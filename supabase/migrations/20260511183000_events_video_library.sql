-- Video library for /admin/story (labels + URLs). Story beats still store resolved `video_url` on `story_nodes`.
alter table public.events
  add column if not exists video_library jsonb not null default '[]'::jsonb;

comment on column public.events.video_library is 'JSON array: [{id,label,url,durationSec?}] for operator video library UI.';
