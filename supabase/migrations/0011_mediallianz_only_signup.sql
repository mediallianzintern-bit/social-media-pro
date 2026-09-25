-- 0011 — only @mediallianz.com accounts can exist.
--
-- The sign-up form checks the domain, and every server function re-checks it
-- (src/lib/require-staff.ts). This is the layer neither can be talked around:
-- the database itself refuses to create — or rename — an auth user whose email
-- is not on the domain, whether the request comes from this app, a script
-- calling Supabase directly, or anything else holding the public key.
--
-- Works together with "Confirm email" (on for this project): the domain rule
-- decides WHICH addresses may register; confirmation proves the person owns
-- the inbox. Without confirmation anyone could register as x@mediallianz.com.
--
-- Idempotent. Run in the Supabase SQL editor.

create or replace function public.enforce_mediallianz_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Anchored at both ends with a single "@": rejects look-alikes such as
  -- x@evil.mediallianz.com, x@mediallianz.com.evil.io and a@mediallianz.com@evil.io.
  if new.email is null or new.email !~* '^[^@[:space:]]+@mediallianz\.com$' then
    raise exception 'Only @mediallianz.com email addresses can use this dashboard.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_mediallianz_email on auth.users;

create trigger enforce_mediallianz_email
  before insert or update of email on auth.users
  for each row
  execute function public.enforce_mediallianz_email();
