-- Per-dish notes, who-did-what on the shopping list, and remembered/staple items.
alter table dishes add column notes text not null default '';

alter table shopping_extras add column added_by_name text, add column have_by_name text;
alter table shopping_checks add column have_by_name text;

create table shopping_staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name_key text not null,
  name text not null,
  category text not null default 'Other',
  pinned boolean not null default false,
  uses int not null default 1,
  last_used timestamptz not null default now(),
  unique (household_id, name_key)
);
alter table shopping_staples enable row level security;
create policy staples_all on shopping_staples for all using (is_member(household_id)) with check (is_member(household_id));
alter publication supabase_realtime add table shopping_staples;
