import type { SupabaseClient } from "@supabase/supabase-js";

import { slugifyExperienceTitle, uniqueExperienceSlug } from "@/lib/experiences/slug";
import type { Database, ExperienceStatus } from "@/lib/supabase/database.types";

export type ExperienceRow = Database["public"]["Tables"]["experiences"]["Row"];
export type ExperienceSceneRow = Database["public"]["Tables"]["experience_scenes"]["Row"];
export type ExperienceVoteMomentRow = Database["public"]["Tables"]["experience_vote_moments"]["Row"];
export type LiveRoomRow = Database["public"]["Tables"]["live_rooms"]["Row"];

export type ExperienceFull = ExperienceRow & {
  scenes: ExperienceSceneRow[];
  voteMoments: ExperienceVoteMomentRow[];
};

export async function listExperiences(client: SupabaseClient<Database>): Promise<ExperienceRow[]> {
  const { data, error } = await client
    .from("experiences")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getExperienceById(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ExperienceRow | null> {
  const { data, error } = await client.from("experiences").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getExperienceBySlug(
  client: SupabaseClient<Database>,
  slug: string,
): Promise<ExperienceRow | null> {
  const { data, error } = await client.from("experiences").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getExperienceFull(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ExperienceFull | null> {
  const exp = await getExperienceById(client, id);
  if (!exp) return null;

  const [scenesRes, votesRes] = await Promise.all([
    client.from("experience_scenes").select("*").eq("experience_id", id).order("order_index"),
    client.from("experience_vote_moments").select("*").eq("experience_id", id).order("order_index"),
  ]);
  if (scenesRes.error) throw scenesRes.error;
  if (votesRes.error) throw votesRes.error;

  return {
    ...exp,
    scenes: scenesRes.data ?? [],
    voteMoments: votesRes.data ?? [],
  };
}

export async function listExperienceSlugs(client: SupabaseClient<Database>): Promise<Set<string>> {
  const { data, error } = await client.from("experiences").select("slug");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.slug));
}

export type CreateExperienceInput = {
  title: string;
  slug?: string;
  description?: string;
  posterUrl?: string | null;
  estimatedRuntimeMinutes?: number | null;
  status?: ExperienceStatus;
};

export async function createExperience(
  client: SupabaseClient<Database>,
  input: CreateExperienceInput,
): Promise<ExperienceRow> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");

  const taken = await listExperienceSlugs(client);
  const slug = input.slug?.trim()
    ? slugifyExperienceTitle(input.slug)
    : uniqueExperienceSlug(title, taken);
  if (taken.has(slug)) throw new Error("That slug is already in use.");

  const { data, error } = await client
    .from("experiences")
    .insert({
      title,
      slug,
      description: input.description?.trim() ?? "",
      poster_url: input.posterUrl?.trim() || null,
      estimated_runtime_minutes: input.estimatedRuntimeMinutes ?? null,
      status: input.status ?? "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Experience was not created.");
  return data;
}

export type UpdateExperienceInput = Partial<{
  title: string;
  slug: string;
  description: string;
  posterUrl: string | null;
  estimatedRuntimeMinutes: number | null;
  status: ExperienceStatus;
}>;

export async function updateExperience(
  client: SupabaseClient<Database>,
  id: string,
  patch: UpdateExperienceInput,
): Promise<ExperienceRow> {
  const row: Database["public"]["Tables"]["experiences"]["Update"] = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.slug !== undefined) row.slug = slugifyExperienceTitle(patch.slug);
  if (patch.description !== undefined) row.description = patch.description.trim();
  if (patch.posterUrl !== undefined) row.poster_url = patch.posterUrl?.trim() || null;
  if (patch.estimatedRuntimeMinutes !== undefined) {
    row.estimated_runtime_minutes = patch.estimatedRuntimeMinutes;
  }
  if (patch.status !== undefined) row.status = patch.status;

  const { data, error } = await client.from("experiences").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  if (!data) throw new Error("Experience not found.");
  return data;
}

export async function deleteExperience(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client.from("experiences").delete().eq("id", id);
  if (error) throw error;
}

export type ExperienceSceneInput = {
  id?: string;
  orderIndex: number;
  title: string;
  description?: string;
  mediaUrl?: string | null;
  durationSeconds?: number | null;
};

export type ExperienceVoteMomentInput = {
  id?: string;
  sceneId?: string | null;
  orderIndex: number;
  question: string;
  choiceA: string;
  choiceB: string;
  countdownSeconds?: number;
  resultMode?: Database["public"]["Tables"]["experience_vote_moments"]["Row"]["result_mode"];
  branchA?: string | null;
  branchB?: string | null;
};

/** Replace all scenes and vote moments for an experience (editor save). */
export async function replaceExperienceTimeline(
  client: SupabaseClient<Database>,
  experienceId: string,
  scenes: ExperienceSceneInput[],
  voteMoments: ExperienceVoteMomentInput[],
): Promise<ExperienceFull> {
  const { error: delVotes } = await client
    .from("experience_vote_moments")
    .delete()
    .eq("experience_id", experienceId);
  if (delVotes) throw delVotes;

  const { error: delScenes } = await client.from("experience_scenes").delete().eq("experience_id", experienceId);
  if (delScenes) throw delScenes;

  if (scenes.length > 0) {
    const sceneRows: Database["public"]["Tables"]["experience_scenes"]["Insert"][] = scenes.map((s) => ({
      experience_id: experienceId,
      order_index: s.orderIndex,
      title: s.title.trim(),
      description: s.description?.trim() ?? "",
      media_url: s.mediaUrl?.trim() || null,
      duration_seconds: s.durationSeconds ?? null,
    }));
    const { error: insScenes } = await client.from("experience_scenes").insert(sceneRows);
    if (insScenes) throw insScenes;
  }

  if (voteMoments.length > 0) {
    const voteRows: Database["public"]["Tables"]["experience_vote_moments"]["Insert"][] = voteMoments.map((v) => ({
      experience_id: experienceId,
      scene_id: v.sceneId ?? null,
      order_index: v.orderIndex,
      question: v.question.trim(),
      choice_a: v.choiceA.trim(),
      choice_b: v.choiceB.trim(),
      countdown_seconds: v.countdownSeconds ?? 45,
      result_mode: v.resultMode ?? "majority",
      branch_a: v.branchA?.trim() || null,
      branch_b: v.branchB?.trim() || null,
    }));
    const { error: insVotes } = await client.from("experience_vote_moments").insert(voteRows);
    if (insVotes) throw insVotes;
  }

  const full = await getExperienceFull(client, experienceId);
  if (!full) throw new Error("Could not reload experience after save.");
  return full;
}

export async function getLiveRoomByCode(
  client: SupabaseClient<Database>,
  roomCode: string,
): Promise<LiveRoomRow | null> {
  const code = roomCode.trim().toUpperCase();
  const { data, error } = await client.from("live_rooms").select("*").eq("room_code", code).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getExperienceForEvent(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<ExperienceRow | null> {
  const { data: event, error } = await client
    .from("events")
    .select("experience_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event?.experience_id) return null;
  return getExperienceById(client, event.experience_id);
}
