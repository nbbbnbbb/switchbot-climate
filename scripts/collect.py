"""Collect SwitchBot readings without publishing device IDs or credentials."""
import base64
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED = {"Meter", "MeterPlus", "Meter Plus", "Outdoor Meter", "MeterPro", "Meter Pro", "MeterPro(CO2)", "Meter Pro (CO2 Monitor)", "WoIOSensor"}


def api(path, token, secret):
    timestamp, nonce = str(int(time.time() * 1000)), str(uuid.uuid4())
    signature = base64.b64encode(hmac.new(secret.encode(), (token + timestamp + nonce).encode(), hashlib.sha256).digest()).decode()
    request = Request("https://api.switch-bot.com/v1.1/" + path, headers={
        "Authorization": token, "sign": signature, "t": timestamp, "nonce": nonce,
        "Content-Type": "application/json",
    })
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.load(response)
            if payload.get("statusCode") != 100:
                raise RuntimeError("SwitchBot rejected request")
            return payload["body"]
        except Exception:
            if attempt == 2:
                raise RuntimeError("SwitchBot request failed") from None
            time.sleep(2 ** attempt)


def read_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    temp.replace(path)


def validate_reading(body):
    temperature, humidity = body.get("temperature"), body.get("humidity")
    if any(isinstance(x, bool) or not isinstance(x, (float, int)) or not math.isfinite(x) for x in (temperature, humidity)):
        raise ValueError("Invalid readings")
    if not -100 <= temperature <= 150 or not 0 <= humidity <= 100:
        raise ValueError("Out-of-range readings")
    return {"temperature": temperature, "humidity": humidity}


def devices_from_config(raw):
    devices = json.loads(raw)
    if not isinstance(devices, list) or not devices:
        raise ValueError("Invalid device configuration")
    aliases, ids = set(), set()
    result = []
    for i, device in enumerate(devices):
        device_id = device.get("id", "")
        alias = device.get("alias", f"sensor-{i + 1}")
        name = device.get("name", f"センサー {i + 1}")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", device_id) or not re.fullmatch(r"[a-z0-9-]{1,48}", alias) or alias in aliases or device_id in ids:
            raise ValueError("Invalid or duplicate device configuration")
        if not isinstance(name, str) or not 1 <= len(name) <= 60:
            raise ValueError("Invalid public label")
        aliases.add(alias)
        ids.add(device_id)
        result.append({"id": device_id, "alias": alias, "name": name})
    return result


def collect(data_dir=ROOT / "docs/data", env=None, request=api, now=None):
    env = os.environ if env is None else env
    token, secret = env.get("SWITCHBOT_TOKEN", ""), env.get("SWITCHBOT_SECRET", "")
    if not token or not secret:
        print("Credentials are not configured; existing data was preserved.")
        return 0
    now = now or datetime.now(timezone.utc)
    at = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    latest_path = data_dir / "latest.json"
    latest = read_json(latest_path, {"sensors": []})
    previous = {s["id"]: s for s in latest.get("sensors", [])}
    try:
        if env.get("SWITCHBOT_DEVICES"):
            devices = devices_from_config(env["SWITCHBOT_DEVICES"])
        else:
            discovered = request("devices", token, secret).get("deviceList", [])
            devices = []
            for device in discovered:
                if device.get("deviceType") in SUPPORTED:
                    device_id = device["deviceId"]
                    alias = "sensor-" + hmac.new(secret.encode(), device_id.encode(), hashlib.sha256).hexdigest()[:12]
                    app_name = device.get("deviceName")
                    name = app_name if isinstance(app_name, str) and app_name.strip() else f"センサー {len(devices) + 1}"
                    devices.append({"id": device_id, "alias": alias, "name": name})
        if not devices:
            raise ValueError("No supported meters")
    except Exception:
        write_json(data_dir / "status.json", {"state": "error", "attemptedAt": at, "message": "機器一覧または設定を確認できません。GitHub Secretsとハブの接続を確認してください。"})
        print("Device discovery or configuration failed. No private details were logged.")
        return 1
    sensors, readings, failed = [], {}, 0
    for device in devices:
        alias, name = device["alias"], device["name"]
        try:
            values = validate_reading(request(f"devices/{device['id']}/status", token, secret))
            sensors.append({"id": alias, "name": name, **values, "collectedAt": at, "state": "ok"})
            readings[alias] = values
        except Exception:
            failed += 1
            old = previous.get(alias, {})
            sensors.append({**old, "id": alias, "name": name, "state": "error"})
    if readings:
        month = now.strftime("%Y-%m")
        history_path = data_dir / "history" / f"{month}.json"
        history = read_json(history_path, [])
        history = [row for row in history if row["at"] != at]
        history.append({"at": at, "values": readings})
        history.sort(key=lambda row: row["at"])
        write_json(history_path, history)
        write_json(data_dir / "manifest.json", {"months": sorted(p.stem for p in (data_dir / "history").glob("????-??.json"))})
    write_json(latest_path, {"sensors": sensors})
    state = "ok" if not failed else "error" if failed == len(devices) else "partial"
    write_json(data_dir / "status.json", {"state": state, "attemptedAt": at, "message": "" if not failed else "一部またはすべての機器から取得できませんでした。最後に取得した値を表示しています。"})
    print(f"Collected {len(readings)} of {len(devices)} meters.")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(collect())
    except Exception:
        print("Collection failed. Existing files were preserved where possible; inspect configuration and rerun.")
        sys.exit(1)
