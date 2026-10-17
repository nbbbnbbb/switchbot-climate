import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("schedule", Path(__file__).resolve().parents[1] / "scripts/wait_for_slot.py")
schedule = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schedule)
dispatch_spec = importlib.util.spec_from_file_location("dispatch", Path(__file__).resolve().parents[1] / "scripts/dispatch_next.py")
dispatch = importlib.util.module_from_spec(dispatch_spec)
dispatch_spec.loader.exec_module(dispatch)


class ScheduleTests(unittest.TestCase):
    def test_sampling_anchored_to_start_not_last_deployment(self):
        self.assertEqual(schedule.wait_seconds(1000, 2, 1030), 90)
        self.assertEqual(schedule.wait_seconds(1000, 5, 1370), 110)

    def test_overdue_slots_skipped_instead_of_burst_requests(self):
        self.assertIsNone(schedule.wait_seconds(1000, 2, 1240))
        self.assertEqual(schedule.wait_seconds(1000, 3, 1240), 0)

    def test_invalid_slot_rejected(self):
        for slot in (0, 6):
            with self.assertRaises(ValueError):
                schedule.wait_seconds(1000, slot, 1000)

    def test_next_window_handover_keeps_two_minute_cadence(self):
        self.assertEqual(dispatch.handover_delay(1000, 5, 1500), 100)
        self.assertEqual(dispatch.handover_delay(1000, 1, 1040), 80)
        self.assertEqual(dispatch.handover_delay(1000, 2, 1245), 0)
