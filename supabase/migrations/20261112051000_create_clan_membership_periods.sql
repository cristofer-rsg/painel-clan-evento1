-- Isolated membership-period ledger for the Ghost Hunt "Tempo de Clã" feature.
-- Access is restricted to the server-side service role; RLS remains enabled.
create table public.clan_membership_periods (
  id uuid primary key default gen_random_uuid(),
  player_tag text not null,
  player_name text not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  entry_source text not null default 'clan_api',
  exit_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clan_membership_periods_valid_period
    check (left_at is null or left_at >= joined_at)
);

create index clan_membership_periods_player_history_idx
  on public.clan_membership_periods (player_tag, joined_at desc);

create unique index clan_membership_periods_one_open_period_idx
  on public.clan_membership_periods (player_tag)
  where left_at is null;

alter table public.clan_membership_periods enable row level security;

revoke all on table public.clan_membership_periods from public, anon, authenticated;
grant select, insert, update, delete on table public.clan_membership_periods to service_role;
