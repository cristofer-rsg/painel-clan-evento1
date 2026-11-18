import unittest
from datetime import datetime, timedelta, timezone

from scripts.war_rules import (
    resolve_war_end,
    should_penalize_early_second_attack,
)


class WarPenaltyWindowTests(unittest.TestCase):
    def setUp(self):
        self.started_at = datetime(2026, 11, 18, 15, 36, 30, tzinfo=timezone.utc)

    def test_active_war_uses_scheduled_24_hour_end_not_api_end_time(self):
        premature_api_end = self.started_at + timedelta(hours=3)
        resolved = resolve_war_end(self.started_at, premature_api_end, "inWar")
        self.assertEqual(resolved, self.started_at + timedelta(hours=24))

    def test_second_attack_before_final_twelve_hours_is_penalized(self):
        war_end = resolve_war_end(self.started_at, None, "inWar")
        observed_at = self.started_at + timedelta(hours=4)
        self.assertTrue(should_penalize_early_second_attack(2, observed_at, war_end))

    def test_second_attack_inside_final_twelve_hours_is_not_penalized(self):
        war_end = resolve_war_end(self.started_at, None, "inWar")
        observed_at = self.started_at + timedelta(hours=13)
        self.assertFalse(should_penalize_early_second_attack(2, observed_at, war_end))

    def test_ended_war_uses_valid_official_end_time(self):
        official_end = self.started_at + timedelta(hours=23, minutes=50)
        self.assertEqual(
            resolve_war_end(self.started_at, official_end, "warEnded"),
            official_end,
        )

    def test_invalid_or_missing_ended_war_time_falls_back_to_24_hours(self):
        invalid_end = self.started_at - timedelta(minutes=1)
        self.assertEqual(
            resolve_war_end(self.started_at, invalid_end, "warEnded"),
            self.started_at + timedelta(hours=24),
        )


if __name__ == "__main__":
    unittest.main()
