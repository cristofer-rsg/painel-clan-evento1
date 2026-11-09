#!/usr/bin/env python3
"""Sincroniza ataques e lança pontos do Raide de forma automática e idempotente."""
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
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(TZ)
        value = value.date()
    return value - timedelta(days=(value.weekday() + 2) % 7)


def api_get_raid_season():
    tag_path = "%23" + CLAN_TAG.lstrip("#")
    response = HTTP.get(
        f"{API_BASE}/clans/{tag_path}/capitalraidseasons",
        headers={"Authorization": f"Bearer {CLASH_TOKEN}", "auth": CLASH_TOKEN, "Accept": "application/json"},
        params={"limit": 1}, timeout=30,
    )
    response.raise_for_status()
    items = (response.json() or {}).get("items") or []
    if not items:
        raise RuntimeError("A API não retornou uma temporada do Raide.")
    return items[0]


def supabase_request(method, table, *, params=None, payload=None):
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
    response = HTTP.request(method, f"{SUPABASE_URL}/rest/v1/{table}", headers=headers,
                            params=params, json=payload, timeout=30)
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase {method} {table}: HTTP {response.status_code} - {response.text[:500]}")
    try:
        return response.status_code, response.json() if response.content else []
    except ValueError:
        return response.status_code, []


def fetch_players():
    _, rows = supabase_request("GET", "players",
        params={"select": "name,player_tag,active", "order": "name.asc"})
    players_by_tag = {}
    for row in rows:
        if row.get("active", True) is False:
            continue
        tag = str(row.get("player_tag") or "").strip().upper()
        if not tag:
            continue
        if tag in players_by_tag:
            raise RuntimeError(f"Tag duplicada no cadastro: {tag}. Nenhum ponto foi lançado.")
        players_by_tag[tag] = row
    return players_by_tag


def sync_raid_attack_stats(members, players_by_tag, month_key, weekend_key):
    sources, seen_tags = [], set()
    for member in members:
        tag = str(member.get("tag") or "").strip().upper()
        player = players_by_tag.get(tag)
        if not player:
            continue
        if tag in seen_tags:
            raise RuntimeError(f"A API retornou a tag duplicada no Raide: {tag}")
        seen_tags.add(tag)
        attacks = member.get("attacks")
        if not isinstance(attacks, int) or attacks < 0:
            raise RuntimeError(f"Quantidade de ataques inválida para {player['name']}.")
        sources.append({
            "month_key": month_key, "source_key": f"raid:{weekend_key}:{tag}",
            "player_tag": tag, "player": player["name"],
            "war_attacks": 0, "league_attacks": 0, "raid_attacks": attacks,
        })
    if not sources:
        raise RuntimeError("Nenhum membro do Raide corresponde aos jogadores ativos cadastrados.")
    _, result = supabase_request("POST", "rpc/sync_player_monthly_stat_sources",
                                 payload={"p_sources": sources})
    print(f"Fontes mensais sincronizadas: {len(sources)} | retorno: {result}")
    return len(sources)


def award_raid_points(members, players_by_tag, weekend_key, month_key, weekend_label):
    awards, unmatched, under_five = [], [], []
    for member in members:
        tag = str(member.get("tag") or "").strip().upper()
        player = players_by_tag.get(tag)
        if not player:
            if tag:
                unmatched.append(f"{member.get('name') or tag} ({tag})")
            continue
        attacks = member.get("attacks")
        if not isinstance(attacks, int) or attacks < 0:
            raise RuntimeError(f"Quantidade de ataques inválida para {player['name']}.")
        if attacks < 5:
            under_five.append(player["name"])
            continue
        awards.append({
            "player": player["name"], "player_tag": tag, "weekend_key": weekend_key,
            "month_key": month_key, "attacks": attacks, "weekend_label": weekend_label,
        })
    if not awards:
        print("Nenhum jogador elegível ao +5 neste momento.")
        return {"awarded": [], "already": [], "capped": [], "unmatched": unmatched}
    _, result = supabase_request("POST", "rpc/apply_automatic_raid_points",
                                 payload={"p_awards": awards})
    if isinstance(result, list) and result:
        result = result[0]
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError(f"Retorno inesperado da pontuação automática: {result}")
    details = result.get("results") or []
    awarded = [r.get("player") for r in details if r.get("status") == "awarded"]
    already = [r.get("player") for r in details if r.get("status") == "already_awarded"]
    capped = [r.get("player") for r in details if r.get("status") == "monthly_limit"]
    inactive = [r.get("player") for r in details if r.get("status") == "not_active"]
    print(f"Novos lançamentos (+5): {len(awarded)}")
    if awarded:
        print("Premiados: " + ", ".join(awarded))
    print(f"Já pontuados: {len(already)} | limite mensal: {len(capped)}")
    print(f"Inativos/tag divergente: {len(inactive)} | menos de 5 ataques: {len(under_five)}")
    print(f"Sem correspondência: {len(unmatched)}")
    if unmatched:
        print("Não encontrados: " + ", ".join(unmatched))
    return {"awarded": awarded, "already": already, "capped": capped, "unmatched": unmatched}


def run():
    season = api_get_raid_season()
    start_raw = season.get("startTime")
    if not start_raw:
        raise RuntimeError("A temporada retornada não possui startTime.")
    season_start = datetime.fromisoformat(start_raw.replace("Z", "+00:00")).astimezone(TZ)
    anchor = weekend_start(season_start)
    closing_date = anchor + timedelta(days=2)
    weekend_key = anchor.isoformat()
    month_key = closing_date.strftime("%Y-%m")
    weekend_label = season_start.strftime("%d/%m/%Y")
    players = fetch_players()
    members = season.get("members") or []
    synced = sync_raid_attack_stats(members, players, month_key, weekend_key)
    result = award_raid_points(members, players, weekend_key, month_key, weekend_label)
    print(f"Temporada: {weekend_label} | fechamento: {closing_date:%d/%m/%Y} | competência: {month_key} | estado: {season.get('state', 'desconhecido')}")
    print(f"Jogadores analisados: {len(members)} | fontes sincronizadas: {synced}")
    print(f"Resultado: {result}")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"ERRO NA AUTOMAÇÃO DO RAIDE: {exc}", file=sys.stderr)
        raise
