create or replace function public.site_analytics_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_active_since timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with filtered as (
  select visitor_hash, page_path, referrer_host, device_type, country_code, region, city, created_at
  from public.site_analytics_events
  where created_at >= p_from and created_at <= p_to
),
daily_counts as (
  select (created_at at time zone 'UTC')::date as day, count(*)::int as views
  from filtered group by 1
),
daily_series as (
  select d::date as day, coalesce(c.views, 0) as views
  from generate_series((p_from at time zone 'UTC')::date, (p_to at time zone 'UTC')::date, interval '1 day') d
  left join daily_counts c on c.day = d::date
),
page_counts as (
  select page_path as label, count(*)::int as count from filtered group by page_path order by count desc limit 6
),
referrer_counts as (
  select referrer_host as label, count(*)::int as count from filtered where referrer_host is not null group by referrer_host order by count desc limit 6
),
device_counts as (
  select device_type as label, count(*)::int as count from filtered group by device_type order by count desc limit 4
),
location_counts as (
  select concat_ws(', ', nullif(city,''), nullif(region,''), nullif(country_code,'')) as label, count(*)::int as count
  from filtered
  where city is not null or region is not null or country_code is not null
  group by 1 order by count desc limit 6
)
select jsonb_build_object(
  'totals', jsonb_build_object(
    'visitors', (select count(distinct visitor_hash)::int from filtered),
    'views', (select count(*)::int from filtered),
    'active', (select count(distinct visitor_hash)::int from public.site_analytics_events where created_at >= p_active_since)
  ),
  'daily', coalesce((select jsonb_agg(jsonb_build_object('date', day::text, 'label', to_char(day, 'DD/MM'), 'views', views) order by day) from daily_series), '[]'::jsonb),
  'pages', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc) from page_counts), '[]'::jsonb),
  'referrers', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc) from referrer_counts), '[]'::jsonb),
  'devices', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc) from device_counts), '[]'::jsonb),
  'locations', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc) from location_counts), '[]'::jsonb)
);
$$;
revoke all on function public.site_analytics_summary(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.site_analytics_summary(timestamptz, timestamptz, timestamptz) to service_role;
