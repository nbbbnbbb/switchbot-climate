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

    def test_auto_discovery_syncs_app_name_and_preserves_history_on_rename(self):
        env = {k: v for k, v in self.env.items() if k != "SWITCHBOT_DEVICES"}
        app_name = "展示室・東"
        def response(path, *args):
            if path == "devices":
                return {"deviceList": [{"deviceId": "private-id", "deviceName": app_name, "deviceType": "Meter"}, {"deviceId": "lock-id", "deviceType": "Lock"}]}
            return {"temperature": 22, "humidity": 50}
        self.assertEqual(self.run_collection(response, env), 0)
        sensor = self.read("latest.json")["sensors"][0]
        self.assertEqual(sensor["name"], app_name)
        self.assertNotIn("private-id", json.dumps(self.read("latest.json")))
        app_name = "展示室・西"
        self.now = datetime(2026, 10, 17, 1, 5, tzinfo=timezone.utc)
        self.assertEqual(self.run_collection(response, env), 0)
        renamed = self.read("latest.json")["sensors"][0]
        self.assertEqual(renamed["name"], app_name)
        self.assertEqual(renamed["id"], sensor["id"])
        history = self.read("history/2026-10.json")
        self.assertEqual(len(history), 2)
        self.assertTrue(all(sensor["id"] in row["values"] for row in history))

    def test_month_rollover_keeps_both_months(self):
        response = lambda *args: {"temperature": 23, "humidity": 50}
        self.run_collection(response)
        self.now = datetime(2026, 11, 1, tzinfo=timezone.utc)
        self.run_collection(response)
        self.assertEqual(self.read("manifest.json")["months"], ["2026-10", "2026-11"])


    def test_retired_co2_is_never_polled_even_when_configured(self):
        devices = [{"deviceId": "co2-private", "deviceType": "MeterPro(CO2)", "deviceName": "CO2センサー（温湿度計） "}, {"deviceId": "meter", "deviceType": "Meter", "deviceName": "室内"}]
        self.env["SWITCHBOT_DEVICES"] = json.dumps([{"id": "co2-private", "alias": "renamed"}, {"id": "meter", "alias": "meter"}])
        requested = []
        def response(path, *args):
            requested.append(path)
            if path == "devices":
                return {"deviceList": devices}
            self.assertNotIn("co2-private", path)
            return {"temperature": 22, "humidity": 50}
        self.assertEqual(self.run_collection(response), 0)
        self.assertEqual(requested, ["devices", "devices/meter/status"])
        self.assertEqual([s["name"] for s in self.read("latest.json")["sensors"]], ["室内"])

    def test_hub_and_named_plugs_are_discovered_and_empty_hub_is_not_a_fake_zero(self):
        env = {k: v for k, v in self.env.items() if k != "SWITCHBOT_DEVICES"}
        devices = [{"deviceId": "hub-private", "deviceType": "Hub Mini2", "deviceName": "ハブミニ 22"}, {"deviceId": "plug-a-private", "deviceType": "Plug Mini (JP)", "deviceName": "プラグミニ A"}, {"deviceId": "plug-b-private", "deviceType": "Plug Mini (JP)", "deviceName": "プラグミニ B"}, {"deviceId": "unselected-private", "deviceType": "Plug Mini (JP)", "deviceName": "別のプラグ"}]
        def response(path, *args):
            if path == "devices":
                return {"deviceList": devices}
            self.assertNotIn("unselected-private", path)
            if "hub-private" in path:
                return {}
            return {"power": "on" if "plug-a" in path else "off", "weight": 0, "deviceId": "DO-NOT-PUBLISH", "voltage": 100, "electricCurrent": 0}
        self.assertEqual(self.run_collection(response, env), 0)
        latest = self.read("latest.json")
        hub = latest["sensors"][0]
        self.assertEqual(hub["state"], "unavailable")
        self.assertNotIn("temperature", hub)
        self.assertNotIn("collectedAt", hub)
        self.assertEqual([p["power"] for p in latest["plugs"]], ["on", "off"])
        self.assertTrue(all(p["powerWatts"] == 0 for p in latest["plugs"]))
        row = self.read("history/2026-10.json")[0]
        self.assertEqual(row["values"], {})
        self.assertEqual(len(row["plugs"]), 2)
        for file in self.root.rglob("*.json"):
            for private in ["hub-private", "plug-a-private", "plug-b-private", "DO-NOT-PUBLISH"]:
                self.assertNotIn(private, file.read_text())

    def test_hub_supported_readings_use_normal_climate_history(self):
        env = {k: v for k, v in self.env.items() if k != "SWITCHBOT_DEVICES"}
        def response(path, *args):
            if path == "devices":
                return {"deviceList": [{"deviceId": "hub", "deviceType": "Hub Mini2", "deviceName": "ハブミニ22"}]}
            return {"temperature": 23.7, "humidity": 53}
        self.assertEqual(self.run_collection(response, env), 0)
        hub = self.read("latest.json")["sensors"][0]
        self.assertEqual(hub["temperature"], 23.7)
        self.assertIn(hub["id"], self.read("history/2026-10.json")[0]["values"])

    def test_plug_failure_preserves_timestamp_without_new_history(self):
        self.env["SWITCHBOT_DEVICES"] = json.dumps([{"id": "plug", "alias": "plug", "name": "プラグミニA", "deviceType": "Plug Mini (JP)"}])
        def response(path, *args):
            if path == "devices":
                return {"deviceList": []}
            return {"power": "on", "weight": 123.5}
        self.assertEqual(self.run_collection(response), 0)
        self.now = datetime(2026, 10, 17, 1, 5, tzinfo=timezone.utc)
        self.assertEqual(self.run_collection(lambda path, *args: {"deviceList": []} if path == "devices" else {"power": "off", "weight": None}), 1)
        plug = self.read("latest.json")["plugs"][0]
        self.assertEqual(plug["power"], "on")
        self.assertEqual(plug["collectedAt"], "2026-10-17T01:00:00Z")
        self.assertEqual(len(self.read("history/2026-10.json")), 1)
        for body in [{"power": "on", "weight": True}, {"power": "unknown", "weight": 0}, {"power": "off", "weight": -1}, {"power": "off", "weight": float("inf")}]:
            with self.assertRaises(ValueError):
                collector.validate_plug(body)


if __name__ == "__main__":
    unittest.main()
