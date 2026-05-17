-- Clean playback architecture: explicit room status + host→screen playback commands.
-- Drops play_phase and current_vote_id (votes target events.current_node_id while voting_open).

CREATE TYPE public.playback_cmd AS ENUM ('play', 'pause', 'restart', 'load');

CREATE TYPE public.showtime_event_status_new AS ENUM (
  'setup',
  'ready',
  'playing',
  'paused',
  'video_ended',
  'voting_open',
  'voting_closed',
  'winner_revealed',
  'ended'
);

ALTER TABLE public.events
  ADD COLUMN status_new public.showtime_event_status_new;

UPDATE public.events e
SET status_new =
  CASE
    WHEN e.status = 'setup'::public.showtime_event_status THEN 'setup'::public.showtime_event_status_new
    WHEN e.status = 'ended'::public.showtime_event_status THEN 'ended'::public.showtime_event_status_new
    WHEN e.status = 'voting_open'::public.showtime_event_status THEN 'voting_open'::public.showtime_event_status_new
    WHEN e.status = 'voting_closed'::public.showtime_event_status THEN 'voting_closed'::public.showtime_event_status_new
    WHEN e.status = 'winner_revealed'::public.showtime_event_status THEN 'winner_revealed'::public.showtime_event_status_new
    WHEN e.status = 'waiting'::public.showtime_event_status
      AND coalesce(e.play_phase, 'idle') = 'playing' THEN 'playing'::public.showtime_event_status_new
    WHEN e.status = 'waiting'::public.showtime_event_status
      AND coalesce(e.play_phase, 'idle') = 'vote_slate' THEN 'video_ended'::public.showtime_event_status_new
    ELSE 'ready'::public.showtime_event_status_new
  END;

DROP POLICY IF EXISTS audience_members_insert_join_window ON public.audience_members;
DROP POLICY IF EXISTS votes_insert_when_joined ON public.votes;

ALTER TABLE public.events DROP COLUMN status;

ALTER TABLE public.events DROP COLUMN IF EXISTS play_phase;

ALTER TABLE public.events RENAME COLUMN status_new TO status;

ALTER TABLE public.events
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'setup'::public.showtime_event_status_new;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_current_vote_fkey;

ALTER TABLE public.events DROP COLUMN IF EXISTS current_vote_id;

ALTER TABLE public.events
  ADD COLUMN playback_command public.playback_cmd NOT NULL DEFAULT 'load',
  ADD COLUMN playback_command_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN playback_position_seconds double precision NOT NULL DEFAULT 0;

DROP TYPE public.showtime_event_status;

ALTER TYPE public.showtime_event_status_new RENAME TO showtime_event_status;

ALTER TABLE public.events
  ALTER COLUMN status SET DEFAULT 'setup'::public.showtime_event_status;

CREATE POLICY audience_members_insert_join_window ON public.audience_members
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = audience_members.event_id
        AND e.status IN (
          'ready',
          'playing',
          'paused',
          'video_ended',
          'voting_open',
          'voting_closed',
          'winner_revealed'
        )
    )
  );

CREATE POLICY votes_insert_when_joined ON public.votes
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audience_members am
      WHERE am.event_id = votes.event_id AND am.session_id = votes.session_id
    )
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = votes.event_id
        AND e.status = 'voting_open'
        AND e.current_node_id = votes.node_id
    )
  );

COMMENT ON COLUMN public.events.playback_command IS 'Host-issued command; /screen applies when playback_command_id changes.';
COMMENT ON COLUMN public.events.playback_command_id IS 'Bumped by host on each new command so /screen can sync.';
COMMENT ON COLUMN public.events.playback_position_seconds IS 'Optional cue position (e.g. after load/restart).';
