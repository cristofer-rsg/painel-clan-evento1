import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo

from supabase import create_client

CLAN_TAG = "#2GCGP0RQ9"
API_URL = "https://cocproxy.royaleapi.dev/v1"
TZ = ZoneInfo("America/Sao_Paulo")


def api_get(path, token):
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "ClanEvento-LeagueSync/1.0",
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


def make_war_events(war, players_by_tag):
    if war.get("state") not in ("inWar", "warEnded"):
        return [], []

    clan = war.get("clan") or {}
    opponent = war.get("opponent") or {}

    if clan.get("tag") == CLAN_TAG:
        own_clan, enemy_clan = clan, opponent
    elif opponent.get("tag") == CLAN_TAG:
        own_clan, enemy_clan = opponent, clan
    else:
        return [], []

    war_time = war.get("startTime") or war.get("endTime")
    if not war_time:
        raise RuntimeError("Guerra da Liga sem startTime/endTime.")

    month_key = datetime.strptime(
        war_time[:15], "%Y%m%dT%H%M%S"
    ).replace(tzinfo=timezone.utc).astimezone(TZ).strftime("%Y-%m")

    enemy_positions = {
        member.get("tag"): member.get("mapPosition")
        for member in enemy_clan.get("members") or []
        if member.get("tag")
    }

    events = []
    stat_sources = []

    for member in own_clan.get("members") or []:
        tag = member.get("tag")
        player = players_by_tag.get(tag)

        if not tag or not player:
            continue

        attacks = sorted(
            member.get("attacks") or [],
            key=lambda attack: int(attack.get("order") or 0),
        )

        name = player["name"]

        # Uma origem por jogador e guerra da Liga. Reexecuções atualizam
        # a quantidade, em vez de somar novamente os mesmos ataques.
        stat_sources.append({
            "month_key": month_key,
            "source_key": f"league:{war_time}:{tag}",
            "player_tag": tag,
            "player": name,
            "war_attacks": 0,
            "league_attacks": len(attacks),
            "raid_attacks": 0,
        })

        if not attacks:
            continue

        def add(suffix, activity, points):
            events.append({
                "source_key": f"{war_time}:{tag}:{suffix}",
                "war_key": str(war_time),
                "player_tag": tag,
                "player": name,
                "activity": activity,
                "points": points,
            })

        add(
            "participation",
            "Participou da guerra da Liga (+5)",
            5
        )

        for index, attack in enumerate(attacks, start=1):
            order = attack.get("order", index)

            defender_tag = attack.get("defenderTag")
            own_position = member.get("mapPosition")
            enemy_position = enemy_positions.get(defender_tag)

            if (
                own_position is not None
                and enemy_position == own_position
            ):
                add(
                    f"mirror:{order}",
                    "Acertou o espelho (+5)",
                    5
                )

            stars = int(attack.get("stars") or 0)

            if stars == 1:
                add(
                    f"attack:{order}:stars",
                    "Fez 1 estrela (+1)",
                    1
                )
            elif stars == 2:
                add(
                    f"attack:{order}:stars",
                    "Fez 2 estrelas (+2)",
                    2
                )
            elif stars >= 3:
                add(
                    f"attack:{order}:stars",
                    "Fez 3 estrelas (+3)",
                    3
                )

    return events, stat_sources


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())

    if len(token.split(".")) != 3:
        raise RuntimeError(
            "CLASH_API_TOKEN ausente ou inválido."
        )

    supabase_url = os.environ["SUPABASE_URL"].strip().rstrip("/")
    supabase_key = os.environ["SUPABASE_SECRET_KEY"].strip()

    if not supabase_url.startswith("https://") or not supabase_key:
        raise RuntimeError("Configuração do Supabase inválida.")

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

    clan_tag = quote(CLAN_TAG, safe="")

    group = api_get(
        f"/clans/{clan_tag}/currentwar/leaguegroup",
        token
    )

    if group.get("state") == "notInWar":
        print("O clã não está em uma Liga ativa.")
        return

    rounds = group.get("rounds") or []
    war_tags = []

    for round_data in rounds:
        for war_tag in round_data.get("warTags") or []:
            if war_tag and war_tag != "#0" and war_tag not in war_tags:
                war_tags.append(war_tag)

    if not war_tags:
        print("Nenhuma guerra disponível na Liga.")
        return

    all_events = []
    all_stat_sources = []
    failed_wars = []

    for war_tag in war_tags:
        try:
            encoded_tag = quote(war_tag, safe="")

            war = api_get(
                f"/clanwarleagues/wars/{encoded_tag}",
                token
            )

            war_events, war_stats = make_war_events(war, players_by_tag)
            all_events.extend(war_events)
            all_stat_sources.extend(war_stats)

        except Exception as error:
            failed_wars.append(
                f"{war_tag}: {error}"
            )

    for failure in failed_wars:
        print(f"ATENÇÃO: {failure}")

    # Não grava um total parcial se alguma guerra não pôde ser consultada.
    if failed_wars:
        raise RuntimeError(
            "Sincronização da Liga incompleta; estatísticas mensais não "
            "foram atualizadas para evitar contagem parcial."
        )

    if all_stat_sources:
        stats_result = db.rpc(
            "sync_player_monthly_stat_sources",
            {"p_sources": all_stat_sources}
        ).execute()
        print(
            "Registros de ataques da Liga sincronizados: "
            f"{len(all_stat_sources)}"
        )
        print(f"Resposta da estatística: {stats_result.data}")

    if not all_events:
        print("Nenhum evento de pontuação da Liga encontrado.")
        return

    result = db.rpc(
        "record_clash_league_events",
        {"p_events": all_events}
    ).execute()

    response = result.data or {}

    inserted = (
        response.get("inserted", 0)
        if isinstance(response, dict)
        else 0
    )

    skipped = (
        response.get("skipped", 0)
        if isinstance(response, dict)
        else 0
    )

    print(f"Temporada: {group.get('season', 'não informada')}")
    print(f"Guerras verificadas: {len(war_tags)}")
    print(f"Eventos avaliados: {len(all_events)}")
    print(f"Novos lançamentos: {inserted}")
    print(f"Duplicados/limite mensal: {skipped}")
    print(f"Guerras com erro: {len(failed_wars)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
