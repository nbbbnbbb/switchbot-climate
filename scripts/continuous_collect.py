"""Keep one runner collecting for hours; publish data without rebuilding Pages."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'docs/data'
INTERVAL = 120
DURATION = 5 * 3600 + 40 * 60


def read(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def stamp(now=None):
    return (now or datetime.now(timezone.utc)).isoformat(timespec='seconds').replace('+00:00', 'Z')


def capture_sample(data=DATA):
    status = read(data / 'status.json', {})
    at = status.get('attemptedAt', '')
    history = read(data / 'history' / (at[:7] + '.json'), []) if at else []
    return {'latest': read(data / 'latest.json', {'sensors': [], 'plugs': []}),
            'status': status, 'row': next((r for r in history if r['at'] == at), None)}


def merge_samples(samples, data=DATA):
    """Replay only new samples on current main, never a stale whole history file."""
    for sample in samples:
        latest = read(data / 'latest.json', {'sensors': [], 'plugs': []})
        for kind in ('sensors', 'plugs'):
            current = {s['id']: s for s in latest.get(kind, [])}
            for sensor in sample['latest'].get(kind, []):
                old = current.get(sensor['id'])
                if old is None or sensor.get('collectedAt', '') >= old.get('collectedAt', ''):
                    current[sensor['id']] = sensor
            latest[kind] = list(current.values())
        write(data / 'latest.json', latest)
        old_status = read(data / 'status.json', {})
        if sample['status'].get('attemptedAt', '') >= old_status.get('attemptedAt', ''):
            write(data / 'status.json', sample['status'])
        row = sample.get('row')
        if row:
            path = data / 'history' / (row['at'][:7] + '.json')
            history = {r['at']: r for r in read(path, [])}
            history[row['at']] = row
            write(path, sorted(history.values(), key=lambda r: r['at']))
    write(data / 'manifest.json', {'months': sorted(p.stem for p in (data / 'history').glob('????-??.json'))})


def make_live_snapshot(data=DATA, now=None):
    """One public request returns current values and the last 24 hours together."""
    now = now or datetime.now(timezone.utc)
    cutoff = stamp(now - timedelta(days=1))
    rows = []
    for path in sorted((data / 'history').glob('????-??.json')):
        rows.extend(r for r in read(path, []) if r['at'] >= cutoff)
    payload = {'schemaVersion': 1, 'generatedAt': stamp(now),
               'latest': read(data / 'latest.json', {'sensors': [], 'plugs': []}),
               'status': read(data / 'status.json', {}),
               'settings': read(data.parent / 'settings.json', {}),
               'manifest': read(data / 'manifest.json', {'months': []}),
               'rows': sorted(rows, key=lambda r: r['at'])}
    write(data / 'live.json', payload)
    return payload


def git(*args, check=True):
    return subprocess.run(['git', *args], cwd=ROOT, check=check, timeout=45,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def sync_main():
    # This is deliberately restricted to the disposable Actions checkout.
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Continuous runner requires an Actions checkout')
    git('fetch', '--no-auto-maintenance', 'origin', 'main')
    git('reset', '--hard', 'origin/main')


def publish(samples):
    for attempt in range(4):
        try:
            sync_main()
            merge_samples(samples)
            make_live_snapshot()
            git('add', 'docs/data')
            if git('diff', '--cached', '--quiet', check=False).returncode == 0:
                return True
            git('commit', '-m', 'Update public climate readings')
            if git('push', 'origin', 'HEAD:main', check=False).returncode == 0:
                return True
        except (subprocess.SubprocessError, OSError, ValueError):
            pass
        if attempt < 3:
            time.sleep(2 ** attempt)
    return False


def mark_timeout(data=DATA):
    latest = read(data / 'latest.json', {'sensors': [], 'plugs': []})
    for kind in ('sensors', 'plugs'):
        latest[kind] = [{**s, 'state': 'error'} for s in latest.get(kind, [])]
    write(data / 'latest.json', latest)
    write(data / 'status.json', {'state': 'error', 'attemptedAt': stamp(),
          'message': '取得処理がタイムアウトしました。前回値を保持し、次の収集で自動再試行します。'})


def main():
    if not os.environ.get('SWITCHBOT_TOKEN') or not os.environ.get('SWITCHBOT_SECRET'):
        print('Credentials are not configured; existing data was preserved.', flush=True)
        return 1
    duration = int(os.environ.get('CLIMATE_DURATION_SECONDS', DURATION))
    started = time.monotonic()
    pending, cycles = [], 0
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    while time.monotonic() - started < duration:
        cycle_start = time.monotonic()
        try:
            sync_main()
            try:
                subprocess.run([sys.executable, 'scripts/collect.py'], cwd=ROOT, timeout=90, check=False)
            except subprocess.TimeoutExpired:
                mark_timeout()
            pending.append(capture_sample())
            if publish(pending):
                pending.clear()
                print('Collection snapshot saved; Pages rebuild is not required.', flush=True)
            else:
                print('Save delayed; retaining samples and retrying next cycle.', flush=True)
        except Exception:
            print('Cycle failed; automatically retrying. No credentials logged.', flush=True)
        cycles += 1
        # No catch-up burst: late operations wait for the next regular slot.
        target = max(started + cycles * INTERVAL, cycle_start + INTERVAL)
        while time.monotonic() < min(target, started + duration):
            time.sleep(max(0, min(30, min(target, started + duration) - time.monotonic())))
    if pending and not publish(pending):
        print('Some samples remain unsaved; the watchdog will restart collection.', flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
