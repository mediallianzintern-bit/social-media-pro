-- 0041 — each client's level of service: full or tracking only
-- (multi-client plan; 25 Nov 2026).
--
-- Until now Pro decided "every feature" by asking whether the client was
-- Pritesh. This puts the answer on the client itself:
--
--   full      ideas, scripts, trends, Published, learning, To do, reports;
--   tracking  Home, the account pages (summary, posts, audience,
--             competitors), reports and Settings. The server refuses every
--             other action for such a client, paid AI included.
--
-- Pritesh is full; every client linked from Studio starts as tracking.
-- (The app treats a Studio client set to full as tracking until it has its
-- own voice and connections, so its scripts can never come out in Pritesh's
-- voice.)
--
-- Additive only. Idempotent, and safe to re-run.

alter table public.clients
  add column if not exists service text not null default 'tracking';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_service_check') then
    alter table public.clients
      add constraint clients_service_check check (service in ('full', 'tracking'));
  end if;
end $$;

update public.clients set service = 'full' where source = 'pro' and service <> 'full';

comment on column public.clients.service is
  'full: every feature; tracking: measurement only (Home, account pages, reports, Settings).';
