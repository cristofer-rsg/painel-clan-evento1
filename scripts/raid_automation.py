#!/usr/bin/env python3
"""Sincroniza a quantidade de ataques do Raide para o Ghost Hunt."""
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests

TZ = ZoneInfo("America/Sao_Paulo")
API_BASE = "https://cocproxy.royaleapi.dev/v1"
CLAN_TAG = os.getenv("CLASH_CLAN_TAG", "#2GCGP0RQ9").strip()
CLASH_TOKEN = os.environ["CLASH_API_TOKEN"].strip()
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"].strip()
HTTP = requests.Session()


def weekend_start(value):
    """Retorna o sábado que identifica o fim de semana do Raide."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is not None:
        value = value.astimezone(TZ)
    day = value.date() if isinstance(value, datetime) else value
    return day - timedelta(days=(day.weekday() + 2) % 7)


def raid_competence_month(season, anchor):
    """Determina o mês de competência pela data final da temporada."""
    end_raw = season.get("endTime")
    if end_raw:
        end_time = datetime.fromisoformat(end_raw.replace("Z", "+00:00"))
        if end_time.tzinfo is not None:
            end_time = end_time.astimezone(TZ)
        return end_time.strftime("%Y-%m")
    return (anchor + timedelta(days=2)).strftime("%Y-%m")


def api_get_raid_season():
    tag_path = "%23" + CLAN_TAG.lstrip("#")
    url = f"{API_BASE}/clans/{tag_path}/capitalraidseasons"
    response = HTTP.get(
        url,
        headers={
            "Authorization": f"Bearer {CLASH_TOKEN}",
            "auth": CLASH_TOKEN,
            "Accept": "application/json",
        },
        params={"limit": 1},
        timeout=30,
    )
    response.raise_for_status()
    items = (response.json() or {}).get("items") or []
    if not items:
        raise RuntimeError("A API não retornou uma temporada do Raide.")
    return items[0]


def supabase_request(method, table, *, params=None, payload=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
    response = HTTP.request(
        method, url, headers=headers, params=params, json=payload, timeout=30
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Supabase {method} {table}: HTTP {response.status_code} "
            f"- {response.text[:500]}"
        )
    try:
        return response.status_code, response.json() if response.content else []
    except ValueError:
        return response.status_code, []


def fetch_players():
    """Carrega somente jogadores ativos, indexados pela tag."""
    _, rows = supabase_request(
        "GET",
        "players",
        params={"select": "name,player_tag,active", "order": "name.asc"},
    )
    players_by_tag = {}
    for row in rows:
        if row.get("active", True) is False:
            continue
        player_tag = str(row.get("player_tag") or "").strip().upper()
        if not player_tag:
            continue
        if player_tag in players_by_tag:
            raise RuntimeError(
                f"Tag duplicada no cadastro do ClanEvento: {player_tag}. "
                "Nenhuma estatística foi atualizada."
            )
        players_by_tag[player_tag] = row
    return players_by_tag


def sync_raid_attack_stats(members, players, anchor, month_key):
    """Atualiza uma única origem mensal por jogador/fim de semana."""
    sources = []
    seen_tags = set()

    for member in members:
        tag = str(member.get("tag") or "").strip().upper()
        player = players.get(tag) if tag else None
        if not player:
            continue
        if tag in seen_tags:
            raise RuntimeError(
                f"A API retornou tag duplicada no Raide: {tag}. "
                "Estatísticas não atualizadas."
            )
        seen_tags.add(tag)

        attacks = member.get("attacks")
        if not isinstance(attacks, int) or attacks < 0:
            raise RuntimeError(
                f"Quantidade de ataques inválida para {player['name']}."
            )

        sources.append({
            "month_key": month_key,
            "source_key": f"raid:{anchor.isoformat()}:{tag}",
            "player_tag": tag,
            "player": player["name"],
            "war_attacks": 0,
            "league_attacks": 0,
            "raid_attacks": attacks,
        })

    if not sources:
        raise RuntimeError(
            "Nenhum membro do Raide corresponde aos jogadores cadastrados. "
            "Estatísticas não atualizadas."
        )

    _, result = supabase_request(
        "POST",
        "rpc/sync_player_monthly_stat_sources",
        payload={"p_sources": sources},
    )
    print(f"Estatísticas de ataques do Raide sincronizadas: {len(sources)}")
    print(f"Resposta da sincronização mensal: {result}")


def run():
    """Atualiza ataques; os pontos são lançados exclusivamente pelo app.py."""
    season = api_get_raid_season()
    start_raw = season.get("startTime")
    if not start_raw:
        raise RuntimeError("A temporada retornada não possui startTime.")

    season_start = datetime.fromisoformat(
        start_raw.replace("Z", "+00:00")
    ).astimezone(TZ)
    anchor = weekend_start(season_start)
    month_key = raid_competence_month(season, anchor)
    players = fetch_players()
    members = season.get("members") or []

    # Esta rotina NÃO cria eventos em public.events.
    # A pontuação do Raide é gerenciada somente pelo app.py.
    sync_raid_attack_stats(members, players, anchor, month_key)

    print(
        f"Temporada: {season_start.strftime('%d/%m/%Y')} | "
        f"competência: {month_key} | "
        f"estado: {season.get('state', 'desconhecido')}"
    )
    print(f"Jogadores analisados: {len(members)}")
    print(
        "Pontuação: não lançada por esta rotina "
        "(gerenciada exclusivamente pelo app.py)."
    )


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"ERRO NA SINCRONIZAÇÃO DO RAIDE: {exc}", file=sys.stderr)
        raise
