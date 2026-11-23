"""Attach prediction evidence from Garmin TCX and Intervals.icu FIT exports."""

import argparse
import csv
import json
import math
import re
import statistics
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


BLOCK_SECONDS = 8 * 60
SHORT_BLOCK_SECONDS = (6 * 60, 5 * 60)
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
    for offset in range(0, len(window), SCAN_SECONDS):
        interval = [sample[index] for sample in window[offset:offset + SCAN_SECONDS]
                    if sample[index] is not None]
        if len(interval) >= 24:
            means.append(statistics.fmean(interval))
    required = math.ceil(len(window) / SCAN_SECONDS * 0.875)
    return statistics.pstdev(means) / effort if len(means) >= required and effort > 0 else math.inf


def block_measurements(window, sport):
    # Index 1 is recorded speed, 2 heart rate, and 3 power. The TCX file can
    # carry a watch's running power, distinct from a cycling power meter.
    index = 3 if sport == "Ride" else 1
    paired = [sample for sample in window if sample[index] is not None and sample[2] is not None]
    seconds = len(window)
    recent_seconds = HR_SECONDS if seconds == BLOCK_SECONDS else 3 * 60
    coverage = len(paired) / seconds
    if coverage < MIN_COVERAGE:
        return None
    steady = [sample[index] for sample in paired]
    low_speed = 1 if sport == "Run" else None
    if sport == "Ride":
        stationary = sum(sample[3] == 0 for sample in paired)
    else:
        stationary = sum(sample[1] < low_speed for sample in paired)
    if stationary > seconds * 0.10:
        return None
    effort = statistics.fmean(steady)
    if effort <= 0:
        return None
    variability = effort_variability(window, index, effort)
    if variability > (0.24 if sport == "Ride" else 0.16):
        return None
    last = [sample for sample in window[-recent_seconds:]
            if sample[2] is not None and sample[index] is not None]
    if len(last) < recent_seconds * MIN_COVERAGE:
        return None
    result = {
        "durationSeconds": seconds,
        "hrWindowSeconds": recent_seconds,
        "pairedFraction": round(coverage, 4),
        "effortVariability": round(variability, 4),
        "hrBpm": round(statistics.fmean(sample[2] for sample in last), 1),
        "peakHrBpm": max(sample[2] for sample in paired),
    }
    if sport == "Ride":
        result["powerWatts"] = round(effort, 1)
    else:
        result["paceSecondsPerKm"] = round(1000 / effort, 1)
        run_power = [sample[3] for sample in paired if sample[3] is not None]
        last_power = [sample[2] for sample in last if sample[3] is not None]
        if len(run_power) >= seconds * MIN_COVERAGE and len(last_power) >= recent_seconds * MIN_COVERAGE:
            run_effort = statistics.fmean(run_power)
            if effort_variability(window, 3, run_effort) <= 0.24:
                result["runningPowerWatts"] = round(run_effort, 1)
                result["runningPowerHrBpm"] = round(statistics.fmean(last_power), 1)
                result["runningPowerPeakHrBpm"] = max(sample[2] for sample in paired if sample[3] is not None)
    return result


def steady_blocks(tracks, start, sport, metadata, include_short=False):
    rows = []
    for points in tracks:
        for chunk in continuous_samples(points):
            measured = [sample for sample in chunk if sample[0] >= start + WARMUP_SECONDS]
            occupied = bytearray(len(measured))
            for seconds in (BLOCK_SECONDS, *SHORT_BLOCK_SECONDS) if include_short else (BLOCK_SECONDS,):
                offset = 0
                while offset + seconds <= len(measured):
                    end = offset + seconds
                    window = measured[offset:end]
                    block = None if any(occupied[offset:end]) else block_measurements(window, sport)
                    if block:
                        occupied[offset:end] = b"\x01" * seconds
                        rows.append({
                            **block, **metadata, "sport": sport,
                            "startSeconds": int(window[0][0] - start),
                        })
                    offset += seconds if block else SCAN_SECONDS
    return sorted(rows, key=lambda row: row["startSeconds"])


