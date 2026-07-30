-- Root Camp — schéma Supabase
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

-- 1. Profils publics (visibles dans le classement)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text unique not null check (char_length(pseudo) between 2 and 20),
  xp integer not null default 0,
  grade integer not null default 1,
  badges integer not null default 0,
  exam_best integer not null default 0,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 2. Progression complète (privée : sert à la synchronisation multi-appareils)
create table public.progress (
  id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- 3. Sécurité : Row Level Security
alter table public.profiles enable row level security;
alter table public.progress enable row level security;

-- Classement : tout utilisateur connecté voit les profils visibles
create policy "classement lisible" on public.profiles
  for select using (visible = true or auth.uid() = id);

-- Chacun ne crée et ne modifie que SON profil
create policy "creer son profil" on public.profiles
  for insert with check (auth.uid() = id);
create policy "modifier son profil" on public.profiles
  for update using (auth.uid() = id);

-- La progression n'est lisible et modifiable que par son propriétaire
create policy "lire sa progression" on public.progress
  for select using (auth.uid() = id);
create policy "creer sa progression" on public.progress
  for insert with check (auth.uid() = id);
create policy "modifier sa progression" on public.progress
  for update using (auth.uid() = id);
