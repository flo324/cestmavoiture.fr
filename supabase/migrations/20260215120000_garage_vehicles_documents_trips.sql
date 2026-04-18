-- Garage Connect : véhicules, pièces jointes logiques (JSON), trajets / stats km
-- Exécutez avec Supabase CLI : supabase db reset / migration up

-- Extensions utiles (généralement déjà activées sur Supabase)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Véhicules (aligné sur VehicleData / VehicleContext)
-- ---------------------------------------------------------------------------
create table if not exists public.vehicles (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  alias text not null default '',
  prenom text not null default '',
  nom text not null default '',
  modele text not null default '',
  immat text not null default '',
  photo_uri text not null default '',
  photo_bg_center text not null default '#334155',
  photo_bg_edge text not null default '#0B1120',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_user_id_idx on public.vehicles (user_id);

-- ---------------------------------------------------------------------------
-- Documents : une ligne par “bloc” métier (CG, permis, entretien, factures…)
-- payload jsonb = même structure que les JSON AsyncStorage actuels
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id text references public.vehicles (id) on delete set null,
  doc_type text not null,
  title text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists documents_vehicle_id_idx on public.documents (vehicle_id);
create index if not exists documents_doc_type_idx on public.documents (doc_type);

-- ---------------------------------------------------------------------------
-- Trajets (road trip IA, traces GPS, stats agrégées — meta JSON libre)
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id text references public.vehicles (id) on delete set null,
  title text,
  distance_km numeric,
  route jsonb,
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on public.trips (user_id);
create index if not exists trips_vehicle_id_idx on public.trips (vehicle_id);

-- ---------------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------------
create or replace function public.garage_set_updated_at () returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.garage_set_updated_at ();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.garage_set_updated_at ();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.documents enable row level security;
alter table public.trips enable row level security;

drop policy if exists "vehicles_select_own" on public.vehicles;
drop policy if exists "vehicles_insert_own" on public.vehicles;
drop policy if exists "vehicles_update_own" on public.vehicles;
drop policy if exists "vehicles_delete_own" on public.vehicles;
create policy "vehicles_select_own" on public.vehicles for select using (auth.uid () = user_id);
create policy "vehicles_insert_own" on public.vehicles for insert with check (auth.uid () = user_id);
create policy "vehicles_update_own" on public.vehicles for update using (auth.uid () = user_id);
create policy "vehicles_delete_own" on public.vehicles for delete using (auth.uid () = user_id);

drop policy if exists "documents_select_own" on public.documents;
drop policy if exists "documents_insert_own" on public.documents;
drop policy if exists "documents_update_own" on public.documents;
drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_select_own" on public.documents for select using (auth.uid () = user_id);
create policy "documents_insert_own" on public.documents for insert with check (auth.uid () = user_id);
create policy "documents_update_own" on public.documents for update using (auth.uid () = user_id);
create policy "documents_delete_own" on public.documents for delete using (auth.uid () = user_id);

drop policy if exists "trips_select_own" on public.trips;
drop policy if exists "trips_insert_own" on public.trips;
drop policy if exists "trips_update_own" on public.trips;
drop policy if exists "trips_delete_own" on public.trips;
create policy "trips_select_own" on public.trips for select using (auth.uid () = user_id);
create policy "trips_insert_own" on public.trips for insert with check (auth.uid () = user_id);
create policy "trips_update_own" on public.trips for update using (auth.uid () = user_id);
create policy "trips_delete_own" on public.trips for delete using (auth.uid () = user_id);
