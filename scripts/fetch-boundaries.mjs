// One-time fetch of administrative boundaries (2024 boundaries, unchanged as of
// 2026 for these areas) from Kartverket's open kommuneinfo API on Geonorge.
// The simplified output is committed to the repo as static files so the app
// never calls a boundary API at runtime.
//
// Data © Kartverket, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
// Source: https://ws.geonorge.no/kommuneinfo/v1/
//
// Usage: node scripts/fetch-boundaries.mjs

import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://ws.geonorge.no/kommuneinfo/v1';

// The 19 municipalities the trip touches (see raw/DATASET.md), 2024 numbering.
const MUNICIPALITIES = [
  { nr: '3905', name: 'Tønsberg', county: 'Vestfold' },
  { nr: '3907', name: 'Sandefjord', county: 'Vestfold' },
  { nr: '3909', name: 'Larvik', county: 'Vestfold' },
  { nr: '3911', name: 'Færder', county: 'Vestfold' },
  { nr: '4001', name: 'Porsgrunn', county: 'Telemark' },
  { nr: '4003', name: 'Skien', county: 'Telemark' },
  { nr: '4012', name: 'Bamble', county: 'Telemark' },
  { nr: '4014', name: 'Kragerø', county: 'Telemark' },
  { nr: '4018', name: 'Nome', county: 'Telemark' },
  { nr: '4020', name: 'Midt-Telemark', county: 'Telemark' },
  { nr: '4022', name: 'Seljord', county: 'Telemark' },
  { nr: '4028', name: 'Kviteseid', county: 'Telemark' },
  { nr: '4030', name: 'Nissedal', county: 'Telemark' },
  { nr: '4034', name: 'Tokke', county: 'Telemark' },
  { nr: '4036', name: 'Vinje', county: 'Telemark' },
  { nr: '4211', name: 'Gjerstad', county: 'Agder' },
  { nr: '4217', name: 'Åmli', county: 'Agder' },
  { nr: '4221', name: 'Valle', county: 'Agder' },
  { nr: '4222', name: 'Bykle', county: 'Agder' },
];

const COUNTIES = [
  { nr: '39', name: 'Vestfold' },
  { nr: '40', name: 'Telemark' },
  { nr: '42', name: 'Agder' },
];

// --- Douglas-Peucker simplification on [lng, lat] rings -------------------

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const cx = a[0] + Math.max(0, Math.min(1, t)) * dx;
  const cy = a[1] + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDist = -1;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [first, last];
  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

function simplifyRing(ring, tolerance) {
  // Keep the ring closed: simplify the open portion, then re-close it.
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const open = closed ? ring.slice(0, -1) : ring;
  const simplified = douglasPeucker(open, tolerance);
  if (simplified.length < 4) return null; // degenerate after simplification
  simplified.push(simplified[0]);
  return simplified.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
}

function bboxDiagonal(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

// minRingDiag drops tiny skerries that add bytes but no visual information.
function simplifyMultiPolygon(geometry, tolerance, minRingDiag) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (bboxDiagonal(outer) < minRingDiag) continue;
    const rings = [];
    for (const ring of polygon) {
      const s = simplifyRing(ring, tolerance);
      if (s && (rings.length === 0 || bboxDiagonal(ring) >= minRingDiag)) rings.push(s);
    }
    if (rings.length > 0) out.push(rings);
  }
  return { type: 'MultiPolygon', coordinates: out };
}

function countPoints(geometry) {
  return geometry.coordinates.flat(1).reduce((n, ring) => n + ring.length, 0);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function main() {
  await mkdir('public/data', { recursive: true });

  const kommuneFeatures = [];
  for (const m of MUNICIPALITIES) {
    const data = await fetchJson(`${API}/kommuner/${m.nr}/omrade?utkoordsys=4326`);
    const before = countPoints(data.omrade);
    const geometry = simplifyMultiPolygon(data.omrade, 0.0008, 0.004);
    console.log(`kommune ${m.nr} ${m.name}: ${before} -> ${countPoints(geometry)} pts`);
    kommuneFeatures.push({
      type: 'Feature',
      properties: { nr: m.nr, name: m.name, county: m.county },
      geometry,
    });
  }
  const kommuner = {
    type: 'FeatureCollection',
    license: 'Boundary data © Kartverket, CC BY 4.0, via ws.geonorge.no/kommuneinfo (2024 boundaries)',
    features: kommuneFeatures,
  };
  await writeFile('public/data/kommuner.geojson', JSON.stringify(kommuner));

  const fylkeFeatures = [];
  for (const c of COUNTIES) {
    const data = await fetchJson(`${API}/fylker/${c.nr}/omrade?utkoordsys=4326`);
    const before = countPoints(data.omrade);
    const geometry = simplifyMultiPolygon(data.omrade, 0.0012, 0.006);
    console.log(`fylke ${c.nr} ${c.name}: ${before} -> ${countPoints(geometry)} pts`);
    fylkeFeatures.push({
      type: 'Feature',
      properties: { nr: c.nr, name: c.name },
      geometry,
    });
  }
  const fylker = {
    type: 'FeatureCollection',
    license: 'Boundary data © Kartverket, CC BY 4.0, via ws.geonorge.no/kommuneinfo (2024 boundaries)',
    features: fylkeFeatures,
  };
  await writeFile('public/data/fylker.geojson', JSON.stringify(fylker));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
