#!/usr/bin/env python3
"""
Extract a date range from an Android Timeline.json export and strip personal data
so the result is safe to publish.

Removed:
  * userLocationProfile        (HOME/WORK coordinates, frequent trips, persona vector)
  * rawSignals                 (raw GPS fixes, activity confidences, and ~18k
                                 nearby Wi-Fi AP MAC addresses -- other people's
                                 networks, the single most sensitive field in the file)
  * any visit labelled HOME / INFERRED_HOME / WORK / SEARCHED_ADDRESS
  * anything inside a geofence around home/work (visits, activity legs,
                                 individual timelinePath points)

Kept: visits, activity legs and timelinePath traces outside the fences,
with their timestamps, place IDs and inferred travel modes.

Usage:
    python3 sanitize_timeline.py IN.json OUT_DIR --from 2026-07-20 --to 2026-07-24
"""
import argparse
import json
import math
import os
import re
from datetime import datetime
from collections import defaultdict

FENCE_RADIUS_M = 2000          # redaction radius around each private anchor
PRIVATE_SEMANTIC_TYPES = {"HOME", "INFERRED_HOME", "WORK", "SEARCHED_ADDRESS"}

# Stop labels. "verified" means the Timeline place ID matched a Google Places
# record exactly; otherwise the label is derived from the surrounding locality
# (Timeline sometimes stores alternate/legacy place IDs for small businesses).
# (label, municipality, verified)
STOP_LABELS = {
    "ChIJUSVouJbhRkYR4EJyH7Z9Zf8": ("St1 Lasses, Stathelle", "Bamble", True),
    "ChIJJ4kwxJbhRkYRQUutKVVOV9Q": ("Stathelle", "Bamble", False),
    "ChIJP8nqTK-DOEYR6cXn4F-4lXk": ("Jettegrytene \u2013 parkering/adkomst", "Nissedal", False),
    "ChIJA2zxi7eDOEYRR6j9einN1Bs": ("Jettegrytene, Reinfoss", "Nissedal", True),
    "ChIJdWWvCRXLOEYRMC7AQ849YsQ": ("Groven Camping og Hyttegrend, \u00c5mot", "Vinje", True),
    "ChIJZzluuRTLOEYR8SpEVKVMF4E": ("Fristadsenteret, \u00c5mot", "Vinje", True),
    "ChIJOwhbghPLOEYRPgYSIr3wVtA": ("Fristadsenteret (butikk), \u00c5mot", "Vinje", False),
    "ChIJeRoAhKbLOEYRhtByq2wbuwA": ("Fristadsenteret (butikk), \u00c5mot", "Vinje", False),
    "ChIJ16xOF4zjOEYRlCfgAC0aB1s": ("Kulpane, Nomeland", "Valle", True),
    "ChIJYWIzKvemOEYRudv0CLZVHp4": ("Bensinstasjon, Vr\u00e5dal", "Kviteseid", False),
    "ChIJqROjXrioOEYRRQoZ_C7XqAw": ("Kviteseid sentrum", "Kviteseid", False),
    "ChIJhXW2Xr9WR0YRCdPrMe2x6R0": ("Garvikstrondi Camping", "Seljord", True),
    "ChIJf6ah9vBLR0YR8tWfWb6XA8A": ("B\u00f8 Sommarland", "Midt-Telemark", True),
    "ChIJMa54ZkdJR0YRKELy8mWi-Kw": ("MENY B\u00f8", "Midt-Telemark", True),
    "ChIJMa54ZkdJR0YR51Mf-0UUQZA": ("MENY B\u00f8", "Midt-Telemark", False),
    "ChIJb0TYjXRJR0YRDbqv5EYFX5o": ("\u00c5sgrav Family Camping, B\u00f8", "Midt-Telemark", True),
    "ChIJqUadMfc2R0YRTe7TTvIU2xg": ("First Camp Norsj\u00f8 / Norsj\u00f8 Kabelpark, Akkerhaugen",
                                    "Midt-Telemark", True),
    "ChIJcVrnP5A5R0YRjcDQt4qokyU": ("Ulefoss", "Nome", False),
    "ChIJ4R2jJDDHRkYRoio2CwDelGc": ("Fokser\u00f8d, E18", "Sandefjord", False),
    "ChIJrbTL05_HRkYR5b2mSLfjYRY": ("E18 nord for Fokser\u00f8d", "Sandefjord", False),
}

