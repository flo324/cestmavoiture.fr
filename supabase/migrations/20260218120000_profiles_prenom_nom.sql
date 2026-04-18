-- Prénom / nom conducteur sur public.profiles (1 ligne par compte)
alter table public.profiles add column if not exists prenom text not null default '';
alter table public.profiles add column if not exists nom text not null default '';
