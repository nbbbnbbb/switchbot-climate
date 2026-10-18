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
import unicodedata
from datetime import datetime, timezone
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED = {"Meter", "MeterPlus", "Meter Plus", "Outdoor Meter", "MeterPro", "Meter Pro", "WoIOSensor"}

HUB_NAME = "ハブミニ22"
PLUG_NAMES = {"プラグミニA", "プラグミニB"}
RETIRED = {"sensor-b8a1a0585a7f"}


def normalized_name(value):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value or ""))


def device_kind(device):
    name = normalized_name(device.get("name", device.get("deviceName", "")))
    kind = device.get("deviceType", "")
    if "CO2" in kind.upper() or "CO2" in name.upper() or device.get("alias") in RETIRED:
        return None
    if kind in {"Hub Mini2", "Hub Mini"} and name == HUB_NAME:
        return "hub"
    if kind.startswith("Plug Mini") and name in PLUG_NAMES:
        return "plug"
    if kind in SUPPORTED or not kind:
        return "meter"
    return None


def validate_plug(body):
    power, watts = body.get("power"), body.get("weight")
    if power not in ("on", "off") or isinstance(watts, bool) or not isinstance(watts, (int, float)) or not math.isfinite(watts) or not 0 <= watts <= 100000:
        raise ValueError("Invalid plug readings")
    values = {"power": power, "powerWatts": watts}
    for source, key in [("voltage", "voltage"), ("electricCurrent", "currentMilliamps")]:
        value = body.get(source)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 100000:
            values[key] = value
    return values


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
        result.append({"id": device_id, "alias": alias, "name": name, "deviceType": device.get("deviceType", "")})
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
    previous_plugs = {s["id"]: s for s in latest.get("plugs", [])}
    try:
        # Resolve app names and types even for explicitly configured devices. This
        # prevents an old configuration from polling a retired CO2 meter.
        discovered = request("devices", token, secret).get("deviceList", [])
        inventory = {d["deviceId"]: d for d in discovered}
        configured = devices_from_config(env["SWITCHBOT_DEVICES"]) if env.get("SWITCHBOT_DEVICES") else None
        candidates = configured if configured is not None else [{"id": d["deviceId"]} for d in discovered]
        if configured is not None:
            selected_ids = {d["id"] for d in candidates}
            candidates += [{"id": d["deviceId"]} for d in discovered if d["deviceId"] not in selected_ids and device_kind(d) in {"hub", "plug"}]
        devices = []
        for configured_device in candidates:
            device_id = configured_device["id"]
            if "sensor-" + hmac.new(secret.encode(), device_id.encode(), hashlib.sha256).hexdigest()[:12] in RETIRED:
                continue
            info = inventory.get(device_id, {})
            alias = configured_device.get("alias", "sensor-" + hmac.new(secret.encode(), device_id.encode(), hashlib.sha256).hexdigest()[:12])
            name = info.get("deviceName") or configured_device.get("name") or f"センサー {len(devices) + 1}"
            device = {"id": device_id, "alias": alias, "name": name.strip(), "deviceType": info.get("deviceType", configured_device.get("deviceType", ""))}
            kind = device_kind(device)
            if kind:
                devices.append({**device, "kind": kind})
        if not devices:
            raise ValueError("No supported devices")
    except Exception:
        write_json(latest_path, {"sensors": [{**s, "state": "error"} for s in latest.get("sensors", []) if s["id"] not in RETIRED and "CO2" not in normalized_name(s.get("name", "")).upper()], "plugs": [{**s, "state": "error"} for s in latest.get("plugs", [])]})
        write_json(data_dir / "status.json", {"state": "error", "attemptedAt": at, "message": "機器一覧または設定を確認できません。GitHub Secretsとハブの接続を確認してください。"})
        print("Device discovery or configuration failed. No private details were logged.")
        return 1
    sensors, plugs, readings, plug_readings, failed, unavailable = [], [], {}, {}, 0, 0
    for device in devices:
        alias, name, kind = device["alias"], device["name"], device["kind"]
        old = (previous_plugs if kind == "plug" else previous).get(alias, {})
        try:
            body = request(f"devices/{device['id']}/status", token, secret)
            if kind == "hub" and not body:
                unavailable += 1
                sensors.append({**old, "id": alias, "name": name, "state": "unavailable", "message": "この機器の通常APIは温湿度を返していません。", "kind": kind})
                continue
            values = validate_plug(body) if kind == "plug" else validate_reading(body)
            item = {"id": alias, "name": name, **values, "collectedAt": at, "state": "ok", "kind": kind}
            (plugs if kind == "plug" else sensors).append(item)
            (plug_readings if kind == "plug" else readings)[alias] = values
        except Exception:
            failed += 1
            (plugs if kind == "plug" else sensors).append({**old, "id": alias, "name": name, "state": "error", "kind": kind})
    if readings or plug_readings:
        month = now.strftime("%Y-%m")
        history_path = data_dir / "history" / f"{month}.json"
        history = read_json(history_path, [])
        history = [row for row in history if row["at"] != at]
        history.append({"at": at, "values": readings, "plugs": plug_readings})
        history.sort(key=lambda row: row["at"])
        write_json(history_path, history)
        write_json(data_dir / "manifest.json", {"months": sorted(p.stem for p in (data_dir / "history").glob("????-??.json"))})
    write_json(latest_path, {"sensors": sensors, "plugs": plugs})
    state = "ok" if not failed else "error" if failed == len(devices) else "partial"
    write_json(data_dir / "status.json", {"state": state, "attemptedAt": at, "message": "一部の機器から取得できませんでした。取得日時を確認してください。" if failed else "ハブミニ22は通常APIから温湿度を取得できません。他の機器は収集中です。" if unavailable else ""})
    print(f"Collected {len(readings)} climate sensors and {len(plug_readings)} plugs; {unavailable} devices unavailable.")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(collect())
    except Exception:
        print("Collection failed. Existing files were preserved where possible; inspect configuration and rerun.")
        sys.exit(1)
