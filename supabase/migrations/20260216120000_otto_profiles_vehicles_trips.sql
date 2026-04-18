-- =============================================================================
-- OTTO — Schéma Supabase Cloud : profiles, vehicles, trips + RLS
-- Exécution : SQL Editor (Dashboard) ou `supabase db push`
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Profils utilisateur (1 ligne par compte auth)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Profil OTTO lié à auth.users';

-- -----------------------------------------------------------------------------
-- Véhicules (propriété = user_id)
-- -----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  marque text not null default '',
  modele text not null default '',
  immatriculation text not null default '',
  kilometrage numeric not null default 0,
  photo_url text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists vehicles_user_id_idx on public.vehicles (user_id);

comment on table public.vehicles is 'Véhicules OTTO';

-- -----------------------------------------------------------------------------
-- Trajets (liés à un véhicule appartenant à l’utilisateur)
-- Colonne "date" entre guillemets (mot réservé SQL)
-- -----------------------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid (),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  depart text not null default '',
  arrivee text not null default '',
  distance numeric,
  "date" timestamptz not null default now (),
  created_at timestamptz not null default now ()
);

create index if not exists trips_vehicle_id_idx on public.trips (vehicle_id);
create index if not exists trips_date_idx on public.trips ("date");

comment on table public.trips is 'Trajets OTTO';

-- -----------------------------------------------------------------------------
-- updated_at automatique (vehicles)
-- -----------------------------------------------------------------------------
create or replace function public.otto_set_updated_at () returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists vehicles_otto_updated_at on public.vehicles;
create trigger vehicles_otto_updated_at
before update on public.vehicles
for each row execute function public.otto_set_updated_at ();

drop trigger if exists profiles_otto_updated_at on public.profiles;
create trigger profiles_otto_updated_at
before update on public.profiles
for each row execute function public.otto_set_updated_at ();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.trips enable row level security;

-- --- profiles : uniquement sa ligne (id = auth.uid)
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select using (auth.uid () = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid () = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid () = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid () = id);

-- --- vehicles : CRUD si user_id = auth.uid
drop policy if exists "vehicles_select_own" on public.vehicles;
drop policy if exists "vehicles_insert_own" on public.vehicles;
drop policy if exists "vehicles_update_own" on public.vehicles;
drop policy if exists "vehicles_delete_own" on public.vehicles;

create policy "vehicles_select_own" on public.vehicles for select using (auth.uid () = user_id);
create policy "vehicles_insert_own" on public.vehicles for insert with check (auth.uid () = user_id);
create policy "vehicles_update_own" on public.vehicles for update using (auth.uid () = user_id);
create policy "vehicles_delete_own" on public.vehicles for delete using (auth.uid () = user_id);

-- --- trips : uniquement si le véhicule appartient à l’utilisateur
drop policy if exists "trips_select_own" on public.trips;
drop policy if exists "trips_insert_own" on public.trips;
drop policy if exists "trips_update_own" on public.trips;
drop policy if exists "trips_delete_own" on public.trips;

create policy "trips_select_own" on public.trips for select using (
  exists (
    select 1
    from public.vehicles v
    where v.id = trips.vehicle_id and v.user_id = auth.uid ()
  )
);

create policy "trips_insert_own" on public.trips for insert with check (
  exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id and v.user_id = auth.uid ()
  )
);

create policy "trips_update_own" on public.trips for update using (
  exists (
    select 1
    from public.vehicles v
    where v.id = trips.vehicle_id and v.user_id = auth.uid ()
  )
);

create policy "trips_delete_own" on public.trips for delete using (
  exists (
    select 1
    from public.vehicles v
    where v.id = trips.vehicle_id and v.user_id = auth.uid ()
  )
);

-- -----------------------------------------------------------------------------
-- Optionnel : créer automatiquement une ligne profiles à l’inscription
-- (décommentez si vous ne créez pas le profil côté app)
-- -----------------------------------------------------------------------------
-- create or replace function public.handle_new_user_otto ()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   insert into public.profiles (id, email, full_name)
--   values (
--     new.id,
--     new.email,
--     coalesce(new.raw_user_meta_data ->> 'full_name', '')
--   );
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists on_auth_user_created_otto on auth.users;
-- create trigger on_auth_user_created_otto
--   after insert on auth.users
--   for each row execute function public.handle_new_user_otto ();
