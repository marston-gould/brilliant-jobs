-- ============================================================
-- Migration: Feedback System tables (POD2_HANDOFF_FeedbackSystem)
-- Version: v11.50 | Date: 2026-03-20
-- ============================================================

-- D.1 exit_surveys
create table if not exists exit_surveys (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  survey_type     text        not null,
  platform        text,
  platform_other  text,
  satisfaction    integer     check (satisfaction >= 1 and satisfaction <= 5),
  follow_up       text,
  user_id         uuid,
  page_url        text,
  visit_count     integer,
  segment         text,
  session_number  integer
);
alter table exit_surveys enable row level security;
create policy exit_surveys_anon_insert   on exit_surveys for insert to anon          with check (true);
create policy exit_surveys_auth_insert   on exit_surveys for insert to authenticated  with check (true);
create policy exit_surveys_own_select    on exit_surveys for select to authenticated  using (user_id = auth.uid());

-- D.2 bug_reports
create table if not exists bug_reports (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid        not null,
  what_happened   text        not null,
  what_expected   text        not null,
  page_name       text,
  screenshot_url  text,
  severity        text        not null check (severity in ('minor','blocking','critical')),
  status          text        not null default 'submitted' check (status in ('submitted','confirmed','wont_fix','duplicate')),
  credits_awarded integer     not null default 0,
  admin_notes     text
);
alter table bug_reports enable row level security;
create policy bug_reports_auth_insert    on bug_reports for insert to authenticated  with check (user_id = auth.uid());
create policy bug_reports_own_select     on bug_reports for select to authenticated  using (user_id = auth.uid());

-- D.3 feature_suggestions
create table if not exists feature_suggestions (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid        not null,
  suggestion_type text        not null check (suggestion_type in ('new_feature','change_existing')),
  category        text        not null,
  description     text        not null,
  rationale       text,
  status          text        not null default 'submitted' check (status in ('submitted','planned','shipped','declined')),
  admin_notes     text
);
alter table feature_suggestions enable row level security;
create policy feature_suggestions_auth_insert on feature_suggestions for insert to authenticated with check (user_id = auth.uid());
create policy feature_suggestions_own_select  on feature_suggestions for select to authenticated using (user_id = auth.uid());

-- D.4 Cohort config keys in app_settings
insert into app_settings (key, value, description, updated_at) values
  ('sat_popup_delay_minutes', '5',  'Minutes after session start before satisfaction prompt appears',       now()),
  ('sat_session_cadence',     '10', 'Show satisfaction prompt every N sessions (10 = sessions 10,20,30)',   now()),
  ('bug_reward_standard',     '5',  'Credits for confirmed minor/blocking bug reports',                     now()),
  ('bug_reward_critical',     '15', 'Credits for confirmed critical bug reports',                           now())
on conflict (key) do nothing;
