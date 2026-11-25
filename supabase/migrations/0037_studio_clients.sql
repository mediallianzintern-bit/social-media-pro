-- 0037 — Pro adopts Studio's clients (Studio spec §5.2, §10 Phase 5; build
-- tracker T12 "Multi-client foundation").
--
-- Studio owns the shared brand profile: a client is described once, in Studio,
-- and a manager links it to Pro there. Pro reads its linked clients through
-- Studio's server (STUDIO_BRIDGE_URL + PRO_BRIDGE_SECRET) and keeps one row
-- per client here, for the Pro-only settings Studio does not hold (growth goal,
-- metrics, engagement start).
--
-- Pritesh's existing row is kept exactly as it is (source 'pro'): every query
-- that does not name a client still means him, so his dashboard, lanes and
-- learning are unchanged.
--
-- Additive only. Idempotent, and safe to re-run.

alter table public.clients
  add column if not exists studio_client_id uuid,
  add column if not exists source text not null default 'pro';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_source_check') then
    alter table public.clients
      add constraint clients_source_check check (source in ('pro', 'studio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_studio_link_check') then
    -- A Studio client always carries its Studio id; a Pro-only client never does.
    alter table public.clients
      add constraint clients_studio_link_check
      check ((source = 'studio') = (studio_client_id is not null));
  end if;
end $$;

create unique index if not exists clients_studio_client_id_key
  on public.clients (studio_client_id) where studio_client_id is not null;

-- One client per Instagram account: two rows on one handle would split, or
-- double count, the same posts.
create unique index if not exists clients_instagram_handle_key
  on public.clients (lower(instagram_handle)) where instagram_handle is not null;

comment on column public.clients.studio_client_id is
  'The client''s id in Social Pulse Studio, when Studio owns its brand profile (source = studio).';
