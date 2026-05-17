-- Beginner-facing name: legacy operator clip label column becomes `video` (playback still uses `video_url`).
ALTER TABLE public.story_nodes RENAME COLUMN operator_clip_name TO video;

COMMENT ON COLUMN public.story_nodes.video IS 'Optional short label; projector and audience use video_url.';
