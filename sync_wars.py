from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import quote
from zoneinfo import ZoneInfo

from supabase import create_client

from scripts.war_rules import (
    should_penalize_early_second_attack,
    should_penalize_off_mirror,
    resolve_war_end,
    find_matching_warlog_entry,
)

CLAN_TAG = "#2GCGP0RQ9"
API_URL = "https://cocproxy.royaleapi.dev/v1"
TZ = ZoneInfo("America/Sao_Paulo")


def api_get(path, token):
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "GhostHunt-WarSync/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Erro na API Clash of Clans ({error.code}): {detail}"
        ) from error



def fetch_war_preference(member, token, war_key):
    player_tag = (member.get("tag") or "").strip().upper()
    if not player_tag:
        return None
    try:
        profile = api_get(f"/players/{quote(player_tag, safe='')}", token)
        preference = profile.get("warPreference")
        if preference not in {"in", "out"}:
            preference = "unknown"
        return {
            "war_key": war_key,
            "player_tag": player_tag,
            "player_name": member.get("name") or player_tag,
            "war_preference": preference,
            "observed_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as error:
        print(f"Preferência de guerra não consultada para {player_tag}: {error}")
        return None


def sync_war_preferences(db, war, war_key, token):
    members = war.get("clan", {}).get("members") or []
    existing_result = (
        db.table("clan_war_preferences")
        .select("player_tag,observed_at")
        .eq("war_key", war_key)
        .execute()
    )
    now = datetime.now(timezone.utc)
    refresh_before = now - timedelta(minutes=30)
    last_observed = {
        row["player_tag"].strip().upper(): row.get("observed_at")
        for row in (existing_result.data or [])
        if row.get("player_tag")
    }
    members_to_refresh = []
    for member in members:
        tag = (member.get("tag") or "").strip().upper()
        observed_at = last_observed.get(tag)
        try:
            observed = datetime.fromisoformat(observed_at.replace("Z", "+00:00")) if observed_at else None
        except (TypeError, ValueError):
            observed = None
        if observed is None or observed < refresh_before:
            members_to_refresh.append(member)

    if not members_to_refresh:
        print(f"Preferências da guerra atualizadas há menos de 30 minutos: {len(last_observed)}")
        return 0

    snapshots = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [
            executor.submit(fetch_war_preference, member, token, war_key)
            for member in members_to_refresh
        ]
        for future in as_completed(futures):
            snapshot = future.result()
            if snapshot:
                snapshots.append(snapshot)

    if snapshots:
        db.table("clan_war_preferences").upsert(
            snapshots,
            on_conflict="war_key,player_tag",
            ignore_duplicates=False,
        ).execute()
    print(f"Preferências de guerra registradas: {len(snapshots)}/{len(members_to_refresh)}")
    return len(snapshots)


def parse_coc_time(value):
    if not value:
        return None
    return datetime.strptime(value[:15], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)


def recover_completed_wars_from_warlog(db, token):
    """Recover completion markers when currentwar no longer exposes the ended war."""
    source_result = (
        db.table("player_monthly_stat_sources")
        .select("source_key")
        .like("source_key", f"war:{CLAN_TAG}:%")
        .order("updated_at", desc=True)
        .limit(500)
        .execute()
    )
    completed_result = (
        db.table("clan_war_completions")
        .select("war_key")
        .execute()
    )
    completed_keys = {
        row.get("war_key")
        for row in (completed_result.data or [])
        if row.get("war_key")
    }

    pending_starts = set()
    for row in source_result.data or []:
        source_key = row.get("source_key") or ""
        if not source_key.startswith(f"war:{CLAN_TAG}:"):
            continue
        parts = source_key.split(":")
        if len(parts) < 4:
            continue
        start_time = parts[2]
        war_key = f"{CLAN_TAG}:{start_time}"
        if war_key not in completed_keys and parse_coc_time(start_time):
            pending_starts.add(start_time)

    if not pending_starts:
        print("Nenhuma guerra pendente de finalização encontrada no banco.")
        return 0

    try:
        warlog = api_get(
            f"/clans/{quote(CLAN_TAG, safe='')}/warlog?limit=50",
            token,
        )
    except Exception as error:
        print(f"Não foi possível consultar o histórico oficial de guerras: {error}")
        return 0

    recovered = 0
    for start_time in sorted(pending_starts):
        war_started = parse_coc_time(start_time)
        entry = find_matching_warlog_entry(
            warlog.get("items") or [],
            CLAN_TAG,
            war_started,
        )
        if not entry:
            continue

        ended_at = parse_coc_time(entry.get("endTime"))
        if ended_at is None:
            continue

        war_key = f"{CLAN_TAG}:{start_time}"
        db.table("clan_war_completions").upsert({
            "war_key": war_key,
            "started_at": war_started.isoformat(),
            "ended_at": ended_at.isoformat(),
        }, on_conflict="war_key").execute()
        recovered += 1
        print(f"Conclusão recuperada pelo histórico oficial: {war_key}")

    print(f"Guerras finalizadas recuperadas: {recovered}")
    return recovered


def build_war_events(war, players_by_tag):
    state = war.get("state")

    if state not in ("inWar", "warEnded"):
        print(f"Nenhuma pontuação para processar. Estado: {state}")
        return [], set()

    clan = war.get("clan") or {}
    opponent = war.get("opponent") or {}
    war_start = war.get("startTime") or war.get("endTime")
    war_started_at = parse_coc_time(war_start)
    war_end = resolve_war_end(
        war_started_at,
        parse_coc_time(war.get("endTime")),
        state,
    )
    # A API de guerra não informa battleTime nos ataques. Usamos o instante
    # desta sincronização como primeira observação do ataque recém-publicado.
    observed_at = datetime.now(timezone.utc)

    if not war_start or war_started_at is None:
        raise RuntimeError("A API não informou startTime/endTime válido.")

    if war_end is None:
        raise RuntimeError("Não foi possível determinar o fim previsto da guerra.")

    print(
        f"Regra de penalidade: observado={observed_at.isoformat()}, "
        f"fim_guerra={war_end.isoformat()}, "
        f"limite_12h={(war_end - timedelta(hours=12)).isoformat()}"
    )

    war_key = f"{CLAN_TAG}:{war_start}"
    own_members = clan.get("members") or []
    enemy_members = opponent.get("members") or []

    enemy_position_by_tag = {
        member.get("tag"): member.get("mapPosition")
        for member in enemy_members
        if member.get("tag")
    }

    events = []
    missing_players = set()

    def add(source_key, player_name, player_tag, activity, points, battle_time=None):
        events.append({
            "source_key": source_key,
            "war_key": war_key,
            "player_tag": player_tag,
            "player": player_name,
            "category": "Guerras",
            "activity": activity,
            "points": int(points),
            "battle_time": battle_time.isoformat() if battle_time else None,
        })

    for member in own_members:
        player_tag = member.get("tag")
        if not player_tag:
            continue

        player = players_by_tag.get(player_tag.strip().upper())

        if not player:
            missing_players.add(player_tag)
            continue

        attacks = sorted(
            member.get("attacks") or [],
            key=lambda attack: int(attack.get("order") or 0),
        )

        player_name = player["name"]

        add(
            f"{war_key}:{player_tag}:participation",
            player_name,
            player_tag,
            "Participou da guerra (+5)",
            5,
        )

        if not attacks:
            if state == "warEnded":
                add(f"{war_key}:{player_tag}:penalty:no-attacks", player_name, player_tag,
                    "Penalidade: não realizou nenhum ataque (−10)", -10)
            continue

        if state == "warEnded" and len(attacks) == 1:
            add(f"{war_key}:{player_tag}:penalty:one-attack", player_name, player_tag,
                "Penalidade: realizou apenas um ataque (−5)", -5)

        if len(attacks) >= 2:
            add(
                f"{war_key}:{player_tag}:two-attacks",
                player_name,
                player_tag,
                "Fez os dois ataques (+10)",
                10,
            )

        # O espelho só é obrigatório no primeiro ataque, antes da janela final.
        # Quando restarem 12 horas ou menos, o jogador pode fazer os ataques
        # ainda disponíveis em qualquer alvo, inclusive os dois se não atacou antes.
        for attack_number, attack in enumerate(attacks, start=1):
            defender_tag = attack.get("defenderTag")
            own_position = member.get("mapPosition")
            defender_position = enemy_position_by_tag.get(defender_tag)
            # Quando a API não fornece o horário real, registra a primeira
            # detecção deste ataque. A chave idempotente preserva a observação
            # inicial feita durante a guerra, sem confundi-la com battleTime.
            battle_time = parse_coc_time(attack.get("battleTime"))
            order = attack.get("order", attack_number)

            if battle_time is None:
                add(
                    f"{war_key}:{player_tag}:attack:{order}:observed-time",
                    player_name,
                    player_tag,
                    f"Ataque detectado pela sincronização em {observed_at.astimezone(TZ).strftime('%d/%m/%Y %H:%M:%S')} (Brasília)",
                    0,
                )

            if battle_time is not None:
                add(
                    f"{war_key}:{player_tag}:attack:{order}:battle-time",
                    player_name,
                    player_tag,
                    f"Ataque realizado — horário oficial: {battle_time.astimezone(TZ).strftime('%d/%m/%Y %H:%M:%S')} (Brasília)",
                    0,
                    battle_time,
                )

            if (
                own_position is not None
                and defender_position == own_position
            ):
                add(
                    f"{war_key}:{player_tag}:mirror:{order}",
                    player_name,
                    player_tag,
                    "Acertou o espelho (+5)",
                    5,
                )
            elif (
                defender_tag
                and defender_position is not None
                and own_position is not None
                and should_penalize_off_mirror(
                    attack_number, observed_at, war_end
                )
            ):
                add(
                    f"{war_key}:{player_tag}:penalty:off-mirror:{order}",
                    player_name,
                    player_tag,
                    "Penalidade: primeiro ataque fora do espelho antes das 12 horas finais (−5)",
                    -5,
                )

            # Mantém a regra existente de guardar o segundo ataque para
            # as 12 horas finais. A ordem é individual do jogador (1º/2º),
            # não o número global do ataque na guerra retornado pela API.
            if should_penalize_early_second_attack(
                attack_number, observed_at, war_end
            ):
                add(
                    f"{war_key}:{player_tag}:penalty:early-second:{order}",
                    player_name,
                    player_tag,
                    "Penalidade: segundo ataque antes das 12 horas finais (−5)",
                    -5,
                )

        # Soma as estrelas de cada ataque separadamente.
        for attack_number, attack in enumerate(attacks, start=1):
            stars = int(attack.get("stars") or 0)

            if stars <= 0:
                continue

            if stars == 1:
                activity, points = "Fez 1 estrela (+1)", 1
            elif stars == 2:
                activity, points = "Fez 2 estrelas (+2)", 2
            else:
                activity, points = "Fez 3 estrelas (+3)", 3

            order = attack.get("order")
            attack_identity = (
                order if order is not None else attack_number
            )

            add(
                f"{war_key}:{player_tag}:attack:{attack_identity}:stars",
                player_name,
                player_tag,
                activity,
                points,
                parse_coc_time(attack.get("battleTime")),
            )

    return events, missing_players


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())

    if len(token.split(".")) != 3:
        raise RuntimeError(
            "CLASH_API_TOKEN ausente ou em formato inválido."
        )

    supabase_url = os.environ["SUPABASE_URL"].strip().rstrip("/")
    supabase_key = os.environ["SUPABASE_SECRET_KEY"].strip()

    if not supabase_url.startswith("https://") or not supabase_key:
        raise RuntimeError(
            "SUPABASE_URL ou SUPABASE_SECRET_KEY inválida."
        )

    db = create_client(supabase_url, supabase_key)
    clan_tag = quote(CLAN_TAG, safe="")
    war = api_get(f"/clans/{clan_tag}/currentwar", token)

    # Recupera guerras encerradas pendentes mesmo quando uma nova guerra
    # já começou e currentwar retorna preparation ou inWar.
    recover_completed_wars_from_warlog(db, token)

    if war.get("state") == "notInWar":
        print(
            "A API não disponibiliza uma guerra atual. "
            "Verificação do histórico oficial concluída."
        )
        return

    start_time = war.get("startTime")

    if not start_time:
        raise RuntimeError("A API não informou o início da guerra.")

    war_started = datetime.strptime(
        start_time[:15],
        "%Y%m%dT%H%M%S"
    ).replace(tzinfo=timezone.utc)
    war_key = f"{CLAN_TAG}:{start_time}"

    cutoff = datetime(2026, 11, 6, 13, 50, tzinfo=timezone.utc)
    allow_points = war_started > cutoff

    roster = (
        db.table("players")
        .select("name,player_tag,active")
        .eq("active", True)
        .execute()
        .data or []
    )

    players_by_tag = {
        row["player_tag"].strip().upper(): row
        for row in roster
        if row.get("player_tag") and row.get("name")
    }

    sync_war_preferences(db, war, war_key, token)

    events, missing_players = build_war_events(
        war, players_by_tag
    )

    # Diagnóstico da fonte oficial: registra quantos ataques individuais
    # a API retornou nesta execução para facilitar a conferência.
    api_attack_total = sum(
        len(member.get("attacks") or [])
        for member in (war.get("clan") or {}).get("members") or []
    )
    print(
        f"Auditoria da guerra {CLAN_TAG}:{start_time}: "
        f"{len((war.get('clan') or {}).get('members') or [])} membros, "
        f"{api_attack_total} ataques individuais retornados pela API."
    )

    # Registra a conclusão oficial da guerra sem alterar fontes ou estatísticas.
    if war.get("state") == "warEnded":
        ended_at = parse_coc_time(war.get("endTime"))
        if ended_at is None:
            raise RuntimeError("A API não informou endTime para a guerra encerrada.")
        db.table("clan_war_completions").upsert({
            "war_key": war_key,
            "started_at": war_started.isoformat(),
            "ended_at": ended_at.isoformat(),
        }, on_conflict="war_key").execute()
        print(f"Guerra concluída registrada: {war_key}")

    # Estatística mensal: uma origem por jogador e guerra. A mesma chave
    # é atualizada nas próximas execuções, sem somar ataques em duplicidade.
    month_key = war_started.astimezone(TZ).strftime("%Y-%m")
    stat_sources = []

    for member in (war.get("clan") or {}).get("members") or []:
        player_tag = member.get("tag")
        player = players_by_tag.get(player_tag.strip().upper()) if player_tag else None
        if not player_tag or not player:
            continue

        stat_sources.append({
            "month_key": month_key,
            "source_key": f"war:{war_key}:{player_tag}",
            "player_tag": player_tag,
            "player": player["name"],
            "war_attacks": len(member.get("attacks") or []),
            "league_attacks": 0,
            "raid_attacks": 0,
        })

    if stat_sources:
        stats_result = db.rpc(
            "sync_player_monthly_stat_sources",
            {"p_sources": stat_sources},
        ).execute()
        print(
            "Jogadores com estatística de guerra sincronizada: "
            f"{len(stat_sources)}"
        )
        print(f"Resultado da estatística: {stats_result.data}")

    if not allow_points:
        print(
            "Guerra anterior à data de corte: estatísticas atualizadas, "
            "mas nenhum ponto será lançado."
        )
        return

    if missing_players:
        print(
            "ATENÇÃO: jogadores sem cadastro ativo correspondente "
            "foram ignorados: "
            + ", ".join(sorted(missing_players))
        )

    if not events:
        print("Nenhum evento de pontuação novo para enviar.")
        return

    result = db.rpc(
        "record_clash_war_events",
        {"p_events": events}
    ).execute()

    response = result.data or {}
    inserted = (
        response.get("inserted", 0)
        if isinstance(response, dict)
        else 0
    )

    print(f"Eventos avaliados: {len(events)}")
    print(f"Novos lançamentos gravados: {inserted}")
    print(
        "Eventos já processados/ignorados: "
        f"{len(events) - inserted}"
    )
    print(f"Estado da guerra: {war.get('state')}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
