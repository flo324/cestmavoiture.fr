-- =============================================================================
-- OTTO — À exécuter UNE FOIS dans Supabase : SQL Editor → coller tout → Run
-- Crée public.profiles (prénom/nom) + RLS. Sans danger si déjà partiellement créé.
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists prenom text not null default '';
alter table public.profiles add column if not exists nom text not null default '';

create or replace function public.otto_set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_otto_updated_at on public.profiles;
create trigger profiles_otto_updated_at
before update on public.profiles
for each row execute function public.otto_set_updated_at ();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select using (auth.uid () = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid () = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid () = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid () = id);
