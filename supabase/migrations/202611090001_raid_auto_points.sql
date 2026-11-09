-- Pontuação automática e idempotente do Raide de Fim de Semana.
-- Aplicar uma única vez no SQL Editor do Supabase antes de habilitar o workflow.

create table if not exists public.raid_point_awards (
    player_tag text not null,
    player text not null references public.players(name) on update cascade on delete restrict,
    weekend_key date not null,
    month_key text not null check (month_key ~ '^\\d{4}-\\d{2}$'),
    points integer not null default 5 check (points = 5),
    attacks integer not null check (attacks >= 5),
    event_id bigint not null unique references public.events(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint raid_point_awards_player_weekend_pk primary key (player_tag, weekend_key)
);

create index if not exists raid_point_awards_month_player_idx
    on public.raid_point_awards (month_key, player);

alter table public.raid_point_awards enable row level security;
revoke all on public.raid_point_awards from anon, authenticated;
grant all on public.raid_point_awards to service_role;

create or replace function public.apply_automatic_raid_points(p_awards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_award record;
    v_player text;
    v_tag text;
    v_weekend date;
    v_month text;
    v_attacks integer;
    v_label text;
    v_month_points integer;
    v_legacy_points integer;
    v_event_id bigint;
    v_results jsonb := '[]'::jsonb;
begin
    if jsonb_typeof(p_awards) <> 'array' then
        raise exception 'p_awards precisa ser uma lista JSON';
    end if;

    for v_award in
        select * from jsonb_to_recordset(p_awards) as x(
            player text, player_tag text, weekend_key date, month_key text,
            attacks integer, weekend_label text
        )
    loop
        v_tag := upper(trim(coalesce(v_award.player_tag, '')));
        v_weekend := v_award.weekend_key;
        v_month := v_award.month_key;
        v_attacks := coalesce(v_award.attacks, 0);
        v_label := coalesce(v_award.weekend_label, '');

        if v_tag = '' or v_weekend is null or v_month is null or v_attacks < 5 then
            raise exception 'Dados inválidos para pontuação do Raide';
        end if;
        if to_char(v_weekend + 2, 'YYYY-MM') <> v_month then
            raise exception 'Mês de competência inválido para o fim de semana %', v_weekend;
        end if;

        select p.name into v_player
          from public.players p
         where upper(trim(coalesce(p.player_tag, ''))) = v_tag
           and p.active = true;
        if not found or v_player <> v_award.player then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'player', coalesce(v_award.player, v_tag), 'status', 'not_active'
            ));
            continue;
        end if;

        -- Serializa pontuações do mesmo jogador no mesmo mês.
        perform pg_advisory_xact_lock(hashtextextended(v_tag || ':' || v_month, 0));

        if exists (
            select 1 from public.raid_point_awards a
             where a.player_tag = v_tag and a.weekend_key = v_weekend
        ) then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'player', v_player, 'status', 'already_awarded'
            ));
            continue;
        end if;

        -- Respeita lançamentos antigos manuais/automáticos do mesmo fim de semana.
        if exists (
            select 1 from public.events e
             where e.player = v_player
               and e.category = 'Raide de Fim de Semana'
               and (
                    e.activity like ('%RAIDE_AUTO:' || v_weekend::text || ':%')
                    or (
                        (e.created_at at time zone 'America/Sao_Paulo')::date
                        - ((extract(dow from (e.created_at at time zone 'America/Sao_Paulo'))::integer + 1) % 7)
                    ) = v_weekend
               )
        ) then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'player', v_player, 'status', 'already_awarded'
            ));
            continue;
        end if;

        select coalesce(sum(a.points), 0) into v_month_points
          from public.raid_point_awards a
         where a.player = v_player and a.month_key = v_month;

        -- Lançamentos legados sem registro na tabela de idempotência.
        select coalesce(sum(e.points), 0) into v_legacy_points
          from public.events e
         where e.player = v_player
           and e.category = 'Raide de Fim de Semana'
           and e.points > 0
           and not exists (
                select 1 from public.raid_point_awards a where a.event_id = e.id
           )
           and to_char(
                (e.created_at at time zone 'America/Sao_Paulo')::date
                - ((extract(dow from (e.created_at at time zone 'America/Sao_Paulo'))::integer + 1) % 7)
                + 2,
                'YYYY-MM'
           ) = v_month;

        v_month_points := v_month_points + v_legacy_points;
        if v_month_points + 5 > 20 then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'player', v_player, 'status', 'monthly_limit'
            ));
            continue;
        end if;

        insert into public.events (player, category, activity, points)
        values (
            v_player, 'Raide de Fim de Semana',
            'RAIDE_AUTO:' || v_weekend::text || ':5_ATAQUES | Utilizou 5 ou mais ataques (' ||
                v_attacks::text || ' ataques) | ' || v_label,
            5
        ) returning id into v_event_id;

        insert into public.raid_point_awards (
            player_tag, player, weekend_key, month_key, points, attacks, event_id
        ) values (v_tag, v_player, v_weekend, v_month, 5, v_attacks, v_event_id);

        v_results := v_results || jsonb_build_array(jsonb_build_object(
            'player', v_player, 'status', 'awarded', 'points', 5, 'event_id', v_event_id
        ));
    end loop;
    return jsonb_build_object('success', true, 'results', v_results);
end;
$function$;

revoke all on function public.apply_automatic_raid_points(jsonb) from public, anon, authenticated;
grant execute on function public.apply_automatic_raid_points(jsonb) to service_role;
