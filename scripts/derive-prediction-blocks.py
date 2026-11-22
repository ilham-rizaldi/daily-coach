"""Attach prediction evidence from the owner's native Garmin TCX exports."""

import argparse
import json
import math
import statistics
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


BLOCK_SECONDS = 8 * 60
WARMUP_SECONDS = 5 * 60
HR_SECONDS = 5 * 60
MIN_COVERAGE = 0.90
SCAN_SECONDS = 30


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.timestamp() if parsed.tzinfo is not None else None
    except (AttributeError, ValueError):
        return None


def measure(value, low, high):
    try:
        number = float(value)
        return number if math.isfinite(number) and low <= number <= high else None
    except (TypeError, ValueError):
        return None


def read_tracks(activity):
    for track in activity.findall(".//{*}Track"):
        points = []
        for point in track.findall("{*}Trackpoint"):
            time = timestamp(point.findtext("{*}Time"))
            if time is None:
                continue
            speed = measure(point.findtext(".//{*}Speed"), 0, 60)
            hr = measure(point.findtext("{*}HeartRateBpm/{*}Value"), 35, 235)
            power = measure(point.findtext(".//{*}Watts"), 0, 2000)
            points.append((time, speed, hr, power))
        if points:
            yield points


def continuous_samples(points):
    chunk = []
    for point, following in zip(points, points[1:]):
        delta = following[0] - point[0]
        if 0 < delta <= 4 and delta.is_integer():
            chunk.extend((point[0] + offset, *point[1:]) for offset in range(int(delta)))
        elif chunk:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def effort_variability(window, index, effort):
    means = []
    for offset in range(0, BLOCK_SECONDS, SCAN_SECONDS):
        interval = [sample[index] for sample in window[offset:offset + SCAN_SECONDS]
                    if sample[index] is not None]
        if len(interval) >= 24:
            means.append(statistics.fmean(interval))
    return statistics.pstdev(means) / effort if len(means) >= 14 and effort > 0 else math.inf


def block_measurements(window, sport):
    # Index 1 is recorded speed, 2 heart rate, and 3 power. The TCX file can
    # carry a watch's running power, distinct from a cycling power meter.
    index = 3 if sport == "Ride" else 1
    paired = [sample for sample in window if sample[index] is not None and sample[2] is not None]
    coverage = len(paired) / BLOCK_SECONDS
    if coverage < MIN_COVERAGE:
        return None
    steady = [sample[index] for sample in paired]
    low_speed = 1 if sport == "Run" else None
    if sport == "Ride":
        stationary = sum(sample[3] == 0 for sample in paired)
    else:
        stationary = sum(sample[1] < low_speed for sample in paired)
    if stationary > BLOCK_SECONDS * 0.10:
        return None
    effort = statistics.fmean(steady)
    if effort <= 0:
        return None
    variability = effort_variability(window, index, effort)
    if variability > (0.24 if sport == "Ride" else 0.16):
        return None
    last = [sample for sample in window[-HR_SECONDS:]
            if sample[2] is not None and sample[index] is not None]
    if len(last) < HR_SECONDS * MIN_COVERAGE:
        return None
    result = {
        "durationSeconds": BLOCK_SECONDS,
        "pairedFraction": round(coverage, 4),
        "effortVariability": round(variability, 4),
        "hrBpm": round(statistics.fmean(sample[2] for sample in last), 1),
    }
    if sport == "Ride":
        result["powerWatts"] = round(effort, 1)
    else:
        result["paceSecondsPerKm"] = round(1000 / effort, 1)
        run_power = [sample[3] for sample in paired if sample[3] is not None]
        last_power = [sample[2] for sample in last if sample[3] is not None]
        if len(run_power) >= BLOCK_SECONDS * MIN_COVERAGE and len(last_power) >= HR_SECONDS * MIN_COVERAGE:
            run_effort = statistics.fmean(run_power)
            if effort_variability(window, 3, run_effort) <= 0.24:
                result["runningPowerWatts"] = round(run_effort, 1)
                result["runningPowerHrBpm"] = round(statistics.fmean(last_power), 1)
    return result


def blocks_from_tcx(path, activity):
    root = ET.parse(path).getroot()
    record = root.find(".//{*}Activity")
    sport = activity["sport"]
    expected = {"Ride": "Biking", "Run": "Running"}[sport]
    if record is None or record.get("Sport") != expected:
        raise ValueError("The TCX sport does not match the report.")
    device = record.findtext("{*}Creator/{*}Name")
    exported_start = timestamp(record.findtext("{*}Id"))
    report_start = timestamp(activity.get("startedAt"))
    if not device or exported_start is None or report_start is None or abs(exported_start - report_start) > 150:
        raise ValueError("The TCX device or start time could not be matched.")
    context = "outdoor" if record.find(".//{*}Position") is not None else "indoor"
    rows = []
    for points in read_tracks(record):
        for chunk in continuous_samples(points):
            measured = [sample for sample in chunk if sample[0] >= exported_start + WARMUP_SECONDS]
            offset = 0
            while offset + BLOCK_SECONDS <= len(measured):
                window = measured[offset:offset + BLOCK_SECONDS]
                block = block_measurements(window, sport)
                if block:
                    rows.append({
                        **block, "date": activity["date"], "sport": sport,
                        "activityId": str(activity["externalIds"]["garmin"]),
                        "source": "Garmin Connect TCX",
                        "sourceUrl": "https://connect.garmin.com/app/activity/" + str(activity["externalIds"]["garmin"]),
                        "device": device, "environment": context,
                        "startSeconds": int(window[0][0] - exported_start),
                    })
                offset += BLOCK_SECONDS if block else SCAN_SECONDS
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("exports", nargs="+", type=Path)
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    lookup = {str(activity.get("externalIds", {}).get("garmin")): activity
              for activity in report["activities"] if activity.get("sport") in ("Ride", "Run")
              and activity.get("classification") != "non-training"}
    blocks = []
    for export in args.exports:
        key = export.stem.removeprefix("activity_")
        if key not in lookup:
            raise ValueError(f"Could not match {export.name} to the selected report.")
        rows = blocks_from_tcx(export, lookup[key])
        blocks.extend(rows)
        print(lookup[key]["date"], lookup[key]["sport"], len(rows), "eligible blocks")
    report["predictionEvidence"] = {
        "method": "Eight-minute TCX blocks after the first five minutes. The first eligible window at each 30-second scan is kept and never reused. HR uses the final five minutes.",
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "blocks": blocks,
    }
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
