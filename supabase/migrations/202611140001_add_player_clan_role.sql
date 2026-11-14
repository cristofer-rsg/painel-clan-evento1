alter table public.players
  add column if not exists role text;

alter table public.players
  drop constraint if exists players_role_check;

alter table public.players
  add constraint players_role_check
  check (role is null or role in ('leader', 'coLeader', 'elder', 'member'));

comment on column public.players.role is 'Cargo atual retornado pela API do Clash of Clans.';
