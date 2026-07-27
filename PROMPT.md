# Task: Build, test and publish an interactive trip-map web app

## Context

This directory contains a sanitized GPS dataset from a 5-day motorhome trip in
south-eastern Norway (2026-07-20 → 2026-07-24). Build a static, single-page web
application that visualizes the trip on an interactive map, then publish it
publicly on GitHub Pages with full CI/CD.

**Before writing any code, read `raw/DATASET.md` in full.** It is the contract
for this task. It documents the data schema, known gotchas (degree-symbol
string coordinates, globally unsorted path segments, duplicate visit hierarchy
levels, redacted/missing fields), how metrics must be computed, and
non-negotiable privacy rules. Where this prompt and DATASET.md overlap,
DATASET.md wins.

## Data

- `raw/trip_20260720_20260724.geojson` — render-ready FeatureCollection
  (5 day tracks + 20 stops). Use this for map geometry.
- `raw/trip_20260720_20260724_timeline.json` — source of truth for metrics.
  Aggregate distance/duration from its `activity` segments, **not** from
  GeoJSON geometry.
- The two distance measures disagree (see DATASET.md → Metrics). Pick one
  deliberately, use it consistently, and label it in the UI (e.g. a footnote
  explaining what the figure represents).

## Functional requirements

1. **Interactive map** (pan/zoom) centred on the trip area, with a free tile
   provider and proper attribution. Use a mature library (Leaflet or MapLibre
   GL — your choice, justify it in the README).
2. **Day tracks**: draw all five daily routes, visually distinct per day
   (colour + legend). Do not interpolate across GPS gaps — DATASET.md warns
   that long straight jumps are sampling dropouts, not travel.
3. **Stops**: markers with popups showing label, municipality, arrival/
   departure time, and duration. Respect `name_verified`: only link to Google
   Maps for verified `place_id`s; present unverified labels as approximate
   locality descriptions, never as confirmed businesses. Highlight overnight
   stops distinctly (duration 850–1250 min).
4. **Day filter**: "All days" plus each of the five dates. Selecting a day
   filters tracks, stops, and all statistics. Day titles from the dataset
   (e.g. "Dagstur til Setesdal") should be shown.
5. **Statistics panel**: distance travelled and time in motion — aggregate and
   per day, broken down by travel mode (car / walking / cycling). Times are
   local (Europe/Oslo, +02:00); never assume UTC.
6. **Administrative context**: show names and borders for the Norwegian
   municipalities (kommuner) and counties (fylker) the trip touches — 19
   municipalities across Vestfold, Telemark and Agder (listed in DATASET.md).
   Note: Norway has counties, not states. Fetch boundaries once from a public
   source (e.g. Kartverket/Geonorge, 2024 boundaries to match the dataset),
   simplify, and bundle them as static files in the repo — no runtime calls to
   boundary APIs. Include the required license attribution.
7. **Derived insights**: explore the dataset and implement 2–4 additional
   features it supports well — candidates: a time-of-day timeline/scrubber,
   stop-duration chart, per-day mode breakdown, average moving speed per leg,
   municipalities-crossed-per-day. Document in the README what you chose and
   why.

## Technical constraints

- Fully static output: no backend, no server-side code, no secrets. A build
  step (bundler) is fine as long as the artifact is static files.
- Must work when served from a GitHub Pages project subpath
  (`https://<user>.github.io/<repo>/`) — use relative asset paths or a
  configured base URL.
- Responsive: usable from 360 px-wide Android phones up to desktop.
- Target browsers: Firefox and Chromium (desktop + Android). Safari/iOS
  explicitly out of scope.

## Testing

- **Unit tests** for all data parsing and aggregation logic (coordinate
  parsing, segment sorting, dedup by `hierarchyLevel`, metric sums, day
  filtering). Aim for ~100% coverage of the data layer; ≥90% overall for
  non-trivial code. Enforce the threshold in CI.
- **Playwright E2E** in both Chromium and Firefox, at desktop and
  mobile-emulated viewports (e.g. a Pixel device profile for Android).
- **Screenshot-driven visual verification**: during E2E, capture screenshots
  of every major state — initial load, each day selected, a stop popup open,
  the stats panel, and the mobile layout. Then open and inspect those images
  yourself, check layout, element placement and readability, and fix what
  looks wrong before considering the task done. Iterate until the screenshots
  look right.
- Verify the metric totals shown in the UI against the reference totals table
  in DATASET.md (660 km / 14 h 24 min across modes, or the polyline figure if
  you chose that — whichever you picked).

## CI/CD (GitHub Actions)

- On push to `main`: install → lint → unit tests (with coverage gate) → build
  → Playwright E2E → deploy to GitHub Pages using the official Pages actions.
- Upload Playwright screenshots and the coverage report as workflow artifacts.
- The deploy must only run if every prior step passes.

## Repository & publishing

- Initialize a git repo in this directory and create a **public** repo under
  my GitHub handle using the `gh` CLI; push and enable GitHub Pages
  (Actions-based deployment).
- Include: a README (what the app is, a screenshot, link to the live page,
  data provenance summary pointing at `raw/DATASET.md`, local dev/test
  instructions), a license, and a sensible `.gitignore` (no `node_modules`,
  no test output).

## Privacy — hard requirements

- The dataset in `raw/` is already sanitized. Follow the four "Rules for
  downstream work" in DATASET.md exactly: do not weaken the redaction fence or
  its audit, do not merge in raw exports, do not reverse-geocode the trip
  endpoints, do not add personal identifiers of any kind.
- No PII anywhere in the repo or its history: no real names, no home or work
  address, no personal or employer email addresses.
- **Commit metadata counts as part of the repo.** Before the first commit, set
  this repo's git author/committer to my GitHub noreply address
  (`<id>+<username>@users.noreply.github.com`) — do not commit with my work
  email. use `gh api user` to get the correct ID for your username.
- Before pushing, sweep everything that will be published — files, commit
  messages, commit author fields, CI logs that end up in artifacts — for
  names, email addresses, street addresses, and any coordinates that did not
  come from the sanitized dataset. Report what you checked.

## Acceptance criteria

- Live GitHub Pages URL serving the app, deployed by a green Actions run.
- All functional requirements above demonstrably working in the E2E
  screenshots.
- Tests green in Chromium and Firefox, desktop and mobile viewports, with the
  coverage gate met.
- README complete; no PII in the repo per the sweep above.
