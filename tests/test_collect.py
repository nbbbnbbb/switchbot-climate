import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location("collector", Path(__file__).resolve().parents[1] / "scripts/collect.py")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = {"SWITCHBOT_TOKEN": "test-token-private", "SWITCHBOT_SECRET": "test-secret-private", "SWITCHBOT_DEVICES": json.dumps([{"id": "PRIVATE_DEVICE_123", "alias": "studio", "name": "展示室"}])}
        self.now = datetime(2026, 10, 17, 1, 0, tzinfo=timezone.utc)

    def run_collection(self, request, env=None):
        return collector.collect(self.root, self.env if env is None else env, request, self.now)

    def read(self, name):
        return json.loads((self.root / name).read_text())

    def test_success_history_and_no_private_identifiers(self):
        self.assertEqual(self.run_collection(lambda *args: {"temperature": 24.1, "humidity": 55, "deviceId": "PRIVATE_DEVICE_123"}), 0)
        self.assertEqual(self.read("latest.json")["sensors"][0]["temperature"], 24.1)
        self.assertEqual(self.read("manifest.json")["months"], ["2026-10"])
        for file in self.root.rglob("*.json"):
            text = file.read_text()
            for private in ("PRIVATE_DEVICE_123", "test-token-private", "test-secret-private"):
                self.assertNotIn(private, text)

    def test_missing_credentials_preserve_everything(self):
        marker = self.root / "latest.json"
        marker.write_text('{"sensors":[]}')
        self.assertEqual(self.run_collection(lambda *args: self.fail("API should not run"), {}), 0)
        self.assertEqual(marker.read_text(), '{"sensors":[]}')

    def test_failure_preserves_last_success_without_fabricated_history(self):
        self.run_collection(lambda *args: {"temperature": 24.1, "humidity": 55})
        original = (self.root / "history/2026-10.json").read_text()
        self.now = datetime(2026, 10, 17, 1, 5, tzinfo=timezone.utc)
        def failure(*args):
            raise RuntimeError("private response with token")
        self.assertEqual(self.run_collection(failure), 1)
        sensor = self.read("latest.json")["sensors"][0]
        self.assertEqual(sensor["state"], "error")
        self.assertEqual(sensor["collectedAt"], "2026-10-17T01:00:00Z")
        self.assertEqual((self.root / "history/2026-10.json").read_text(), original)

    def test_partial_success_keeps_successful_sensor(self):
        self.env["SWITCHBOT_DEVICES"] = json.dumps([{"id": "one", "alias": "one"}, {"id": "two", "alias": "two"}])
        def response(path, *args):
            if "/two/" in path:
                raise RuntimeError()
            return {"temperature": 20, "humidity": 40}
        self.assertEqual(self.run_collection(response), 1)
        self.assertEqual(self.read("status.json")["state"], "partial")
        self.assertEqual(list(self.read("history/2026-10.json")[0]["values"]), ["one"])

    def test_invalid_numbers_are_rejected(self):
        for temp, humidity in [(float("nan"), 40), (20, 101), (True, 40), (20, None), (float("inf"), 40)]:
            with self.subTest(temp=temp, humidity=humidity):
                with self.assertRaises(ValueError):
                    collector.validate_reading({"temperature": temp, "humidity": humidity})

    def test_duplicate_alias_and_path_injection_rejected(self):
        for devices in [[{"id": "a", "alias": "same"}, {"id": "b", "alias": "same"}], [{"id": "a/../../b"}], [{"id": "a", "alias": "../../a"}]]:
            with self.assertRaises(ValueError):
                collector.devices_from_config(json.dumps(devices))

    def test_retry_at_same_second_is_idempotent(self):
        response = lambda *args: {"temperature": 23, "humidity": 50}
        self.run_collection(response)
        self.run_collection(response)
        self.assertEqual(len(self.read("history/2026-10.json")), 1)

    def test_auto_discovery_does_not_publish_private_room_name(self):
        env = {k: v for k, v in self.env.items() if k != "SWITCHBOT_DEVICES"}
        def response(path, *args):
            if path == "devices":
                return {"deviceList": [{"deviceId": "private-id", "deviceName": "private room", "deviceType": "Meter"}, {"deviceId": "lock-id", "deviceType": "Lock"}]}
            return {"temperature": 22, "humidity": 50}
        self.assertEqual(self.run_collection(response, env), 0)
        sensor = self.read("latest.json")["sensors"][0]
        self.assertEqual(sensor["name"], "センサー 1")
        self.assertNotIn("private", json.dumps(self.read("latest.json")))

    def test_month_rollover_keeps_both_months(self):
        response = lambda *args: {"temperature": 23, "humidity": 50}
        self.run_collection(response)
        self.now = datetime(2026, 11, 1, tzinfo=timezone.utc)
        self.run_collection(response)
        self.assertEqual(self.read("manifest.json")["months"], ["2026-10", "2026-11"])


if __name__ == "__main__":
    unittest.main()
