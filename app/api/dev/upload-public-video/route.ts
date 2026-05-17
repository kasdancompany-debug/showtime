import { access, mkdir, writeFile } from "fs/promises";
import path from "path";
import { constants as fsConstants } from "fs";

import { NextResponse } from "next/server";

const MAX_BYTES = 400 * 1024 * 1024; // 400 MB
const ALLOWED_EXT = new Set([".mp4", ".webm", ".mov"]);

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
    throw new Error("Only .mp4 and .webm files are allowed.");
  }
  let stem = path.basename(base, ext).slice(0, 120);
  if (!stem) stem = "video";
  return `${stem}${ext}`;
}

/**
 * Dev only: save a clip under `public/videos/` so `/videos/…` works on /screen.
 * Not available in production (serverless filesystem is read-only).
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { ok: false, error: "Local upload only works when running `npm run dev` on your machine." },
      { status: 403 },
    );
  }

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
      return NextResponse.json({ ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` }, { status: 400 });
    }

    const safeName = safeBasename(file.name);
    const videosDir = path.join(process.cwd(), "public", "videos");
    await mkdir(videosDir, { recursive: true });

    const ext = path.extname(safeName);
    const stem = path.basename(safeName, ext);

    let outName = safeName;
    let outPath = path.join(videosDir, outName);
    let n = 2;
    while (await fileExists(outPath)) {
      outName = `${stem}_${n}${ext}`;
      outPath = path.join(videosDir, outName);
      n += 1;
      if (n > 1000) throw new Error("Could not pick a unique filename.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(outPath, buf);

    const publicPath = `/videos/${outName}`;
    return NextResponse.json({ ok: true, publicPath, filename: outName });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
