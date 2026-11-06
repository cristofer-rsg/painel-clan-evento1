import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

from supabase import create_client

CLAN_TAG = "#2GCGP0RQ9"
API_URL = "https://cocproxy.royaleapi.dev/v1"


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
        return []

    clan = war.get("clan") or {}
    opponent = war.get("opponent") or {}

    if clan.get("tag") == CLAN_TAG:
        own_clan, enemy_clan = clan, opponent
    elif opponent.get("tag") == CLAN_TAG:
        own_clan, enemy_clan = opponent, clan
    else:
        return []

    war_key = war.get("startTime") or war.get("endTime") or "unknown"

    enemy_positions = {
        member.get("tag"): member.get("mapPosition")
        for member in enemy_clan.get("members") or []
        if member.get("tag")
    }

    events = []

    for member in own_clan.get("members") or []:
        tag = member.get("tag")
        player = players_by_tag.get(tag)

        if not tag or not player:
            continue

        attacks = sorted(
            member.get("attacks") or [],
            key=lambda attack: int(attack.get("order") or 0),
        )

        if not attacks:
            continue

        name = player["name"]

        def add(suffix, activity, points):
            events.append({
                "source_key": f"{war_key}:{tag}:{suffix}",
                "war_key": str(war_key),
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

    return events


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
    failed_wars = []

    for war_tag in war_tags:
        try:
            encoded_tag = quote(war_tag, safe="")

            war = api_get(
                f"/clanwarleagues/wars/{encoded_tag}",
                token
            )

            all_events.extend(
                make_war_events(war, players_by_tag)
            )

        except Exception as error:
            failed_wars.append(
                f"{war_tag}: {error}"
            )

    for failure in failed_wars:
        print(f"ATENÇÃO: {failure}")

    if not all_events:
        print("Nenhum evento da Liga encontrado.")
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
