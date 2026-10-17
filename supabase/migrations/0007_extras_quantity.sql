-- Optional quantity + unit on manually added shopping items.
alter table shopping_extras add column quantity numeric, add column unit text not null default '';
