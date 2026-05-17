-- =============================================================================
-- DESTRUCTIVE: replaces legacy Showtime tables with Supabase-only source of truth.
-- Drops events, story_nodes, audience_members, votes and legacy enums.
-- =============================================================================

-- PG14 / older Supabase: `ALTER PUBLICATION ... DROP TABLE IF EXISTS` is invalid syntax.
-- PG15+ allows IF EXISTS; use DROP TABLE + swallow "not in publication" / missing object.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.votes;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
  WHEN SQLSTATE '55000' THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.audience_members;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
  WHEN SQLSTATE '55000' THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.story_nodes;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
  WHEN SQLSTATE '55000' THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.events;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
  WHEN SQLSTATE '55000' THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.get_audience_member_count(uuid);

DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.audience_members CASCADE;
DROP TABLE IF EXISTS public.story_nodes CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

DROP TYPE IF EXISTS public.vote_option CASCADE;
DROP TYPE IF EXISTS public.event_status CASCADE;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.showtime_event_status AS ENUM (
  'setup',
  'waiting',
  'voting_open',
  'voting_closed',
  'winner_revealed',
  'ended'
);

CREATE TYPE public.vote_ab AS ENUM ('A', 'B');

-- ---------------------------------------------------------------------------
-- events (FKs to story_nodes added after story_nodes exists)
-- ---------------------------------------------------------------------------
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  status public.showtime_event_status NOT NULL DEFAULT 'setup',
  current_node_id uuid,
  current_vote_id uuid,
  winner public.vote_ab,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_code_nonempty CHECK (char_length(trim(code)) >= 3),
  CONSTRAINT events_code_upper CHECK (code = upper(code))
);

CREATE UNIQUE INDEX events_code_uidx ON public.events (code);

COMMENT ON TABLE public.events IS 'Single source of truth for a live night.';
COMMENT ON COLUMN public.events.current_vote_id IS 'story_nodes.id for the active vote node when voting.';

-- ---------------------------------------------------------------------------
-- story_nodes
-- ---------------------------------------------------------------------------
CREATE TABLE public.story_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  node_key text NOT NULL,
  title text NOT NULL DEFAULT '',
  operator_clip_name text NOT NULL DEFAULT '',
  question text,
  option_a_label text,
  option_b_label text,
  option_a_next_node_key text,
  option_b_next_node_key text,
  is_ending boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_nodes_node_key_nonempty CHECK (char_length(trim(node_key)) >= 1),
  CONSTRAINT story_nodes_node_key_trim CHECK (node_key = trim(node_key))
);

CREATE UNIQUE INDEX story_nodes_event_node_key_uidx ON public.story_nodes (event_id, node_key);
CREATE INDEX story_nodes_event_id_idx ON public.story_nodes (event_id);

-- Required for votes → (event_id, node_id) REFERENCES story_nodes (event_id, id)
ALTER TABLE public.story_nodes
  ADD CONSTRAINT story_nodes_event_id_id_key UNIQUE (event_id, id);

ALTER TABLE public.story_nodes
  ADD CONSTRAINT story_nodes_option_a_next_fkey
  FOREIGN KEY (event_id, option_a_next_node_key)
  REFERENCES public.story_nodes (event_id, node_key)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.story_nodes
  ADD CONSTRAINT story_nodes_option_b_next_fkey
  FOREIGN KEY (event_id, option_b_next_node_key)
  REFERENCES public.story_nodes (event_id, node_key)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.events
  ADD CONSTRAINT events_current_node_fkey
  FOREIGN KEY (current_node_id) REFERENCES public.story_nodes (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.events
  ADD CONSTRAINT events_current_vote_fkey
  FOREIGN KEY (current_vote_id) REFERENCES public.story_nodes (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- audience_members
-- ---------------------------------------------------------------------------
CREATE TABLE public.audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  session_id text NOT NULL,
  display_name text NOT NULL,
  table_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audience_members_session_nonempty CHECK (char_length(trim(session_id)) >= 4),
  CONSTRAINT audience_members_display_nonempty CHECK (char_length(trim(display_name)) > 0)
);

CREATE UNIQUE INDEX audience_members_event_session_uidx ON public.audience_members (event_id, session_id);
CREATE INDEX audience_members_event_id_idx ON public.audience_members (event_id);

-- ---------------------------------------------------------------------------
-- votes
-- ---------------------------------------------------------------------------
CREATE TABLE public.votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  node_id uuid NOT NULL,
  session_id text NOT NULL,
  ballot_option public.vote_ab NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT votes_session_nonempty CHECK (char_length(trim(session_id)) >= 4)
);

CREATE UNIQUE INDEX votes_one_per_session_per_node_uidx ON public.votes (event_id, node_id, session_id);
CREATE INDEX votes_event_node_idx ON public.votes (event_id, node_id);

ALTER TABLE public.votes
  ADD CONSTRAINT votes_node_same_event_fkey
  FOREIGN KEY (event_id, node_id)
  REFERENCES public.story_nodes (event_id, id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.showtime_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_touch_updated_at ON public.events;
CREATE TRIGGER events_touch_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE PROCEDURE public.showtime_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPC headcount
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_audience_member_count(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT count(*)::int FROM public.audience_members WHERE event_id = p_event_id), 0);
$$;

REVOKE ALL ON FUNCTION public.get_audience_member_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_member_count(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audience_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select_public ON public.events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY events_insert_authenticated ON public.events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY events_update_authenticated ON public.events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY events_delete_authenticated ON public.events FOR DELETE TO authenticated USING (true);

CREATE POLICY story_nodes_select_public ON public.story_nodes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY story_nodes_insert_authenticated ON public.story_nodes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY story_nodes_update_authenticated ON public.story_nodes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY story_nodes_delete_authenticated ON public.story_nodes FOR DELETE TO authenticated USING (true);

CREATE POLICY audience_members_select_public ON public.audience_members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY audience_members_insert_join_window ON public.audience_members FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = audience_members.event_id
      AND e.status IN ('waiting', 'voting_open', 'voting_closed', 'winner_revealed')
  )
);
CREATE POLICY audience_members_update_session ON public.audience_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY votes_select_public ON public.votes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY votes_insert_when_joined ON public.votes FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.audience_members am
    WHERE am.event_id = votes.event_id AND am.session_id = votes.session_id
  )
  AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = votes.event_id AND e.status = 'voting_open'
  )
);

-- ---------------------------------------------------------------------------
-- Realtime (idempotent add)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'story_nodes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_nodes;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'audience_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audience_members;
  END IF;
END $$;

ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.story_nodes REPLICA IDENTITY FULL;
ALTER TABLE public.votes REPLICA IDENTITY FULL;
ALTER TABLE public.audience_members REPLICA IDENTITY FULL;
