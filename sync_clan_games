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
ACHIEVEMENT_NAME = "Games Champion"


def api_get(path, token):
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "ClanEvento-ClanGames/1.0",
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


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())
    if len(token.split(".")) != 3:
        raise RuntimeError("CLASH_API_TOKEN ausente ou inválido.")

    supabase_url = os.environ["SUPABASE_URL"].strip().rstrip("/")
    supabase_key = os.environ["SUPABASE_SECRET_KEY"].strip()
    if not supabase_url.startswith("https://") or not supabase_key:
        raise RuntimeError("Configuração do Supabase inválida.")

    mode = os.environ.get("GAMES_MODE", "poll").strip().lower()
    if mode not in ("baseline", "poll"):
        raise RuntimeError("GAMES_MODE deve ser baseline ou poll.")

    db = create_client(supabase_url, supabase_key)
    roster = (
        db.table("players")
        .select("name,player_tag,active")
        .eq("active", True)
        .execute()
        .data or []
    )
    players = [
        row for row in roster
        if row.get("player_tag") and row.get("name")
    ]
    if not players:
        raise RuntimeError("Nenhum jogador ativo com tag cadastrado.")

    month_key = datetime.now(TZ).strftime("%Y-%m")

    # Antes do início oficial dos Jogos, o agendamento periódico não deve
    # gerar falhas nem criar uma linha de base acidental.
    if mode == "poll":
        baseline_check = (
            db.table("clash_games_tracking")
            .select("player_tag")
            .eq("month_key", month_key)
            .limit(1)
            .execute()
            .data or []
        )
        if not baseline_check:
            print(
                "Jogos do Clã ainda não foram iniciados no Ghost Hunt. "
                "No primeiro dia do evento, execute manualmente com mode=baseline."
            )
            return

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

    if failures:
        for failure in failures:
            print(f"ATENÇÃO: {failure}")
        raise RuntimeError(
            f"{len(failures)} jogador(es) não puderam ser consultados. "
            "Banco não alterado para evitar um ranking incompleto."
        )
    if not snapshot:
        raise RuntimeError("Nenhum perfil consultado.")

    if mode == "baseline":
        result = db.rpc(
            "start_clash_games_tracking",
            {"p_month_key": month_key, "p_snapshot": snapshot},
        ).execute()
    else:
        result = db.rpc(
            "sync_clash_games",
            {"p_month_key": month_key, "p_snapshot": snapshot},
        ).execute()

    data = result.data or {}
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        data = {}

    print(f"Mês: {month_key}")
    print(f"Modo: {mode}")
    print(f"Jogadores consultados: {len(snapshot)}")
    print(f"Resultado: {json.dumps(data, ensure_ascii=False)}")
    print("Sincronização dos Jogos do Clã concluída.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
