-- ============================================================
-- Migration: Subscription Fixes (POD2_HANDOFF_SubscriptionFixes)
-- Version: v11.52 | Date: 2026-03-20
-- ============================================================

-- SUB-05: Add username column to profiles
alter table profiles add column if not exists username text;

-- Unique index (only on non-null usernames)
create unique index if not exists idx_profiles_username
  on profiles(username) where username is not null;

-- Auto-generate usernames for existing users (derives from name, handles collisions)
do $$
declare
  r record;
  base_name text;
  candidate text;
  n integer;
begin
  for r in select id, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1)) as display_name, email
           from auth.users
           where id not in (select id from profiles where username is not null)
  loop
    base_name := lower(regexp_replace(coalesce(r.display_name, split_part(r.email,'@',1)), '[^a-z0-9]', '', 'g'));
    if length(base_name) < 3 then base_name := split_part(lower(r.email),'@',1); end if;
    base_name := substring(base_name from 1 for 28);
    candidate := base_name;
    n := 2;
    loop
      begin
        update profiles set username = candidate where id = r.id;
        exit;
      exception when unique_violation then
        candidate := base_name || n::text;
        n := n + 1;
        if n > 999 then exit; end if;
      end;
    end loop;
  end loop;
end $$;
