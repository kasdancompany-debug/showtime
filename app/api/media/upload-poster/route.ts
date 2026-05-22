import { access, mkdir, writeFile } from "fs/promises";
import path from "path";
import { constants as fsConstants } from "fs";

import { NextResponse } from "next/server";

import { canonicalOriginFromEnv } from "@/lib/showtime/canonical-origin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role-client";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const BUCKET = "showtime-media";

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function safeBasename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error("Only .jpg, .jpeg, .png, .webp, or .gif are allowed.");
  }
  let stem = path.basename(base, ext).slice(0, 80);
  if (!stem) stem = "poster";
  return `${stem}${ext}`;
}

function requestOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return canonicalOriginFromEnv();
}

async function uploadToLocalPublic(
  req: Request,
  file: File,
  folder: "screen-posters" | "experience-posters",
  subfolder?: string,
): Promise<string> {
  const safeName = safeBasename(file.name);
  const dir = path.join(process.cwd(), "public", folder, ...(subfolder ? [subfolder] : []));
  await mkdir(dir, { recursive: true });

  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);

  let outName = safeName;
  let outPath = path.join(dir, outName);
  let n = 2;
  while (await fileExists(outPath)) {
    outName = `${stem}_${n}${ext}`;
    outPath = path.join(dir, outName);
    n += 1;
    if (n > 1000) throw new Error("Could not pick a unique filename.");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(outPath, buf);

  const publicPath = subfolder ? `/${folder}/${subfolder}/${outName}` : `/${folder}/${outName}`;
  return `${requestOrigin(req)}${publicPath}`;
}

/**
 * Upload experience thumbnail or walk-in image — Supabase Storage in production, local public/ in dev.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file field." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ ok: false, error: "Empty file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
        { status: 400 },
      );
    }

    const kind = (form.get("kind")?.toString() ?? "experience").trim();
    const experienceId = form.get("experienceId")?.toString()?.trim() ?? "";
    const safeName = safeBasename(file.name);
    const storagePath =
      kind === "screen"
        ? `screen-posters/${Date.now()}-${safeName}`
        : experienceId
          ? `experience-posters/${experienceId}/${Date.now()}-${safeName}`
          : `experience-posters/misc/${Date.now()}-${safeName}`;

    const client = createSupabaseServiceRoleClient();
    if (client) {
      const buf = Buffer.from(await file.arrayBuffer());
      const { error } = await client.storage.from(BUCKET).upload(storagePath, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw new Error(error.message);

      const { data } = client.storage.from(BUCKET).getPublicUrl(storagePath);
      return NextResponse.json({ ok: true, publicUrl: data.publicUrl, storagePath });
    }

    if (process.env.NODE_ENV === "development") {
      const publicUrl =
        kind === "screen"
          ? await uploadToLocalPublic(req, file, "screen-posters")
          : await uploadToLocalPublic(
              req,
              file,
              "experience-posters",
              experienceId || "misc",
            );
      return NextResponse.json({ ok: true, publicUrl });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Image upload needs SUPABASE_SERVICE_ROLE_KEY on the server (Vercel → Environment Variables). Paste a full https:// image URL until that is set.",
      },
      { status: 503 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
