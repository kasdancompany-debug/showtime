-- Allow browser uploads (anon) when server service role is unavailable.
-- Idempotent: these were already applied by hand before this migration was authored, so guard
-- each with drop-if-exists rather than assume a clean slate.
drop policy if exists "showtime_media_public_read" on storage.objects;
create policy "showtime_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'showtime-media');

drop policy if exists "showtime_media_anon_insert" on storage.objects;
create policy "showtime_media_anon_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'showtime-media');

drop policy if exists "showtime_media_anon_update" on storage.objects;
create policy "showtime_media_anon_update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'showtime-media')
with check (bucket_id = 'showtime-media');
