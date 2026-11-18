create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.war_penalty_history (
  id bigint generated always as identity primary key,
  source_key text not null unique,
  war_key text not null,
  player_tag text not null,
  player_name text not null,
  activity text not null,
  points integer not null check (points < 0),
  event_id text,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create index if not exists war_penalty_history_player_month_idx
  on private.war_penalty_history (player_tag, occurred_at desc);
create index if not exists war_penalty_history_war_idx
  on private.war_penalty_history (war_key);

insert into private.war_penalty_history
  (source_key, war_key, player_tag, player_name, activity, points, event_id, occurred_at)
select
  a.source_key, a.war_key, a.player_tag, e.player, e.activity, e.points,
  a.event_id, e.created_at
from public.clash_war_automation a
join public.events e on e.id::text = a.event_id
where e.points < 0 and lower(e.activity) like '%penalidade%'
on conflict (source_key) do nothing;

create or replace function public.record_clash_war_events(p_events jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
    item jsonb;
    inserted_key text;
    new_event_id text;
    inserted_count integer := 0;
begin
    if jsonb_typeof(p_events) <> 'array' then
        raise exception 'p_events precisa ser um array JSON';
    end if;

    for item in select value from jsonb_array_elements(p_events)
    loop
        if nullif(item->>'source_key', '') is null
           or nullif(item->>'player', '') is null
           or nullif(item->>'category', '') is null
           or nullif(item->>'activity', '') is null
           or (item->>'points') is null then
            raise exception 'Evento automático incompleto: %', item;
        end if;

        inserted_key := null;
        insert into public.clash_war_automation
            (source_key, war_key, player_tag)
        values
            (item->>'source_key', item->>'war_key', item->>'player_tag')
        on conflict (source_key) do nothing
        returning source_key into inserted_key;

        if inserted_key is not null then
            insert into public.events
                (player, category, activity, points, battle_time)
            values (
                item->>'player',
                item->>'category',
                item->>'activity',
                (item->>'points')::integer,
                nullif(item->>'battle_time', '')::timestamptz
            )
            returning id::text into new_event_id;

            update public.clash_war_automation
            set event_id = new_event_id
            where source_key = inserted_key;

            if (item->>'points')::integer < 0
               and lower(item->>'activity') like '%penalidade%' then
                insert into private.war_penalty_history
                    (source_key, war_key, player_tag, player_name, activity,
                     points, event_id, occurred_at)
                values (
                    item->>'source_key',
                    item->>'war_key',
                    item->>'player_tag',
                    item->>'player',
                    item->>'activity',
                    (item->>'points')::integer,
                    new_event_id,
                    coalesce(nullif(item->>'battle_time', '')::timestamptz, now())
                )
                on conflict (source_key) do nothing;
            end if;

            inserted_count := inserted_count + 1;
        end if;
    end loop;

    return jsonb_build_object('inserted', inserted_count);
end;
$function$;
