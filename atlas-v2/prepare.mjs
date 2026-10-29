// Build the data files for the Urban Sea Atlas (v2) from the derived
// snapshots in atlas-src/. Node built-ins only.
//
//   node atlas-v2/prepare.mjs
//
// Writes site/data/catalog.js and site/data/case-<id>.js. Each file is a
// plain <script> that assigns to window.*, so the atlas opens from a local
// folder (file://) as well as from a web host.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', 'atlas-src');
const out = path.join(here, 'site', 'data');
const read = async f => JSON.parse(await fs.readFile(path.join(src, f), 'utf8'));

const rows = await read('dist/data.json');
const locations = await read('global-locations.json');
const rankings = await read('rankings-data.json');
const analysis = await read('catalog-analysis.json');
const workspace = await read('workspace-data.json');
const studio = await read('studio-data.json');
const oahu = await read('oahu-geography-addition.json');
const source = await read('source.json');
// Cases added in v2 (built by extra-cases.py; narrative in extra-cases-content.json).
const readHere = async f => JSON.parse(await fs.readFile(path.join(here, f), 'utf8'));
const extraGeo = await readHere('extra-cases.json');
const extraContent = await readHere('extra-cases-content.json');

if (rankings.source.sha256 !== source.sha256 || locations.source.catalog.sha256 !== source.sha256)
  throw Error('Rankings or locations belong to a different workbook than source.json.');

