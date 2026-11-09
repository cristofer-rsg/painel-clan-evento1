import os
import sys
import unittest
from datetime import date, datetime
from zoneinfo import ZoneInfo

os.environ.setdefault("CLASH_API_TOKEN", "test-token")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-key")

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from scripts.raid_automation import legacy_stats_anchor, raid_weekend_start


class RaidWeekendDateTests(unittest.TestCase):
    def test_friday_to_monday_share_friday_anchor(self):
        expected = date(2026, 11, 6)
        for day in (date(2026, 11, 6), date(2026, 11, 7),
                    date(2026, 11, 8), date(2026, 11, 9)):
            self.assertEqual(raid_weekend_start(day), expected)

    def test_following_weekend_has_new_anchor(self):
        self.assertEqual(
            raid_weekend_start(date(2026, 11, 13)),
            date(2026, 11, 13),
        )

    def test_legacy_monthly_source_key_is_preserved(self):
        friday = datetime(2026, 11, 6, 4, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
        self.assertEqual(legacy_stats_anchor(friday), date(2026, 10, 31))


if __name__ == "__main__":
    unittest.main()
