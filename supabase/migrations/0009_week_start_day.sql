-- First day of the week for the planner and shopping list: 0 = Monday ... 6 = Sunday.
alter table preferences add column week_start_day smallint not null default 0 check (week_start_day between 0 and 6);
