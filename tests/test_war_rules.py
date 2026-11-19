import unittest
from datetime import datetime, timedelta, timezone

from scripts.war_rules import (
    resolve_war_end,
    resolve_war_state,
    should_penalize_early_second_attack,
    should_penalize_off_mirror,
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

    def test_official_attack_time_overrides_first_observation(self):
        war_end = resolve_war_end(self.started_at, None, "inWar")
        observed_after_cutoff = self.started_at + timedelta(hours=13)
        actual_attack_before_cutoff = self.started_at + timedelta(hours=4)
        self.assertTrue(should_penalize_early_second_attack(
            2, observed_after_cutoff, war_end, actual_attack_before_cutoff
        ))

    def test_first_attack_after_cutoff_is_not_penalized_when_observed_early(self):
        war_end = resolve_war_end(self.started_at, None, "inWar")
        observed_early = self.started_at + timedelta(hours=4)
        actual_attack_late = self.started_at + timedelta(hours=13)
        self.assertFalse(should_penalize_off_mirror(
            1, observed_early, war_end, actual_attack_late
        ))

    def test_missing_attack_time_after_cutoff_is_not_treated_as_proof(self):
        war_end = resolve_war_end(self.started_at, None, "inWar")
        observed_after_cutoff = self.started_at + timedelta(hours=13)
        self.assertFalse(should_penalize_early_second_attack(
            2, observed_after_cutoff, war_end
        ))

    def test_war_state_uses_the_24_hour_end(self):
        war_end = self.started_at + timedelta(hours=24)
        self.assertEqual(
            resolve_war_state(self.started_at, war_end, self.started_at - timedelta(seconds=1)),
            "preparation",
        )
        self.assertEqual(
            resolve_war_state(self.started_at, war_end, self.started_at + timedelta(hours=23)),
            "inWar",
        )
        self.assertEqual(
            resolve_war_state(self.started_at, war_end, self.started_at + timedelta(hours=24)),
            "warEnded",
        )

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
