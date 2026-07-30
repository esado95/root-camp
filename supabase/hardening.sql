-- Root Camp — durcissement serveur (issu de la revue de sécurité)
-- À exécuter une fois dans le SQL Editor, APRÈS setup.sql.

-- Format du pseudo imposé côté base (le client peut être contourné)
alter table public.profiles
  add constraint pseudo_format check (pseudo ~ '^[A-Za-z0-9_-]{2,20}$');

-- Unicité du pseudo insensible à la casse (« Sofia » et « sofia » = même pseudo)
create unique index if not exists profiles_pseudo_lower
  on public.profiles (lower(pseudo));

-- Bornes de plausibilité : bloque les valeurs absurdes dans le classement
alter table public.profiles
  add constraint xp_borne check (xp between 0 and 1000000),
  add constraint grade_borne check (grade between 1 and 7),
  add constraint badges_borne check (badges between 0 and 50),
  add constraint exam_borne check (exam_best between 0 and 100);

-- Pseudo non modifiable après création du profil
create or replace function public.pseudo_fige() returns trigger
language plpgsql as $$
begin
  if new.pseudo is distinct from old.pseudo then
    raise exception 'pseudo non modifiable';
  end if;
  return new;
end $$;

drop trigger if exists pseudo_fige on public.profiles;
create trigger pseudo_fige before update on public.profiles
  for each row execute function public.pseudo_fige();

-- Taille maximale d'une sauvegarde de progression : 256 Ko
alter table public.progress
  add constraint state_taille check (pg_column_size(state) < 262144);
