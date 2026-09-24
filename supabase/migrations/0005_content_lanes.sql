-- Content lanes: what each account actually talks about, attached to each post.
--
-- The lane vocabulary is derived ONCE per account and then reused. If the model
-- re-invented lane names on every run, "Brand teardowns" would become "Brand
-- case studies" next week and every historical comparison would break — so the
-- taxonomy is persisted and new posts are classified AGAINST it, with an
-- "other" escape hatch. When "other" grows past a threshold the account's
-- content has genuinely shifted, which is itself worth surfacing.
alter table public.post_metrics
  add column if not exists content_lane text;

-- Lane performance is always read per account over a window, so this index
-- covers the way the rollups actually query.
create index if not exists post_metrics_lane_idx
  on public.post_metrics (platform, handle, content_lane)
  where content_lane is not null;

create table if not exists public.content_taxonomy (
  platform text not null check (platform in ('instagram', 'linkedin')),
  handle text not null,
  -- [{ name, definition }] — the stable vocabulary for this account.
  lanes jsonb not null,
  generated_at timestamptz not null default now(),
  primary key (platform, handle)
);

alter table public.content_taxonomy enable row level security;
