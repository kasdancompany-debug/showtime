-- Allow authenticated clients (including Supabase anonymous auth) to clear votes and audience when resetting a night.
CREATE POLICY votes_delete_authenticated ON public.votes FOR DELETE TO authenticated USING (true);

CREATE POLICY audience_members_delete_authenticated ON public.audience_members FOR DELETE TO authenticated USING (true);
