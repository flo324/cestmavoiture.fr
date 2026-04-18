-- =============================================================================
-- Si l'erreur dit : Could not find the 'user_id' column of 'vehicles'
-- → exécuter ce script dans SQL Editor (une fois), puis réessayer l'app.
-- =============================================================================

-- 1) Colonne propriétaire (liée au compte auth)
alter table public.vehicles
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists vehicles_user_id_idx on public.vehicles (user_id);

-- 2) RLS : chaque utilisateur ne voit que ses véhicules
alter table public.vehicles enable row level security;

drop policy if exists "vehicles_select_own" on public.vehicles;
drop policy if exists "vehicles_insert_own" on public.vehicles;
drop policy if exists "vehicles_update_own" on public.vehicles;
drop policy if exists "vehicles_delete_own" on public.vehicles;

create policy "vehicles_select_own" on public.vehicles for select using (auth.uid () = user_id);
create policy "vehicles_insert_own" on public.vehicles for insert with check (auth.uid () = user_id);
create policy "vehicles_update_own" on public.vehicles for update using (auth.uid () = user_id);
create policy "vehicles_delete_own" on public.vehicles for delete using (auth.uid () = user_id);

-- 3) Lignes orphelines sans user_id (facultatif, si la table était déjà remplie)
-- delete from public.vehicles where user_id is null;
