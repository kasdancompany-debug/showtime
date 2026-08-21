-- Allow transcoded reel uploads (video/mp4, video/webm) into the existing showtime-media
-- bucket, alongside the poster/thumbnail images it already accepts. Raises the size limit
-- from 12MB (fine for images) to 300MB (a transcoded reel at CRF 23 / 1080p easily clears
-- the old cap even though it is far smaller than the camera-original source).
update storage.buckets
set
  file_size_limit = 314572800,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
where id = 'showtime-media';
