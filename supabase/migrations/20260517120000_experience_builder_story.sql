-- Store full show-builder graph on experiences (same shape as /admin/story export).

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS builder_story jsonb,
  ADD COLUMN IF NOT EXISTS rehearsal_event_id uuid REFERENCES public.events (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS experiences_rehearsal_event_id_idx ON public.experiences (rehearsal_event_id);

COMMENT ON COLUMN public.experiences.builder_story IS 'kasdan-branch-story v3 JSON — beats, branches, video_library.';
COMMENT ON COLUMN public.experiences.rehearsal_event_id IS 'Optional linked event for home-laptop rehearsal (/host, /screen).';
