-- Resolve o nome oficial pelo vínculo de tag antes de gravar eventos de Capital.
-- A API do Clash pode variar maiúsculas/minúsculas no nome; events.player
-- referencia players.name e exige correspondência exata.
create or replace function public.sync_capital_gold_contribution(
  p_player_tag text,
  p_player text,
  p_total bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_inserted_tag text;
  v_last_total bigint;
  v_delta bigint;
  v_canonical_player text;
begin
  if p_player_tag is null or btrim(p_player_tag) = ''
     or p_player is null or btrim(p_player) = ''
     or p_total is null or p_total < 0 then
    raise exception 'Dados inválidos para sincronização.';
  end if;

  select name into v_canonical_player
  from public.players
  where upper(btrim(player_tag)) = upper(btrim(p_player_tag))
  limit 1;

  if v_canonical_player is null then
    raise exception 'Jogador com tag % não encontrado em players; nenhum lançamento foi registrado.', p_player_tag;
  end if;

  insert into public.capital_gold_sync_snapshots (player_tag, player, api_total)
  values (upper(btrim(p_player_tag)), v_canonical_player, p_total);

  insert into public.capital_gold_sync_state
    (player_tag, player, last_total, baseline_total, baseline_at)
  values
    (upper(btrim(p_player_tag)), v_canonical_player, p_total, p_total, now())
  on conflict (player_tag) do nothing
  returning player_tag into v_inserted_tag;

  if v_inserted_tag is not null then
    return jsonb_build_object('status', 'baseline', 'player', v_canonical_player, 'total', p_total, 'points', 0);
  end if;

  select last_total into v_last_total
  from public.capital_gold_sync_state
  where player_tag = upper(btrim(p_player_tag))
  for update;

  v_delta := greatest(0, p_total - v_last_total);

  if v_delta > 0 then
    insert into public.events (player, category, activity, points)
    values (v_canonical_player, 'Capital do Clã', 'Doação automática de Ouro da Capital', v_delta);
  end if;

  update public.capital_gold_sync_state
  set player = v_canonical_player, last_total = p_total, updated_at = now()
  where player_tag = upper(btrim(p_player_tag));

  return jsonb_build_object('status', 'synced', 'player', v_canonical_player, 'total', p_total, 'points', v_delta);
end;
$function$;