# Route context per day, for the track popups.
DAY_INFO = {
    "2026-07-20": ("T\u00f8nsberg \u2013 Jettegrytene \u2013 Vinje",
                   ["T\u00f8nsberg", "Sandefjord", "Larvik", "Porsgrunn", "Bamble", "Krager\u00f8",
                    "Gjerstad", "\u00c5mli", "Nissedal", "Kviteseid", "Tokke", "Vinje"]),
    "2026-07-21": ("Dagstur til Setesdal",
                   ["Vinje", "Tokke", "Bykle", "Valle", "Kviteseid", "Seljord"]),
    "2026-07-22": ("Seljord \u2013 B\u00f8 Sommarland", ["Seljord", "Midt-Telemark"]),
    "2026-07-23": ("Norsj\u00f8 Kabelpark", ["Midt-Telemark"]),
    "2026-07-24": ("Hjemover over Ulefoss og Skien",
                   ["Midt-Telemark", "Nome", "Skien", "Porsgrunn", "Larvik", "Sandefjord",
                    "T\u00f8nsberg"]),
}

COORD_RE = re.compile(r"-?\d+\.?\d*")


def parse_coord(s):
    """'59.2414355°, 10.3974458°' -> (59.2414355, 10.3974458)"""
    lat, lng = (float(x) for x in COORD_RE.findall(s)[:2])
    return lat, lng


def parse_ts(s):
    return datetime.fromisoformat(s)


def haversine_m(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def collect_fences(profile, radius):
    """Build redaction fences from the labelled places in userLocationProfile."""
    fences = []
    for p in (profile or {}).get("frequentPlaces", []):
        if p.get("label") in ("HOME", "WORK"):
            fences.append((parse_coord(p["placeLocation"]), radius, p["label"]))
    return fences


def fenced(pt, fences):
    return any(haversine_m(pt, c) <= r for c, r, _ in fences)


def segment_coords(seg):
    """Every coordinate a segment exposes, for fence testing."""
    if "visit" in seg:
        yield parse_coord(seg["visit"]["topCandidate"]["placeLocation"]["latLng"])
    if "activity" in seg:
        for end in ("start", "end"):
            if end in seg["activity"]:
                yield parse_coord(seg["activity"][end]["latLng"])


def sanitize(raw, date_from, date_to, radius):
    fences = collect_fences(raw.get("userLocationProfile"), radius)
    stats = defaultdict(int)
    out = []

    for seg in raw.get("semanticSegments", []):
        day = seg.get("startTime", "")[:10]
        if not (date_from <= day <= date_to):
            continue
        stats["in_range"] += 1

        if "visit" in seg:
            tc = seg["visit"]["topCandidate"]
            if tc.get("semanticType") in PRIVATE_SEMANTIC_TYPES:
                stats["dropped_labelled_visit"] += 1
                continue
            if fenced(parse_coord(tc["placeLocation"]["latLng"]), fences):
                stats["dropped_fenced_visit"] += 1
                continue

        elif "activity" in seg:
            # Keep the leg (mode + distance are harmless and needed for stats),
            # but strip whichever endpoint sits inside a fence.
            act = dict(seg["activity"])
            redacted = [end for end in ("start", "end")
                        if fenced(parse_coord(act[end]["latLng"]), fences)]
            # activity.parking.location is a separate coordinate -- it records
            # where the vehicle was parked, i.e. the driveway at either end.
            park = act.get("parking", {}).get("location", {}).get("latLng")
            if park and fenced(parse_coord(park), fences):
                redacted.append("parking")
            if redacted:
                for end in redacted:
                    act.pop(end, None)
                act["redactedEndpoints"] = redacted
                seg = dict(seg, activity=act)
                stats["redacted_activity_endpoints"] += len(redacted)

        elif "timelinePath" in seg:
            keep = [p for p in seg["timelinePath"]
                    if not fenced(parse_coord(p["point"]), fences)]
            stats["dropped_fenced_points"] += len(seg["timelinePath"]) - len(keep)
            if len(keep) < 2:
                stats["dropped_short_path"] += 1
                continue
            seg = dict(seg, timelinePath=keep)

        out.append(seg)
        stats["kept"] += 1

    return {"semanticSegments": out}, stats, fences


def to_geojson(clean):
    """Day LineStrings + stop Points, ready for umap/geojson.io/Leaflet."""
    days_pts = defaultdict(list)
    visits = {}
    days_meta = defaultdict(lambda: {"distance_m": 0.0, "modes": defaultdict(float)})
    stops = []

    for seg in clean["semanticSegments"]:
        day = seg["startTime"][:10]
        if "timelinePath" in seg:
            for p in seg["timelinePath"]:
                lat, lng = parse_coord(p["point"])
                days_pts[day].append((p["time"], lng, lat))
        elif "activity" in seg:
            a = seg["activity"]
            d = a.get("distanceMeters", 0.0)
            mode = a["topCandidate"]["type"]
            days_meta[day]["distance_m"] += d
            days_meta[day]["modes"][mode] += d
        elif "visit" in seg:
            visits.setdefault(seg["startTime"], []).append(seg)

    # One feature per visit event: Timeline emits a leaf place plus an enclosing
    # area at the same timestamp, which would otherwise double up on the map.
    for start, group in visits.items():
        best = min(group, key=lambda g: (
            g["visit"]["topCandidate"].get("placeId") not in STOP_LABELS,
            not STOP_LABELS.get(g["visit"]["topCandidate"].get("placeId"),
                                (None, None, False))[2],
            g["visit"].get("hierarchyLevel", 9)))
        tc = best["visit"]["topCandidate"]
        lat, lng = parse_coord(tc["placeLocation"]["latLng"])
        label, muni, verified = STOP_LABELS.get(
            tc.get("placeId"), ("Ukjent stopp", None, False))
        mins = round((parse_ts(best["endTime"]) - parse_ts(start)).total_seconds() / 60)
        stops.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]},
            "properties": {
                "kind": "stop",
                "label": label,
                "municipality": muni,
                "name_verified": verified,
                "date": start[:10],
                "start": start,
                "end": best["endTime"],
                "duration_min": mins,
                "place_id": tc.get("placeId"),
            },
        })

    features = []
    for day in sorted(days_pts):
        pts = sorted(days_pts[day])
        meta = days_meta[day]
        modes = sorted(meta["modes"].items(), key=lambda kv: -kv[1])
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString",
                         "coordinates": [[round(x, 6), round(y, 6)] for _, x, y in pts]},
            "properties": {
                "kind": "track",
                "date": day,
                "points": len(pts),
                "first_fix": pts[0][0],
                "last_fix": pts[-1][0],
                "distance_km": round(meta["distance_m"] / 1000, 1),
                "track_length_km": round(sum(
                    haversine_m((pts[i - 1][2], pts[i - 1][1]), (pts[i][2], pts[i][1]))
                    for i in range(1, len(pts))) / 1000, 1),
                "modes": [m for m, _ in modes],
                "title": DAY_INFO.get(day, (None, None))[0],
                "municipalities": DAY_INFO.get(day, (None, None))[1],
            },
        })

    features.extend(sorted(stops, key=lambda f: f["properties"]["start"]))
    return {"type": "FeatureCollection", "features": features}


