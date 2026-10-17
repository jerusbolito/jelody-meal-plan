-- Manually added shopping list items (not tied to a dish or date range).
create table shopping_extras (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  category text not null default 'Other',
  have boolean not null default false,
  created_at timestamptz not null default now()
);
alter table shopping_extras enable row level security;
create policy extras_all on shopping_extras for all using (is_member(household_id)) with check (is_member(household_id));
alter publication supabase_realtime add table shopping_extras;
