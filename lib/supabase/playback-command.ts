import type { Database, PlaybackCmd } from "@/lib/supabase/database.types";

export type { PlaybackCmd };

type PlaybackPatch = Pick<
  Database["public"]["Tables"]["events"]["Update"],
  "playback_command" | "playback_command_id"
> & { playback_position_seconds?: number };

/** Host-only: pair a playback command with a new id so /screen can apply it reliably. */
export function withPlaybackCommand(cmd: PlaybackCmd, patch?: { playback_position_seconds?: number }): PlaybackPatch {
  const base: PlaybackPatch = {
    playback_command: cmd,
    playback_command_id: crypto.randomUUID(),
  };
  if (patch && typeof patch.playback_position_seconds === "number") {
    base.playback_position_seconds = patch.playback_position_seconds;
  }
  return base;
}
