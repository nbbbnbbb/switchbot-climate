"""Hand over to the next Actions run without depending on cron delivery."""
import json
import os
import time
from urllib.request import Request, urlopen


def handover_delay(start, samples, now, interval=120):
    if samples not in (1, 2, 5):
        raise ValueError("Unsupported sample count")
    return max(0, start + samples * interval - now)


def main():
    samples = int(os.environ["CLIMATE_SAMPLE_COUNT"])
    start = float(os.environ.get("CLIMATE_WINDOW_START", time.time()))
    while True:
        delay = handover_delay(start, samples, time.time())
        if delay <= 0:
            break
        time.sleep(min(delay, 60))
    repository = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GH_TOKEN"]
    request = Request(
        f"https://api.github.com/repos/{repository}/actions/workflows/climate.yml/dispatches",
        data=json.dumps({"ref": "main", "inputs": {"samples": "5", "continuous": "true"}}).encode(),
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28"},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                if response.status not in (200, 201, 202, 204):
                    raise RuntimeError("Dispatch rejected")
            print("Next five-sample window dispatched successfully.")
            return
        except Exception:
            if attempt == 2:
                raise RuntimeError("Could not dispatch the next window; restart the workflow manually.") from None
            time.sleep(2 ** attempt)


if __name__ == "__main__":
    main()
