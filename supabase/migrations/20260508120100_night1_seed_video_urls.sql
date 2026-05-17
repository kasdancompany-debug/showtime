-- NIGHT1 demo: explicit hosted paths under /public/videos (served as /videos/…).

UPDATE public.story_nodes sn
SET video_url = '/videos/' || ltrim(trim(sn.operator_clip_name), '/')
FROM public.events e
WHERE e.code = 'NIGHT1'
  AND sn.event_id = e.id
  AND trim(sn.operator_clip_name) <> ''
  AND (trim(coalesce(sn.video_url, '')) = '' OR sn.video_url = '/videos/' || ltrim(trim(sn.operator_clip_name), '/'));

UPDATE public.events SET play_phase = 'idle' WHERE code = 'NIGHT1';
