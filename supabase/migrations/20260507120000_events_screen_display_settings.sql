-- Optional countdown for /screen when voting_open; host-controlled tally visibility when voting_closed.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS vote_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS screen_show_closed_tally boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.vote_ends_at IS 'When set during voting_open, /screen shows a countdown to this instant.';
COMMENT ON COLUMN public.events.screen_show_closed_tally IS 'If true, /screen shows vote bars and counts while voting_closed; if false, tallies stay hidden until reveal.';
