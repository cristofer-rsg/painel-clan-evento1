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


class ClashAPIError(RuntimeError):
    def __init__(self, status, detail):
        self.status = status
        self.detail = detail
        super().__init__(f"Erro na API Clash of Clans ({status}): {detail}")


def api_get(path, token):
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json",
                 "User-Agent": "GhostHunt-Sync/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise ClashAPIError(error.code, detail) from error


def sync_capital_gold(db, token, players_by_tag):
    """
    Sincroniza o total vitalício de contribuições à Capital.
    A primeira consulta de cada jogador apenas cria a linha de referência
    (baseline), sem lançar pontos retroativos. Consultas seguintes lançam
    somente a diferença positiva desde a última leitura.
    """
    synced = 0
    baseline = 0
    skipped = 0
    failures = []

    for tag, player in players_by_tag.items():
        try:
            profile = api_get(f"/players/{quote(tag, safe='')}", token)

            # Evita registrar dados caso o jogador já não esteja no clã correto.
            clan = profile.get("clan") or {}
            if clan.get("tag") != CLAN_TAG:
                print(f"Capital: {player['name']} ignorado (não está no clã).")
                skipped += 1
                continue

            total = profile.get("clanCapitalContributions")
            if total is None:
                raise RuntimeError("API não retornou clanCapitalContributions.")

            result = db.rpc(
                "sync_capital_gold_contribution",
                {
                    "p_player_tag": tag,
                    "p_player": player["name"],
                    "p_total": int(total),
                },
            ).execute()

            response = result.data or {}
            status = response.get("status") if isinstance(response, dict) else None
            points = int(response.get("points", 0)) if isinstance(response, dict) else 0

            if status == "baseline":
                baseline += 1
                print(f"Capital: referência inicial criada para {player['name']} ({total}).")
            else:
                synced += 1
                if points:
                    print(f"Capital: {player['name']} +{points} pontos.")
        except Exception as error:
            failures.append(f"{player['name']} ({tag}): {error}")
            print(f"ATENÇÃO: falha ao sincronizar Capital de {player['name']}: {error}")

    print(
        "Capital do Clã — "
        f"atualizados: {synced}; referências iniciais: {baseline}; "
        f"ignorados: {skipped}; falhas: {len(failures)}"
    )
    return failures



def sync_league_completion_bonus(db, players_by_tag):
    """Lança uma única vez o bônus de 10 pontos para quem completou 7 ataques.

    A consulta usa as estatísticas mensais já consolidadas no banco, por isso
    também funciona depois que a API encerra o grupo da Liga. A source_key
    mensal por jogador torna a operação idempotente via RPC existente.
    """
    month_key = datetime.now(TZ).strftime("%Y-%m")
    rows = (db.table("player_monthly_stats")
            .select("player_tag,player,league_attacks")
            .eq("month_key", month_key)
            .gte("league_attacks", 7)
            .execute().data or [])
    events = []
    for row in rows:
        tag = row.get("player_tag")
        player = players_by_tag.get(tag)
        if not player:
            continue
        events.append({
            "source_key": f"league-completion:{month_key.replace('-', '')}:{tag}",
            "war_key": f"league:{month_key.replace('-', '')}",
            "player_tag": tag,
            "player": player["name"],
            "activity": "Completou os 7 ataques da Liga dos Clãs (+10 bônus)",
            "points": 10,
        })
    if not events:
        print(f"Bônus de conclusão da Liga: nenhum jogador elegível em {month_key}.")
        return
    result = db.rpc("record_clash_league_events", {"p_events": events}).execute()
    response = result.data or {}
    inserted = response.get("inserted", 0) if isinstance(response, dict) else 0
    skipped = response.get("skipped", 0) if isinstance(response, dict) else 0
    print(
        f"Bônus de conclusão da Liga ({month_key}): "
        f"elegíveis={len(events)}, lançados={inserted}, já registrados/ignorados={skipped}."
    )

