"""Attach validated export summaries and dated snapshots to a private report."""

import argparse
import csv
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path


PROVIDERS = ("Garmin Connect", "Strava", "Intervals.icu")
WELLNESS_FIELDS = (
    "date", "readiness", "readinessStatus", "recoveryTimeMinutes", "recoveryTimeStatus",
    "averageSpo2", "averageRespiration", "awakeMinutes", "restingHr", "rawHrvMs",
    "hrv7dMs", "hrvBaselineLowMs", "hrvBaselineHighMs", "sleepMinutes", "sleepNeedMinutes",
    "deepSleepMinutes", "remSleepMinutes", "sleepScore", "vo2Max", "heatAcclimationPercent",
    "trainingStatus", "bodyBatteryDailyLow", "bodyBatteryDailyHigh", "bodyBatteryChange",
    "garminAcuteLoad", "garminChronicLoad",
)


def read_json(path):
    return json.loads(path.read_text())


def csv_rows(path):
    with path.open(newline="", encoding="utf-8-sig") as stream:
        return list(csv.DictReader(stream))


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) and result >= 0 else None
    except (TypeError, ValueError):
        return None


def clock(value):
    if not value or not re.fullmatch(r"\d+:\d{2}(?::\d{2}(?:\.\d+)?)?", value.strip()):
        return None
    parts = [float(part) for part in value.strip().split(":")]
    return sum(part * 60**i for i, part in enumerate(reversed(parts)))


def normalized_date(value):
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except (TypeError, ValueError):
        return None


def sport_type(value):
    description = value.lower()
    if description in ("ride", "virtualride", "mountainbikeride", "medan kerikil") or any(
        token in description for token in ("cycling", "bersepeda")
    ):
        return "Ride"
    if description in ("run", "virtualrun", "trailrun", "berlari", "lari trail") or "running" in description:
        return "Run"
    if description in ("strength training", "weighttraining", "weight training", "angkat beban"):
        return "Weight Training"
    return value or "Other"


def compact(row):
    return {key: value for key, value in row.items() if value is not None and value != ""}


def garmin_activities(paths):
    for path in paths:
        for row in csv_rows(path):
            kind = row.get("Activity Type", "")
            sport = sport_type(kind)
            power = number(row.get("Avg Power"))
            yield compact({
                "date": normalized_date(row.get("Date")), "sourceLocalStart": row.get("Date"),
                "source": PROVIDERS[0], "sourceType": kind, "sport": sport, "name": row.get("Title"),
                "distanceKm": number(row.get("Distance")), "timerSeconds": clock(row.get("Time")),
                "movingSeconds": clock(row.get("Moving Time")), "averageHr": number(row.get("Avg HR")),
                "maxHr": number(row.get("Max HR")), "averageSpeedKph": number(row.get("Avg Speed")) if sport == "Ride" else None,
                "averagePaceSeconds": clock(row.get("Avg Pace") or row.get("Avg Speed")) if sport == "Run" else None,
                "measuredPowerWatts": power if sport == "Ride" and power else None,
                "averageRunningPowerWatts": power if sport == "Run" and power else None,
            })


def strava_activities(path):
    if not path:
        return
    for row in read_json(path)["rows"]:
        named_date = re.search(r"\d{1,2}/\d{1,2}/\d{4}$", row.get("dateText", ""))
        if not named_date or not re.fullmatch(r"\d+", row.get("id", "")):
            continue
        distance = re.fullmatch(r"([\d.,]+) (km|m)", row.get("distance", "").strip())
        km = number(distance[1].replace(".", "").replace(",", ".")) if distance else None
        yield compact({
            "date": datetime.strptime(named_date[0], "%d/%m/%Y").date().isoformat(),
            "id": row["id"], "source": PROVIDERS[1], "sourceType": row.get("type"),
            "sport": sport_type(row.get("type", "")), "name": row.get("title"),
            "sourceUrl": "https://www.strava.com/activities/" + row["id"], "movingSeconds": clock(row.get("duration")),
            "distanceKm": (km / 1000 if distance[2] == "m" else km) if km is not None else None,
        })


def intervals_activities(paths):
    for path in paths:
        for row in csv_rows(path):
            activity_id = row.get("id", "")
            if not re.fullmatch(r"[ia]?\d+", activity_id):
                continue
            meters = number(row.get("Distance"))
            yield compact({
                "date": normalized_date(row.get("Date")), "sourceLocalStart": row.get("Date"),
                "id": activity_id, "source": PROVIDERS[2], "sourceType": row.get("Type"),
                "sport": sport_type(row.get("Type", "")), "name": row.get("Name"),
                "sourceUrl": "https://intervals.icu/activities/" + activity_id,
                "distanceKm": meters / 1000 if meters is not None else None,
                "movingSeconds": number(row.get("Moving Time")), "averageHr": number(row.get("Avg HR")),
                "normalizedPowerWatts": number(row.get("Norm Power")), "intervalsLoad": number(row.get("Load")),
            })


def date_sorted(rows, limit):
    unique = {}
    for row in rows:
        if row.get("date") and row["date"] <= limit:
            key = row.get("id") or (row["sourceLocalStart"], row["sourceType"], row.get("name"))
            unique[key] = row
    return sorted(unique.values(), key=lambda row: (row["date"], row.get("sourceLocalStart", "")), reverse=True)


