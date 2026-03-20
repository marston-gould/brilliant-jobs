-- Migration: hidden_jobs table (v11.53)
-- Fixes 404 on /rest/v1/hidden_jobs in SPA dashboard
create table if not exists hidden_jobs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  job_id     text        not null,
  hidden_at  timestamptz not null default now(),
  unique(user_id, job_id)
);
alter table hidden_jobs enable row level security;
create index if not exists idx_hidden_jobs_user on hidden_jobs(user_id);
create policy hidden_jobs_own on hidden_jobs
  for all to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
