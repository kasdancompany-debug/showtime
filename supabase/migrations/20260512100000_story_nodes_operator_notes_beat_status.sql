-- Operator-facing notes and publish readiness per beat (Show Builder).

alter table public.story_nodes
  add column if not exists operator_notes text not null default '';

alter table public.story_nodes
  add column if not exists beat_status text not null default 'draft';

alter table public.story_nodes drop constraint if exists story_nodes_beat_status_check;

alter table public.story_nodes
  add constraint story_nodes_beat_status_check check (beat_status in ('draft', 'ready'));

comment on column public.story_nodes.operator_notes is 'Plain-language cue for the operator at this beat (not shown to audience).';
comment on column public.story_nodes.beat_status is 'draft = still editing; ready = OK for live use (Show Builder validation).';
