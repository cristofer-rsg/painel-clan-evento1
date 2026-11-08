import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

from supabase import create_client

API_URL = "https://cocproxy.royaleapi.dev/v1"
TZ = ZoneInfo("America/Sao_Paulo")
ACHIEVEMENT_NAME = "Games Champion"


def api_get(path, token):
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "ClanEvento-ClanGames/2.2",
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


def rpc_data(result):
    data = result.data or {}
    if isinstance(data, list) and data:
        data = data[0]
    return data if isinstance(data, dict) else {}


def sync_monthly_performance(db, month_key):
    result = db.rpc(
        "sync_player_monthly_clan_games",
        {"p_month_key": month_key},
    ).execute()
    data = rpc_data(result)
    if data.get("success") is not True:
        raise RuntimeError(
            f"Falha ao atualizar desempenho mensal dos Jogos do Clã: {data}"
        )
    print(
        "Desempenho mensal atualizado: "
        f"{data.get('players_updated', 0)} jogador(es)."
    )


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

    # Evita consultar duas vezes a mesma tag caso haja duplicidade no cadastro.
    players_by_tag = {}
    for row in roster:
        tag = row.get("player_tag")
        name = row.get("name")
        if tag and name:
            if tag in players_by_tag:
                raise RuntimeError(f"Tag duplicada no cadastro: {tag}")
            players_by_tag[tag] = row

    players = list(players_by_tag.values())
    if not players:
        print("Nenhum jogador ativo com tag cadastrado; nada a sincronizar.")
        return

    month_key = datetime.now(TZ).strftime("%Y-%m")
    snapshot = []
    failures = []

    for player in players:
        tag = player["player_tag"]
        try:
            data = api_get(f"/players/{quote(tag, safe='')}", token)
            achievements = data.get("achievements") or []
            achievement = next(
                (
                    item for item in achievements
                    if item.get("name", "").strip().casefold()
                    == ACHIEVEMENT_NAME.casefold()
                ),
                None,
            )
            if achievement is None:
                raise RuntimeError("Conquista Games Champion não encontrada.")

            value = achievement.get("value")
            if not isinstance(value, int) or value < 0:
                raise RuntimeError("Valor da conquista inválido.")

            snapshot.append({
                "player_tag": tag,
                "player": player["name"],
                "achievement_value": value,
            })
        except Exception as error:
            failures.append(f"{player['name']} ({tag}): {error}")

    # Não atualiza observador nem ranking com uma amostra incompleta.
    if failures:
        for failure in failures:
            print(f"ATENÇÃO: {failure}")
        raise RuntimeError(
            f"{len(failures)} jogador(es) não puderam ser consultados. "
            "Banco não alterado para evitar detectar início ou pontuação "
            "com uma lista incompleta."
        )

    if not snapshot:
        raise RuntimeError("Nenhum perfil consultado.")

    # Preserva o mecanismo automático original: ele detecta o início
    # dos Jogos do Clã e mantém o baseline individual da conquista.
    result = db.rpc(
        "auto_sync_clash_games",
        {"p_month_key": month_key, "p_snapshot": snapshot},
    ).execute()
    data = rpc_data(result)

    # Espelha points_earned somente depois da sincronização original.
    # A função SQL atualiza exclusivamente clan_games_points.
    sync_monthly_performance(db, month_key)

    print(f"Mês: {month_key}")
    print(f"Jogadores consultados: {len(snapshot)}")
    print(f"Resultado: {json.dumps(data, ensure_ascii=False)}")
    print("Verificação automática dos Jogos do Clã concluída.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
