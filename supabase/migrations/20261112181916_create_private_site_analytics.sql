create table if not exists public.site_analytics_events (
  id bigint generated always as identity primary key,
  visitor_hash text not null,
  page_path text not null,
  referrer_host text,
  device_type text not null check (device_type in ('mobile','desktop','tablet','unknown')),
  country_code text,
  region text,
  city text,
  created_at timestamptz not null default now()
);

create index if not exists site_analytics_events_created_at_idx
  on public.site_analytics_events (created_at desc);
create index if not exists site_analytics_events_visitor_created_idx
  on public.site_analytics_events (visitor_hash, created_at desc);
create index if not exists site_analytics_events_page_created_idx
  on public.site_analytics_events (page_path, created_at desc);

alter table public.site_analytics_events enable row level security;
revoke all on table public.site_analytics_events from anon, authenticated;
grant all on table public.site_analytics_events to service_role;
