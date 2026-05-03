-- Showtime core schema: events, story graph, audience, votes
-- Audience flows should use Supabase Auth (anonymous sign-in is fine) so auth.uid() is available for RLS.
--
-- Safe to re-run in SQL Editor: skips enums/tables/indexes/constraints/policies/publication links that already exist.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.event_status AS ENUM (
    'draft',
    'waiting',
    'playing',
    'voting',
    'revealing',
    'ended'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.vote_option AS ENUM ('A', 'B');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- events (FKs to story_nodes added after story_nodes exists)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code text NOT NULL UNIQUE,
  title text NOT NULL,
  status public.event_status NOT NULL DEFAULT 'draft',
  current_node_id uuid,
  active_vote_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_event_code_format CHECK (char_length(trim(event_code)) >= 3)
);

COMMENT ON TABLE public.events IS 'A branching screening; operator owns the row via created_by.';
COMMENT ON COLUMN public.events.active_vote_id IS 'Story node currently in a vote round (nullable).';

CREATE INDEX IF NOT EXISTS events_created_by_idx ON public.events (created_by);
CREATE INDEX IF NOT EXISTS events_status_idx ON public.events (status);

-- ---------------------------------------------------------------------------
-- story_nodes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.story_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  title text NOT NULL,
  video_url text,
  duration_seconds integer,
  question text,
  option_a_label text,
  option_b_label text,
  option_a_next_node_id uuid REFERENCES public.story_nodes (id) ON DELETE SET NULL,
  option_b_next_node_id uuid REFERENCES public.story_nodes (id) ON DELETE SET NULL,
  is_ending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_nodes_duration_nonneg CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  )
);

COMMENT ON TABLE public.story_nodes IS 'Directed graph of beats for one event.';

CREATE INDEX IF NOT EXISTS story_nodes_event_id_idx ON public.story_nodes (event_id);

CREATE UNIQUE INDEX IF NOT EXISTS story_nodes_event_id_id_uidx ON public.story_nodes (event_id, id);

DO $$
BEGIN
  ALTER TABLE public.events
    ADD CONSTRAINT events_current_node_id_fkey
    FOREIGN KEY (current_node_id) REFERENCES public.story_nodes (id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.events
    ADD CONSTRAINT events_active_vote_id_fkey
    FOREIGN KEY (active_vote_id) REFERENCES public.story_nodes (id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- audience_members (user_id = auth.uid() for RLS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  table_number text,
  session_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audience_members_display_name_nonempty CHECK (char_length(trim(display_name)) > 0)
);

COMMENT ON TABLE public.audience_members IS 'One row per auth user per event.';
COMMENT ON COLUMN public.audience_members.user_id IS 'Set from auth.uid(); use anonymous auth on phones.';

CREATE UNIQUE INDEX IF NOT EXISTS audience_members_event_user_uidx ON public.audience_members (event_id, user_id);
CREATE INDEX IF NOT EXISTS audience_members_event_id_idx ON public.audience_members (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS audience_members_event_id_id_uidx ON public.audience_members (event_id, id);

-- ---------------------------------------------------------------------------
-- votes (column "option" → vote_option per SQL reserved words)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  story_node_id uuid NOT NULL,
  audience_member_id uuid NOT NULL,
  vote_option public.vote_option NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.votes IS 'One vote per audience member per story node (enforced by unique index).';
COMMENT ON COLUMN public.votes.vote_option IS 'Maps to product spec "option": A or B.';

CREATE UNIQUE INDEX IF NOT EXISTS votes_one_per_member_per_node_uidx ON public.votes (audience_member_id, story_node_id);
CREATE INDEX IF NOT EXISTS votes_event_story_idx ON public.votes (event_id, story_node_id);
CREATE INDEX IF NOT EXISTS votes_event_id_idx ON public.votes (event_id);

DO $$
BEGIN
  ALTER TABLE public.votes
    ADD CONSTRAINT votes_story_node_same_event_fkey
    FOREIGN KEY (event_id, story_node_id)
    REFERENCES public.story_nodes (event_id, id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.votes
    ADD CONSTRAINT votes_audience_member_same_event_fkey
    FOREIGN KEY (event_id, audience_member_id)
    REFERENCES public.audience_members (event_id, id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audience_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_host_or_published" ON public.events;
CREATE POLICY "events_select_host_or_published"
ON public.events
FOR SELECT
TO authenticated, anon
USING (
  created_by = (SELECT auth.uid())
  OR status <> 'draft'
);

DROP POLICY IF EXISTS "events_insert_host" ON public.events;
CREATE POLICY "events_insert_host"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "events_update_host" ON public.events;
CREATE POLICY "events_update_host"
ON public.events
FOR UPDATE
TO authenticated
USING (created_by = (SELECT auth.uid()))
WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "events_delete_host" ON public.events;
CREATE POLICY "events_delete_host"
ON public.events
FOR DELETE
TO authenticated
USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "story_nodes_select_visible" ON public.story_nodes;
CREATE POLICY "story_nodes_select_visible"
ON public.story_nodes
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = story_nodes.event_id
      AND (
        e.created_by = (SELECT auth.uid())
        OR e.status <> 'draft'
      )
  )
);

DROP POLICY IF EXISTS "story_nodes_insert_host" ON public.story_nodes;
CREATE POLICY "story_nodes_insert_host"
ON public.story_nodes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = story_nodes.event_id
      AND e.created_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "story_nodes_update_host" ON public.story_nodes;
CREATE POLICY "story_nodes_update_host"
ON public.story_nodes
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = story_nodes.event_id
      AND e.created_by = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = story_nodes.event_id
      AND e.created_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "story_nodes_delete_host" ON public.story_nodes;
CREATE POLICY "story_nodes_delete_host"
ON public.story_nodes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = story_nodes.event_id
      AND e.created_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "audience_members_insert_self" ON public.audience_members;
CREATE POLICY "audience_members_insert_self"
ON public.audience_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = audience_members.event_id
      AND e.status <> 'draft'
  )
);

DROP POLICY IF EXISTS "audience_members_select_self_or_host" ON public.audience_members;
CREATE POLICY "audience_members_select_self_or_host"
ON public.audience_members
FOR SELECT
TO authenticated, anon
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = audience_members.event_id
      AND e.created_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "votes_insert_own_member" ON public.votes;
CREATE POLICY "votes_insert_own_member"
ON public.votes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.audience_members am
    WHERE am.id = votes.audience_member_id
      AND am.user_id = (SELECT auth.uid())
      AND am.event_id = votes.event_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.story_nodes sn
    WHERE sn.id = votes.story_node_id
      AND sn.event_id = votes.event_id
  )
);

DROP POLICY IF EXISTS "votes_select_tally_and_host" ON public.votes;
CREATE POLICY "votes_select_tally_and_host"
ON public.votes
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = votes.event_id
      AND (
        e.status IN ('waiting', 'playing', 'voting', 'revealing', 'ended')
        OR e.created_by = (SELECT auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "votes_delete_host" ON public.votes;
CREATE POLICY "votes_delete_host"
ON public.votes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = votes.event_id
      AND e.created_by = (SELECT auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- Realtime: host, screen, and join clients subscribe to these tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'story_nodes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_nodes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'audience_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audience_members;
  END IF;
END $$;

ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.story_nodes REPLICA IDENTITY FULL;
ALTER TABLE public.votes REPLICA IDENTITY FULL;
ALTER TABLE public.audience_members REPLICA IDENTITY FULL;
