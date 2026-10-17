"""Keep sampling anchored to two-minute slots, skipping missed slots."""
import os
import sys
import time


def wait_seconds(start, slot, now, interval=120):
    if slot < 1 or slot > 5:
        raise ValueError("Invalid sample slot")
    target = start + (slot - 1) * interval
    if now >= target + interval:
        return None
    return max(0, target - now)


def main():
    start, slot = float(os.environ["CLIMATE_WINDOW_START"]), int(sys.argv[1])
    while True:
        delay = wait_seconds(start, slot, time.time())
        if delay is None or delay == 0:
            break
        time.sleep(min(delay, 60))
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"due={'true' if delay is not None else 'false'}\n")
    print(f"Sample slot {slot}: {'ready' if delay is not None else 'missed; skipped without catch-up'}")


if __name__ == "__main__":
    main()
