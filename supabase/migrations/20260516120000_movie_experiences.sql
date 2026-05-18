-- Movie Experiences: reusable templates materialized into live `events` + `story_nodes`.

CREATE TYPE public.experience_status AS ENUM ('draft', 'ready', 'archived');

CREATE TYPE public.experience_result_mode AS ENUM ('majority', 'host_override');

CREATE TYPE public.live_room_status AS ENUM ('lobby', 'live', 'voting', 'paused', 'ended');

CREATE TABLE public.experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  poster_url text,
  estimated_runtime_minutes integer,
  status public.experience_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experiences_title_nonempty CHECK (char_length(trim(title)) >= 1),
  CONSTRAINT experiences_slug_nonempty CHECK (char_length(trim(slug)) >= 1),
  CONSTRAINT experiences_runtime_positive CHECK (
    estimated_runtime_minutes IS NULL OR estimated_runtime_minutes > 0
  )
);

CREATE UNIQUE INDEX experiences_slug_uidx ON public.experiences (slug);

CREATE TABLE public.experience_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experiences (id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  media_url text,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_scenes_title_nonempty CHECK (char_length(trim(title)) >= 1),
  CONSTRAINT experience_scenes_duration_positive CHECK (
    duration_seconds IS NULL OR duration_seconds > 0
  )
);

CREATE INDEX experience_scenes_experience_order_idx ON public.experience_scenes (experience_id, order_index);

CREATE TABLE public.experience_vote_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experiences (id) ON DELETE CASCADE,
  scene_id uuid REFERENCES public.experience_scenes (id) ON DELETE SET NULL,
  order_index integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  choice_a text NOT NULL,
  choice_b text NOT NULL,
  countdown_seconds integer NOT NULL DEFAULT 45,
  result_mode public.experience_result_mode NOT NULL DEFAULT 'majority',
  branch_a text,
  branch_b text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_vote_question_nonempty CHECK (char_length(trim(question)) >= 1),
  CONSTRAINT experience_vote_choice_a_nonempty CHECK (char_length(trim(choice_a)) >= 1),
  CONSTRAINT experience_vote_choice_b_nonempty CHECK (char_length(trim(choice_b)) >= 1),
  CONSTRAINT experience_vote_countdown_positive CHECK (countdown_seconds > 0)
);

CREATE INDEX experience_vote_moments_experience_order_idx ON public.experience_vote_moments (experience_id, order_index);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS experience_id uuid REFERENCES public.experiences (id) ON DELETE SET NULL;

CREATE INDEX events_experience_id_idx ON public.events (experience_id);

CREATE TABLE public.live_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL,
  experience_id uuid NOT NULL REFERENCES public.experiences (id) ON DELETE RESTRICT,
  event_id uuid NOT NULL UNIQUE REFERENCES public.events (id) ON DELETE CASCADE,
  status public.live_room_status NOT NULL DEFAULT 'lobby',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_rooms_code_nonempty CHECK (char_length(trim(room_code)) >= 3),
  CONSTRAINT live_rooms_code_upper CHECK (room_code = upper(room_code))
);

CREATE UNIQUE INDEX live_rooms_room_code_uidx ON public.live_rooms (room_code);

COMMENT ON TABLE public.experiences IS 'Reusable interactive movie experience templates.';
COMMENT ON TABLE public.live_rooms IS 'Active night: links a room code to a materialized events row.';

-- updated_at triggers
DROP TRIGGER IF EXISTS experiences_touch_updated_at ON public.experiences;
CREATE TRIGGER experiences_touch_updated_at
BEFORE UPDATE ON public.experiences
FOR EACH ROW EXECUTE PROCEDURE public.showtime_touch_updated_at();

DROP TRIGGER IF EXISTS experience_scenes_touch_updated_at ON public.experience_scenes;
CREATE TRIGGER experience_scenes_touch_updated_at
BEFORE UPDATE ON public.experience_scenes
FOR EACH ROW EXECUTE PROCEDURE public.showtime_touch_updated_at();

DROP TRIGGER IF EXISTS experience_vote_moments_touch_updated_at ON public.experience_vote_moments;
CREATE TRIGGER experience_vote_moments_touch_updated_at
BEFORE UPDATE ON public.experience_vote_moments
FOR EACH ROW EXECUTE PROCEDURE public.showtime_touch_updated_at();

-- RLS (match events: public read, anon/authenticated write for builder UI)
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_vote_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY experiences_select_public ON public.experiences FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY experiences_insert_public ON public.experiences FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY experiences_update_public ON public.experiences FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY experiences_delete_public ON public.experiences FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY experience_scenes_select_public ON public.experience_scenes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY experience_scenes_insert_public ON public.experience_scenes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY experience_scenes_update_public ON public.experience_scenes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY experience_scenes_delete_public ON public.experience_scenes FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY experience_vote_moments_select_public ON public.experience_vote_moments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY experience_vote_moments_insert_public ON public.experience_vote_moments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY experience_vote_moments_update_public ON public.experience_vote_moments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY experience_vote_moments_delete_public ON public.experience_vote_moments FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY live_rooms_select_public ON public.live_rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY live_rooms_insert_public ON public.live_rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY live_rooms_update_public ON public.live_rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY live_rooms_delete_public ON public.live_rooms FOR DELETE TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_rooms;
