-- Hosted video playback: phase within `waiting`, plus per-beat `video_url`.

ALTER TABLE public.story_nodes
  ADD COLUMN IF NOT EXISTS video_url text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.story_nodes.video_url IS
  'Absolute or site-root URL to an MP4 (e.g. /videos/scene.mp4 or https://cdn…/scene.mp4). No blob: or file://.';

UPDATE public.story_nodes
SET video_url = CASE
  WHEN trim(coalesce(video_url, '')) <> '' THEN trim(video_url)
  WHEN trim(operator_clip_name) ~* '^https?://' THEN trim(operator_clip_name)
  WHEN trim(operator_clip_name) ~ '^/' THEN trim(operator_clip_name)
  WHEN trim(operator_clip_name) <> '' THEN '/videos/' || ltrim(trim(operator_clip_name), '/')
  ELSE ''
END
WHERE trim(coalesce(video_url, '')) = '';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS play_phase text NOT NULL DEFAULT 'idle';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_play_phase_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_play_phase_check CHECK (play_phase IN ('idle', 'playing', 'vote_slate'));

COMMENT ON COLUMN public.events.play_phase IS
  'When status is waiting: idle (lobby / next beat ready), playing (/screen plays current beat video), vote_slate (video ended; clean slate until host opens vote).';

UPDATE public.events SET play_phase = 'idle' WHERE play_phase IS NULL OR play_phase = '';