def capture_summary(rows, status, extra=None):
    summary = {"records": len(rows), "first": rows[-1]["date"] if rows else None, "last": rows[0]["date"] if rows else None}
    return {**summary, "status": status, "detail": extra}


def attach_battery(report, paths):
    measured = {}
    for path in paths:
        captured_at = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
        for row in csv_rows(path):
            low, high = number(row.get("Daily Low")), number(row.get("Daily High"))
            if low is None or high is None or not 0 <= low <= high <= 100:
                continue
            day = datetime.strptime(row[""], "%m/%d/%Y").date().isoformat()
            if day <= report["date"]:
                measured.setdefault(day, []).append((captured_at, low, high))
    history = report.setdefault("wellnessHistory", {"source": PROVIDERS[0], "rows": []})
    rows = {row["date"]: row for row in history["rows"]}
    conflicts = []
    for day, marks in measured.items():
        captured_at, low, high = max(marks)
        if len({(item[1], item[2]) for item in marks}) > 1 and day != report["date"]:
            conflicts.append(day)
            continue
        entry = rows.setdefault(day, {"date": day, "provenance": {}})
        provenance = entry.setdefault("provenance", {})
        for name, value in (("bodyBatteryLow", low), ("bodyBatteryHigh", high)):
            entry[name] = value
            provenance[name] = {"source": PROVIDERS[0], "captureMethod": "Body Battery 4 Weeks CSV",
                                "capturedAt": captured_at, "date": day, "unit": "score",
                                "partial": day == report["date"]}
    history["rows"] = sorted(rows.values(), key=lambda row: row["date"])
    ordered = sorted(({"date": day} for day in measured if day not in conflicts), key=lambda row: row["date"], reverse=True)
    return {**capture_summary(ordered, "Daily low and high", "Garmin Connect Body Battery CSV"),
            "unresolvedDates": sorted(conflicts), "files": len(paths)}


def prior_snapshots(paths, limit):
    out = {}
    for path in paths:
        row = read_json(path)
        day = row.get("date")
        if not normalized_date(day) or day >= limit or not isinstance(row.get("wellness"), dict):
            continue
        wellness = row["wellness"]
        values = {key: wellness[key] for key in WELLNESS_FIELDS if wellness.get(key) is not None}
        evidence_date = wellness.get("date") or wellness.get("provenance", {}).get("datedRecovery", {}).get("date")
        if evidence_date:
            values["date"] = evidence_date
        coaching = {key: row.get("coaching", {}).get(key) for key in ("headline", "confidence", "pacing")}
        out[day] = compact({"date": day, "capturedAt": row.get("capturedAt"), "wellness": values,
                            "coaching": coaching, "thresholdReview": row.get("thresholdReview"),
                            "trainingMix": {"garminLoadFocus": row.get("trainingMix", {}).get("garminLoadFocus")}})
    return [out[day] for day in sorted(out, reverse=True)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--battery", nargs="*", type=Path, default=[])
    parser.add_argument("--garmin", nargs="*", type=Path, default=[])
    parser.add_argument("--strava", type=Path)
    parser.add_argument("--intervals", nargs="*", type=Path, default=[])
    parser.add_argument("--snapshots", nargs="*", type=Path, default=[])
    parser.add_argument("--garmin-archive", default="Account archive pending")
    parser.add_argument("--strava-archive", default="Account archive pending")
    parser.add_argument("--intervals-files", default="Activity summaries downloaded")
    args = parser.parse_args()

    report = read_json(args.report)
    limit = report["date"]
    data = dict(zip(PROVIDERS, (date_sorted(garmin_activities(args.garmin), limit),
                               date_sorted(strava_activities(args.strava), limit),
                               date_sorted(intervals_activities(args.intervals), limit))))
    status = (args.garmin_archive, args.strava_archive, args.intervals_files)
    providers = [{"source": name, **capture_summary(data[name], message)} for name, message in zip(PROVIDERS, status)]
    # The original comparison window keeps its source reconciliation. Older
    # sessions come from Garmin where its list covers the date, then Strava
    # before the Garmin list starts. All provider rows remain inspectable.
    cutoff = report["coverage"]["start"]
    native_first = data[PROVIDERS[0]][-1]["date"] if data[PROVIDERS[0]] else cutoff
    older = [row for index, name in enumerate(PROVIDERS[:2]) for row in data[name]
             if row["date"] < (min(native_first, cutoff) if index else cutoff)]
    battery = attach_battery(report, args.battery)
    report["baseHistory"] = {
        "processedAt": datetime.now(timezone.utc).isoformat(), "bodyBattery": battery,
        "providers": providers, "providerActivities": data, "additionalActivities": older,
        "snapshots": prior_snapshots(args.snapshots, limit),
    }
    args.output.write_text(json.dumps(report, separators=(",", ":"), ensure_ascii=False) + "\n")
    args.output.chmod(0o600)
    print(json.dumps({"bodyBattery": battery, "providers": providers, "additionalActivities": len(older)}, indent=2))


if __name__ == "__main__":
    main()
