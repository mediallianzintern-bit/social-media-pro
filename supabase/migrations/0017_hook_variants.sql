-- T63 — the hook A/B.
--
-- Every idea is now written with two alternative first lines beside its own,
-- so the team can choose how to open rather than taking the one the model
-- happened to write first. The alternatives themselves need no column: they
-- ride in `payload`, which already holds the whole idea.
--
-- What does need storing is the CHOICE. The learning loop classifies an
-- idea's opening and groups outcomes by that shape, so if variant B is the one
-- filmed and nothing records it, every lesson the loop draws is attributed to
-- a hook that was never used. Null means the idea's own first hook, which is
-- what every idea made before this used.
alter table public.suggested_ideas
  add column if not exists chosen_hook text;
