import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const BUCKET = "showtime-media";

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const ext = base.match(/\.(jpe?g|png|webp|gif)$/i)?.[0]?.toLowerCase() ?? ".jpg";
  const stem = base.replace(/\.(jpe?g|png|webp|gif)$/i, "") || "poster";
  return `${stem}${ext}`;
}

function storagePath(kind: "experience" | "screen", experienceId: string | undefined, filename: string): string {
  if (kind === "screen") return `screen-posters/${Date.now()}-${filename}`;
  if (experienceId) return `experience-posters/${experienceId}/${Date.now()}-${filename}`;
  return `experience-posters/misc/${Date.now()}-${filename}`;
}

async function uploadViaApi(
  file: File,
  kind: "experience" | "screen",
  experienceId?: string,
): Promise<string | null> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", kind);
  if (experienceId) fd.set("experienceId", experienceId);

  const res = await fetch("/api/media/upload-poster", { method: "POST", body: fd });
  const data = (await res.json()) as { ok?: boolean; error?: string; publicUrl?: string };
  if (data.ok && data.publicUrl) return data.publicUrl;
  if (res.status === 503) return null;
  throw new Error(data.error ?? `Upload failed (${res.status}).`);
}

async function uploadViaBrowser(
  file: File,
  kind: "experience" | "screen",
  experienceId?: string,
): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const anon = await tryEnsureAnonymousSession(supabase);
  if (!anon.ok) throw new Error(anon.message);

  const filename = safeFilename(file.name);
  const path = storagePath(kind, experienceId, filename);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) {
    throw new Error(
      `${error.message} — run the showtime_media storage migration in Supabase, or add SUPABASE_SERVICE_ROLE_KEY on Vercel.`,
    );
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Could not get public URL for uploaded image.");
  return data.publicUrl;
}

/** Upload a poster/thumbnail; tries server API then direct Supabase Storage from the browser. */
export async function uploadPosterImage(
  file: File,
  options: { kind?: "experience" | "screen"; experienceId?: string },
): Promise<string> {
  const kind = options.kind ?? "experience";
  try {
    const fromApi = await uploadViaApi(file, kind, options.experienceId);
    if (fromApi) return fromApi;
  } catch (apiErr) {
    try {
      return await uploadViaBrowser(file, kind, options.experienceId);
    } catch (browserErr) {
      const apiMsg = apiErr instanceof Error ? apiErr.message : "Server upload failed.";
      const browserMsg = browserErr instanceof Error ? browserErr.message : "Browser upload failed.";
      throw new Error(`${apiMsg} ${browserMsg}`);
    }
  }
  return uploadViaBrowser(file, kind, options.experienceId);
}