def audit(obj, fences, path="$"):
    """Walk the whole structure and fence-check every coordinate-shaped string.

    Guards against schema fields we did not think to redact explicitly.
    Returns (closest_distance_m, offending_paths).
    """
    worst, bad = float("inf"), []
    stack = [(obj, path)]
    while stack:
        node, where = stack.pop()
        if isinstance(node, dict):
            stack.extend((v, f"{where}.{k}") for k, v in node.items())
        elif isinstance(node, list):
            stack.extend((v, f"{where}[{i}]") for i, v in enumerate(node))
        elif isinstance(node, str) and node.count("\u00b0") == 2:
            pt = parse_coord(node)
            for centre, radius, label in fences:
                d = haversine_m(pt, centre)
                worst = min(worst, d)
                if d <= radius:
                    bad.append((where, label, round(d)))
    return worst, bad


def audit_geojson(gj, fences):
    """Same check for the GeoJSON, whose coordinates are numeric [lng, lat]."""
    worst, bad = float("inf"), []
    for feat in gj["features"]:
        geom = feat["geometry"]
        coords = ([geom["coordinates"]] if geom["type"] == "Point"
                  else geom["coordinates"])
        for lng, lat in coords:
            for centre, radius, label in fences:
                d = haversine_m((lat, lng), centre)
                worst = min(worst, d)
                if d <= radius:
                    bad.append((feat["properties"].get("label",
                                feat["properties"].get("date")), label, round(d)))
    return worst, bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("infile")
    ap.add_argument("outdir")
    ap.add_argument("--from", dest="date_from", required=True)
    ap.add_argument("--to", dest="date_to", required=True)
    ap.add_argument("--radius", type=int, default=FENCE_RADIUS_M,
                    help="redaction radius in metres around home/work")
    args = ap.parse_args()

    with open(args.infile) as fh:
        raw = json.load(fh)

    clean, stats, fences = sanitize(raw, args.date_from, args.date_to, args.radius)
    gj = to_geojson(clean)

    for name, obj in (("timeline", clean), ("geojson", gj)):
        closest, bad = (audit(obj, fences) if name == "timeline"
                        else audit_geojson(obj, fences))
        if bad:
            raise SystemExit(f"REDACTION FAILURE in {name}: {bad[:5]}")
        print(f"audit {name}: no coordinate within {args.radius} m of a private "
              f"anchor (closest {closest:.0f} m)")

    os.makedirs(args.outdir, exist_ok=True)
    tag = f"{args.date_from}_{args.date_to}".replace("-", "")
    p_json = os.path.join(args.outdir, f"trip_{tag}_timeline.json")
    p_gj = os.path.join(args.outdir, f"trip_{tag}.geojson")
    for path, obj in ((p_json, clean), (p_gj, gj)):
        with open(path, "w") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=1)

    print(f"fences applied: {[(l, args.radius) for *_, l in fences] or 'NONE'}")
    for k in sorted(stats):
        print(f"  {k}: {stats[k]}")
    print(f"\n{p_json}\n{p_gj}")


if __name__ == "__main__":
    main()
