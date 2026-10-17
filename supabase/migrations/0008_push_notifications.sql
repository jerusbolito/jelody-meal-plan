-- Web Push: one row per subscribed device, plus that person's reminder preferences.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',          -- IANA time zone, so reminders fire at local time
  meal_enabled boolean not null default true,
  meal_time time not null default '08:00', -- local time for "today's meals"
  shop_enabled boolean not null default true,
  last_meal_on date,                       -- local dates already notified (prevents repeats)
  last_shop_on date,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy push_own on push_subscriptions for all
  using (user_id = auth.uid() and is_member(household_id))
  with check (user_id = auth.uid() and is_member(household_id));
