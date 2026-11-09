"""Pure planning logic for idempotent Clash of Clans raid point awards.

This module performs no network or database operations. It mirrors the decision
rules in the legacy Streamlit app so they can be tested before an automated
writer is connected to public.events.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Sao_Paulo")
CATEGORY = "Raide de Fim de Semana"


def _weekend_start(value):
    """Return the local Saturday anchor for a date, datetime, or ISO timestamp."""
    if value is None:
        return None
    try:
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=ZoneInfo("UTC"))
            value = value.astimezone(TZ).date()
        if not isinstance(value, date):
            return None
        return value - timedelta(days=(value.weekday() + 2) % 7)
    except (TypeError, ValueError, OverflowError):
        return None


def _name_key(value):
    return str(value or "").strip().casefold()


def build_raid_event_plan(preview, players_data, month_events):
    """Build insert/update/delete/skip actions without writing to Supabase."""
    plan = {"actions": [], "unmatched": [], "errors": []}
    if not isinstance(preview, dict) or preview.get("status") != "ok":
        return plan

    try:
        weekend_date = datetime.strptime(str(preview.get("season") or ""), "%d/%m/%Y").date()
    except ValueError:
        plan["errors"].append("Não foi possível identificar a data do fim de semana.")
        return plan

    anchor = _weekend_start(weekend_date)
    if anchor is None:
        plan["errors"].append("Não foi possível calcular o identificador do fim de semana.")
        return plan

    weekend_key = anchor.isoformat()
    weekend_label = weekend_date.strftime("%d/%m/%Y")
    active_players = {
        _name_key(player.get("name")): player
        for player in (players_data or [])
        if player.get("name") and player.get("active", True) is not False
    }
    known_events = list(month_events or [])

    def same_player_weekend(event, player_name):
        if _name_key(event.get("player")) != _name_key(player_name):
            return False
        if event.get("category") != CATEGORY:
            return False
        activity = str(event.get("activity") or "")
        return (
            activity.startswith(f"RAIDE_AUTO:{weekend_key}:")
            or _weekend_start(event.get("created_at")) == anchor
        )

    for row in preview.get("rows", []):
        try:
            attacks = max(0, min(6, int(row.get("Ataques") or 0)))
        except (TypeError, ValueError, OverflowError):
            plan["errors"].append(
                f"{row.get('Jogador na API', 'Jogador')}: quantidade de ataques inválida."
            )
            continue
        if attacks <= 0:
            continue

        registered_name = str(row.get("Cadastro no Ghost Hunt") or "").strip()
        player = active_players.get(_name_key(registered_name))
        if not player:
            plan["unmatched"].append(row.get("Jogador na API", ""))
            continue

        player_name = str(player["name"])
        marker = f"RAIDE_AUTO:{weekend_key}:ATAQUES_{attacks}"
        points = attacks + (2 if attacks >= 5 else 0)
        activity = (
            f"{marker} | {attacks} ataque(s) utilizados"
            f" | bônus de 5 ataques: {2 if attacks >= 5 else 0} ponto(s)"
            f" | total: {points} pontos | {weekend_label}"
        )

        weekend_events = [
            event for event in known_events
            if same_player_weekend(event, player_name)
        ]
        automatic_events = [
            event for event in weekend_events
            if str(event.get("activity") or "").startswith(f"RAIDE_AUTO:{weekend_key}:")
        ]
        target = next(
            (
                event for event in automatic_events
                if str(event.get("activity") or "").startswith(marker)
            ),
            None,
        )

        if target:
            if int(target.get("points") or 0) != points:
                plan["actions"].append({
                    "action": "update", "id": target.get("id"),
                    "player": player_name, "activity": activity, "points": points,
                })
                target["points"] = points
                target["activity"] = activity
            else:
                plan["actions"].append({
                    "action": "skip", "reason": "already_awarded", "player": player_name,
                })
            for duplicate in automatic_events:
                if duplicate is not target and duplicate.get("id") is not None:
                    plan["actions"].append({
                        "action": "delete", "id": duplicate["id"],
                        "player": player_name, "reason": "duplicate_automatic",
                    })
            continue

        if automatic_events:
            canonical = automatic_events[0]
            plan["actions"].append({
                "action": "update", "id": canonical.get("id"),
                "player": player_name, "activity": activity, "points": points,
            })
            canonical["activity"] = activity
            canonical["points"] = points
            for duplicate in automatic_events[1:]:
                if duplicate.get("id") is not None:
                    plan["actions"].append({
                        "action": "delete", "id": duplicate["id"],
                        "player": player_name, "reason": "duplicate_automatic",
                    })
            continue

        if weekend_events:
            plan["actions"].append({
                "action": "skip", "reason": "manual_event_precedence", "player": player_name,
            })
            continue

        plan["actions"].append({
            "action": "insert", "player": player_name, "category": CATEGORY,
            "activity": activity, "points": points,
        })

    return plan
