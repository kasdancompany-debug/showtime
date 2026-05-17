-- Headcount for host /screen without widening SELECT on audience_members (privacy).
CREATE OR REPLACE FUNCTION public.get_audience_member_count(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT count(*)::int FROM public.audience_members WHERE event_id = p_event_id),
    0
  );
$$;

REVOKE ALL ON FUNCTION public.get_audience_member_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_member_count(uuid) TO anon, authenticated;
