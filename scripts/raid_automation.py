#!/usr/bin/env python3
"""Background Capital Raid scorer for Ghost Hunt. Runs from GitHub Actions."""
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
    """Return Saturday local date identifying the raid weekend."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is not None:
        value = value.astimezone(TZ)
    day = value.date() if isinstance(value, datetime) else value
    return day - timedelta(days=(day.weekday() + 2) % 7)


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


def fetch_month_raid_events(now_local):
    start = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    start_utc = start.astimezone(timezone.utc).isoformat()
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
    return rows


def run():
    now_local = datetime.now(TZ)
    season = api_get_raid_season()
    start_raw = season.get("startTime")
    if not start_raw:
        raise RuntimeError("A temporada retornada não possui startTime.")
    season_start = datetime.fromisoformat(start_raw.replace("Z", "+00:00")).astimezone(TZ)
    anchor = weekend_start(season_start)
    weekend_key = anchor.strftime("%Y-%m-%d")
    weekend_label = season_start.strftime("%d/%m/%Y")
    marker_prefix = f"RAIDE_AUTO:{weekend_key}:5_ATAQUES"

    players = fetch_players()
    events = fetch_month_raid_events(now_local)
    members = season.get("members") or []

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

        # Keep the existing database name so historical event links remain intact.
        registered_name = str(player["name"]).strip()
        player_events = [
            event for event in events
            if str(event.get("player", "")).strip().casefold() == registered_name.casefold()
        ]

        # Any manual or automatic raid award in this same weekend blocks another award.
        same_weekend = False
        for event in player_events:
            created_at = event.get("created_at")
            same_marker = marker_prefix in str(event.get("activity") or "")
            try:
                same_date = weekend_start(created_at) == anchor
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

    print(f"Temporada: {weekend_label} | estado: {season.get('state', 'desconhecido')}")
    print(f"Jogadores analisados: {len(members)}")
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
