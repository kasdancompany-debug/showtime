-- Optional full-viewport walk-in / idle image for /screen before playback (setup + ready).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS screen_idle_poster_url text;

COMMENT ON COLUMN public.events.screen_idle_poster_url IS
  'HTTPS or site path to an image; shown on /screen during setup/ready instead of text-only slate when set.';
