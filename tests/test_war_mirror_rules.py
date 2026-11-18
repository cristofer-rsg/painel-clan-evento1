import unittest
from datetime import datetime, timedelta, timezone

from scripts.war_rules import (
    should_penalize_early_second_attack,
    should_penalize_off_mirror,
    resolve_war_end,
)


class WarMirrorRuleTests(unittest.TestCase):
    """Confere a regra de espelho no início e na janela final da guerra."""
    def setUp(self):
        self.war_end = datetime(2026, 11, 13, 9, 6, tzinfo=timezone.utc)
        self.before_window = self.war_end - timedelta(hours=13)
        self.inside_window = self.war_end - timedelta(hours=11)
        self.at_boundary = self.war_end - timedelta(hours=12)

    def test_first_attack_off_mirror_before_final_window_is_penalized(self):
        self.assertTrue(
            should_penalize_off_mirror(1, self.before_window, self.war_end)
        )

    def test_first_attack_off_mirror_inside_final_window_is_allowed(self):
        self.assertFalse(
            should_penalize_off_mirror(1, self.inside_window, self.war_end)
        )

    def test_both_attacks_can_be_off_mirror_if_saved_for_final_window(self):
        for attack_number in (1, 2):
            self.assertFalse(
                should_penalize_off_mirror(
                    attack_number, self.inside_window, self.war_end
                )
            )

    def test_second_attack_off_mirror_has_no_mirror_penalty(self):
        self.assertFalse(
            should_penalize_off_mirror(2, self.before_window, self.war_end)
        )

    def test_second_attack_before_final_window_keeps_existing_timing_penalty(self):
        self.assertTrue(
            should_penalize_early_second_attack(
                2, self.before_window, self.war_end
            )
        )

    def test_second_attack_inside_final_window_has_no_timing_penalty(self):
        self.assertFalse(
            should_penalize_early_second_attack(
                2, self.inside_window, self.war_end
            )
        )

    def test_exactly_twelve_hours_remaining_is_inside_final_window(self):
        self.assertFalse(
            should_penalize_off_mirror(1, self.at_boundary, self.war_end)
        )

    def test_missing_api_end_time_uses_24_hour_battle_duration(self):
        war_start = self.war_end - timedelta(hours=24)
        self.assertEqual(resolve_war_end(war_start, None), self.war_end)
        self.assertIsNone(resolve_war_end(None, None))

    def test_api_end_time_takes_precedence_over_fallback(self):
        actual_end = self.war_end + timedelta(minutes=5)
        self.assertEqual(resolve_war_end(self.war_end, actual_end), actual_end)

    def test_missing_timestamps_do_not_create_mirror_penalty(self):
        self.assertFalse(should_penalize_off_mirror(1, None, self.war_end))
        self.assertFalse(should_penalize_off_mirror(1, self.before_window, None))


if __name__ == "__main__":
    unittest.main()