def blocks_from_tcx(path, activity):
    record = ET.parse(path).getroot().find(".//{*}Activity")
    sport = activity["sport"]
    if record is None or record.get("Sport") != {"Ride": "Biking", "Run": "Running"}[sport]:
        raise ValueError("The TCX sport does not match the report.")
    device = record.findtext("{*}Creator/{*}Name")
    start = timestamp(record.findtext("{*}Id"))
    report_start = timestamp(activity.get("startedAt"))
    if not device or start is None or report_start is None or abs(start - report_start) > 150:
        raise ValueError("The TCX device or start time could not be matched.")
    context = "outdoor" if record.find(".//{*}Position") is not None else "indoor"
    key = str(activity["externalIds"]["garmin"])
    points = list(read_tracks(record))
    metadata = {
        "date": activity["date"], "activityId": key, "device": device, "environment": context,
        "source": "Garmin Connect TCX", "sourceUrl": "https://connect.garmin.com/app/activity/" + key,
    }
    return steady_blocks(points, start, sport, metadata, include_short=True), {
        "device": device, "environment": context,
        "hasRecordedPower": any(row[3] is not None and row[3] > 0 for track in points for row in track),
    }


def fit_points(records, power_recorded):
    for row in records:
        time = row.get("timestamp")
        if not isinstance(time, datetime) or time.tzinfo is None:
            continue
        yield (time.timestamp(), measure(row.get("enhanced_speed", row.get("speed")), 0, 60),
               measure(row.get("heart_rate"), 35, 235), measure(row.get("power"), 0, 2000) if power_recorded else None)


def read_intervals_fit(path, report, recorders, zone):
    # Run this import only when processing FIT. The Garmin SDK validates message
    # encodings and checksums. A FIT download from Intervals can contain edits.
    from garmin_fit_sdk import Decoder, Stream

    catalog = {row["id"]: row for row in report["baseHistory"]["providerActivities"]["Intervals.icu"]}
    sport_lookup = {"cycling": "Ride", "running": "Run"}
    selected = {str(row["externalIds"]["intervals"]): row for row in report["activities"]
                if row.get("externalIds", {}).get("intervals") and row.get("classification") != "non-training"}
    first = (date.fromisoformat(report["date"]) - timedelta(days=83)).isoformat()
    blocks, verified, dates = [], set(), []
    counts = {"files": 0, "matchedFiles": 0, "recentRideRun": 0, "verifiedRecorder": 0, "eligibleFiles": 0}
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            counts["files"] += 1
            name = Path(member.filename)
            match = re.match(r"^(i?\d+)(?:_|$)", name.stem)
            activity_id = match[1] if match else None
            if name.suffix.lower() != ".fit" or activity_id not in catalog or activity_id in verified or member.file_size > 20_000_000:
                continue
            stream = Stream.from_byte_array(bytearray(archive.read(member)))
            messages, errors = Decoder(stream).read()
            sessions = messages.get("session_mesgs", [])
            if errors or len(sessions) != 1:
                continue
            session = sessions[0]
            start = session.get("start_time")
            published = catalog[activity_id]
            if not isinstance(start, datetime) or start.tzinfo is None or not published.get("sourceLocalStart"):
                continue
            expected = datetime.fromisoformat(published["sourceLocalStart"]).replace(tzinfo=zone)
            if abs((start - expected).total_seconds()) > 150:
                continue
            verified.add(activity_id)
            day = published["date"]
            dates.append(day)
            counts["matchedFiles"] += 1
            sport = sport_lookup.get(session.get("sport"))
            if not sport or sport != published["sport"] or not first <= day <= report["date"]:
                continue
            counts["recentRideRun"] += 1
            activity = selected.get(activity_id)
            if not activity or activity["sport"] != sport or activity["date"] != day:
                continue
            recorder = recorders.get(str(activity.get("externalIds", {}).get("garmin")))
            if not recorder:
                continue
            records = messages.get("record_mesgs", [])
            environment = "outdoor" if any(row.get("position_lat") is not None for row in records) else (
                "indoor" if session.get("sub_sport") in ("indoor_running", "treadmill", "indoor_cycling") else None)
            if environment != recorder["environment"] or (sport == "Ride" and not recorder["hasRecordedPower"]):
                continue
            counts["verifiedRecorder"] += 1
            points = list(fit_points(records, recorder["hasRecordedPower"]))
            metadata = {
                "date": day, "activityId": activity_id, "device": recorder["device"], "environment": environment,
                "source": "Intervals.icu FIT", "sourceUrl": published["sourceUrl"],
            }
            rows = steady_blocks([points], start.timestamp(), sport, metadata, include_short=True)
            counts["eligibleFiles"] += bool(rows)
            blocks.extend(rows)
    return blocks, {**counts, "first": min(dates, default=None), "last": max(dates, default=None)}


