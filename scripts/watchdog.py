"""Independent scheduled recovery for a missing or stuck collector."""
import json
import os
from datetime import datetime, timezone
from urllib.request import Request, urlopen


def age_seconds(status, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        at = datetime.fromisoformat(status['attemptedAt'].replace('Z', '+00:00'))
        return max(0, (now - at).total_seconds())
    except (KeyError, TypeError, ValueError):
        return float('inf')


def recovery_action(age, runs, running_job_ids):
    if age <= 300:
        return 'healthy', []
    active = [r for r in runs if r['status'] in ('in_progress', 'queued', 'waiting', 'pending', 'requested')]
    running = [r for r in active if r['id'] in running_job_ids]
    if running and age <= 600:
        return 'collecting', []
    if running and age > 600:
        return 'restart', [r['id'] for r in running]
    # Finished jobs may leave a workflow stuck in finalization, blocking its queue.
    stuck = [r['id'] for r in active if r['status'] == 'in_progress' and r.get('jobs_finished')]
    if stuck and age > 600:
        return 'restart', stuck
    if active:
        return 'waiting_for_runner', []
    return 'start', []


def main():
    repo, token = os.environ['GITHUB_REPOSITORY'], os.environ['GH_TOKEN']
    def api(path, body=None):
        request = Request('https://api.github.com/repos/' + repo + '/' + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                     'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'})
        with urlopen(request, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    file = api('contents/docs/data/status.json?ref=main')
    import base64
    status = json.loads(base64.b64decode(file['content']))
    age = age_seconds(status)
    runs = api('actions/workflows/climate.yml/runs?branch=main&per_page=20')['workflow_runs']
    running_jobs = set()
    for run in runs:
        if run['status'] != 'in_progress':
            continue
        jobs = api(f"actions/runs/{run['id']}/jobs")['jobs']
        if any(j['status'] == 'in_progress' for j in jobs):
            running_jobs.add(run['id'])
        run['jobs_finished'] = bool(jobs) and all(j['status'] == 'completed' for j in jobs)
    action, cancel = recovery_action(age, runs, running_jobs)
    for run_id in cancel:
        api(f'actions/runs/{run_id}/cancel', {})
    if action in ('start', 'restart'):
        api('actions/workflows/climate.yml/dispatches', {'ref': 'main', 'inputs': {'continuous': 'true', 'samples': '5'}})
    print(json.dumps({'action': action, 'secondsSinceAttempt': age if age != float('inf') else None,
                      'restartedRuns': cancel}))


if __name__ == '__main__':
    main()
