-- Allow browser uploads (anon) when server service role is unavailable.
create policy "showtime_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'showtime-media');

create policy "showtime_media_anon_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'showtime-media');

create policy "showtime_media_anon_update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'showtime-media')
with check (bucket_id = 'showtime-media');
