import unittest

from scripts.raid_points import build_raid_event_plan


PLAYERS = [{"name": "Lilias", "active": True, "player_tag": "#AAA"}]
PREVIEW = {
    "status": "ok",
    "season": "08/11/2026",
    "rows": [{
        "Jogador na API": "Lilias",
        "Cadastro no Ghost Hunt": "Lilias",
        "Ataques": 5,
    }],
}


class RaidPointPlanTests(unittest.TestCase):
    def test_creates_award_with_five_attack_bonus(self):
        plan = build_raid_event_plan(PREVIEW, PLAYERS, [])
        action = plan["actions"][0]
        self.assertEqual(action["action"], "insert")
        self.assertEqual(action["points"], 7)
        self.assertIn("bônus de 5 ataques: 2 ponto(s)", action["activity"])

    def test_six_attacks_clamp_and_update_existing_automatic_award(self):
        old = {
            "id": 11, "player": "Lilias", "category": "Raide de Fim de Semana",
            "activity": "RAIDE_AUTO:2026-11-07:ATAQUES_5 | antigo", "points": 7,
            "created_at": "2026-11-07T12:00:00-03:00",
        }
        preview = {**PREVIEW, "rows": [{**PREVIEW["rows"][0], "Ataques": 9}]}
        plan = build_raid_event_plan(preview, PLAYERS, [old])
        self.assertEqual(plan["actions"][0]["action"], "update")
        self.assertEqual(plan["actions"][0]["id"], 11)
        self.assertEqual(plan["actions"][0]["points"], 8)
        self.assertIn("ATAQUES_6", plan["actions"][0]["activity"])

    def test_manual_event_prevents_automatic_duplicate(self):
        manual = {
            "id": 20, "player": "Lilias", "category": "Raide de Fim de Semana",
            "activity": "Lançamento manual", "points": 5,
            "created_at": "2026-11-07T12:00:00-03:00",
        }
        plan = build_raid_event_plan(PREVIEW, PLAYERS, [manual])
        self.assertEqual(plan["actions"][0]["reason"], "manual_event_precedence")

    def test_existing_target_is_not_inserted_again(self):
        existing = {
            "id": 30, "player": "Lilias", "category": "Raide de Fim de Semana",
            "activity": "RAIDE_AUTO:2026-11-07:ATAQUES_5 | existente", "points": 7,
            "created_at": "2026-11-07T12:00:00-03:00",
        }
        plan = build_raid_event_plan(PREVIEW, PLAYERS, [existing])
        self.assertEqual(plan["actions"][0]["action"], "skip")
        self.assertEqual(plan["actions"][0]["reason"], "already_awarded")

    def test_duplicate_automatic_records_are_consolidated(self):
        first = {
            "id": 31, "player": "Lilias", "category": "Raide de Fim de Semana",
            "activity": "RAIDE_AUTO:2026-11-07:ATAQUES_5 | antigo", "points": 7,
            "created_at": "2026-11-07T12:00:00-03:00",
        }
        second = {**first, "id": 32}
        plan = build_raid_event_plan(PREVIEW, PLAYERS, [first, second])
        self.assertEqual([a["action"] for a in plan["actions"]], ["skip", "delete"])
        self.assertEqual(plan["actions"][0]["reason"], "already_awarded")
        self.assertEqual(plan["actions"][1]["id"], 32)

    def test_inactive_player_is_unmatched(self):
        plan = build_raid_event_plan(PREVIEW, [{"name": "Lilias", "active": False}], [])
        self.assertEqual(plan["unmatched"], ["Lilias"])
        self.assertEqual(plan["actions"], [])

    def test_invalid_season_returns_error_without_actions(self):
        plan = build_raid_event_plan({**PREVIEW, "season": "data inválida"}, PLAYERS, [])
        self.assertTrue(plan["errors"])
        self.assertEqual(plan["actions"], [])

    def test_zero_attacks_do_not_create_event(self):
        preview = {**PREVIEW, "rows": [{**PREVIEW["rows"][0], "Ataques": 0}]}
        self.assertEqual(build_raid_event_plan(preview, PLAYERS, [])["actions"], [])


    def test_tag_matched_preview_awards_registered_player_not_api_name(self):
        preview = {
            **PREVIEW,
            "rows": [{
                "Jogador na API": "Old Clash Name",
                "Tag": "#AAA",
                "Cadastro no Ghost Hunt": "Lilias",
                "Vínculo": "TAG",
                "Ataques": 5,
            }],
        }
        plan = build_raid_event_plan(preview, PLAYERS, [])
        self.assertEqual(plan["actions"][0]["player"], "Lilias")
        self.assertEqual(plan["actions"][0]["action"], "insert")

    def test_weekend_anchor_uses_brazil_local_time(self):
        from scripts.raid_points import _weekend_start
        from datetime import date

        # 02:00 UTC on Sunday is 23:00 Saturday in Sao Paulo.
        self.assertEqual(
            _weekend_start("2026-11-08T02:00:00Z"),
            date(2026, 11, 7),
        )

    def test_event_input_is_not_mutated(self):
        existing = {
            "id": 41, "player": "Lilias", "category": "Raide de Fim de Semana",
            "activity": "RAIDE_AUTO:2026-11-07:ATAQUES_5 | antigo", "points": 6,
            "created_at": "2026-11-07T12:00:00-03:00",
        }
        original = dict(existing)
        build_raid_event_plan(PREVIEW, PLAYERS, [existing])
        self.assertEqual(existing, original)

    def test_rows_without_registered_match_are_not_awarded(self):
        preview = {
            **PREVIEW,
            "rows": [{
                "Jogador na API": "Unknown",
                "Cadastro no Ghost Hunt": "NÃO ENCONTRADO",
                "Ataques": 6,
            }],
        }
        plan = build_raid_event_plan(preview, PLAYERS, [])
        self.assertEqual(plan["unmatched"], ["Unknown"])
        self.assertEqual(plan["actions"], [])


if __name__ == "__main__":
    unittest.main()
