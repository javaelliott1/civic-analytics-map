import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
const outDir = path.join(root, "web", "data");

const thresholds = [10, 20, 30];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some((value) => value !== ""))
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
    );
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

// EPSG:2263 / NAD83 New York Long Island ftUS inverse projection.
// This keeps the app self-contained when R/proj4 are not available locally.
function makeStatePlaneInverse() {
  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;
  const usFtPerMeter = 3937 / 1200;
  const a = 6378137 * usFtPerMeter;
  const e = Math.sqrt(0.00669438002290);
  const lat1 = 41.03333333333333 * degToRad;
  const lat2 = 40.66666666666666 * degToRad;
  const lat0 = 40.16666666666666 * degToRad;
  const lon0 = -74 * degToRad;
  const falseEasting = 984250;
  const falseNorthing = 0;

  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - e ** 2 * Math.sin(phi) ** 2);
  const t = (phi) => {
    const sinPhi = Math.sin(phi);
    return (
      Math.tan(Math.PI / 4 - phi / 2) /
      ((1 - e * sinPhi) / (1 + e * sinPhi)) ** (e / 2)
    );
  };

  const n = Math.log(m(lat1) / m(lat2)) / Math.log(t(lat1) / t(lat2));
  const f = m(lat1) / (n * t(lat1) ** n);
  const rho0 = a * f * t(lat0) ** n;

  return function inverse(x, y) {
    const dx = x - falseEasting;
    const dy = rho0 - (y - falseNorthing);
    const rho = Math.sign(n) * Math.sqrt(dx ** 2 + dy ** 2);
    const theta = Math.atan2(dx, dy);
    const tt = (rho / (a * f)) ** (1 / n);
    let phi = Math.PI / 2 - 2 * Math.atan(tt);

    for (let i = 0; i < 8; i += 1) {
      const sinPhi = Math.sin(phi);
      phi =
        Math.PI / 2 -
        2 *
          Math.atan(
            tt * ((1 - e * sinPhi) / (1 + e * sinPhi)) ** (e / 2),
          );
    }

    const lon = lon0 + theta / n;
    return [lon * radToDeg, phi * radToDeg];
  };
}

function geometryToRings(geometryText, inverse) {
  const rings = [];
  const vectorPattern = /c\(([^()]*)\)/g;
  let match;

  while ((match = vectorPattern.exec(geometryText))) {
    const values = match[1]
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Number.isFinite);

    if (values.length < 8 || values.length % 2 !== 0) continue;

    const half = values.length / 2;
    const ring = [];
    for (let i = 0; i < half; i += 1) {
      ring.push(inverse(values[i], values[i + half]));
    }

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push(first);
    }
    rings.push(ring);
  }

  return rings;
}

function makeTractGeoJson(acsRows) {
  const inverse = makeStatePlaneInverse();
  const features = acsRows
    .map((row) => {
      const rings = geometryToRings(row.geometry, inverse);
      if (!rings.length) return null;

      return {
        type: "Feature",
        properties: {
          geoid: String(row.GEOID),
          name: row.NAME,
          total_pop: Number(row.demo_total_pop) || null,
          median_income: Number(row.demo_median_income) || null,
          median_rent: Number(row.demo_med_rent) || null,
        },
        geometry: {
          type: rings.length === 1 ? "Polygon" : "MultiPolygon",
          coordinates: rings.length === 1 ? [rings[0]] : rings.map((ring) => [ring]),
        },
      };
    })
    .filter(Boolean);

  return { type: "FeatureCollection", features };
}

function makePublicSpaceGeoJson(publicSpaces) {
  const seen = new Set();
  const features = [];

  for (const row of publicSpaces) {
    if (!row.space_id || seen.has(row.space_id)) continue;
    const longitude = Number(row.longitude);
    const latitude = Number(row.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    seen.add(row.space_id);

    features.push({
      type: "Feature",
      properties: {
        space_id: row.space_id,
        type: row.type,
        subtype: row.subtype,
        name: row.name || row.space_id,
        location: row.location,
        url: row.url,
        description: row.description,
      },
      geometry: { type: "Point", coordinates: [longitude, latitude] },
    });
  }

  return { type: "FeatureCollection", features };
}

function makeAccessRows(rows) {
  return rows
    .map((row) => ({
      geoid: String(row.geoid),
      space_id: row.space_id,
      type: row.type,
      min_walk: Number(row.min_walk),
    }))
    .filter((row) => row.geoid && row.space_id && Number.isFinite(row.min_walk))
    .sort((a, b) => a.geoid.localeCompare(b.geoid) || a.min_walk - b.min_walk);
}

function makeSummaries(accessRows) {
  const byTract = new Map();

  for (const row of accessRows) {
    if (!byTract.has(row.geoid)) {
      byTract.set(row.geoid, {
        geoid: row.geoid,
        total_10: 0,
        total_20: 0,
        total_30: 0,
        by_type: {},
      });
    }
    const summary = byTract.get(row.geoid);
    if (!summary.by_type[row.type]) {
      summary.by_type[row.type] = { total_10: 0, total_20: 0, total_30: 0 };
    }

    for (const threshold of thresholds) {
      if (row.min_walk <= threshold) {
        summary[`total_${threshold}`] += 1;
        summary.by_type[row.type][`total_${threshold}`] += 1;
      }
    }
  }

  return [...byTract.values()].sort((a, b) => a.geoid.localeCompare(b.geoid));
}

await mkdir(outDir, { recursive: true });

const [acsRows, publicSpaces, accessSourceRows] = await Promise.all([
  readFile(path.join(dataDir, "nyc_acs.csv"), "utf8").then(parseCsv),
  readFile(path.join(dataDir, "nyc-public-space.csv"), "utf8").then(parseCsv),
  readFile(path.join(dataDir, "ps_and_centroids.csv"), "utf8").then(parseCsv),
]);

const tracts = makeTractGeoJson(acsRows);
const spaces = makePublicSpaceGeoJson(publicSpaces);
const accessRows = makeAccessRows(accessSourceRows);
const summaries = makeSummaries(accessRows);

const accessCsv = [
  "geoid,space_id,type,min_walk",
  ...accessRows.map((row) =>
    [row.geoid, row.space_id, row.type, row.min_walk.toFixed(2)].map(csvEscape).join(","),
  ),
].join("\n");

await Promise.all([
  writeFile(path.join(outDir, "tracts.geojson"), JSON.stringify(tracts)),
  writeFile(path.join(outDir, "public_spaces.geojson"), JSON.stringify(spaces)),
  writeFile(path.join(outDir, "tract_space_access.csv"), accessCsv),
  writeFile(path.join(outDir, "tract_summaries.json"), JSON.stringify(summaries)),
]);

console.log(`Wrote ${tracts.features.length} tracts`);
console.log(`Wrote ${spaces.features.length} public spaces`);
console.log(`Wrote ${accessRows.length} tract-space access rows`);
console.log(`Wrote ${summaries.length} tract summaries`);
