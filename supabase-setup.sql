-- Run this in your Supabase project: SQL Editor > New query > paste > Run.

create table if not exists meal_planner (
  device_id text primary key,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table meal_planner enable row level security;

-- This is a personal, no-login app keyed by a random device id.
-- The policy below allows the anon key to read/write. Because rows are keyed
-- by an unguessable UUID stored only in the user's browser, each device only
-- ever touches its own row. If you later add real auth, tighten this policy.
create policy "anon can manage own device row"
  on meal_planner
  for all
  to anon
  using (true)
  with check (true);
