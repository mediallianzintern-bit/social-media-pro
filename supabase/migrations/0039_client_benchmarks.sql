-- 0039 — a Studio client's aspirational account, measured as a benchmark
-- (Studio spec §3.11 and §7.6).
--
-- Studio's brand profile names competitors and the aspirational account(s)
-- the client wants to grow into. The spec has Pro take the competitors as
-- PEERS and the aspirational account as a BENCHMARK. 0038 stored only the
-- competitors; this marks each row with which of the two it is, so the
-- aspirational account is collected beside them and labelled as what it is.
--
-- Additive only. Idempotent, and safe to re-run. Every existing row is a
-- competitor, so it defaults to 'peer'.

alter table public.client_competitors
  add column if not exists kind text not null default 'peer';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_competitors_kind_check') then
    alter table public.client_competitors
      add constraint client_competitors_kind_check check (kind in ('peer', 'benchmark'));
  end if;
end $$;

comment on column public.client_competitors.kind is
  'peer: a competitor named in the Studio brand profile; benchmark: an aspirational account the client wants to grow into.';
