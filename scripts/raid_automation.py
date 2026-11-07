#!/usr/bin/env python3
"""Background Capital Raid scorer and monthly activity sync for Ghost Hunt."""
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

TZ = ZoneInfo("America/Sao_Paulo")
API_BASE = "https://cocproxy.royaleapi.dev/v1"
RAID_CATEGORY = "Raide de Fim de Semana"
POINTS_PER_WEEKEND = 5
MONTHLY_CAP = 20
CLAN_TAG = os.getenv("CLASH_CLAN_TAG", "#2GCGP0RQ9").strip()
CLASH_TOKEN = os.environ["CLASH_API_TOKEN"].strip()
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"].strip()
HTTP = requests.Session()


def weekend_start(value):
    """Return the Saturday anchor used by existing raid source keys."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(TZ)
        day = value.date()
    else:
        day = value
    # Keep the historical Saturday key so existing sources remain idempotent.
    return day - timedelta(days=(day.weekday() + 2) % 7)


def weekend_end(value):
    """Return Monday, the closing date of the raid weekend."""
    return weekend_start(value) + timedelta(days=2)


def raid_month_key(value):
    """Assign the entire raid weekend to the month in which it ends."""
    return weekend_end(value).strftime("%Y-%m")


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
    if response.status_code >= 400 and response.status_code != 409:
        raise RuntimeError(
            f"Supabase {method} {table}: HTTP {response.status_code} "
            f"- {response.text[:500]}"
        )
    try:
        return response.status_code, response.json() if response.content else []
    except ValueError:
        return response.status_code, []


def fetch_players():
    """Load active players indexed by tag, not by mutable in-game name."""
    _, rows = supabase_request(
        "GET", "players",
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
                "Nenhum ponto foi lançado."
            )
        players_by_tag[player_tag] = row
    return players_by_tag


def fetch_raid_events(month_key):
    """Fetch raid events spanning the target month and the prior weekend."""
    start = datetime.strptime(month_key + "-01", "%Y-%m-%d").replace(tzinfo=TZ)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    query_start = start - timedelta(days=7)
    start_utc = query_start.astimezone(timezone.utc).isoformat()
    end_utc = end.astimezone(timezone.utc).isoformat()
    _, rows = supabase_request(
        "GET", "events",
        params={
            "select": "player,category,activity,points,created_at",
            "category": f"eq.{RAID_CATEGORY}",
            "created_at": f"gte.{start_utc}",
            "and": f"(created_at.lt.{end_utc})",
            "limit": "1000",
        },
    )
    # Attribute an event to the month in which its raid weekend ended.
    filtered = []
    for event in rows:
        try:
            if raid_month_key(event.get("created_at")) == month_key:
                filtered.append(event)
        except Exception:
            continue
    return filtered


def sync_raid_attack_stats(members, players_by_tag, month_key, weekend_key):
    """Upsert one source per player/weekend, then rebuild monthly attack totals."""
    sources = []
    seen_tags = set()
    for member in members:
        if not isinstance(member, dict):
            continue
        tag = str(member.get("tag") or "").strip().upper()
        if not tag or tag not in players_by_tag:
            continue
        if tag in seen_tags:
            raise RuntimeError(f"A API retornou a tag duplicada na Raide: {tag}")
        seen_tags.add(tag)
        attacks = member.get("attacks")
        if not isinstance(attacks, int) or attacks < 0:
            raise RuntimeError(
                f"Quantidade de ataques inválida para {member.get('name') or tag}."
            )
        sources.append({
            "month_key": month_key,
            "source_key": f"raid:{weekend_key}:{tag}",
            "player_tag": tag,
            "player": players_by_tag[tag]["name"],
            "war_attacks": 0,
            "league_attacks": 0,
            "raid_attacks": attacks,
        })

    if not sources:
        raise RuntimeError(
            "Nenhum membro da temporada corresponde aos jogadores cadastrados. "
            "Estatísticas mensais não foram alteradas."
        )

    _, result = supabase_request(
        "POST",
        "rpc/sync_player_monthly_stat_sources",
        payload={"p_sources": sources},
    )
    if isinstance(result, list) and result:
        result = result[0]
    print(f"Estatísticas de ataques do Raide sincronizadas: {len(sources)}")
    print(f"Resposta da sincronização mensal: {result}")
    return len(sources)


def run():
    now_local = datetime.now(TZ)
    season = api_get_raid_season()
    start_raw = season.get("startTime")
    if not start_raw:
        raise RuntimeError("A temporada retornada não possui startTime.")

    season_start = datetime.fromisoformat(
        start_raw.replace("Z", "+00:00")
    ).astimezone(TZ)

    anchor = weekend_start(season_start)
    closing_date = anchor + timedelta(days=3)
    weekend_key = anchor.strftime("%Y-%m-%d")
    month_key = closing_date.strftime("%Y-%m")
    weekend_label = season_start.strftime("%d/%m/%Y")
    marker_prefix = f"RAIDE_AUTO:{weekend_key}:5_ATAQUES"

    players = fetch_players()
    events = fetch_raid_events(month_key)
    members = season.get("members") or []

    # Sync attack counts independently from reward eligibility.
    synced_sources = sync_raid_attack_stats(
        members, players, month_key, weekend_key
    )

    awarded, already, capped, unmatched, under = [], [], [], [], []
    for member in members:
        attacks = int(member.get("attacks") or 0)
        api_name = str(member.get("name") or "").strip()
        api_tag = str(member.get("tag") or "").strip().upper()
        player = players.get(api_tag) if api_tag else None
        if not player:
            unmatched.append(f"{api_name} ({api_tag or 'sem tag na API'})")
            continue
        if attacks < 5:
            under.append(api_name or api_tag)
            continue

        registered_name = str(player["name"]).strip()
        player_events = [
            event for event in events
            if str(event.get("player", "")).strip().casefold()
            == registered_name.casefold()
        ]

        same_weekend = False
        for event in player_events:
            same_marker = marker_prefix in str(event.get("activity") or "")
            try:
                same_date = weekend_start(event.get("created_at")) == anchor
            except Exception:
                same_date = False
            if same_marker or same_date:
                same_weekend = True
                break
        if same_weekend:
            already.append(registered_name)
            continue

        month_points = sum(
            int(event.get("points") or 0)
            for event in player_events
            if int(event.get("points") or 0) > 0
        )
        if MONTHLY_CAP - month_points < POINTS_PER_WEEKEND:
            capped.append(registered_name)
            continue

        activity = (
            f"{marker_prefix} | Utilizou 5 ou mais ataques "
            f"({attacks} ataques) | {weekend_label}"
        )
        payload = {
            "player": registered_name,
            "category": RAID_CATEGORY,
            "activity": activity,
            "points": POINTS_PER_WEEKEND,
        }
        status, inserted = supabase_request("POST", "events", payload=payload)
        if status == 409:
            already.append(registered_name)
        else:
            awarded.append(registered_name)
            events.extend(inserted if isinstance(inserted, list) and inserted else [{
                **payload, "created_at": now_local.isoformat()
            }])

    print(
        f"Temporada: {weekend_label} | encerramento: "
        f"{closing_date.strftime('%d/%m/%Y')} | mês contabilizado: {month_key} "
        f"| estado: {season.get('state', 'desconhecido')}"
    )
    print(f"Jogadores analisados: {len(members)}")
    print(f"Fontes mensais sincronizadas: {synced_sources}")
    print(f"Novos lançamentos (+5): {len(awarded)}")
    if awarded:
        print("Premiados: " + ", ".join(awarded))
    print(f"Já registrados neste fim de semana: {len(already)}")
    print(f"Limite mensal atingido: {len(capped)}")
    print(f"Sem correspondência no cadastro: {len(unmatched)}")
    if unmatched:
        print("Não encontrados: " + ", ".join(unmatched))
    print(f"Com menos de 5 ataques: {len(under)}")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"ERRO NA AUTOMAÇÃO DO RAIDE: {exc}", file=sys.stderr)
        raise