def make_war_events(war, players_by_tag):
    if war.get("state") not in ("inWar", "warEnded"):
        return [], []
    clan, opponent = war.get("clan") or {}, war.get("opponent") or {}
    if clan.get("tag") == CLAN_TAG:
        own_clan, enemy_clan = clan, opponent
    elif opponent.get("tag") == CLAN_TAG:
        own_clan, enemy_clan = opponent, clan
    else:
        return [], []
    war_time = war.get("startTime") or war.get("endTime")
    if not war_time:
        raise RuntimeError("Guerra da Liga sem startTime/endTime.")
    month_key = datetime.strptime(war_time[:15], "%Y%m%dT%H%M%S").replace(
        tzinfo=timezone.utc
    ).astimezone(TZ).strftime("%Y-%m")
    enemy_positions = {
        m.get("tag"): m.get("mapPosition")
        for m in enemy_clan.get("members") or [] if m.get("tag")
    }
    events, stat_sources = [], []
    for member in own_clan.get("members") or []:
        tag = member.get("tag")
        player = players_by_tag.get(tag)
        if not tag or not player:
            continue
        attacks = sorted(member.get("attacks") or [],
                         key=lambda a: int(a.get("order") or 0))
        name = player["name"]
        stat_sources.append({
            "month_key": month_key, "source_key": f"league:{war_time}:{tag}",
            "player_tag": tag, "player": name, "war_attacks": 0,
            "league_attacks": len(attacks), "raid_attacks": 0,
        })
        if war.get("state") == "warEnded" and not attacks:
            events.append({
                "source_key": f"{war_time}:{tag}:penalty:missed-daily-attack",
                "war_key": str(war_time), "player_tag": tag, "player": name,
                "activity": "Penalidade: não realizou o ataque do dia na Liga (−5)",
                "points": -5,
            })
        for index, attack in enumerate(attacks, start=1):
            order = attack.get("order", index)
            stars = int(attack.get("stars") or 0)

            def add(suffix, activity, points):
                events.append({
                    "source_key": f"{war_time}:{tag}:{suffix}",
                    "war_key": str(war_time), "player_tag": tag,
                    "player": name, "activity": activity, "points": points,
                })

            add(f"attack:{order}:completed", f"Realizou ataque {order} (+5)", 5)
            if stars > 0:
                add(f"attack:{order}:stars",
                    f"Conquistou {stars} estrela(s) no ataque {order} (+{stars})",
                    stars)
            defender_tag = attack.get("defenderTag")
            if (member.get("mapPosition") is not None and
                    enemy_positions.get(defender_tag) == member.get("mapPosition")):
                add(f"mirror:{order}",
                    f"Acertou o espelho no ataque {order} (+5)", 5)
            elif defender_tag and enemy_positions.get(defender_tag) is not None and member.get("mapPosition") is not None:
                add(f"penalty:off-mirror:{order}",
                    "Penalidade: atacou fora do espelho na Liga (−5)", -5)
    return events, stat_sources


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())
    if len(token.split(".")) != 3:
        raise RuntimeError("CLASH_API_TOKEN ausente ou inválido.")
    supabase_url = os.environ["SUPABASE_URL"].strip().rstrip("/")
    supabase_key = os.environ["SUPABASE_SECRET_KEY"].strip()
    if not supabase_url.startswith("https://") or not supabase_key:
        raise RuntimeError("Configuração do Supabase inválida.")
    db = create_client(supabase_url, supabase_key)
    roster = (db.table("players").select("name,player_tag,active")
              .eq("active", True).execute().data or [])
    players_by_tag = {r["player_tag"]: r for r in roster
                      if r.get("player_tag") and r.get("name")}

    # A sincronização da Capital é independente da Liga. Falhas individuais
    # são registradas e serão tentadas novamente na próxima execução.
    sync_capital_gold(db, token, players_by_tag)
    # O bônus é conferido antes da consulta à Liga ativa, inclusive após o encerramento.
    sync_league_completion_bonus(db, players_by_tag)

    clan_tag = quote(CLAN_TAG, safe="")
    try:
        group = api_get(f"/clans/{clan_tag}/currentwar/leaguegroup", token)
    except ClashAPIError as error:
        # Fora da temporada, a API retorna 404/notFound porque não existe
        # grupo de Liga ativo. Isso é um estado esperado, não uma falha.
        try:
            payload = json.loads(error.detail)
        except (TypeError, ValueError):
            payload = {}
        if error.status == 404 and payload.get("reason") == "notFound":
            print(
                "Liga dos Clãs sem grupo ativo (temporada encerrada ou ainda "
                "não iniciada). Sincronização da Liga ignorada; pontos e "
                "histórico existentes foram preservados."
            )
            return
        raise

    if group.get("state") == "notInWar":
        print("O clã não está em uma Liga ativa.")
        return
    war_tags = []
    for round_data in group.get("rounds") or []:
        for war_tag in round_data.get("warTags") or []:
            if war_tag and war_tag != "#0" and war_tag not in war_tags:
                war_tags.append(war_tag)
    if not war_tags:
        print("Nenhuma guerra disponível na Liga.")
        return
    all_events, all_stat_sources, failed_wars = [], [], []
    for war_tag in war_tags:
        try:
            war = api_get(f"/clanwarleagues/wars/{quote(war_tag, safe='')}", token)
            ev, stats = make_war_events(war, players_by_tag)
            all_events.extend(ev)
            all_stat_sources.extend(stats)
        except Exception as error:
            failed_wars.append(f"{war_tag}: {error}")
    for failure in failed_wars:
        print(f"ATENÇÃO: {failure}")
    if failed_wars:
        raise RuntimeError(
            "Sincronização da Liga incompleta; estatísticas mensais não foram "
            "atualizadas para evitar contagem parcial."
        )
    if all_stat_sources:
        stats_result = db.rpc("sync_player_monthly_stat_sources",
                              {"p_sources": all_stat_sources}).execute()
        print(f"Registros de ataques da Liga sincronizados: {len(all_stat_sources)}")
        print(f"Resposta da estatística: {stats_result.data}")
    if not all_events:
        print("Nenhum evento de pontuação da Liga encontrado.")
        return
    result = db.rpc("record_clash_league_events", {"p_events": all_events}).execute()
    response = result.data or {}
    inserted = response.get("inserted", 0) if isinstance(response, dict) else 0
    skipped = response.get("skipped", 0) if isinstance(response, dict) else 0
    print(f"Temporada: {group.get('season', 'não informada')}")
    print(f"Guerras verificadas: {len(war_tags)}")
    print(f"Eventos avaliados: {len(all_events)}")
    print(f"Novos lançamentos: {inserted}")
    print(f"Duplicados/ignorados: {skipped}")
    print(f"Guerras com erro: {len(failed_wars)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
