-- Canonical demo event for /test-run E2E checklist (code NIGHT1).
-- Idempotent: safe to re-apply; resets graph and vote pointers.

INSERT INTO public.events (code, title, status)
VALUES ('NIGHT1', 'E2E demo — Kasdan Co. Player', 'setup')
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  status = 'setup',
  current_vote_id = NULL,
  winner = NULL,
  vote_ends_at = NULL,
  updated_at = now();

DELETE FROM public.story_nodes
WHERE event_id = (SELECT id FROM public.events WHERE code = 'NIGHT1' LIMIT 1);

INSERT INTO public.story_nodes (
  event_id, node_key, title, operator_clip_name, question,
  option_a_label, option_b_label, option_a_next_node_key, option_b_next_node_key, is_ending, sort_order
)
SELECT e.id, v.node_key, v.title, v.clip, v.question, v.a_label, v.b_label, NULL::text, NULL::text, v.is_end, v.ord
FROM public.events e
CROSS JOIN (
  VALUES
    ('01_OPENING', 'House lights', '01_house_lights_walkon.mp4',
     'Do we hold in the lobby or send everyone to their seats?',
     'Hold in lobby', 'Take seats', false, 0),
    ('02_BACKSTAGE', 'Quick change', '02_quick_change_wing.mp4',
     'Wardrobe is tight — quick change in the wing or stay in blackout?',
     'Quick change', 'Stay dark', false, 1),
    ('03_AUDITORIUM', 'House hold', '03_auditorium_hold_cue.mp4',
     'Program is running long — hold for cues or roll the B-reel cover?',
     'Hold for cues', 'Roll B-reel', false, 2),
    ('04_CURTAIN_CALL', 'Curtain call', '04_curtain_call_finale.mp4',
     NULL::text, NULL::text, NULL::text, true, 3),
    ('05_AFTERPARTY', 'Wrap party', '05_wrap_party_roll.mp4',
     NULL::text, NULL::text, NULL::text, true, 4)
) AS v(node_key, title, clip, question, a_label, b_label, is_end, ord)
WHERE e.code = 'NIGHT1';

UPDATE public.story_nodes sn
SET option_a_next_node_key = '02_BACKSTAGE', option_b_next_node_key = '03_AUDITORIUM'
FROM public.events e
WHERE e.code = 'NIGHT1' AND sn.event_id = e.id AND sn.node_key = '01_OPENING';

UPDATE public.story_nodes sn
SET option_a_next_node_key = '04_CURTAIN_CALL', option_b_next_node_key = '05_AFTERPARTY'
FROM public.events e
WHERE e.code = 'NIGHT1' AND sn.event_id = e.id AND sn.node_key = '02_BACKSTAGE';

UPDATE public.story_nodes sn
SET option_a_next_node_key = '04_CURTAIN_CALL', option_b_next_node_key = '05_AFTERPARTY'
FROM public.events e
WHERE e.code = 'NIGHT1' AND sn.event_id = e.id AND sn.node_key = '03_AUDITORIUM';

UPDATE public.events ev
SET
  current_node_id = sn.id,
  current_vote_id = NULL,
  winner = NULL,
  status = 'setup',
  updated_at = now()
FROM public.story_nodes sn
WHERE ev.code = 'NIGHT1'
  AND sn.event_id = ev.id
  AND sn.node_key = '01_OPENING';
