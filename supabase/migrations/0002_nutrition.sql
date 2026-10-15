-- Estimated nutrition per serving (nullable = unknown)
alter table dishes
  add column calories int,
  add column protein_g numeric,
  add column carbs_g numeric,
  add column fat_g numeric,
  add column fiber_g numeric;
