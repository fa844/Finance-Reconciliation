-- Single row for global app settings (id = 1). All users share the same reference date.
-- Run this once in the Supabase SQL editor.

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  reference_date date
);

-- Ensure the single row exists
insert into public.app_settings (id, reference_date) values (1, current_date)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Any authenticated user can read the global reference date
create policy "Authenticated users can read app settings"
  on public.app_settings for select
  to authenticated
  using (true);

-- Any authenticated user can update the global reference date (one user's change affects everyone)
create policy "Authenticated users can update app settings"
  on public.app_settings for update
  to authenticated
  using (true)
  with check (true);
