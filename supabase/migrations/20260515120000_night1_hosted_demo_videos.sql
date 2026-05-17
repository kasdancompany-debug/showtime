-- NIGHT1 demo: use hosted CC0 samples so /screen plays without files in public/videos.

UPDATE public.story_nodes sn
SET video_url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
FROM public.events e
WHERE e.code = 'NIGHT1'
  AND sn.event_id = e.id
  AND sn.node_key = '01_OPENING';

UPDATE public.story_nodes sn
SET video_url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm'
FROM public.events e
WHERE e.code = 'NIGHT1'
  AND sn.event_id = e.id
  AND sn.node_key IN ('02_BACKSTAGE', '04_CURTAIN_CALL');

UPDATE public.story_nodes sn
SET video_url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
FROM public.events e
WHERE e.code = 'NIGHT1'
  AND sn.event_id = e.id
  AND sn.node_key IN ('03_AUDITORIUM', '05_AFTERPARTY');