WELLNESS = {
    "restingHR": ("restingHrBpm", 25, 180), "hrv": ("hrvMs", 1, 500),
    "sleepSecs": ("sleepSeconds", 0, 86400), "sleepScore": ("sleepScore", 0, 100),
    "avgSleepingHR": ("sleepingHrBpm", 25, 180), "steps": ("steps", 0, 200_000),
    "spO2": ("spo2", 0, 100), "respiration": ("respiration", 0, 120),
    "readiness": ("readiness", 0, 100), "weight": ("weightKg", 0, 400),
}


def read_intervals_wellness(path, cutoff):
    by_date = {}
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not {"date", "ctl", "atl"}.issubset(reader.fieldnames or ()):
            raise ValueError("Intervals wellness columns or fitness fields are missing.")
        for row in reader:
            day = date.fromisoformat(row["date"]).isoformat()
            if day > cutoff:
                continue
            if day in by_date:
                raise ValueError("Intervals wellness has a duplicate date.")
            by_date[day] = row
    wellness, training = [], []
    for day, row in sorted(by_date.items()):
        readings = {"date": day}
        for field, (label, low, high) in WELLNESS.items():
            value = measure(row.get(field), low, high)
            if value is not None:
                readings[label] = value
        if len(readings) > 1:
            wellness.append(readings)
        fitness = measure(row.get("ctl"), 0, 1500)
        fatigue = measure(row.get("atl"), 0, 1500)
        if fitness is not None and fatigue is not None:
            training.append({"date": day, "fitness": fitness, "fatigue": fatigue})
    return wellness, training, {
        "csvRows": len(by_date), "recordedDays": len(wellness), "fitnessDays": len(training),
        "first": min(by_date, default=None), "last": max(by_date, default=None),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("exports", nargs="+", type=Path)
    parser.add_argument("--intervals-fit", type=Path)
    parser.add_argument("--intervals-wellness", type=Path)
    parser.add_argument("--timezone", default="Asia/Jakarta")
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    lookup = {str(activity.get("externalIds", {}).get("garmin")): activity
              for activity in report["activities"] if activity.get("sport") in ("Ride", "Run")
              and activity.get("classification") != "non-training"}
    blocks, recorders = [], {}
    for export in args.exports:
        key = export.stem.removeprefix("activity_")
        if key not in lookup:
            raise ValueError(f"Could not match {export.name} to the selected report.")
        rows, recorders[key] = blocks_from_tcx(export, lookup[key])
        blocks.extend(rows)
        print(lookup[key]["date"], lookup[key]["sport"], len(rows), "eligible blocks")
    if args.intervals_fit or args.intervals_wellness:
        base = report["baseHistory"]
        counts = base.setdefault("intervalsDownloads", {})
        counts["capturedAt"] = datetime.now(timezone.utc).isoformat()
        if args.intervals_fit:
            rows, counts["fit"] = read_intervals_fit(args.intervals_fit, report, recorders, ZoneInfo(args.timezone))
            blocks.extend(rows)
            print("Intervals FIT", counts["fit"], len(rows), "eligible blocks")
        if args.intervals_wellness:
            base["intervalsWellness"], base["intervalsDaily"], counts["wellness"] = read_intervals_wellness(args.intervals_wellness, report["date"])
            print("Intervals wellness", counts["wellness"])
        for provider in base["providers"]:
            if provider["source"] == "Intervals.icu":
                captured = ["Activity CSV"] + (["FIT archive"] if counts.get("fit") else []) + (["wellness CSV"] if counts.get("wellness") else [])
                provider["status"] = "Downloaded " + ", ".join(captured)
    report["predictionEvidence"] = {
        "method": "After a five-minute warm-up, verified eight-minute steady blocks take priority. Nonoverlapping six- and five-minute blocks fill gaps. End-block mean and measured peak HR are saved separately.",
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "blocks": blocks,
    }
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
