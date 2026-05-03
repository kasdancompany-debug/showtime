-- Optional wall-clock poll close for audience phones (operator sets when opening vote).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS vote_ends_at timestamptz;

COMMENT ON COLUMN public.events.vote_ends_at IS 'When the active poll closes; phones show countdown. Nullable for legacy rows.';
