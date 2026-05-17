-- When false, /screen hides live vote counts while voting_open (question + choices only).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS screen_show_live_vote_counts boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.screen_show_live_vote_counts IS 'If true, /screen shows live vote tallies while voting_open; if false, only the question and choice cards.';
