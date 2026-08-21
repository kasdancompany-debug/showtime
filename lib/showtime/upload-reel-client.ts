"use client";

import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Same bucket already used for poster/thumbnail uploads (lib/showtime/upload-poster-client.ts). */
const BUCKET = "showtime-media";

/** Upload an already-transcoded MP4 blob to Supabase Storage and return its public URL. */
export async function uploadReelVideo(blob: Blob, filename: string): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured — cannot upload to storage.");
  }
  const anon = await tryEnsureAnonymousSession(supabase);
  if (!anon.ok) throw new Error(anon.message);

  const path = `reels/${Date.now()}-${filename}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) {
    throw new Error(
      `${error.message} — run the showtime_media storage migration in Supabase, or add SUPABASE_SERVICE_ROLE_KEY on Vercel.`,
    );
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Could not get a public URL for the uploaded reel.");
  return data.publicUrl;
}
