create extension if not exists pgcrypto;

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
);

create table household_members (
  household_id uuid references households on delete cascade,
  user_id uuid references auth.users on delete cascade,
  display_name text,
  primary key (household_id, user_id)
);

create function is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid())
$$;

create table preferences (
  household_id uuid primary key references households on delete cascade,
  diets text[] not null default '{}',
  allergies text[] not null default '{}',
  dislikes text[] not null default '{}',
  favorite_cuisines text[] not null default '{}',
  weeknight_max_minutes int not null default 60,
  new_ideas_per_week int not null default 1 check (new_ideas_per_week between 0 and 3),
  notes text not null default ''
);

create table slot_template (
  household_id uuid references households on delete cascade,
  weekday int check (weekday between 0 and 6),
  slots text[] not null default '{dinner}',
  primary key (household_id, weekday)
);

create table dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  cuisine text not null default '',
  tags text[] not null default '{}',
  prep_minutes int not null default 30,
  servings int not null default 4,
  instructions text not null default '',
  source text not null default 'manual' check (source in ('manual','ai')),
  status text not null default 'active' check (status in ('active','idea','archived')),
  created_at timestamptz not null default now()
);

create table dish_ingredients (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references dishes on delete cascade,
  name text not null,
  quantity numeric,
  unit text not null default '',
  category text not null default '',
  note text not null default ''
);

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  week_start date not null,
  unique (household_id, week_start)
);

create table plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references meal_plans on delete cascade,
  date date not null,
  slot text not null,
  dish_id uuid references dishes on delete set null,
  status text not null default 'planned' check (status in ('planned','cooked','skipped')),
  locked boolean not null default false,
  unique (plan_id, date, slot)
);

create table dish_ratings (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references dishes on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  plan_entry_id uuid references plan_entries on delete set null,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create table dish_events (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references dishes on delete cascade,
  type text not null check (type in ('cooked','skipped','swapped_out','idea_accepted','idea_rejected')),
  created_at timestamptz not null default now()
);

create table shopping_checks (
  household_id uuid references households on delete cascade,
  range_key text,
  item_key text,
  have boolean not null default true,
  primary key (household_id, range_key, item_key)
);

-- Stats + affinity (higher = liked more)
create view dish_stats with (security_invoker = true) as
select
  d.id as dish_id,
  d.household_id,
  coalesce(e.cooked, 0) as times_cooked,
  e.last_cooked_at,
  r.avg_rating,
  coalesce(e.swaps, 0) as swap_count,
  coalesce(e.skips, 0) as skip_count,
  coalesce(r.avg_rating, 3) - 3
    + ln(1 + coalesce(e.cooked, 0)) * 0.5
    - 0.5 * coalesce(e.swaps, 0)
    - 0.3 * coalesce(e.skips, 0) as affinity
from dishes d
left join (
  select dish_id,
    count(*) filter (where type = 'cooked') as cooked,
    max(created_at) filter (where type = 'cooked') as last_cooked_at,
    count(*) filter (where type = 'swapped_out') as swaps,
    count(*) filter (where type = 'skipped') as skips
  from dish_events group by dish_id
) e on e.dish_id = d.id
left join (
  select dish_id, avg(rating)::float as avg_rating from dish_ratings group by dish_id
) r on r.dish_id = d.id;

-- Create household + join by code (bypass RLS safely)
create function create_household(h_name text, d_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  insert into households(name) values (h_name) returning id into hid;
  insert into household_members values (hid, auth.uid(), d_name);
  insert into preferences(household_id) values (hid);
  insert into slot_template(household_id, weekday) select hid, g from generate_series(0,6) g;
  return hid;
end $$;

create function join_household(code text, d_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select id into hid from households where invite_code = code;
  if hid is null then raise exception 'Invalid invite code'; end if;
  insert into household_members values (hid, auth.uid(), d_name) on conflict do nothing;
  return hid;
end $$;

-- RLS
alter table households enable row level security;
alter table household_members enable row level security;
alter table preferences enable row level security;
alter table slot_template enable row level security;
alter table dishes enable row level security;
alter table dish_ingredients enable row level security;
alter table meal_plans enable row level security;
alter table plan_entries enable row level security;
alter table dish_ratings enable row level security;
alter table dish_events enable row level security;
alter table shopping_checks enable row level security;

create policy h_sel on households for select using (is_member(id));
create policy h_upd on households for update using (is_member(id));
create policy m_sel on household_members for select using (is_member(household_id));
create policy pref_all on preferences for all using (is_member(household_id)) with check (is_member(household_id));
create policy slot_all on slot_template for all using (is_member(household_id)) with check (is_member(household_id));
create policy dish_all on dishes for all using (is_member(household_id)) with check (is_member(household_id));
create policy ing_all on dish_ingredients for all
  using (exists (select 1 from dishes d where d.id = dish_id and is_member(d.household_id)))
  with check (exists (select 1 from dishes d where d.id = dish_id and is_member(d.household_id)));
create policy plan_all on meal_plans for all using (is_member(household_id)) with check (is_member(household_id));
create policy entry_all on plan_entries for all
  using (exists (select 1 from meal_plans p where p.id = plan_id and is_member(p.household_id)))
  with check (exists (select 1 from meal_plans p where p.id = plan_id and is_member(p.household_id)));
create policy rating_all on dish_ratings for all
  using (exists (select 1 from dishes d where d.id = dish_id and is_member(d.household_id)))
  with check (exists (select 1 from dishes d where d.id = dish_id and is_member(d.household_id)));
create policy event_all on dish_events for all
  using (exists (select 1 from dishes d where d.id = dish_id and is_member(d.household_id)))
  with check (exists (select 1 from dishes d where d.id = dish_id and is_member(d.household_id)));
create policy check_all on shopping_checks for all using (is_member(household_id)) with check (is_member(household_id));

-- Realtime
alter publication supabase_realtime add table plan_entries, meal_plans, dishes, dish_ingredients, shopping_checks;
