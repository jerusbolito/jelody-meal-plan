-- Only allow-listed emails may sign up or use the app (protects AI credits).
create table allowed_emails (email text primary key check (email = lower(email)));
alter table allowed_emails enable row level security; -- no policies: only security-definer functions can read it

-- Keep everyone who already has an account
insert into allowed_emails select lower(email) from auth.users where email is not null on conflict do nothing;

create function is_allowed_email(e text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from allowed_emails where email = lower(e))
$$;

-- 1) Block sign-up for anyone not on the list
create function block_unlisted_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_allowed_email(new.email) then
    raise exception 'Email not allowed';
  end if;
  return new;
end $$;
create trigger on_auth_user_created_check before insert on auth.users
  for each row execute function block_unlisted_signup();

-- 2) Also lock out existing accounts if removed from the list: no household access, so no data and no AI calls
create or replace function is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed_email(auth.jwt() ->> 'email')
    and exists (select 1 from household_members where household_id = h and user_id = auth.uid())
$$;

create or replace function create_household(h_name text, d_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if not is_allowed_email(auth.jwt() ->> 'email') then raise exception 'Email not allowed'; end if;
  insert into households(name) values (h_name) returning id into hid;
  insert into household_members values (hid, auth.uid(), d_name);
  insert into preferences(household_id) values (hid);
  insert into slot_template(household_id, weekday) select hid, g from generate_series(0,6) g;
  return hid;
end $$;

create or replace function join_household(code text, d_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if not is_allowed_email(auth.jwt() ->> 'email') then raise exception 'Email not allowed'; end if;
  select id into hid from households where invite_code = code;
  if hid is null then raise exception 'Invalid invite code'; end if;
  insert into household_members values (hid, auth.uid(), d_name) on conflict do nothing;
  return hid;
end $$;

-- To allow someone:  insert into allowed_emails values ('partner@example.com');
-- To remove them:    delete from allowed_emails where email = 'partner@example.com';
