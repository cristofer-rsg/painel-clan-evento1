create table if not exists public.clan_war_preferences (
  war_key text not null,
  player_tag text not null,
  player_name text not null,
  war_preference text not null check (war_preference in ('in', 'out', 'unknown')),
  observed_at timestamptz not null default now(),
  primary key (war_key, player_tag)
);

alter table public.clan_war_preferences enable row level security;
revoke all on table public.clan_war_preferences from anon, authenticated;
grant select, insert, update on table public.clan_war_preferences to service_role;
