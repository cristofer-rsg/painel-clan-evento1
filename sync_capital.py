import json
import os
import sys
import time
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
            "User-Agent": "ClanEvento-CapitalSync/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Clash API respondeu HTTP {error.code}: {detail}") from error


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())
    if len(token.split(".")) != 3:
        raise RuntimeError("CLASH_API_TOKEN ausente ou inválido.")

    supabase_url = os.environ["SUPABASE_URL"].strip().rstrip("/")
    supabase_key = os.environ["SUPABASE_SECRET_KEY"].strip()
    if not supabase_url.startswith("https://") or not supabase_key:
        raise RuntimeError("Configuração do Supabase inválida.")

    clan_tag = quote(CLAN_TAG, safe="")
    roster = api_get(f"/clans/{clan_tag}/members?limit=50", token).get("items")
    if not isinstance(roster, list) or not roster:
        raise RuntimeError("Lista de membros vazia/inválida; nenhuma sincronização foi feita.")

    # Primeiro coleta e valida TODOS os perfis. Só depois grava no banco,
    # evitando uma execução parcial caso a API falhe no meio da consulta.
    profiles = []
    seen_tags = set()
    for member in roster:
        tag = str(member.get("tag") or "").strip().upper()
        name = str(member.get("name") or "").strip()
        if not tag or not name or tag in seen_tags:
            raise RuntimeError(f"Membro inválido ou tag duplicada na lista do clã: {member!r}")
        seen_tags.add(tag)

        profile = api_get(f"/players/{quote(tag, safe='')}", token)
        if str(profile.get("tag") or "").strip().upper() != tag:
            raise RuntimeError(f"A API retornou perfil incompatível para {tag}.")
        if "clanCapitalContributions" not in profile:
            raise RuntimeError(
                f"A API não retornou clanCapitalContributions para {name} ({tag}); "
                "nenhum lançamento foi gravado."
            )
        total = profile["clanCapitalContributions"]
        if isinstance(total, bool) or not isinstance(total, int) or total < 0:
            raise RuntimeError(f"Total de Capital inválido para {name} ({tag}): {total!r}")
        profiles.append({"tag": tag, "name": name, "total": total})
        time.sleep(0.12)

    db = create_client(supabase_url, supabase_key)
    synced = baselines = unchanged = 0
    for profile in profiles:
        result = db.rpc(
            "sync_capital_gold_contribution",
            {
                "p_player_tag": profile["tag"],
                "p_player": profile["name"],
                "p_total": profile["total"],
            },
        ).execute()
        payload = result.data
        if isinstance(payload, list) and payload:
            payload = payload[0]
        if not isinstance(payload, dict):
            raise RuntimeError(f"Retorno inesperado da sincronização para {profile['name']}: {payload!r}")

        status = payload.get("status")
        delta = int(payload.get("points") or 0)
        if status == "baseline":
            baselines += 1
        elif status == "synced":
            synced += 1
            if delta == 0:
                unchanged += 1
        else:
            raise RuntimeError(f"Status inesperado para {profile['name']}: {payload!r}")

        if delta:
            print(f"CAPITAL | {profile['name']} | +{delta:,} moedas".replace(",", "."))
        elif status == "baseline":
            print(f"BASELINE | {profile['name']} | {profile['total']:,} moedas".replace(",", "."))
    print(f"Perfis consultados: {len(profiles)}")
    print(f"Sincronizados: {synced}; sem aumento: {unchanged}; baselines: {baselines}")
    print("Sincronização de Capital do Clã concluída.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