// ---------- geometry helpers ----------
const r4 = n => Math.round(n * 1e4) / 1e4;
function roundCoords(c) {
  if (typeof c[0] === 'number') return [r4(c[0]), r4(c[1])];
  const mapped = c.map(roundCoords);
  if (mapped.length && typeof mapped[0][0] === 'number') {
    // a ring or line: drop repeated points created by rounding
    const kept = mapped.filter((p, i) => i === 0 || p[0] !== mapped[i - 1][0] || p[1] !== mapped[i - 1][1]);
    return kept.length >= 2 ? kept : mapped.slice(0, 2);
  }
  return mapped;
}
// Douglas-Peucker on a single line or ring (coordinates in degrees).
function simplifyLine(pts, tol, closed) {
  if (!tol || pts.length < (closed ? 6 : 3)) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > t2) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= (closed ? 4 : 2) ? out : pts;
}
function simplifyCoords(c, tol, closed) {
  if (typeof c[0][0] === 'number') return simplifyLine(c, tol, closed);
  return c.map(x => simplifyCoords(x, tol, closed));
}
let TOL = 0;
const geom = g => {
  if (!g) return g;
  const closed = /Polygon/.test(g.type);
  const simple = g.type === 'Point' || !g.coordinates.length ? g.coordinates : simplifyCoords(g.coordinates, TOL, closed);
  return {type: g.type, coordinates: roundCoords(simple)};
};
// Display tolerances in degrees (0.004 is about 400 m), chosen for regional maps.
const withTol = (tol, fn) => { const prev = TOL; TOL = tol; try { return fn(); } finally { TOL = prev; } };
// Line and polygon coordinates are stored as flat integer deltas at 1/SCALE
// degree; atlas.js decodes them. 1000 is about 110 m, below the display tolerance.
let SCALE = 1000;
function encodeLine(pts) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of pts) {
    const ix = Math.round(x * SCALE), iy = Math.round(y * SCALE);
    if (out.length && ix === px && iy === py) continue;
    out.push(ix - px, iy - py);
    px = ix; py = iy;
  }
  return out;
}
const encodeCoords = c => (typeof c[0][0] === 'number' ? encodeLine(c) : c.map(encodeCoords));
function encodeFC(collection) {
  for (const f of collection.features) {
    if (f.geometry && f.geometry.type !== 'Point' && f.geometry.coordinates.length) f.geometry.coordinates = encodeCoords(f.geometry.coordinates);
  }
  collection.enc = SCALE;
  return collection;
}
const fc = features => ({type: 'FeatureCollection', features});
const feature = (g, properties, id) => ({type: 'Feature', ...(id !== undefined ? {id} : {}), properties, geometry: geom(g)});
const num = v => (v === null || v === undefined || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ---------- catalog ----------
const locById = new Map(locations.records.map(r => [r.id, r]));
const caseByEntry = new Map(workspace.catalogLinks.map(l => [l.recordId, l.caseId]));
for (const c of [...studio.cases, ...extraContent.cases]) if (!caseByEntry.has(c.entry)) caseByEntry.set(c.entry, c.id);
const groupsByEntry = new Map();
for (const g of analysis.groups) for (const id of g.entryIds) {
  if (!groupsByEntry.has(id)) groupsByEntry.set(id, []);
  groupsByEntry.get(id).push(g.id);
}

const entries = rows.map(r => {
  const loc = locById.get(r.id);
  const ranks = {};
  for (const [axis, v] of Object.entries(rankings.recordIndex[r.id]?.axes || {})) ranks[axis] = [v.rank, v.band, v.value];
  return {
    id: r.id, name: r.name, country: r.country, region: r.region,
    tier: r.tier, water: r.water, type: r.type, connection: r.connection,
    distance: num(r.distance), distanceText: r.distance ?? null,
    watershed: r.watershed, watershedTier: num(r.watershedTier),
    population: num(r.population), gdp: num(r.gdp), containers: num(r.containers),
    cargo: r.cargo, cargoNote: r.cargoNote, note: r.note,
    hinterland: num(r.hinterland), ecology: num(r.ecology),
    corridor: num(r.corridor), economicMass: num(r.economicMass), gateway: num(r.gateway),
    waterVulnerability: num(r.waterVulnerability), biodiversity: num(r.biodiversity), ecoPressure: num(r.ecoPressure),
    strategic: r.strategicFlag === 'Y' || r.strategic === true,
    crossBorder: r.crossBorderFlag === 'Y' || r.crossBorder === true,
    sourceRow: r.sourceRow ?? rankings.recordIndex[r.id]?.masterRow ?? null,
    location: loc?.status || 'unresolved',
    locationNote: loc?.reason || '',
    points: (loc?.points || []).map(p => [r4(p.lon), r4(p.lat), p.name]),
    ranks,
    caseId: caseByEntry.get(r.id) || null,
    groups: groupsByEntry.get(r.id) || [],
  };
});

const axes = rankings.axes.map(a => ({
  id: a.id, name: a.name, key: a.key, unit: a.unit, description: a.description,
  method: a.method, bands: a.bands.map(b => b.label),
  components: (a.components || []).map(c => ({key: c.key, name: c.name, meaning: c.meaning})),
}));

const geoFor = id => studio.geography.cases[id] || extraGeo.cases[id];
const cases = [...studio.cases, ...extraContent.cases].map(c => {
  const g = geoFor(c.id);
  return {
    id: c.id, name: c.name, kind: c.kind, question: c.question, tagline: c.tagline,
    entry: c.entry, family: c.family, point: c.point,
    extent: g.extent, local: g.local, parentLabel: g.parentLabel,
    level: g.hydrobasinsLevel || 6,
    facts: c.facts, lenses: c.lenses,
  };
});

const catalog = {
  source: {filename: source.filename, definitionReference: source.definitionReference, sha256: source.sha256},
  counts: {...analysis.counts, ...locations.counts},
  limits: analysis.limits,
  entries, axes,
  groups: analysis.groups.map(g => ({id: g.id, name: g.name, entryIds: g.entryIds})),
  cases,
  sources: {...studio.sources, ...extraContent.sources},
  lakes: studio.lakes,
  research: studio.research,
  waterPressure: {
    source: studio.waterPressure.source, release: studio.waterPressure.release,
    url: studio.waterPressure.url, citation: studio.waterPressure.citation,
    baseline: studio.waterPressure.baseline, labels: studio.waterPressure.labels,
  },
  geographySources: studio.geography.method,
  oahuSources: oahu.sources,
};

// ---------- case geography ----------
const wp = {...studio.waterPressure.values, ...extraGeo.aqueduct};
const cat = (pfaf, k) => {
  const v = wp[pfaf]?.[k];
  return v ? v[2] : null;
};

function caseLayers(id) {
  const g = geoFor(id);
  const L = g.layers;
  const basins = withTol(0.004, () => fc(g.basins.map(b => feature(b.geometry, {
    id: b.id, down: b.down, area: b.area, up: b.up, order: b.order, coast: b.coast, endo: b.endo, pfaf: b.pfaf,
    bws: cat(b.aqPfaf || b.pfaf, 'bws'), bwd: cat(b.aqPfaf || b.pfaf, 'bwd'), iav: cat(b.aqPfaf || b.pfaf, 'iav'), sev: cat(b.aqPfaf || b.pfaf, 'sev'),
  }, b.id))));
  const rivers = withTol(0.003, () => fc([...(L.rivers_lake_centerlines || []), ...(L.rivers_north_america || [])]
    .map(r => feature(r.geometry, {name: r.name || '', rank: r.rank ?? 10}))));
  const lakes = withTol(0.002, () => fc((L.lakes || []).map(r => feature(r.geometry, {name: r.name || ''}))));
  const marine = withTol(0.01, () => fc((L.geography_marine_polys || []).map(r => feature(r.geometry, {name: r.name || ''}))));
  const borders = withTol(0.005, () => fc([
    ...(L.admin_0_boundary_lines_land || []).map(r => feature(r.geometry, {level: 0})),
    ...(L.admin_1_states_provinces_lines || []).map(r => feature(r.geometry, {level: 1})),
  ]));
  const ports = fc((L.ports || []).map(r => feature(r.geometry, {name: r.name || ''})));
  const cities = fc((L.populated_places_simple || []).map(r => feature(r.geometry, {name: r.name || '', rank: r.rank ?? 5, basin: r.basin ?? null})));
  const data = {id, parent: g.parent, basins, rivers, lakes, marine, borders, ports, cities};
  if (id === 'oahu') TOL = 0.0003; // about 30 m on a small island
  if (id === 'oahu') {
    data.watersheds = fc(oahu.watersheds.map((w, i) => feature(w.geometry, {
      fid: i, name: w.name, code: w.sourceId, area: r4(w.areaKm2),
    }, i)));
    data.streams = fc(oahu.streams.map(s => feature(s.geometry, {
      name: s.name, type: s.classification, km: r4(s.lengthKm),
    })));
    data.aquifers = fc(oahu.aquifers.map((a, i) => feature(a.geometry, {
      fid: i, name: a.name, code: a.systemCode, sector: a.properties.SECTOR, yield: a.sustainableYieldMgd, area: r4(a.areaKm2),
    }, i)));
  }
  TOL = 0;
  SCALE = id === 'oahu' ? 10000 : 1000;
  for (const v of Object.values(data)) if (v && v.type === 'FeatureCollection') encodeFC(v);
  return data;
}

// Low-zoom world layer (Natural Earth 1:110m, public domain). The globe view
// draws this instead of downloading full-detail street tiles.
const ne = async f => JSON.parse(await fs.readFile(path.join(here, 'source', f), 'utf8'));
const world = {};
TOL = 0.05; SCALE = 100;
world.land = encodeFC(fc((await ne('ne_110m_land.geojson')).features.map(f => feature(f.geometry, {}))));
world.lakes = encodeFC(fc((await ne('ne_110m_lakes.geojson')).features.map(f => feature(f.geometry, {}))));
world.borders = encodeFC(fc((await ne('ne_110m_admin_0_boundary_lines_land.geojson')).features.map(f => feature(f.geometry, {}))));
TOL = 0; SCALE = 1000;

await fs.mkdir(out, {recursive: true});
const write = async (file, name, value) => {
  const body = `window.${name}=${JSON.stringify(value)};\n`;
  await fs.writeFile(path.join(out, file), body);
  return [file, (body.length / 1e6).toFixed(2) + ' MB'];
};
const written = [await write('catalog.js', 'ATLAS_CATALOG', catalog), await write('world.js', 'ATLAS_WORLD', world)];
for (const c of [...studio.cases, ...extraContent.cases]) {
  written.push(await write(`case-${c.id}.js`, `ATLAS_CASE_${c.id.toUpperCase()}`, caseLayers(c.id)));
}

// Urban Sea Systems (draft): survey entries grouped by the Greene and Delaney (2025)
// definition, built by systems/draft.py. Loaded only when the Systems view opens.
const sysDir = path.join(here, 'systems');
try {
  const draft = JSON.parse(await fs.readFile(path.join(sysDir, 'draft.json'), 'utf8'));
  const geo = JSON.parse(await fs.readFile(path.join(sysDir, 'systems-geo.json'), 'utf8'));
  const v = draft.variants.enclosed;
  const caseIds = new Map(entries.filter(e => e.caseId).map(e => [e.id, e.caseId]));
  const systems = v.systems.map(s => ({
    id: s.id, name: s.name, by: s.definedBy, seas: s.seas, opens: s.receivingWater,
    members: s.members.map(m => [m.id, Math.round(m.upstreamKm || 0)]),
    countries: s.countries, land: s.watershedKm2, sea: s.seaKm2, area: s.areaKm2,
    size: s.sizeClass, climate: s.climate, lon: s.lon, lat: s.lat, coastal: s.coastalPort,
    caseId: s.members.map(m => caseIds.get(m.id)).find(Boolean) || null,
  }));
  TOL = 0; SCALE = 100;
  const payload = {
    rule: v.label, definition: draft.definition, semiEnclosed: draft.semiEnclosed,
    versions: Object.fromEntries(Object.entries(draft.variants).map(([k, x]) => [k, x.count])),
    hard: {endorheic: draft.hardCases.endorheic.map(x => x.name), islands: draft.hardCases.islands.map(x => x.name), notMapped: draft.hardCases.notMapped.length},
    systems, land: encodeFC(geo.land), sea: encodeFC(geo.sea),
  };
  TOL = 0; SCALE = 1000;
  written.push(await write('systems.js', 'ATLAS_SYSTEMS', payload));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
console.log(Object.fromEntries(written));
