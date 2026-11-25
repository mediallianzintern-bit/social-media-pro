-- 0042 — two clients can hold the same item without clashing
-- (multi-client plan; 25 Nov 2026).
--
-- 0040 gave every client-owned table a client_id, but each table's unique key
-- still ignored it: two clients could not both vote on the same news story,
-- watch the same creator, save LinkedIn figures for the same day, or keep a
-- LinkedIn connection each. This adds client_id to the 14 keys where two
-- clients can meet. The other ten client tables are keyed by a random id, or
-- by a post id that belongs to one account, so they cannot collide.
--
--   saved_topics, topic_feedback   (platform, item_kind, item_id)
--   voice_references               (platform, title)
--   content_calendar               (content_hash)
--   lane_patterns                  (platform, lane)
--   discovered_reels               (platform, post_id)
--   watched_creators               (platform, handle)
--   niche_models                   (platform, niche)          primary key
--   competitor_watchlist           (platform, handle)         primary key
--   platform_tokens                (platform)                 primary key
--   linkedin_reach_cache           (period)                   primary key
--   linkedin_content               (post_id)                  primary key
--   linkedin_account_daily         (day)                      primary key
--   linkedin_member_daily          (day)                      primary key
--
-- Each becomes (client_id, ...). Every row today is Pritesh's, so no row can
-- break the wider key.
--
-- ORDER: push the app first, then apply this. The app (server/tenant/db.ts)
-- adds client_id to its upserts' conflict keys only once this has run, which
-- it learns from pro_tenant_keys() below; the app as deployed before that
-- change still names the old keys and would fail to save until redeployed.
--
-- Idempotent, and safe to re-run: a key that already includes client_id is
-- left as it is.

do $$
declare
  r record;
  con text;
  wanted text[];
  existing text[];
begin
  for r in
    select * from (values
      ('saved_topics', 'u', 'platform,item_kind,item_id'),
      ('topic_feedback', 'u', 'platform,item_kind,item_id'),
      ('voice_references', 'u', 'platform,title'),
      ('content_calendar', 'u', 'content_hash'),
      ('lane_patterns', 'u', 'platform,lane'),
      ('discovered_reels', 'u', 'platform,post_id'),
      ('watched_creators', 'u', 'platform,handle'),
      ('niche_models', 'p', 'platform,niche'),
      ('competitor_watchlist', 'p', 'platform,handle'),
      ('platform_tokens', 'p', 'platform'),
      ('linkedin_reach_cache', 'p', 'period'),
      ('linkedin_content', 'p', 'post_id'),
      ('linkedin_account_daily', 'p', 'day'),
      ('linkedin_member_daily', 'p', 'day')
    ) as v(tbl, kind, cols)
  loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'Skipping %: table does not exist', r.tbl;
      continue;
    end if;

    -- Already widened (a re-run): nothing to do.
    wanted := (select array_agg(x order by x) from unnest(string_to_array('client_id,' || r.cols, ',')) x);
    con := null;
    select c.conname into con
      from pg_constraint c
     where c.conrelid = ('public.' || r.tbl)::regclass
       and c.contype = r.kind::"char"
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) = wanted;
    if con is not null then
      continue;
    end if;

    -- The old key, found by its columns, whatever Postgres named it.
    existing := (select array_agg(x order by x) from unnest(string_to_array(r.cols, ',')) x);
    con := null;
    select c.conname into con
      from pg_constraint c
     where c.conrelid = ('public.' || r.tbl)::regclass
       and c.contype = r.kind::"char"
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) = existing;
    if con is not null then
      execute format('alter table public.%I drop constraint %I', r.tbl, con);
    end if;

    if r.kind = 'p' then
      execute format('alter table public.%I add primary key (client_id, %s)', r.tbl, r.cols);
    else
      execute format('alter table public.%I add constraint %I unique (client_id, %s)',
        r.tbl, r.tbl || '_client_key', r.cols);
    end if;
  end loop;
end $$;

-- How the app learns this has run: it asks, and before 0042 the function does
-- not exist. It returns a constant and reads nothing.
create or replace function public.pro_tenant_keys()
returns boolean
language sql
stable
as $$ select true $$;

comment on function public.pro_tenant_keys() is
  'True once 0042 has widened the client-owned unique keys to include client_id.';
