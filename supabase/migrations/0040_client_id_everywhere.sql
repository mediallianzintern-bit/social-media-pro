-- 0040 — every client-owned table records which client a row belongs to
-- (multi-client plan, step 2; 25 Nov 2026).
--
-- 24 tables hold one client's own work (ideas, saved topics, reel and post
-- learning, LinkedIn data, feedback, calendar, creators, tokens) and until now
-- had no client column: they were Pritesh's because Pro had one client. This
-- adds client_id to each and files every existing row under Pritesh, the
-- first Pro client, which is who wrote all of them.
--
-- The app reads and writes these tables through server/tenant/db.ts, which
-- adds `client_id = <the request's client>` once this column exists. The
-- column DEFAULTS to Pritesh, so the app as deployed before this change keeps
-- working: anything it inserts without a client_id is his, as it always was.
--
-- Left for later, on purpose: the tables' unique keys do not include
-- client_id yet. Only Pritesh writes these tables today (Studio clients get
-- tracking only), so nothing can collide; the keys are widened when a second
-- client gets the full service.
--
-- suggested_ideas already has a client_id from 0008, nullable and never
-- filled; it is filled and made required here like the rest.
--
-- Additive only. Idempotent, and safe to re-run. `decoded_links` is a shared
-- cache of resolved URLs, not one client's, and is left as it is.

do $$
declare
  pritesh uuid;
  t text;
  tenant_tables text[] := array[
    'suggested_ideas', 'saved_topics', 'reel_learning', 'linkedin_post_learning',
    'linkedin_articles', 'linkedin_post_analytics', 'linkedin_reach_cache',
    'linkedin_content', 'linkedin_account_daily', 'linkedin_member_daily',
    'voice_references', 'script_feedback', 'topic_feedback', 'content_calendar',
    'content_eras', 'content_proposals', 'lane_patterns', 'niche_models',
    'discovered_reels', 'watched_creators', 'creator_search_runs',
    'competitor_watchlist', 'platform_tokens', 'trend_observations'
  ];
begin
  select id into pritesh
    from public.clients
   where source = 'pro'
   order by created_at
   limit 1;
  if pritesh is null then
    raise exception 'No Pro client (Pritesh) in public.clients; nothing to file the existing rows under.';
  end if;

  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Skipping %: table does not exist', t;
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists client_id uuid references public.clients (id)', t);
    execute format('update public.%I set client_id = %L where client_id is null', t, pritesh);
    execute format('alter table public.%I alter column client_id set default %L', t, pritesh);
    execute format('alter table public.%I alter column client_id set not null', t);
    execute format('create index if not exists %I on public.%I (client_id)', t || '_client_idx', t);
  end loop;
end $$;
