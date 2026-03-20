-- ============================================================
-- Migration: create payl_waitlist table
-- Spec ref: POD3_HANDOFF_PricingModule, Section 8.6
-- Version: v11.46
-- Date: 2026-03-20
-- ============================================================

create table if not exists payl_waitlist (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null unique,
  created_at  timestamptz not null default now(),
  source      text        not null default 'pricing_page',
  notified_at timestamptz null
);

-- Index for email lookups
create index if not exists payl_waitlist_email_idx on payl_waitlist (email);

-- RLS: public insert allowed (anon role); select/update restricted to service role
alter table payl_waitlist enable row level security;

-- Anon can insert (signup from landing page)
create policy "payl_waitlist_anon_insert"
  on payl_waitlist
  for insert
  to anon
  with check (true);

-- Authenticated users cannot select (service role only)
-- Service role bypasses RLS automatically, so no explicit select policy needed.
-- Ensure no accidental select by authenticated:
create policy "payl_waitlist_no_select"
  on payl_waitlist
  for select
  using (false);
