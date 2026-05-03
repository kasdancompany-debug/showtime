-- Optional: lets operators allow phones to join without typing a display name (still tracked per anonymous auth user).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS allow_anonymous_quick_join boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.allow_anonymous_quick_join IS
  'When true, /join may offer one-tap anonymous entry; display_name may be a generic label.';
