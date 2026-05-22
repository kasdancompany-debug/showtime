-- Public bucket for experience thumbnails and walk-in / screen images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'showtime-media',
  'showtime-media',
  true,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
