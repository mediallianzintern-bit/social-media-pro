-- Post thumbnails — the cover frame of a reel, kept so it does not expire.
--
-- Instagram hands out thumbnail links on its own CDN that are signed and
-- short-lived: store one and the poster wall is broken images within days.
-- So the link is not what is kept. On each sync the image itself is copied
-- into our own bucket, and `thumbnail_url` holds the permanent public link to
-- that copy. Copying happens once per post — a post's cover frame does not
-- change — so a sync re-reading the same sixty posts downloads nothing.
alter table public.post_metrics
  add column if not exists thumbnail_url text;

-- Public, because these are public post covers shown on a dashboard page and
-- an <img> cannot send an auth header. Nothing private is ever put in here.
-- Writes still require the service-role key: the app is the only writer.
insert into storage.buckets (id, name, public)
values ('post-thumbnails', 'post-thumbnails', true)
on conflict (id) do update set public = true;
