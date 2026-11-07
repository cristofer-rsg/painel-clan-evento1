import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

from supabase import create_client

CLAN_TAG = "#2GCGP0RQ9"
API_URL = "https://cocproxy.royaleapi.dev/v1"
TZ = ZoneInfo("America/Sao_Paulo")


def buscar_membros(token):
    clan_tag = quote(CLAN_TAG, safe="")
    url = f"{API_URL}/clans/{clan_tag}/members?limit=50"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "ClanEvento-DonationSync/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Erro na API Clash of Clans ({error.code}): {detail}"
        ) from error

    members = data.get("items")
    if not isinstance(members, list):
        raise RuntimeError("A API não retornou uma lista válida de membros.")
    return members


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())
    if len(token.split(".")) != 3:
        raise RuntimeError("CLASH_API_TOKEN ausente ou inválido.")

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
    if not players_by_tag:
        raise RuntimeError("Nenhum jogador ativo com tag cadastrado no Supabase.")

    members = buscar_membros(token)
    snapshot = []
    seen_tags = set()

    for member in members:
        if not isinstance(member, dict):
            continue
        tag = member.get("tag")
        if not tag or tag not in players_by_tag:
            continue
        if tag in seen_tags:
            raise RuntimeError(f"A API retornou a tag duplicada: {tag}")
        seen_tags.add(tag)

        donations = member.get("donations")
        if not isinstance(donations, int) or donations < 0:
            raise RuntimeError(
                f"Quantidade de doações inválida para {member.get('name', tag)}."
            )

        snapshot.append({
            "player_tag": tag,
            "player": players_by_tag[tag]["name"],
            "donations": donations,
        })

    if not snapshot:
        raise RuntimeError(
            "Nenhum membro da API corresponde aos jogadores ativos cadastrados. "
            "O banco não foi alterado."
        )

    month_key = datetime.now(TZ).strftime("%Y-%m")
    result = db.rpc(
        "sync_clash_donations",
        {"p_month_key": month_key, "p_snapshot": snapshot},
    ).execute()

    data = result.data or {}
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        data = {}

    # Atualiza somente a coluna donations em player_monthly_stats.
    # As colunas de guerras, liga, raide e jogos permanecem intactas.
    stats_result = db.rpc(
        "sync_player_monthly_donations",
        {"p_month_key": month_key, "p_snapshot": snapshot},
    ).execute()

    stats_data = stats_result.data or {}
    if isinstance(stats_data, list) and stats_data:
        stats_data = stats_data[0]
    if not isinstance(stats_data, dict):
        stats_data = {}

    print(f"Mês do ranking: {month_key}")
    print(f"Membros do clã consultados: {len(members)}")
    print(f"Jogadores sincronizados: {len(snapshot)}")
    print(f"Doações acumuladas no mês: {data.get('players_tracked', 'OK')}")
    print(f"Lançamentos de pontuação atualizados: {data.get('events_created', 'OK')}")
    print(f"Estatísticas mensais atualizadas: {stats_data.get('players_updated', 'OK')}")
    print("Sincronização automática de doações concluída.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
