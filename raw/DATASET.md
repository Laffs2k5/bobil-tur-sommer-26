# Motorhome trip dataset — 20–24 July 2026

Sanitized extract of a personal Google Timeline export, prepared for **public
publication** in a web map. Everything here is cleared for publication; see
[Redaction](#redaction) for what was removed and the rules you must not relax.

- **Region:** south-eastern Norway (Vestfold, Telemark, Agder)
- **Coverage:** 2026-07-20 → 2026-07-24, five consecutive days
- **All timestamps:** ISO 8601 with explicit `+02:00` offset (CEST, Europe/Oslo).
  Never assume UTC.
- **Coordinate reference system:** WGS 84 (EPSG:4326)

## Files

| File | Size | Purpose |
|---|---|---|
| `trip_20260720_20260724.geojson` | 51 KB | **Use this for the map.** Ready-to-render FeatureCollection. |
| `trip_20260720_20260724_timeline.json` | 113 KB | Same trip in Google's original schema. Source of truth for metrics. |
| `sanitize_timeline.py` | 12 KB | Regenerates both files from the raw export. Contains the label table. |
| `DATASET.md` | — | This document. |

The GeoJSON is derived from the timeline JSON — it is not independent data. If
you change one, regenerate the other with the script rather than hand-editing.

---

## `trip_20260720_20260724.geojson`

`FeatureCollection`, 25 features. Two kinds, distinguished by
`properties.kind`. Tracks come first, then stops in chronological order.

### `kind: "track"` — 5 features, one per day

`LineString`, positions ordered by time. 825 positions total, sampled roughly
every 1–3 minutes while moving.

| Property | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD`, local date |
| `title` | string | Human label, e.g. `Dagstur til Setesdal` |
| `municipalities` | string[] | Municipalities crossed that day, in travel order |
| `points` | int | Position count |
| `first_fix`, `last_fix` | string | Timestamps of the first/last position |
| `distance_km` | float | Sum of Google's `distanceMeters` for that day. **See [Metrics](#metrics).** |
| `track_length_km` | float | Great-circle length of this LineString |
| `modes` | string[] | Travel modes used, most kilometres first |

A day's LineString may contain a long straight jump where GPS sampling dropped
out. Do not interpret those as travel in a straight line, and do not
interpolate over them.

### `kind: "stop"` — 20 features

`Point`, one per stop event, chronological.

| Property | Type | Notes |
|---|---|---|
| `label` | string | Display name — always populated |
| `municipality` | string | Norwegian municipality (2024 boundaries) |
| `name_verified` | bool | **See below** |
| `date` | string | Local date of the stop's start |
| `start`, `end` | string | Timestamps |
| `duration_min` | int | Rounded minutes |
| `place_id` | string | Google Place ID as recorded by Timeline |

**`name_verified` matters.** 12 of 20 labels are verified: the Place ID from
Timeline matched a live Google Places record exactly, so the name is the real
business name. The other 8 are `false` — Timeline stored an alternate or legacy
Place ID that no longer resolves, so the label was derived from the surrounding
locality instead (`Bensinstasjon, Vrådal`, `Fokserød, E18`). Those 8 are
accurate as to place and municipality but must not be presented as a confirmed
business identity, and **their `place_id` should not be used to link to Google
Maps** — it may resolve to nothing or to the wrong entity. Verified IDs are
safe to link.

Overnight stops appear as a single stop with `duration_min` in the 850–1250
range. Two consecutive stays at the same campsite on 23 July are two separate
features (the family drove into town and came back), not a duplicate.

---

## `trip_20260720_20260724_timeline.json`

Google's on-device Timeline schema, reduced to a single top-level key:

```
{ "semanticSegments": [ ... ] }   // 76 segments
```

Every segment has `startTime` and `endTime`, plus exactly one payload key.
46 of the 76 also carry `startTimeTimezoneUtcOffsetMinutes` /
`endTimeTimezoneUtcOffsetMinutes` (always `120`).

**Coordinate format gotcha:** coordinates are *strings with degree symbols*,
not numbers — `"59.2905015°, 10.3911224°"`. Parse with a regex; do not
`float()` the raw value. In the original export the key is `latLng` inside
`semanticSegments` but `LatLng` inside the (removed) `rawSignals`, so
case-insensitive key lookup is wise if you ever touch a raw export.

### `timelinePath` — 30 segments, 825 points

The GPS trace, bucketed into ~2-hour windows. Each point is
`{"point": "<lat>°, <lng>°", "time": "<iso8601>"}`. Points within a segment are
time-ordered, but **segments are not guaranteed globally sorted** — sort by
point `time` before drawing.

### `activity` — 23 segments

A movement leg.

| Field | Notes |
|---|---|
| `distanceMeters` | Google's own distance estimate for the leg |
| `topCandidate.type` | `IN_PASSENGER_VEHICLE` (19), `WALKING` (2), `CYCLING` (2) |
| `topCandidate.probability`, `probability` | Confidence, 0–1 |
| `start`, `end` | `{"latLng": "..."}` — **absent on 5 legs**, see below |
| `parking` | `{location, startTime}` — where the vehicle was parked. Present on 17 legs |
| `redactedEndpoints` | **Added by the sanitizer.** Array naming which of `start` / `end` / `parking` was stripped |

`redactedEndpoints` is not part of Google's schema. It appears on 5 legs whose
endpoint or parking spot fell inside a redaction fence. Those legs keep their
distance, duration, mode and probability — only the coordinate is gone. Your
code must tolerate a missing `start`, `end` or `parking` on any activity leg.

### `visit` — 23 segments

A dwell at a place. `topCandidate` holds `placeId`, `placeLocation.latLng`,
`semanticType` and `probability`.

`hierarchyLevel` is the trap: **18 segments are level 0 (the specific place)
and 5 are level 1 (the enclosing area, same timestamp)**. That is why there are
23 visit segments but only 20 stops on the map. Deduplicate by `startTime`
before plotting or you will stack pins. `semanticType` is `UNKNOWN` throughout
this extract — every labelled type was removed (see below).

---

## Metrics

Everything needed for distance and duration totals is present. Aggregate from
the `activity` segments in the timeline JSON, not from the GeoJSON geometry.

Current totals:

| | Legs | Distance | Duration |
|---|---|---|---|
| Car (`IN_PASSENGER_VEHICLE`) | 19 | 657 km | 13 h 20 min |
| Walking | 2 | 2.9 km | 1 h 02 min |
| Cycling | 2 | 0.6 km | 3 min |
| **All modes** | 23 | **660 km** | **14 h 24 min** |

**The two distance measures disagree and you must pick deliberately.** Google's
`distanceMeters` sums to 660 km. The drawn polyline over the same time windows
measures 726 km, and total polyline length including unsegmented movement is
755 km. This is not a coverage gap — only 27 km of traced movement falls outside
any activity leg. Sparse sampling means the polyline cuts corners, so it is
itself a lower bound: the real road distance for 20 July alone exceeds 350 km,
while the legs claim 241 km and the polyline 300 km. Both undercount; the
polyline undercounts less.

Guidance: publish 657 km if you want the figure Google itself reports, or
~755 km as an honest lower bound on kilometres driven. State which you used.
Do not average them, and do not present either as odometer-accurate.

**Duration is reliable.** It derives from timestamps, not geometry, and the
redacted legs kept their durations. Use `endTime - startTime` summed over legs
where `topCandidate.type == "IN_PASSENGER_VEHICLE"`. Note this counts time in
motion only; time parked appears as `visit` segments.

Nineteen municipalities were crossed in total:

- **Vestfold:** Færder, Tønsberg, Sandefjord, Larvik
- **Telemark:** Porsgrunn, Bamble, Kragerø, Nissedal, Kviteseid, Tokke, Vinje, Seljord, Midt-Telemark, Nome, Skien
- **Agder:** Gjerstad, Åmli, Bykle, Valle

Færder does not appear in the published data — it is where the redaction fence
sits. Municipality attribution for the forest stretch between Brokelandsheia
and Nissedal, and for the Bykle/Valle boundary on the Sessvatn mountain road,
is inferred from the trace rather than from an authoritative boundary lookup.

---

## Redaction

Removed from the source export:

- **`userLocationProfile`** — labelled home and work coordinates, 10 frequent
  places, 9 frequent trips with typical departure times, travel-mode affinity
  vector.
- **`rawSignals`** — raw GPS fixes with accuracy/altitude/speed, activity
  confidences, and 18,346 nearby Wi-Fi access point MAC addresses with signal
  strengths. That last set is third-party data and must never be republished.
- **Visits labelled `HOME`, `INFERRED_HOME`, `WORK` or `SEARCHED_ADDRESS`.**
- **A 2,000 m geofence around the home and workplace**, applied to every
  remaining coordinate: 67 trace points dropped, 11 path segments emptied, 10
  activity endpoints or parking locations stripped.

The closest surviving coordinate in either file is **2,074 m** from a private
anchor. The published track therefore begins and ends on the E18 corridor
north of Tønsberg rather than at a driveway.

`sanitize_timeline.py` verifies this on every run: it walks both outputs
recursively, fence-checks every coordinate it finds — including nested fields
nobody thought about — and exits non-zero rather than writing a file that
leaks. Keep that check if you modify the script.

### Rules for downstream work

1. **Do not lower the fence radius or disable the audit.** The `parking`
   coordinate leak was caught only because the audit walks everything.
2. **Do not merge in data from the raw export**, and do not accept a raw
   `Timeline.json` as input to a publication pipeline without re-running the
   sanitizer.
3. **Do not reverse-geocode the trip endpoints to a street address** or
   otherwise reconstruct what the fence hides. The fence conceals the address,
   not the region — anyone can see the route converges on the Tønsberg area,
   which is unavoidable for a trip starting at home. Do not narrow it further.
4. **Do not add photos, names of the people travelling, or vehicle
   registration** to these files. There is currently no personal identifier of
   any kind in either file, and it should stay that way.

---

## Regenerating

```bash
python3 sanitize_timeline.py <raw Timeline.json> <outdir> \
    --from 2026-07-20 --to 2026-07-24 [--radius 2000]
```

Stdlib only, no dependencies. Prints the audit result, then a per-category
count of what was dropped or redacted. A larger `--radius` moves the start and
end of the published track further from home (15000 starts it around Larvik).

Stop labels live in the `STOP_LABELS` dict at the top of the script, keyed by
Place ID, as `(label, municipality, verified)`. Correct a label there and
re-run; do not edit the GeoJSON by hand. Per-day titles and municipality lists
live in `DAY_INFO` in the same file.

### Source

Exported from Android: Settings → Location → Location services → Timeline →
Export Timeline data, on 2026-07-25. Timeline data is stored on-device since
Google's migration away from account-level Location History, so Google Takeout
does not contain this dataset and cannot filter it by date range — hence the
script. The device retained 2025-01-30 onward at export time.
