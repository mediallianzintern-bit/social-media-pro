-- Read-only. Lists every index, constraint, function and trigger the
-- migrations 0001-0039 create, and shows only the ones the database lacks.
with expected(kind, name, migration) as (values
  ('index','account_snapshots_series_idx','0001'),
  ('index','post_metrics_published_idx','0001'),
  ('index','account_insights_series_idx','0002'),
  ('index','suggested_ideas_platform_idx','0004'),
  ('index','suggested_ideas_shortcode_idx','0004'),
  ('index','post_metrics_lane_idx','0005'),
  ('index','outcomes_platform_idx','0006'),
  ('index','predictions_niche_idx','0007'),
  ('constraint','suggested_ideas_source_signal_check','0008'),
  ('constraint','suggested_ideas_status_check','0008'),
  ('index','trend_observations_niche_idx','0008'),
  ('constraint','suggested_ideas_format_check','0010'),
  ('index','source_items_platform_idx','0010'),
  ('function','enforce_mediallianz_email','0011'),
  ('trigger','enforce_mediallianz_email','0011'),
  ('index','content_calendar_lane_idx','0012'),
  ('index','content_calendar_platform_idx','0012'),
  ('index','content_calendar_subjects_idx','0012'),
  ('index','content_eras_lookup_idx','0013'),
  ('index','topic_feedback_platform_idx','0014'),
  ('constraint','suggested_ideas_format_template_check','0015'),
  ('index','reaction_sources_platform_idx','0015'),
  ('index','suggested_ideas_format_template_idx','0015'),
  ('index','saved_topics_platform_idx','0018'),
  ('index','discovered_reels_lane_idx','0019'),
  ('index','discovered_reels_platform_idx','0019'),
  ('index','reel_learning_platform_idx','0020'),
  ('index','watched_creators_platform_idx','0021'),
  ('index','creator_search_runs_platform_idx','0023'),
  ('index','linkedin_content_handle','0032'),
  ('index','script_feedback_platform_idx','0033'),
  ('index','source_items_first_seen_idx','0034'),
  ('index','linkedin_post_learning_published_idx','0036'),
  ('constraint','clients_source_check','0037'),
  ('constraint','clients_studio_link_check','0037'),
  ('index','clients_instagram_handle_key','0037'),
  ('index','clients_studio_client_id_key','0037'),
  ('constraint','account_snapshots_role_check','0038'),
  ('index','sync_runs_client_idx','0038'),
  ('constraint','client_competitors_kind_check','0039')
),
found as (
  select 'index' as kind, indexname as name from pg_indexes where schemaname = 'public'
  union all select 'constraint', conname from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'
  union all select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  union all select 'trigger', t.tgname from pg_trigger t where not t.tgisinternal and t.tgenabled <> 'D'
)
select e.migration, e.kind, e.name, 'MISSING' as status
from expected e
where not exists (select 1 from found f where f.kind = e.kind and f.name = e.name)
union all
select 'all', 'summary', count(*)::text || ' expected, ' ||
  count(*) filter (where exists (select 1 from found f where f.kind = e.kind and f.name = e.name))::text || ' found', 'TOTAL'
from expected e
order by 1;
