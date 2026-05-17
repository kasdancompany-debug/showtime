-- Allow Show Builder "Create new show" without SUPABASE_SERVICE_ROLE_KEY on Next.js:
-- anonymous clients cannot INSERT into events under RLS, but they may EXECUTE this RPC.

CREATE OR REPLACE FUNCTION public.create_show_for_builder(p_code text, p_title text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_title text;
  v_event_id uuid;
  v_node_id uuid;
BEGIN
  v_code := upper(trim(p_code));
  IF length(v_code) < 3 THEN
    RAISE EXCEPTION 'Show codes must be at least 3 characters (letters and numbers).';
  END IF;
  IF v_code !~ '^[A-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Use only letters, numbers, and underscores in the show code.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.events e WHERE e.code = v_code) THEN
    RAISE EXCEPTION 'CODE_TAKEN';
  END IF;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  IF v_title IS NULL THEN
    v_title := 'Live show ' || v_code;
  END IF;

  INSERT INTO public.events (code, title, status)
  VALUES (v_code, v_title, 'setup'::public.showtime_event_status)
  RETURNING id INTO v_event_id;

  INSERT INTO public.story_nodes (
    event_id,
    node_key,
    title,
    video,
    video_url,
    operator_notes,
    beat_status,
    question,
    option_a_label,
    option_b_label,
    option_a_next_node_key,
    option_b_next_node_key,
    is_ending,
    sort_order
  )
  VALUES (
    v_event_id,
    '01_OPENING',
    'Opening',
    '',
    '',
    '',
    'draft',
    null,
    null,
    null,
    null,
    null,
    false,
    0
  )
  RETURNING id INTO v_node_id;

  UPDATE public.events e
  SET current_node_id = v_node_id
  WHERE e.id = v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.create_show_for_builder(text, text) IS
  'Show Builder: create events row + opening beat; callable by anon (bypasses RLS via SECURITY DEFINER).';

REVOKE ALL ON FUNCTION public.create_show_for_builder(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_show_for_builder(text, text) TO anon, authenticated;
