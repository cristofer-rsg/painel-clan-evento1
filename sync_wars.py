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


def parse_coc_time(value):
    if not value:
        return None
    return datetime.strptime(value[:15], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)


def build_war_events(war, players_by_tag):
    state = war.get("state")

    if state not in ("inWar", "warEnded"):
        print(f"Nenhuma pontuação para processar. Estado: {state}")
        return [], set()

    clan = war.get("clan") or {}
    opponent = war.get("opponent") or {}
    war_start = war.get("startTime") or war.get("endTime")
    war_end = parse_coc_time(war.get("endTime"))

    if not war_start:
        raise RuntimeError("A API não informou startTime/endTime.")

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

    def add(source_key, player_name, player_tag, activity, points):
        events.append({
            "source_key": source_key,
            "war_key": war_key,
            "player_tag": player_tag,
            "player": player_name,
            "category": "Guerras",
            "activity": activity,
            "points": int(points),
        })

    for member in own_members:
        player_tag = member.get("tag")
        if not player_tag:
            continue

        player = players_by_tag.get(player_tag)

        if not player:
            missing_players.add(player_tag)
            continue

        attacks = sorted(
            member.get("attacks") or [],
            key=lambda attack: int(attack.get("order") or 0),
        )

        player_name = player["name"]

        if not attacks:
            if state == "warEnded":
                add(f"{war_key}:{player_tag}:penalty:no-attacks", player_name, player_tag,
                    "Penalidade: não realizou nenhum ataque (−10)", -10)
            continue

        if state == "warEnded" and len(attacks) == 1:
            add(f"{war_key}:{player_tag}:penalty:one-attack", player_name, player_tag,
                "Penalidade: realizou apenas um ataque (−5)", -5)

        add(
            f"{war_key}:{player_tag}:participation",
            player_name,
            player_tag,
            "Participou da guerra (+5)",
            5,
        )

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
            battle_time = parse_coc_time(attack.get("battleTime"))
            order = attack.get("order", attack_number)

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
                    attack_number, battle_time, war_end
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
                attack_number, battle_time, war_end
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

    clan_tag = quote(CLAN_TAG, safe="")
    war = api_get(f"/clans/{clan_tag}/currentwar", token)

    if war.get("state") == "notInWar":
            print("O clã não está em guerra. Nenhum lançamento será feito.")
            return

    start_time = war.get("startTime")

    if not start_time:
        raise RuntimeError("A API não informou o início da guerra.")

    war_started = datetime.strptime(
        start_time[:15],
        "%Y%m%dT%H%M%S"
    ).replace(tzinfo=timezone.utc)

    cutoff = datetime(2026, 11, 6, 13, 50, tzinfo=timezone.utc)
    allow_points = war_started > cutoff

    db = create_client(supabase_url, supabase_key)

    roster = (
        db.table("players")
        .select("name,player_tag,active")
        .eq("active", True)
        .execute()
        .data or []
    )

    players_by_tag = {
        row["player_tag"]: row
        for row in roster
        if row.get("player_tag") and row.get("name")
    }

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

    # Estatística mensal: uma origem por jogador e guerra. A mesma chave
    # é atualizada nas próximas execuções, sem somar ataques em duplicidade.
    month_key = war_started.astimezone(TZ).strftime("%Y-%m")
    war_key = f"{CLAN_TAG}:{start_time}"
    stat_sources = []

    for member in (war.get("clan") or {}).get("members") or []:
        player_tag = member.get("tag")
        player = players_by_tag.get(player_tag)
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
