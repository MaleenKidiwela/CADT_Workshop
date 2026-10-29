/* Urban Sea Atlas v2. Plain JavaScript on MapLibre GL. */
(() => {
'use strict';

const C = window.ATLAS_CATALOG;
const E = C.entries;
const byId = new Map(E.map(e => [e.id, e]));
const axisById = Object.fromEntries(C.axes.map(a => [a.id, a]));
const caseById = Object.fromEntries(C.cases.map(c => [c.id, c]));
const groupById = Object.fromEntries(C.groups.map(g => [g.id, g]));

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const short = name => String(name).split(' (')[0];
const isNarrow = () => matchMedia('(max-width: 900px)').matches;
function fmt(v, d = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return (+v.toFixed(d)).toString();
  return (+v.toFixed(Math.max(d, 2))).toString();
}

// ---------- fields ----------
const NUM = [
  {key: 'population', label: 'Metro population', unit: 'million people', log: true, c: 0.1},
  {key: 'gdp', label: 'Metro GDP', unit: 'USD billions', log: true, c: 1},
  {key: 'containers', label: 'Container throughput', unit: 'thousand TEU', log: true, c: 10},
  {key: 'distance', label: 'Inland distance', unit: 'km', log: true, c: 10},
  {key: 'watershedScore', label: 'Watershed size', unit: 'score 1 to 5', ordinal: true, get: e => e.watershedTier == null ? null : 6 - e.watershedTier},
  {key: 'hinterland', label: 'Hinterland reach', unit: 'score 1 to 5'},
  {key: 'ecology', label: 'Ecological stakes', unit: 'score 1 to 5'},
  {key: 'corridor', label: 'Corridor component', unit: '1 to 5', ordinal: true},
  {key: 'economicMass', label: 'Economic mass component', unit: '1 to 5', ordinal: true},
  {key: 'gateway', label: 'Gateway component', unit: '1 to 5', ordinal: true},
  {key: 'waterVulnerability', label: 'Water vulnerability component', unit: '1 to 5', ordinal: true},
  {key: 'biodiversity', label: 'Biodiversity component', unit: '1 to 5', ordinal: true},
  {key: 'ecoPressure', label: 'Pressure component', unit: '1 to 5', ordinal: true},
];
const numByKey = Object.fromEntries(NUM.map(f => [f.key, f]));
const val = (e, key) => {
  const f = numByKey[key];
  const v = f && f.get ? f.get(e) : e[key];
  return v === null || v === undefined || !Number.isFinite(v) ? null : v;
};

// ---------- palettes ----------
const count = (arr, fn) => { const m = new Map(); for (const x of arr) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
const byCount = fn => [...count(E, fn)].sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(x => x !== null && x !== undefined && x !== '');
const TYPE_COLORS = {'Open coast': '#5b8db8', 'Estuary/Delta': '#1b9e77', 'Bay': '#2c5d8f', 'River': '#d9711c', 'Gulf': '#7b6fd0', 'Strait': '#a05195', 'Lake': '#e3a21a', 'Lagoon': '#2fb5ad', 'Fjord': '#4b5a8a', 'Inland sea': '#c2456b', 'Semi-enclosed': '#8a3b12'};
const QUAL = ['#2c7fb8', '#e6812f', '#2ca25f', '#d1495b', '#7b6fd0', '#8c6d31', '#e377c2', '#5c6f7b', '#b5bd2b', '#17becf'];
const BAND = ['#0b3c5d', '#1d6a8a', '#3a9b9b', '#86c5a4', '#d4ebc2'];
const COLOR_BY = {
  type: {label: 'Water setting', cats: byCount(e => e.type), color: k => TYPE_COLORS[k] || '#888', get: e => e.type},
  tier: {label: 'Marine or inland', cats: ['M', 'I'], names: {M: 'Marine', I: 'Inland'}, color: k => ({M: '#2c5d8f', I: '#d9711c'}[k]), get: e => e.tier},
  region: {label: 'Region', cats: byCount(e => e.region), color: null, get: e => e.region},
  cargo: {label: 'Cargo focus', cats: byCount(e => e.cargo), color: null, get: e => e.cargo},
  band: {label: 'Ranking band', dynamic: true, get: e => e.ranks[S.axis]?.[1]},
};
for (const k of ['region', 'cargo']) { const cb = COLOR_BY[k]; cb.color = c => QUAL[cb.cats.indexOf(c) % QUAL.length]; }
function colorScheme() {
  const cb = COLOR_BY[S.colorBy];
  if (cb.dynamic) {
    const bands = axisById[S.axis].bands;
    return {...cb, label: `${axisById[S.axis].name} band`, cats: bands, color: k => BAND[bands.indexOf(k)] || '#999'};
  }
  return cb;
}
const SIZE_BY = {population: 'Metro population', gdp: 'Metro GDP', containers: 'Container throughput', none: 'Same size'};
const AQ = {
  bws: 'Baseline water stress', bwd: 'Baseline water depletion', iav: 'Year-to-year variability', sev: 'Seasonal variability',
};
const AQ_COLORS = {'-1': '#9a9a9a', 0: '#fff7b0', 1: '#ffd54a', 2: '#ff9a1f', 3: '#f2441d', 4: '#9b0f0f'};
const aqLabel = (k, c) => (C.waterPressure.labels[k]?.[c] || [''])[0] || (c === null ? 'No data' : String(c));

// ---------- state ----------
const S = {
  mode: 'explore',
  q: '', tier: '', regions: new Set(), types: new Set(), bands: new Set(),
  strategic: false, crossBorder: false, hasCase: false, group: '',
  brush: null, pattern: null, hidden: new Set(), topN: 0,
  colorBy: 'type', sizeBy: 'population',
  selected: null, hover: null,
  tab: 'rank', wide: false,
  axis: 'A', weights: null,
  cx: 'population', cy: 'gdp',
  listView: false, listSort: 'population',
  caseId: 'salish', lens: 'water', indicator: 'bws', basin: null, oahuLayer: 'watersheds',
  layers: {basins: true, rivers: true, lakes: true, marine: true, borders: true, cities: true, ports: true, entries: true},
};

// ---------- filtering ----------
const popBand = e => e.ranks.A?.[1];
function passes(e, skip = '') {
  if (S.q) {
    const hay = `${e.name} ${e.country} ${e.water} ${e.watershed} ${e.region}`.toLowerCase();
    if (!S.q.toLowerCase().split(/\s+/).every(t => hay.includes(t))) return false;
  }
  if (S.tier && e.tier !== S.tier) return false;
  if (skip !== 'region' && S.regions.size && !S.regions.has(e.region)) return false;
  if (skip !== 'type' && S.types.size && !S.types.has(e.type)) return false;
  if (skip !== 'band' && S.bands.size && !S.bands.has(popBand(e))) return false;
  if (S.strategic && !e.strategic) return false;
  if (S.crossBorder && !e.crossBorder) return false;
  if (S.hasCase && !e.caseId) return false;
  if (S.group && !groupById[S.group].entryIds.includes(e.id)) return false;
  if (skip !== 'brush' && S.brush && !S.brush.has(e.id)) return false;
  if (skip !== 'legend' && S.hidden.size && S.hidden.has(String(colorScheme().get(e)))) return false;
  if (S.topN) { const r = rankFor(e); if (r === null || r > S.topN) return false; }
  return true;
}
let visible = E;
let visibleSet = new Set(E.map(e => e.id));
function refilter() {
  visible = E.filter(e => passes(e));
  visibleSet = new Set(visible.map(e => e.id));
}

// ---------- rankings ----------
const defaultWeights = () => axisById[S.axis].components.map(() => 1);
const isScenario = () => !!(S.weights && axisById[S.axis].components.length && S.weights.some(w => w !== 1));
let rankCache = null;
function rankTable() {
  if (rankCache) return rankCache;
  const ax = axisById[S.axis];
  const scen = isScenario();
  const rows = E.map(e => {
    const src = e.ranks[ax.id];
    let v = src ? src[2] : null;
    if (scen) {
      const sum = S.weights.reduce((a, b) => a + b, 0);
      const parts = ax.components.map(c => e[c.key]);
      v = sum > 0 && parts.every(p => p !== null) ? ax.components.reduce((a, c, i) => a + e[c.key] * S.weights[i], 0) / sum : null;
    }
    return {e, v, src: src ? src[0] : null, band: src ? src[1] : null};
  });
  const sorted = rows.filter(r => r.v !== null).map(r => r.v).sort((a, b) => b - a);
  for (const r of rows) {
    if (r.v === null) { r.rank = null; continue; }
    if (!scen) { r.rank = r.src; continue; }
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] > r.v + 1e-9) lo = m + 1; else hi = m; }
    r.rank = lo + 1; // Excel RANK: ties share the best rank
  }
  rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.e.name.localeCompare(b.e.name));
  rankCache = {rows, byId: new Map(rows.map(r => [r.e.id, r])), scen};
  return rankCache;
}
const rankFor = e => rankTable().byId.get(e.id)?.rank ?? null;

// ---------- map ----------
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const FALLBACK_STYLE = {version: 8, sources: {}, layers: [{id: 'background', type: 'background', paint: {'background-color': '#d6e4ea'}}]};
const map = new maplibregl.Map({
  container: 'map', style: STYLE, center: [15, 22], zoom: 2.1, minZoom: 1, maxZoom: 13,
  attributionControl: {compact: true, customAttribution: 'Survey: Urban Sea Systems · Natural Earth · HydroBASINS · WRI Aqueduct'},
  dragRotate: false, pitchWithRotate: false,
});
map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');
if (maplibregl.GlobeControl) map.addControl(new maplibregl.GlobeControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({maxWidth: 110}), 'bottom-left');
map.touchZoomRotate.disableRotation();

let styleFailed = false;
const styleTimer = setTimeout(() => { if (!map.isStyleLoaded()) useFallback(); }, 9000);
map.on('error', e => {
  if (!styleFailed && !map.isStyleLoaded() && /style|openfreemap/i.test(String(e?.error?.message || e?.error?.url || ''))) useFallback();
});
function useFallback() {
  if (styleFailed) return;
  styleFailed = true;
  map.setStyle(FALLBACK_STYLE);
  toast('Basemap unavailable (offline?). Showing atlas layers only.');
}

const fidsByEntry = new Map();
function entriesGeoJSON() {
  const cs = colorScheme();
  const sizeVals = S.sizeBy === 'none' ? [] : E.map(e => e[S.sizeBy]).filter(v => v !== null);
  const maxV = Math.max(...sizeVals, 1);
  fidsByEntry.clear();
  const features = [];
  let fid = 0;
  const showAll = S.mode === 'cases';
  for (const e of (showAll ? E : visible)) {
    if (!e.points.length) continue;
    const v = S.sizeBy === 'none' ? null : e[S.sizeBy];
    const r = S.sizeBy === 'none' ? 5 : v === null ? 3 : 3 + 17 * Math.sqrt(v / maxV);
    const k = cs.get(e);
    const caseLinked = showAll && (e.caseId === S.caseId || e.groups.includes(caseById[S.caseId]?.family));
    for (const p of e.points) {
      features.push({type: 'Feature', id: fid, geometry: {type: 'Point', coordinates: [p[0], p[1]]},
        properties: {eid: e.id, name: short(e.name), r, color: showAll ? (caseLinked ? '#e8590c' : '#5f7f8a') : cs.color(k) || '#888', pop: e.population ?? 0, linked: caseLinked ? 1 : 0}});
      if (!fidsByEntry.has(e.id)) fidsByEntry.set(e.id, []);
      fidsByEntry.get(e.id).push(fid++);
    }
  }
  return {type: 'FeatureCollection', features};
}
function selectionGeoJSON() {
  const e = byId.get(S.selected);
  const feats = [];
  if (e && e.points.length) {
    for (const p of e.points) feats.push({type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [p[0], p[1]]}});
    if (e.points.length > 1) feats.push({type: 'Feature', properties: {line: 1}, geometry: {type: 'LineString', coordinates: e.points.map(p => [p[0], p[1]])}});
  }
  return {type: 'FeatureCollection', features: feats};
}

// Below this zoom the globe uses the small Natural Earth layer instead of
// street-detail vector tiles, which are over 1 MB each when zoomed out.
const DETAIL_ZOOM = 3.4;
const SEA = '#c7dbe5', LAND = '#f3f1ea';
let worldData = null;
function worldLayers() {
  if (!worldData) {
    worldData = window.ATLAS_WORLD;
    for (const v of Object.values(worldData)) {
      for (const f of v.features) f.geometry.coordinates = decodeCoords(f.geometry.coordinates, v.enc);
      delete v.enc;
    }
  }
  return worldData;
}
function addAtlasLayers() {
  const tint = (id, prop, value) => { try { if (map.getLayer(id)) map.setPaintProperty(id, prop, value); } catch (_) { /* layer differs */ } };
  tint('water', 'fill-color', SEA);
  // Street-detail basemap only once zoomed in; Natural Earth below that.
  const style = map.getStyle();
  const firstBase = style.layers.find(l => l.source)?.id;
  for (const l of style.layers) {
    if (!l.source) continue;
    map.setLayerZoomRange(l.id, Math.max(l.minzoom || 0, DETAIL_ZOOM), l.maxzoom ?? 24);
  }
  tint('background', 'background-color', styleFailed ? SEA : ['step', ['zoom'], SEA, DETAIL_ZOOM, LAND]);
  const w = worldLayers();
  const maxz = styleFailed ? 24 : DETAIL_ZOOM + 0.05;
  map.addSource('w-land', {type: 'geojson', data: w.land});
  map.addSource('w-lakes', {type: 'geojson', data: w.lakes});
  map.addSource('w-borders', {type: 'geojson', data: w.borders});
  map.addLayer({id: 'w-land', type: 'fill', source: 'w-land', maxzoom: maxz, paint: {'fill-color': LAND}}, firstBase);
  map.addLayer({id: 'w-lakes', type: 'fill', source: 'w-lakes', maxzoom: maxz, paint: {'fill-color': SEA}}, firstBase);
  map.addLayer({id: 'w-borders', type: 'line', source: 'w-borders', maxzoom: maxz, paint: {'line-color': '#c9c4b8', 'line-width': 0.6}}, firstBase);
  try { map.setProjection({type: 'globe'}); } catch (_) { /* older engine */ }
  try { map.setSky({'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0], 'sky-color': '#dfe9ee', 'horizon-color': '#ffffff', 'fog-color': '#ffffff'}); } catch (_) { /* optional */ }

  const glyphs = !styleFailed;
  map.addSource('entries', {type: 'geojson', data: entriesGeoJSON()});
  map.addSource('selection', {type: 'geojson', data: selectionGeoJSON()});
  map.addLayer({id: 'sel-line', type: 'line', source: 'selection', filter: ['==', ['get', 'line'], 1],
    paint: {'line-color': '#e8590c', 'line-width': 2, 'line-dasharray': [2, 1.5]}});
  map.addLayer({id: 'entries', type: 'circle', source: 'entries',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['*', ['get', 'r'], 0.75], 4, ['get', 'r'], 8, ['*', ['get', 'r'], 1.5]],
      'circle-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.15, 0.82],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#102a33', '#ffffff'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 0.9],
    }});
  map.addLayer({id: 'sel-ring', type: 'circle', source: 'selection', filter: ['!=', ['get', 'line'], 1],
    paint: {'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e8590c', 'circle-stroke-width': 3}});
  if (glyphs) {
    map.addLayer({id: 'entry-labels', type: 'symbol', source: 'entries',
      filter: ['any', ['>=', ['get', 'pop'], 8], ['>=', ['zoom'], 4.5]],
      layout: {
        'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5,
        'text-offset': [0, 1.1], 'text-anchor': 'top', 'symbol-sort-key': ['-', 0, ['get', 'pop']],
        'text-optional': true,
      },
      minzoom: 2.2,
      paint: {'text-color': '#142b33', 'text-halo-color': 'rgba(255,255,255,.9)', 'text-halo-width': 1.4}});
  }
  if (S.mode === 'cases') showCase(S.caseId, {fly: !styleSeen});
  styleSeen = true;
}
let styleSeen = false;
map.on('style.load', () => { clearTimeout(styleTimer); syncPadding(); addAtlasLayers(); $('#loading').classList.add('done'); });
window.addEventListener('resize', () => syncPadding());
// milliseconds since navigation, for checking load speed in the console
window.atlasTiming = {script: Math.round(performance.now())};
map.once('style.load', () => { atlasTiming.style = Math.round(performance.now()); });
// Ready once the camera has drawn a frame with the loaded style; waiting for
// 'load' instead would also wait for every first basemap tile.
function markReady() {
  if (mapReady) return;
  mapReady = true;
  atlasTiming.ready = Math.round(performance.now());
  if (pendingFit) { const [b, o] = pendingFit; pendingFit = null; fitBox(b, {...o, duration: 0}); }
}
map.on('style.load', () => map.once('render', markReady));
map.on('load', () => {
  atlasTiming.load = Math.round(performance.now());
  markReady();
  startSpin();
});
map.once('idle', () => { atlasTiming.idle = Math.round(performance.now()); setTimeout(prefetchCases, 1500); });

function refreshEntries() {
  if (!map.getSource('entries')) return;
  try { map.removeFeatureState({source: 'entries'}); } catch (_) { /* nothing to clear */ }
  map.getSource('entries').setData(entriesGeoJSON());
  map.getSource('selection').setData(selectionGeoJSON());
  hoverState = [];
  if (S.hover) setHover(S.hover, 'keep');
}

// hover sync between map, chart and lists
let hoverState = [];
function setHover(id, from) {
  if (from !== 'keep' && S.hover === id) return;
  for (const f of hoverState) map.setFeatureState({source: 'entries', id: f}, {hover: false});
  hoverState = [];
  S.hover = id;
  if (id !== null && map.getSource('entries')) {
    hoverState = fidsByEntry.get(id) || [];
    for (const f of hoverState) map.setFeatureState({source: 'entries', id: f}, {hover: true});
  }
  $$('.chart-wrap circle.dot.hl').forEach(c => c.classList.remove('hl'));
  $$('.hl[data-id]').forEach(c => c.classList.remove('hl'));
  if (id !== null) {
    $$(`[data-id="${id}"]`).forEach(c => c.classList.add('hl'));
    if (from !== 'chart') { const dot = $(`.chart-wrap circle.dot[data-id="${id}"]`); if (dot) dot.parentNode.appendChild(dot); }
  }
}

const tip = $('#tooltip');
function showTip(x, y, html) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, x + 14) + 'px';
  tip.style.top = (y + h + 20 > innerHeight ? y - h - 12 : y + 14) + 'px';
}
const hideTip = () => { tip.hidden = true; };
const entryTip = e => `<b>${esc(e.name)}</b><span>${esc(e.country)} · ${esc(e.type)} · ${e.tier === 'I' ? 'Inland' : 'Marine'}</span><br>${e.population !== null ? fmt(e.population) + ' million people' : 'Population n/a'}${S.mode === 'explore' && rankFor(e) && S.tab === 'rank' ? ` · rank ${rankFor(e)} on ${esc(axisById[S.axis].name.toLowerCase())}` : ''}`;

map.on('mousemove', 'entries', ev => {
  const f = ev.features[0];
  map.getCanvas().style.cursor = 'pointer';
  setHover(f.properties.eid, 'map');
  showTip(ev.originalEvent.clientX, ev.originalEvent.clientY, entryTip(byId.get(f.properties.eid)));
});
map.on('mouseleave', 'entries', () => { map.getCanvas().style.cursor = ''; setHover(null, 'map'); hideTip(); });
map.on('click', 'entries', ev => {
  ev.preventDefault();
  const id = ev.features[0].properties.eid;
  if (S.mode === 'cases') { casePopup(byId.get(id), ev.lngLat); return; }
  select(id, {fly: false});
  syncPadding();
  map.easeTo({center: ev.lngLat, zoom: Math.max(map.getZoom(), 3.5), duration: 900});
});

let popup = null;
function casePopup(e, lngLat) {
  if (popup) popup.remove();
  const at = lngLat || (e.points.length ? [e.points[0][0], e.points[0][1]] : null);
  if (!at) { toast(`${short(e.name)} has no mapped location.`); return; }
  popup = new maplibregl.Popup({closeButton: true, maxWidth: '260px', offset: 12}).setLngLat(at)
    .setHTML(`<b>${esc(e.name)}</b><br><span class="muted">${esc(e.country)} · ${fmt(e.population)} million people</span><br><button class="linkbtn" data-open-entry="${e.id}">Open in Explore</button>`).addTo(map);
}

// gentle globe spin until the first interaction
let spinning = true;
function startSpin() {
  const step = () => {
    if (!spinning || S.mode !== 'explore' || map.getZoom() > 3) return;
    const c = map.getCenter(); c.lng -= 6;
    map.easeTo({center: c, duration: 2400, easing: t => t});
  };
  map.on('moveend', step);
  step();
}
const stopSpin = () => { spinning = false; };
['mousedown', 'touchstart', 'wheel', 'keydown'].forEach(t => window.addEventListener(t, stopSpin, {once: true, passive: true}));

// Panel space is set on the map itself with setPadding. Camera calls must not
// pass `padding`: easeTo/flyTo/jumpTo store it on the map and fitBounds adds
// its own on top, so repeated moves stacked padding until nothing could fit.
let lastPad = '';
function syncPadding() {
  const p = padding(), key = JSON.stringify(p);
  if (key !== lastPad) { lastPad = key; map.setPadding(p); }
}
function safeFit(bounds, opts) {
  syncPadding();
  try { map.fitBounds(bounds, opts); }
  catch (_) {
    const [[w, s], [e, n]] = bounds;
    map.easeTo({center: [(w + e) / 2, (s + n) / 2], duration: opts.duration ?? 1000});
  }
}
function padding() {
  const bottom = tourStep >= 0 ? 190 : 40;
  if (isNarrow()) return {top: 30, bottom: bottom + 20, left: 30, right: 30};
  const right = S.wide ? Math.min(720, innerWidth - 400) : 420;
  return {top: 40, bottom, left: 360, right: right + 20};
}
function flyToEntry(e) {
  if (!e.points.length) return;
  if (e.points.length === 1) {
    syncPadding();
    map.flyTo({center: [e.points[0][0], e.points[0][1]], zoom: Math.max(map.getZoom(), 5), duration: 1400});
  } else {
    const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]);
    safeFit([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], {maxZoom: 7, duration: 1400});
  }
}
function fitEntries(list) {
  const pts = list.flatMap(e => e.points);
  if (!pts.length) return;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  safeFit([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], {maxZoom: 6, duration: 1300});
}

// ---------- selection ----------
function select(id, {fly = true, tab = 'entry'} = {}) {
  stopSpin();
  S.selected = id;
  if (id !== null) S.tab = tab;
  if (map.getSource('selection')) map.getSource('selection').setData(selectionGeoJSON());
  renderRight();
  if (id !== null && fly) flyToEntry(byId.get(id));
  if (isNarrow() && id !== null) openSheet('right');
  saveHash();
}

// ---------- left panel (explore) ----------
const ICON_SEARCH = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function renderLeftExplore() {
  const left = $('#left');
  const cs = colorScheme();
  const types = byCount(e => e.type), regions = byCount(e => e.region), bands = axisById.A.bands;
  const facet = (name, list, set, colorFn) => {
    const counts = count(E.filter(e => passes(e, name)), name === 'region' ? e => e.region : name === 'type' ? e => e.type : popBand);
    return list.map(v => `<button class="chip" data-facet="${name}" data-v="${esc(v)}" aria-pressed="${set.has(v)}">${colorFn ? `<i class="sw" style="background:${colorFn(v)}"></i>` : ''}${esc(v)} <span class="n">${counts.get(v) || 0}</span></button>`).join('');
  };
  const mapped = visible.filter(e => e.points.length).length;
  const legendCounts = count(visible, e => String(cs.get(e)));
  const allLegendCounts = count(E.filter(e => passes({...e}, 'legend')), e => String(cs.get(e)));
  left.innerHTML = `
    <button class="sheet-close btn small" data-close-sheet>Close</button>
    <div class="section">
      <div class="search">${ICON_SEARCH}<input id="q" type="search" placeholder="Search city, country, river…" value="${esc(S.q)}" autocomplete="off" aria-label="Search entries"><kbd>/</kbd><div id="suggest" class="suggest" hidden></div></div>
      <div class="counter"><b>${visible.length}</b><span>of ${E.length} port-metro entries · ${mapped} on the map</span></div>
      <div class="bar-total"><i style="width:${(visible.length / E.length * 100).toFixed(1)}%"></i></div>
      ${S.brush ? `<p class="hint"><span class="badge">${S.pattern ? 'Pattern' : 'Chart selection'}: ${S.brush.size}</span> <button class="linkbtn" data-clear-brush>Clear</button></p>` : ''}
      ${S.topN ? `<p class="hint"><span class="badge">Top ${S.topN} on ${esc(axisById[S.axis].name.toLowerCase())}</span> <button class="linkbtn" data-clear-top>Clear</button></p>` : ''}
    </div>
    <div class="section">
      <span class="label">Connection to the sea</span>
      <div class="seg" role="group">
        ${[['', 'All'], ['M', 'Marine'], ['I', 'Inland']].map(([v, l]) => `<button data-tier="${v}" aria-pressed="${S.tier === v}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="section"><span class="label">Region</span><div class="chips">${facet('region', regions, S.regions)}</div></div>
    <div class="section"><span class="label">Water setting</span><div class="chips">${facet('type', types, S.types, v => TYPE_COLORS[v])}</div></div>
    <div class="section"><span class="label">Metro population</span><div class="chips">${facet('band', bands, S.bands)}</div></div>
    <div class="section">
      <span class="label">Shared waters</span>
      <select class="sel" id="group"><option value="">All river and sea systems</option>${C.groups.map(g => `<option value="${g.id}" ${S.group === g.id ? 'selected' : ''}>${esc(g.name)} (${g.entryIds.length})</option>`).join('')}</select>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="fStrategic" ${S.strategic ? 'checked' : ''}> Strategic flag in survey</label>
      <label class="check"><input type="checkbox" id="fCross" ${S.crossBorder ? 'checked' : ''}> Cross-border flag in survey</label>
      <label class="check"><input type="checkbox" id="fCase" ${S.hasCase ? 'checked' : ''}> Linked to a case study</label>
      <button class="linkbtn" data-reset style="margin-top:6px">Reset all filters</button>
    </div>
    <div class="section">
      <div class="row2">
        <label><span>Color by</span><select class="sel" id="colorBy">${Object.entries(COLOR_BY).map(([k, v]) => `<option value="${k}" ${S.colorBy === k ? 'selected' : ''}>${k === 'band' ? 'Ranking band' : v.label}</option>`).join('')}</select></label>
        <label><span>Size by</span><select class="sel" id="sizeBy">${Object.entries(SIZE_BY).map(([k, v]) => `<option value="${k}" ${S.sizeBy === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="legend">${cs.cats.map(k => `<button data-legend="${esc(k)}" class="${S.hidden.has(String(k)) ? 'off' : ''}"><i class="sw" style="background:${cs.color(k)}"></i>${esc(cs.names?.[k] || k)}<span class="n">${legendCounts.get(String(k)) || (S.hidden.has(String(k)) ? allLegendCounts.get(String(k)) || 0 : 0)}</span></button>`).join('')}</div>
      <p class="hint">Click a legend item to hide or show it.</p>
      ${S.sizeBy !== 'none' ? sizeLegend() : ''}
    </div>`;
}
function sizeLegend() {
  const vals = E.map(e => e[S.sizeBy]).filter(v => v !== null);
  const max = Math.max(...vals);
  const unit = {population: 'M people', gdp: '$B', containers: 'k TEU'}[S.sizeBy];
  const steps = [max, max / 4, max / 25].map(v => +v.toPrecision(1));
  return `<div class="size-legend">${steps.map(v => { const d = 2 * (3 + 17 * Math.sqrt(v / max)); return `<div><i style="width:${d}px;height:${d}px"></i>${fmt(v)} ${unit}</div>`; }).join('')}</div>`;
}

// search suggestions
let sugIndex = -1;
function suggestions(q) {
  if (!q) return [];
  const t = q.toLowerCase();
  const score = e => {
    const n = e.name.toLowerCase();
    if (n.startsWith(t)) return 0;
    if (n.includes(t)) return 1;
    if (`${e.country} ${e.water} ${e.watershed}`.toLowerCase().includes(t)) return 2;
    return 9;
  };
  return E.map(e => [score(e), e]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || (b[1].population || 0) - (a[1].population || 0)).slice(0, 7).map(x => x[1]);
}
function renderSuggest() {
  const box = $('#suggest');
  if (!box) return;
  const list = suggestions(S.q);
  box.hidden = !list.length || document.activeElement !== $('#q');
  box.innerHTML = list.map((e, i) => `<button data-pick="${e.id}" class="${i === sugIndex ? 'active' : ''}">${esc(e.name)}<small>${esc(e.country)} · ${esc(e.water)}</small></button>`).join('');
}

// ---------- right panel ----------
function renderRight() {
  const right = $('#right');
  right.classList.toggle('wide', S.wide && S.mode === 'explore');
  if (S.mode === 'cases') { renderRightCases(); return; }
  const tabs = [['entry', 'Entry'], ['rank', 'Rankings'], ['chart', 'Chart'], ['patterns', 'Patterns'], ['list', 'List']];
  right.innerHTML = `
    <div class="tabs" role="tablist">
      ${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}
      <span class="spacer"></span>
      <button class="icon" data-wide title="${S.wide ? 'Narrow panel' : 'Widen panel'}" aria-label="${S.wide ? 'Narrow panel' : 'Widen panel'}">${S.wide ? '⇥' : '⇤'}</button>
      <button class="icon sheet-close" data-close-sheet aria-label="Close">✕</button>
    </div>
    <div class="tabbody" id="tabbody"></div>`;
  const body = $('#tabbody');
  if (S.tab === 'entry') body.innerHTML = entryHTML();
  if (S.tab === 'rank') renderRankings(body);
  if (S.tab === 'chart') renderChart(body);
  if (S.tab === 'patterns') renderPatterns(body);
  if (S.tab === 'list') renderList(body);
}

function entryHTML() {
  const e = byId.get(S.selected);
  if (!e) {
    return `<p class="kicker">No entry selected</p><h2 class="entry-title">Pick a place</h2>
      <p class="muted">Click a circle on the map, a row in Rankings or List, or a dot in the Chart. Or try one of these:</p>
      <div class="similar">${[464, 119, 108, 461, 300, 16].map(id => byId.get(id)).filter(Boolean).map(x => `<button data-select="${x.id}" data-id="${x.id}"><span>${esc(x.name)}</span><small>${esc(x.country)} · ${fmt(x.population)} million people</small></button>`).join('')}</div>`;
  }
  const scheme = COLOR_BY.type;
  const ranks = C.axes.map(a => {
    const r = e.ranks[a.id];
    if (!r) return '';
    const pos = (r[0] - 1) / (E.length - 1) * 100;
    return `<button class="rankrow" data-goto-axis="${a.id}" title="Show ${esc(a.name)} ranking"><span>${esc(a.name)}</span><span class="track"><i style="left:${(100 - pos).toFixed(1)}%"></i></span><span class="r"><b>${r[0]}</b> / ${E.length}</span></button>`;
  }).join('');
  const sim = similar(e).map(x => `<button data-select="${x.id}" data-id="${x.id}"><span>${esc(x.name)}</span><small>${esc(x.country)} · ${esc(x.type)} · ${fmt(x.population)} M people</small></button>`).join('');
  const caseC = e.caseId && caseById[e.caseId];
  const comp = (keys, title) => `<dt>${title}</dt><dd>${keys.map(([k, l]) => `${l} <b>${e[k] ?? 'n/a'}</b>`).join(' · ')}</dd>`;
  return `
    <p class="kicker">Catalog entry ${e.id} · Master Dataset row ${e.sourceRow ?? 'n/a'}</p>
    <h2 class="entry-title">${esc(e.name)}</h2>
    <div class="entry-sub">${esc(e.country)} · ${esc(e.region)}</div>
    <div class="tags">
      <span class="tag"><i class="sw" style="background:${scheme.color(e.type)}"></i>${esc(e.type)}</span>
      <span class="tag">${e.tier === 'I' ? 'Inland' : 'Marine'}</span>
      <span class="tag">${esc(e.connection)}</span>
      ${e.strategic ? '<span class="tag">Strategic flag</span>' : ''}${e.crossBorder ? '<span class="tag">Cross-border flag</span>' : ''}
      ${e.location !== 'matched' ? `<span class="tag warn">${e.location === 'needs_review' ? 'Location needs review' : 'Not located'}</span>` : ''}
    </div>
    <div class="stats">
      <div class="stat"><b>${fmt(e.population)}</b><span>million people (metro estimate)</span></div>
      <div class="stat"><b>${e.gdp !== null ? '$' + fmt(e.gdp) + 'B' : 'n/a'}</b><span>metro GDP</span></div>
      <div class="stat"><b>${fmt(e.containers)}</b><span>thousand TEU containers</span></div>
      <div class="stat"><b>${e.distance !== null ? fmt(e.distance) + ' km' : esc(e.distanceText || 'n/a')}</b><span>inland distance</span></div>
    </div>
    ${caseC ? `<button class="btn primary" style="width:100%;justify-content:center;margin:8px 0" data-open-case="${caseC.id}">Open the ${esc(caseC.name)} case study</button>` : ''}
    <div class="section" style="margin-top:8px"><span class="label">Where it ranks (1 is highest)</span><div class="ranks">${ranks}</div></div>
    <div class="section"><span class="label">Water and land</span>
      <dl class="facts">
        <dt>Water body</dt><dd>${esc(e.water)}</dd>
        <dt>Watershed</dt><dd>${esc(e.watershed)} <span class="muted">(tier ${e.watershedTier ?? 'n/a'} of 5, 1 is largest)</span></dd>
        <dt>Cargo focus</dt><dd>${esc(e.cargo)}${e.cargoNote ? `<br><span class="muted">${esc(e.cargoNote)}</span>` : ''}</dd>
        ${comp([['corridor', 'corridor'], ['economicMass', 'mass'], ['gateway', 'gateway']], 'Hinterland parts')}
        ${comp([['waterVulnerability', 'water'], ['biodiversity', 'biodiversity'], ['ecoPressure', 'pressure']], 'Ecology parts')}
        ${e.note ? `<dt>Survey note</dt><dd>${esc(e.note.replace(/\*/g, '').trim())}</dd>` : ''}
        ${e.groups.length ? `<dt>Shared waters</dt><dd>${e.groups.map(g => `<button class="chip" data-set-group="${g}">${esc(groupById[g].name)}</button>`).join(' ')}</dd>` : ''}
      </dl>
    </div>
    <div class="section"><span class="label">Location on the map</span>
      <p class="small" style="margin:0">${e.points.length ? e.points.map(p => esc(p[2])).join(', ') + '. ' : ''}<span class="muted">${esc(e.locationNote)}</span></p>
    </div>
    <div class="section"><span class="label">Entries like this one</span><div class="similar">${sim}</div>
      <p class="hint">Closest on population, GDP, containers, watershed size, hinterland and ecology scores.</p></div>`;
}

// nearest neighbours on standardized variables
const SIM_KEYS = [e => Math.log10((e.population ?? 0) + 0.05), e => Math.log10((e.gdp ?? 0) + 1), e => Math.log10((e.containers ?? 0) + 10), e => e.watershedTier, e => e.hinterland, e => e.ecology, e => (e.tier === 'I' ? 1 : 0)];
const SIM_STATS = SIM_KEYS.map(f => {
  const v = E.map(f).filter(x => x !== null && Number.isFinite(x));
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return [m, Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1];
});
const simVec = e => SIM_KEYS.map((f, i) => { const v = f(e); return v === null || !Number.isFinite(v) ? 0 : (v - SIM_STATS[i][0]) / SIM_STATS[i][1]; });
function similar(e) {
  const a = simVec(e);
  return E.filter(x => x.id !== e.id).map(x => [x, simVec(x).reduce((s, v, i) => s + (v - a[i]) ** 2, 0)]).sort((p, q) => p[1] - q[1]).slice(0, 5).map(x => x[0]);
}

// rankings tab with live re-weighting
let rankLimit = 120;
function rankListHTML() {
  const ax = axisById[S.axis];
  const {rows, scen} = rankTable();
  const shown = rows.filter(r => visibleSet.has(r.e.id) || (S.topN && passesIgnoringTop(r.e)));
  const vals = rows.map(r => r.v).filter(v => v !== null);
  const vmax = Math.max(...vals), vmin = Math.min(0, ...vals);
  const limit = rankLimit;
  let lastBand = null;
  const html = [];
  for (const r of shown.slice(0, limit)) {
    const band = scen ? null : r.band;
    if (band && band !== lastBand) { html.push(`<div class="bandhead"><i class="sw" style="background:${BAND[ax.bands.indexOf(band)]}"></i>Band ${esc(band)}</div>`); lastBand = band; }
    const d = scen && r.rank !== null && r.src !== null ? r.src - r.rank : 0;
    const w = r.v === null ? 0 : (r.v - vmin) / (vmax - vmin || 1);
    html.push(`<button class="rk ${S.selected === r.e.id ? 'sel' : ''}" data-select-rank="${r.e.id}" data-id="${r.e.id}" data-key="${r.e.id}">
      <span class="no">${r.rank ?? 'n/a'}</span>
      <span class="nm">${esc(r.e.name)}<small>${esc(r.e.country)}${scen && d ? ` · <span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span> from source rank ${r.src}` : ''}</small></span>
      <span class="val">${r.v === null ? 'n/a' : fmt(r.v, 2)}<i style="transform:scaleX(${w.toFixed(3)});background:${BAND[Math.min(4, Math.floor((1 - w) * 5))]}"></i></span>
    </button>`);
  }
  const more = shown.length > limit ? `<button class="btn" style="width:100%;justify-content:center;margin-top:8px" data-more-ranks>Show ${Math.min(120, shown.length - limit)} more</button>` : '';
  return {html: html.join('') + more, count: shown.length};
}
function renderRankings(body) {
  const ax = axisById[S.axis];
  const scen = isScenario();
  const list = rankListHTML();
  body.innerHTML = `
    <div class="axisgrid">${C.axes.map(a => `<button data-axis="${a.id}" aria-pressed="${S.axis === a.id}"><b>Ranking ${a.id}</b>${esc(a.name)}</button>`).join('')}</div>
    <p class="hint">${esc(ax.description)} Unit: ${esc(ax.unit)}.</p>
    ${ax.components.length ? `<div class="weights">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="label" style="margin:0">Try different weights</span><span class="badge" id="scenBadge" ${scen ? '' : 'hidden'}>Illustrative scenario</span></div>
      ${ax.components.map((c, i) => `<label title="${esc(c.meaning)}"><span>${esc(c.name)}</span><input type="range" min="0" max="3" step="0.5" value="${(S.weights || defaultWeights())[i]}" data-weight="${i}"><output>${(S.weights || defaultWeights())[i]}</output></label>`).join('')}
      <p class="hint" style="margin-top:4px">Drag a slider and watch the order change. Source ranks use equal weights. <button class="linkbtn" data-reset-weights ${scen ? '' : 'hidden'}>Back to source weights</button></p>
    </div>` : ''}
    <div class="listhead" style="margin-top:12px">
      <span class="small muted" id="rankCount">${list.count} of ${E.length} entries match your filters</span>
      <select class="sel" id="topN" style="width:auto">${[0, 10, 25, 50, 100].map(n => `<option value="${n}" ${S.topN === n ? 'selected' : ''}>${n ? 'Map: top ' + n : 'Map: all ranks'}</option>`).join('')}</select>
    </div>
    <div class="ranklist" id="ranklist">${list.html}</div>`;
}
function refreshRankList() {
  const el = $('#ranklist');
  if (!el) return;
  const list = rankListHTML();
  el.innerHTML = list.html;
  const scen = isScenario();
  $('#scenBadge') && ($('#scenBadge').hidden = !scen);
  $('[data-reset-weights]') && ($('[data-reset-weights]').hidden = !scen);
  $('#rankCount') && ($('#rankCount').textContent = `${list.count} of ${E.length} entries match your filters`);
}
function passesIgnoringTop(e) { const t = S.topN; S.topN = 0; const ok = passes(e); S.topN = t; return ok; }

// FLIP animation for re-ordered rank rows
function flipRanks(update) {
  const before = new Map($$('#ranklist .rk').map(el => [el.dataset.key, el.getBoundingClientRect().top]));
  update();
  for (const el of $$('#ranklist .rk')) {
    const old = before.get(el.dataset.key);
    const now = el.getBoundingClientRect().top;
    if (old === undefined) { el.animate([{opacity: 0}, {opacity: 1}], {duration: 300}); continue; }
    if (Math.abs(old - now) > 1) el.animate([{transform: `translateY(${old - now}px)`}, {transform: 'none'}], {duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)'});
  }
}

// chart tab: scatter with brushing
function scale(field, values, range, compress) {
  const v = values.filter(x => x !== null);
  let min = Math.min(...v), max = Math.max(...v);
  if (field.ordinal) { min = Math.min(min, 1); max = Math.max(max, 5); }
  const useLog = compress && field.log;
  const c = field.c || 1;
  const t = useLog ? x => Math.log10(1 + Math.max(0, x) / c) : x => x;
  const a = t(min), b = t(max);
  const pad = (b - a) * 0.05 || 0.5;
  const lo = a - pad, hi = b + pad;
  const f = x => range[0] + (t(x) - lo) / (hi - lo) * (range[1] - range[0]);
  let ticks;
  if (field.ordinal) ticks = [1, 2, 3, 4, 5];
  else if (useLog) ticks = [0, 0.1, 1, 10, 100, 1000, 10000, 100000].filter(x => x >= min && x <= max * 1.01);
  else {
    const raw = (max - min) / 4, p = 10 ** Math.floor(Math.log10(raw || 1)), step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || p;
    ticks = []; for (let x = Math.ceil(min / step) * step; x <= max + 1e-9; x += step) ticks.push(+x.toFixed(6));
  }
  f.ticks = ticks;
  return f;
}
function spearman(pairs) {
  const rank = arr => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  if (pairs.length < 3) return null;
  const rx = rank(pairs.map(p => p[0])), ry = rank(pairs.map(p => p[1]));
  const n = pairs.length, mx = (n + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
  return num / Math.sqrt(dx * dy);
}
const jitter = (id, k) => { const s = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453; return (s - Math.floor(s)) - 0.5; };
const QUESTIONS = [
  ['population', 'gdp', 'Do bigger metros have bigger economies?'],
  ['watershedScore', 'population', 'Do large basins hold large cities?'],
  ['containers', 'hinterland', 'Does port volume track hinterland reach?'],
  ['distance', 'population', 'How far inland do big ports sit?'],
  ['waterVulnerability', 'ecology', 'What drives the ecology score?'],
];
function renderChart(body) {
  const fx = numByKey[S.cx], fy = numByKey[S.cy];
  const base = E.filter(e => passes(e, 'brush'));
  const W = S.wide ? 640 : 370, H = S.wide ? 430 : 330, m = {l: 46, r: 10, t: 10, b: 40};
  const pts = base.map(e => [e, val(e, S.cx), val(e, S.cy)]).filter(p => p[1] !== null && p[2] !== null);
  const sx = scale(fx, E.map(e => val(e, S.cx)), [m.l, W - m.r], true);
  const sy = scale(fy, E.map(e => val(e, S.cy)), [H - m.b, m.t], true);
  const cs = colorScheme();
  const xr = fx.ordinal ? (sx(2) - sx(1)) * 0.55 : 0, yr = fy.ordinal ? (sy(1) - sy(2)) * 0.55 : 0;
  const dots = pts.map(([e, x, y]) => {
    const px = sx(x) + jitter(e.id, 1) * xr, py = sy(y) + jitter(e.id, 2) * yr;
    const inBrush = !S.brush || S.brush.has(e.id);
    return `<circle class="dot ${inBrush ? '' : 'dim'} ${S.selected === e.id ? 'sel' : ''}" data-id="${e.id}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${S.selected === e.id ? 6 : 4}" fill="${cs.color(cs.get(e)) || '#888'}"/>`;
  }).join('');
  const rho = spearman(pts.map(p => [p[1], p[2]]));
  const opt = sel => NUM.map(f => `<option value="${f.key}" ${sel === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  body.innerHTML = `
    <div class="row2">
      <label><span>Across (x)</span><select class="sel" id="cx">${opt(S.cx)}</select></label>
      <label><span>Up (y)</span><select class="sel" id="cy">${opt(S.cy)}</select></label>
    </div>
    <div class="chart-wrap" id="chartwrap">
      <svg viewBox="0 0 ${W} ${H}" id="chart" role="img" aria-label="Scatter plot of ${esc(fx.label)} against ${esc(fy.label)}">
        <g class="axis">${sx.ticks.map(t => `<line x1="${sx(t)}" x2="${sx(t)}" y1="${m.t}" y2="${H - m.b}"/><text x="${sx(t)}" y="${H - m.b + 14}" text-anchor="middle">${fmt(t)}</text>`).join('')}
          ${sy.ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${m.l - 6}" y="${sy(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}</g>
        <text class="axis-title" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(fx.label)} (${esc(fx.unit)})</text>
        <text class="axis-title" transform="translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">${esc(fy.label)} (${esc(fy.unit)})</text>
        <g id="dots">${dots}</g>
        <rect class="brush" id="brushrect" width="0" height="0" visibility="hidden"/>
      </svg>
    </div>
    <div class="chart-meta"><span>${pts.length} entries plotted${base.length - pts.length ? `, ${base.length - pts.length} without values` : ''}${rho !== null ? ` · rank correlation ρ = ${rho.toFixed(2)}` : ''}</span>
      ${S.brush ? `<button class="linkbtn" data-clear-brush>Clear selection (${S.brush.size})</button>` : ''}</div>
    <span class="label" style="margin-top:14px">Questions to try</span>
    <div class="question-chips" style="margin-top:0">${QUESTIONS.map(q => `<button class="chip" data-q="${q[0]},${q[1]}" aria-pressed="${S.cx === q[0] && S.cy === q[1]}">${esc(q[2])}</button>`).join('')}</div>
    <p class="hint">Hover to find a dot on the map. <b>Drag a box</b> to select a group: the map and lists show only those entries. Large values are drawn on a compressed scale; scores 1 to 5 are spread slightly so dots do not overlap.</p>`;
  wireChart(sx, sy, pts, W, H);
}
function wireChart(sx, sy, pts, W, H) {
  const svg = $('#chart');
  const toLocal = ev => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) * W / r.width, (ev.clientY - r.top) * H / r.height]; };
  let start = null;
  const rect = $('#brushrect');
  svg.addEventListener('pointermove', ev => {
    if (start) {
      const [x, y] = toLocal(ev);
      rect.setAttribute('x', Math.min(x, start[0])); rect.setAttribute('y', Math.min(y, start[1]));
      rect.setAttribute('width', Math.abs(x - start[0])); rect.setAttribute('height', Math.abs(y - start[1]));
      return;
    }
    const t = ev.target.closest('circle.dot');
    if (t) {
      const e = byId.get(+t.dataset.id);
      setHover(e.id, 'chart');
      showTip(ev.clientX, ev.clientY, entryTip(e));
    } else { setHover(null, 'chart'); hideTip(); }
  });
  svg.addEventListener('pointerleave', () => { if (!start) { setHover(null, 'chart'); hideTip(); } });
  svg.addEventListener('pointerdown', ev => {
    if (ev.target.closest('circle.dot')) return;
    start = toLocal(ev); svg.setPointerCapture(ev.pointerId);
    rect.setAttribute('visibility', 'visible'); rect.setAttribute('width', 0); rect.setAttribute('height', 0);
    hideTip();
  });
  svg.addEventListener('pointerup', ev => {
    if (!start) {
      const t = ev.target.closest('circle.dot');
      if (t) select(+t.dataset.id, {tab: 'chart'});
      return;
    }
    const [x, y] = toLocal(ev);
    const [x0, x1] = [Math.min(x, start[0]), Math.max(x, start[0])], [y0, y1] = [Math.min(y, start[1]), Math.max(y, start[1])];
    start = null; rect.setAttribute('visibility', 'hidden');
    if (x1 - x0 < 4 && y1 - y0 < 4) { if (S.brush) { S.brush = null; S.pattern = null; update(); } return; }
    const ids = new Set($$('#dots circle.dot').filter(c => { const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'); return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1; }).map(c => +c.dataset.id));
    S.brush = ids.size ? ids : null;
    S.pattern = null;
    update();
    if (ids.size) fitEntries([...ids].map(i => byId.get(i)));
  });
}

// list tab
function renderList(body) {
  let list = visible;
  if (S.listView) {
    const b = map.getBounds();
    list = list.filter(e => e.points.some(p => b.contains([p[0], p[1]])));
  }
  const key = S.listSort;
  list = [...list].sort((a, b) => key === 'name' ? a.name.localeCompare(b.name) : (b[key] ?? -1) - (a[key] ?? -1));
  const limit = 200;
  body.innerHTML = `
    <div class="listhead">
      <label class="check"><input type="checkbox" id="listView" ${S.listView ? 'checked' : ''}> Only what the map shows</label>
      <select class="sel" id="listSort" style="width:auto">${[['population', 'Population'], ['gdp', 'GDP'], ['containers', 'Containers'], ['name', 'Name']].map(([k, l]) => `<option value="${k}" ${key === k ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select>
    </div>
    <p class="small muted">${list.length} entries${list.length > limit ? `, first ${limit} shown` : ''}</p>
    <div>${list.slice(0, limit).map(e => `<button class="listrow" data-select="${e.id}" data-id="${e.id}"><span>${esc(e.name)}</span><span class="pop">${key === 'name' || key === 'population' ? fmt(e.population) + ' M' : key === 'gdp' ? '$' + fmt(e.gdp) + 'B' : fmt(e.containers) + ' k TEU'}</span><small>${esc(e.country)} · ${esc(e.type)}${e.points.length ? '' : ' · <span class="nomap">not on map</span>'}</small></button>`).join('')}</div>`;
}
map.on('moveend', () => { if (S.mode === 'explore' && S.tab === 'list' && S.listView) renderRight(); });

// ---------- patterns ----------
// Every number in a pattern is computed from the catalog when the tab opens.
const median = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const pct = (a, b) => Math.round(a / b * 100);
const tally = (list, fn) => [...count(list, fn)].sort((a, b) => b[1] - a[1]);
const andList = (xs, and = 'and') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`);
const names = (list, n = list.length) => andList(list.slice(0, n).map(e => esc(short(e.name))));
const regionName = r => esc(r === 'Middle East' ? 'the Middle East' : r);
const TYPE_PROSE = {'Estuary/Delta': 'estuaries and deltas', 'Open coast': 'open coasts', Bay: 'bays', River: 'rivers', Gulf: 'gulfs', Strait: 'straits', Lake: 'lakes', Lagoon: 'lagoons', Fjord: 'fjords', 'Inland sea': 'inland seas', 'Semi-enclosed': 'semi-enclosed seas'};
const rho = (a, b) => spearman(E.map(e => [val(e, a), val(e, b)]).filter(p => p[0] !== null && p[1] !== null));
function pbars(rows, {color = () => 'var(--teal)', unit = ''} = {}) {
  const max = Math.max(...rows.map(r => r[1]));
  const row = ([k, v, c]) => `<span title="${esc(k)}">${esc(k)}</span><span class="t"><i style="width:${(v / max * 100).toFixed(1)}%;background:${c || color(k)}"></i></span><span class="v">${fmt(v)}${unit}</span>`;
  return `<div class="pbars">${rows.map(r => (r[3] ? `<button class="hbar" data-select="${r[3]}" data-id="${r[3]}">${row(r)}</button>` : `<div class="hbar">${row(r)}</div>`)).join('')}</div>`;
}
const regionColor = r => COLOR_BY.region.color(r);
const PATTERNS = [
  {id: 'megacities', theme: 'Cities and water', title: 'Big cities gather on estuaries and deltas.', color: 'type', size: 'population',
    ids: () => E.filter(e => e.population >= 10),
    body(list) {
      const t = tally(list, e => e.type), est = E.filter(e => e.type === 'Estuary/Delta'), coast = E.filter(e => e.type === 'Open coast');
      return {text: `Of the ${list.length} entries with 10 million people or more, ${t.find(x => x[0] === 'Estuary/Delta')?.[1] || 0} sit on an estuary or delta and ${t.find(x => x[0] === 'River')?.[1] || 0} on a river. Across all ${E.length} entries, the median estuary or delta metro has ${fmt(median(est.map(e => e.population)))} million people; the median open-coast metro has ${fmt(median(coast.map(e => e.population)))} million.`,
        viz: pbars(t.slice(0, 6), {color: k => TYPE_COLORS[k]})};
    }},
  {id: 'hotspots', theme: 'Cities and water', title: 'Where big cities meet sensitive water.', color: 'type', size: 'population',
    ids: () => E.filter(e => e.population >= 5 && e.ecology >= 4).sort((a, b) => b.population - a.population),
    body(list) {
      const types = tally(list, e => e.type).map(x => TYPE_PROSE[x[0]] || x[0].toLowerCase());
      return {text: `${list.length} entries combine at least 5 million people with an Ecological stakes score of 4 or more. All of them sit on ${andList(types, 'or')}. They pair a large city with the kind of enclosed, sensitive water that the Salish Sea prototype studies.`,
        viz: pbars(list.slice(0, 8).map(e => [short(e.name), e.population, TYPE_COLORS[e.type], e.id]), {unit: ' M'})};
    }},
  {id: 'eastasia', theme: 'Ports', title: 'Container traffic is concentrated in East Asia.', color: 'region', size: 'containers',
    ids: () => [...E].sort((a, b) => b.containers - a.containers).slice(0, 25),
    body(list) {
      const top10 = list.slice(0, 10), total = E.reduce((s, e) => s + e.containers, 0);
      let acc = 0, half = 0;
      for (const e of [...E].sort((a, b) => b.containers - a.containers)) { acc += e.containers; half++; if (acc >= total / 2) break; }
      return {text: `${top10.filter(e => e.region === 'East Asia').length} of the 10 largest container ports in the survey are in East Asia, and ${list.filter(e => e.region === 'East Asia').length} of the top 25. Half of all the container volume listed in the survey passes through ${half} entries, ${pct(half, E.length)}% of the ${E.length}.`,
        viz: pbars(top10.map(e => [short(e.name), e.containers, regionColor(e.region), e.id]), {unit: 'k'})};
    }},
  {id: 'hubs', theme: 'Ports', title: 'Some of the busiest ports serve small cities.', color: 'cargo', size: 'containers',
    ids: () => E.filter(e => e.containers >= 3000 && e.population <= 1.5).sort((a, b) => b.containers - a.containers),
    body(list) {
      const tr = list.filter(e => e.cargo === 'Transship').length, [a, b] = list.filter(e => e.population >= 1);
      return {text: `${list.length} entries handle at least 3 million TEU with a metro of 1.5 million people or fewer. ${tr} of them are marked as transshipment ports, which move containers between ships rather than to a hinterland. ${esc(short(a.name))} handles ${fmt(a.containers)}k TEU for a metro of ${fmt(a.population)} million; ${esc(short(b.name))} ${fmt(b.containers)}k TEU for ${fmt(b.population)} million.`,
        viz: pbars(list.slice(0, 8).map(e => [short(e.name), e.containers, COLOR_BY.cargo.color(e.cargo), e.id]), {unit: 'k'}), plot: ['population', 'containers']};
    }},
  {id: 'quietgiants', theme: 'Ports', title: 'Some of the largest metros have small ports.', color: 'tier', size: 'population',
    ids: () => E.filter(e => e.population >= 8 && e.containers / e.population < 50).sort((a, b) => a.containers / a.population - b.containers / b.population),
    body(list) {
      const inl = list.filter(e => e.tier === 'I').length;
      return {text: `Among metros of 8 million people or more, ${list.length} handle less than 50k TEU per million residents; ${inl} of those ${list.length} are inland. ${names(list.filter(e => e.tier === 'I'), 3)} are large cities on rivers and lakes whose ports are small next to their size. Across all entries, the rank correlation between population and container volume is ${rho('population', 'containers').toFixed(2)}: related, but loosely.`,
        viz: pbars(list.map(e => [short(e.name), e.population, COLOR_BY.tier.color(e.tier), e.id]), {unit: ' M'}), plot: ['population', 'containers']};
    }},
  {id: 'cargo', theme: 'Ports', title: 'Each region leans on different cargo.', color: 'cargo', ids: null,
    body() {
      const regs = byCount(e => e.region), share = (r, c) => { const x = E.filter(e => e.region === r); return pct(x.filter(e => e.cargo === c).length, x.length); };
      const lead = regs.filter(r => tally(E.filter(e => e.region === r), e => e.cargo)[0][0] !== 'Diversified');
      const energy = [...regs].sort((a, b) => share(b, 'Energy') - share(a, 'Energy')).slice(0, 2);
      const cont = [...regs].sort((a, b) => share(b, 'Container') - share(a, 'Container'))[0];
      const cats = COLOR_BY.cargo.cats;
      const rows = regs.map(r => { const x = E.filter(e => e.region === r); return `<div class="stack"><span>${esc(r)}</span><span class="t">${cats.map(c => { const n = x.filter(e => e.cargo === c).length; return n ? `<i style="width:${(n / x.length * 100).toFixed(1)}%;background:${COLOR_BY.cargo.color(c)}" title="${esc(c)}: ${n}"></i>` : ''; }).join('')}</span></div>`; }).join('');
      return {text: `Diversified is the most common cargo focus in every region${lead.length ? ` except ${andList(lead.map(r => { const c = tally(E.filter(e => e.region === r), e => e.cargo)[0][0]; return `${regionName(r)} (${esc(c.toLowerCase())}, ${share(r, c)}%)`; }))}` : ''}. Energy ports are ${share(energy[0], 'Energy')}% of entries in ${regionName(energy[0])} and ${share(energy[1], 'Energy')}% in ${regionName(energy[1])}. Container-focused ports are ${share(cont, 'Container')}% of entries in ${regionName(cont)}, the highest share of any region.`,
        viz: `<div class="pbars">${rows}</div><div class="legend-mini">${cats.map(c => `<span><i style="background:${COLOR_BY.cargo.color(c)}"></i>${esc(c)}</span>`).join('')}</div>`};
    }},
  {id: 'inland', theme: 'Inland', title: 'Inland ports are mostly European and North American.', color: 'region', size: 'population',
    ids: () => E.filter(e => e.tier === 'I'),
    body(list) {
      const t = tally(list, e => e.region), none = byCount(e => e.region).filter(r => !t.some(x => x[0] === r));
      const eu = t.find(x => x[0] === 'Europe')?.[1] || 0, na = t.find(x => x[0] === 'North America')?.[1] || 0;
      const big = [...list].sort((a, b) => b.population - a.population).slice(0, 4);
      return {text: `Europe has ${eu} inland entries and North America ${na}: ${eu + na} of the ${list.length}. ${none.length ? `${andList(none.map(regionName)).replace(/^the/, 'The')} ${none.length > 1 ? 'have' : 'has'} none. ` : ''}The largest inland metros are elsewhere: ${names(big)}.`,
        viz: pbars(t.map(([r, n]) => [r, n, regionColor(r)]))};
    }},
  {id: 'deep', theme: 'Inland', title: 'Ships reach 1,000 km or more inland.', color: 'tier', size: 'population',
    ids: () => E.filter(e => e.distance >= 1000).sort((a, b) => b.distance - a.distance),
    body(list) {
      const [a] = list, gl = list.filter(e => e.distance === 1800);
      return {text: `${list.length} entries sit 1,000 km or more from the open ocean by navigable water. ${esc(short(a.name))} is ${fmt(a.distance)} km inland on the ${esc(short(a.water))}. ${names(gl)} are ${fmt(1800)} km in, by the St. Lawrence and the Great Lakes. The survey gives these as approximate distances, and many are rounded to the same value.`,
        viz: pbars(list.slice(0, 9).map(e => [short(e.name), e.distance, COLOR_BY.tier.color(e.tier), e.id]), {unit: ' km'}), plot: ['distance', 'population']};
    }},
  {id: 'chokepoints', theme: 'Borders and chokepoints', title: 'Strategic ports cluster between Suez and the Arabian Sea.', color: 'region', size: 'containers',
    ids: () => E.filter(e => e.strategic),
    fit: list => list.filter(e => /Persian Gulf|Gulf of Oman|Arabian Sea|Red Sea|Gulf of Aden|Bab-el-Mandeb|Hormuz|Aqaba|Suez/.test(e.water)),
    body(list) {
      const near = this.fit(list), t = tally(list, e => e.region);
      return {text: `The survey marks ${list.length} entries as strategic or chokepoint ports. ${near.length} of them face the Red Sea, the Gulf of Aden, the Gulf of Oman, the Persian Gulf or the Arabian Sea, from Port Said to Gwadar. Others guard Gibraltar, the Bosporus, Panama and the Strait of Malacca.`,
        viz: pbars(t.map(([r, n]) => [r, n, regionColor(r)]))};
    }},
  {id: 'crossborder', theme: 'Borders and chokepoints', title: 'Shared rivers make shared ports.', color: 'type', size: 'population',
    ids: () => E.filter(e => e.crossBorder),
    body(list) {
      const g = [['Rhine', /Rhine/], ['Danube', /Danube/], ['Caspian Sea', /Caspian/], ['Black Sea', /Black Sea|Azov/], ['Mekong', /Mekong/], ['Salish Sea', /Salish/], ['Baltic and Øresund', /Baltic|Øresund/]]
        .map(([k, re]) => [k, list.filter(e => re.test(`${e.water} ${e.watershed}`)).length]).filter(x => x[1]);
      const rd = list.filter(e => /Rhine|Danube/.test(`${e.water} ${e.watershed}`)).length;
      return {text: `${list.length} entries are marked cross-border: their watershed-port interface spans national borders. ${rd} of them are on the Rhine or the Danube. Most of the rest share an enclosed sea or a border river: the Caspian, the Black Sea, the Mekong, the Øresund, the Detroit River and the Salish Sea.`,
        viz: pbars(g)};
    }},
  {id: 'ecotype', theme: 'How the scores work', title: 'The ecology score mostly follows water type.', color: 'type', size: 'population', ids: null,
    body() {
      const m = E.reduce((s, e) => s + e.ecology, 0) / E.length, tss = E.reduce((s, e) => s + (e.ecology - m) ** 2, 0);
      const types = byCount(e => e.type), means = Object.fromEntries(types.map(t => { const x = E.filter(e => e.type === t); return [t, x.reduce((s, e) => s + e.ecology, 0) / x.length]; }));
      const r2 = 1 - E.reduce((s, e) => s + (e.ecology - means[e.type]) ** 2, 0) / tss;
      const uniform = types.filter(t => new Set(E.filter(e => e.type === t).map(e => e.waterVulnerability)).size === 1).length;
      const top = E.filter(e => e.biodiversity === 5);
      return {text: `Water setting alone accounts for ${pct(r2, 1)}% of the variation in Ecological stakes. Water vulnerability takes a single value within ${uniform === types.length ? `every one of the ${types.length} settings` : `${uniform} of the ${types.length} settings`}. The biodiversity component has only ${new Set(E.map(e => e.biodiversity)).size} values, and only ${top.length} entries score 5: ${names(top)}. Ranking F is close to a ranking of water types, which the survey itself describes as provisional.`,
        viz: pbars(types.map(t => [t, means[t], TYPE_COLORS[t]]).sort((a, b) => b[1] - a[1])), plot: ['waterVulnerability', 'ecology']};
    }},
  {id: 'pressure', theme: 'How the scores work', title: 'The pressure score follows port volume, not population.', color: 'type', size: 'containers', ids: () => E.filter(e => e.ecoPressure === 5),
    body(list) {
      const minTeu = Math.min(...list.map(e => e.containers)), quiet = E.filter(e => e.ecoPressure === 1).sort((a, b) => b.population - a.population)[0];
      return {text: `The pressure component has a rank correlation of ${rho('containers', 'ecoPressure').toFixed(2)} with container volume and ${rho('population', 'ecoPressure').toFixed(2)} with population. All ${list.length} entries with the top pressure score handle at least ${fmt(minTeu)}k TEU. ${esc(short(quiet.name))}, with ${fmt(quiet.population)} million people, scores 1. As scored, it says more about shipping than about the size of the city on the shore.`,
        viz: pbars([1, 2, 3, 4, 5].map(p => [`Pressure ${p}`, median(E.filter(e => e.ecoPressure === p).map(e => e.containers))]), {unit: 'k'}), vizNote: 'Median container volume at each pressure score', plot: ['containers', 'ecoPressure']};
    }},
  {id: 'corridor', theme: 'How the scores work', title: 'Hinterland reach repeats watershed size.', color: 'tier', size: 'population', ids: null,
    body() {
      const same = E.filter(e => e.corridor === 6 - e.watershedTier).length;
      return {text: `The corridor component equals the watershed score in ${same} of ${E.length} entries. Hinterland reach and watershed size have a rank correlation of ${rho('watershedScore', 'hinterland').toFixed(2)}, so Rankings B and E order the entries in nearly the same way. Weighting the corridor component down in the Rankings tab separates them.`,
        viz: pbars([1, 2, 3, 4, 5].map(w => [`Watershed ${w}`, E.filter(e => 6 - e.watershedTier === w).reduce((s, e, _, a) => s + e.hinterland / a.length, 0)])), vizNote: 'Mean Hinterland reach at each watershed score', plot: ['watershedScore', 'hinterland']};
    }},
];
const patternById = Object.fromEntries(PATTERNS.map(p => [p.id, p]));
function renderPatterns(body) {
  const themes = [...new Set(PATTERNS.map(p => p.theme))];
  body.innerHTML = `
    <p class="kicker">Patterns in the survey</p>
    <p class="small">Every number here is computed from the ${E.length} entries. The survey is a convenience sample, populations and port figures are approximate, and the 1 to 5 scores are working analyst classifications. Read these as patterns in the survey, not measurements of the world.</p>
    ${themes.map(th => `<span class="label" style="margin-top:16px">${esc(th)}</span>${PATTERNS.filter(p => p.theme === th).map(p => {
      const list = p.ids ? p.ids() : null, b = p.body(list);
      return `<article class="pattern ${S.pattern === p.id ? 'on' : ''}" id="pat-${p.id}">
        <h3>${esc(p.title)}</h3><p>${b.text}</p>${b.viz}${b.vizNote ? `<p class="hint">${esc(b.vizNote)}</p>` : ''}
        <div class="pattern-actions"><button class="btn small ${S.pattern === p.id ? 'primary' : ''}" data-pattern="${p.id}">${list ? `Show ${list.length} on the map` : 'Color the map'}</button>${b.plot ? `<button class="btn small ghost" data-plot="${b.plot.join(',')}">Plot it</button>` : ''}</div>
      </article>`;
    }).join('')}`).join('')}`;
}
function showPattern(id) {
  const p = patternById[id];
  if (!p) return;
  stopSpin();
  const top = $('#tabbody')?.scrollTop || 0;
  const redraw = () => { renderRight(); const b = $('#tabbody'); if (b) b.scrollTop = top; };
  if (S.pattern === id) { S.pattern = null; S.brush = null; update({keepRight: true}); redraw(); return; }
  S.pattern = id;
  const list = p.ids ? p.ids() : null;
  S.brush = list ? new Set(list.map(e => e.id)) : null;
  if (p.color) { S.colorBy = p.color; S.hidden.clear(); }
  if (p.size) S.sizeBy = p.size;
  update({keepRight: true});
  redraw();
  requestAnimationFrame(() => $('#pat-' + id)?.scrollIntoView({block: 'nearest', behavior: 'smooth'}));
  const fit = list && (p.fit ? p.fit(list) : list);
  const pts = fit ? fit.flatMap(e => e.points) : [];
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  syncPadding();
  if (pts.length && Math.max(...xs) - Math.min(...xs) < 100 && Math.max(...ys) - Math.min(...ys) < 60) fitEntries(fit);
  // A worldwide set: show the whole globe, turned toward the middle of the set.
  else map.flyTo({center: pts.length ? [(Math.max(...xs) + Math.min(...xs)) / 2, Math.max(-30, Math.min(40, (Math.max(...ys) + Math.min(...ys)) / 2))] : [15, 22], zoom: isNarrow() ? 0.9 : 1.6, duration: 1400});
  if (isNarrow()) closeSheets();
}

// ---------- case studies ----------
const caseData = {};
const casePending = {};
function loadCase(id) {
  if (caseData[id]) return Promise.resolve(caseData[id]);
  if (casePending[id]) return casePending[id];
  casePending[id] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `data/case-${id}.js?v=6`;
    s.onload = () => {
      caseData[id] = prepCase(window['ATLAS_CASE_' + id.toUpperCase()]);
      delete window['ATLAS_CASE_' + id.toUpperCase()];
      resolve(caseData[id]);
    };
    s.onerror = () => { delete casePending[id]; reject(new Error('load failed')); };
    document.head.appendChild(s);
  });
  return casePending[id];
}
function decodeLine(a, scale) {
  const out = new Array(a.length / 2);
  let x = 0, y = 0;
  for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out[i / 2] = [x / scale, y / scale]; }
  return out;
}
const decodeCoords = (c, scale) => (c.length && typeof c[0] === 'number' ? decodeLine(c, scale) : c.map(x => decodeCoords(x, scale)));
function bboxOf(features) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = c => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
  for (const f of features) if (f.geometry && f.geometry.coordinates.length) walk(f.geometry.coordinates);
  return w <= e ? [w, s, e, n] : null;
}
const unionBox = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
function prepCase(d) {
  for (const v of Object.values(d)) {
    if (!v || v.type !== 'FeatureCollection' || !v.enc) continue;
    for (const f of v.features) if (f.geometry && f.geometry.type !== 'Point' && f.geometry.coordinates.length) f.geometry.coordinates = decodeCoords(f.geometry.coordinates, v.enc);
    delete v.enc;
  }
  const byB = new Map(d.basins.features.map(f => [f.properties.id, f.properties]));
  const kids = new Map();
  for (const p of byB.values()) { if (!kids.has(p.down)) kids.set(p.down, []); kids.get(p.down).push(p.id); }
  d.byB = byB; d.kids = kids;
  d.featById = new Map(d.basins.features.map(f => [f.properties.id, f]));
  // Default view: the main basin plus the receiving waters around the case.
  const c = caseById[d.id];
  const main = byB.has(d.parent) ? upstreamOf(d, d.parent).map(id => d.featById.get(id)) : [];
  d.focus = unionBox(main.length ? bboxOf(main) : null, c.local);
  return d;
}
// Fetch case geography in the background once the map is idle, so case clicks are instant.
function prefetchCases() {
  const queue = C.cases.map(c => c.id).filter(id => !caseData[id]);
  const next = () => {
    const id = queue.shift();
    if (!id) return;
    const go = () => loadCase(id).catch(() => {}).then(() => setTimeout(next, 300));
    (window.requestIdleCallback || (f => setTimeout(f, 200)))(go);
  };
  next();
}
// Camera moves wait for the map's first load; before that the globe camera
// is not ready and fitBounds throws.
let mapReady = false, pendingFit = null;
function fitBox(b, opts = {}) {
  if (!b) return;
  if (!mapReady) { pendingFit = [b, opts]; return; }
  safeFit([[b[0], b[1]], [b[2], b[3]]], {duration: 1200, essential: true, ...opts});
}
function upstreamOf(d, id) {
  const out = [id], seen = new Set(out);
  for (let i = 0; i < out.length; i++) for (const k of d.kids.get(out[i]) || []) if (!seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}
function downstreamOf(d, id) {
  const out = [];
  let cur = d.byB.get(id)?.down;
  const seen = new Set([id]);
  while (cur && d.byB.has(cur) && !seen.has(cur)) { out.push(cur); seen.add(cur); cur = d.byB.get(cur).down; }
  return out;
}

const CASE_LAYERS = ['c-basins', 'c-basins-line', 'c-up', 'c-down', 'c-pick', 'c-marine', 'c-lakes', 'c-rivers', 'c-borders', 'c-ports', 'c-cities', 'c-city-labels', 'c-marine-labels',
  'o-watersheds', 'o-watersheds-line', 'o-aquifers', 'o-aquifers-line', 'o-streams', 'o-pick'];
const CASE_SOURCES = ['c-basins', 'c-rivers', 'c-lakes', 'c-marine', 'c-borders', 'c-ports', 'c-cities', 'o-watersheds', 'o-aquifers', 'o-streams'];
function clearCaseLayers() {
  for (const l of CASE_LAYERS) if (map.getLayer(l)) map.removeLayer(l);
  for (const s of CASE_SOURCES) if (map.getSource(s)) map.removeSource(s);
}
function aqColorExpr(k) {
  return ['match', ['coalesce', ['get', k], -9], -1, AQ_COLORS['-1'], 0, AQ_COLORS[0], 1, AQ_COLORS[1], 2, AQ_COLORS[2], 3, AQ_COLORS[3], 4, AQ_COLORS[4], '#e4e4e4'];
}
let caseToken = 0;
async function showCase(id, {fly = true} = {}) {
  const token = ++caseToken;
  S.caseId = id;
  const c = caseById[id];
  renderLeft(); renderRight();
  let d;
  const slow = caseData[id] ? null : setTimeout(() => toast(`Loading ${c.name} geography…`), 250);
  try { d = await loadCase(id); } catch (_) { clearTimeout(slow); toast('Could not load case geography.'); return; } finally { clearTimeout(slow); }
  if (token !== caseToken || S.mode !== 'cases' || !map.isStyleLoaded() && !map.getSource('entries')) return;
  clearCaseLayers();
  const before = map.getLayer('sel-line') ? 'sel-line' : undefined;
  const add = (src, data) => map.addSource(src, {type: 'geojson', data});
  add('c-basins', d.basins); add('c-rivers', d.rivers); add('c-lakes', d.lakes); add('c-marine', d.marine);
  add('c-borders', d.borders); add('c-ports', d.ports); add('c-cities', d.cities);
  const vis = k => (S.layers[k] ? 'visible' : 'none');
  map.addLayer({id: 'c-basins', type: 'fill', source: 'c-basins', layout: {visibility: vis('basins')},
    paint: {'fill-color': S.indicator === 'none' ? '#cfe3d6' : aqColorExpr(S.indicator), 'fill-opacity': 0.62}}, before);
  map.addLayer({id: 'c-up', type: 'fill', source: 'c-basins', filter: ['in', ['get', 'id'], ['literal', []]],
    paint: {'fill-color': '#1f6f6b', 'fill-opacity': 0.55}}, before);
  map.addLayer({id: 'c-down', type: 'line', source: 'c-basins', filter: ['in', ['get', 'id'], ['literal', []]],
    paint: {'line-color': '#e8590c', 'line-width': 2.5}}, before);
  map.addLayer({id: 'c-basins-line', type: 'line', source: 'c-basins', layout: {visibility: vis('basins')},
    paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 8, 1.2], 'line-opacity': 0.9}}, before);
  map.addLayer({id: 'c-pick', type: 'line', source: 'c-basins', filter: ['==', ['get', 'id'], -1],
    paint: {'line-color': '#102a33', 'line-width': 3}}, before);
  map.addLayer({id: 'c-marine', type: 'fill', source: 'c-marine', layout: {visibility: vis('marine')},
    paint: {'fill-color': '#7fb3cc', 'fill-opacity': 0.18}}, before);
  map.addLayer({id: 'c-lakes', type: 'fill', source: 'c-lakes', layout: {visibility: vis('lakes')},
    paint: {'fill-color': '#8fc1da', 'fill-outline-color': '#4f8fb0'}}, before);
  map.addLayer({id: 'c-rivers', type: 'line', source: 'c-rivers', layout: {visibility: vis('rivers'), 'line-cap': 'round'},
    paint: {'line-color': '#2f7fae', 'line-width': ['interpolate', ['linear'], ['get', 'rank'], 1, 3, 6, 1.6, 12, 0.6], 'line-opacity': 0.9}}, before);
  map.addLayer({id: 'c-borders', type: 'line', source: 'c-borders', layout: {visibility: vis('borders')},
    paint: {'line-color': '#5c6b73', 'line-width': ['match', ['get', 'level'], 0, 1.4, 0.5], 'line-dasharray': [3, 2], 'line-opacity': 0.7}}, before);
  map.addLayer({id: 'c-ports', type: 'circle', source: 'c-ports', layout: {visibility: vis('ports')},
    paint: {'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#102a33', 'circle-stroke-width': 2}}, before);
  map.addLayer({id: 'c-cities', type: 'circle', source: 'c-cities', layout: {visibility: vis('cities')},
    paint: {'circle-radius': ['interpolate', ['linear'], ['get', 'rank'], 1, 4, 10, 2], 'circle-color': '#102a33'}}, before);
  if (!styleFailed) {
    map.addLayer({id: 'c-city-labels', type: 'symbol', source: 'c-cities', layout: {visibility: vis('cities'),
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'symbol-sort-key': ['get', 'rank']},
    paint: {'text-color': '#102a33', 'text-halo-color': '#fff', 'text-halo-width': 1.3}});
    map.addLayer({id: 'c-marine-labels', type: 'symbol', source: 'c-marine', layout: {visibility: vis('marine'),
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'symbol-placement': 'point'},
    paint: {'text-color': '#1f5f7a', 'text-halo-color': 'rgba(255,255,255,.7)', 'text-halo-width': 1}});
  }
  if (id === 'oahu') addOahuLayers(d, before);
  map.setLayoutProperty('entries', 'visibility', S.layers.entries ? 'visible' : 'none');
  refreshEntries();
  if (S.basin && d.byB.has(S.basin)) pickBasin(S.basin, {silent: true}); else S.basin = null;
  if (fly) fitBox(d.focus || c.local, {duration: 1600});
  renderRight();
}
function addOahuLayers(d, before) {
  map.addSource('o-watersheds', {type: 'geojson', data: d.watersheds});
  map.addSource('o-aquifers', {type: 'geojson', data: d.aquifers});
  map.addSource('o-streams', {type: 'geojson', data: d.streams});
  const L = S.oahuLayer;
  const yields = d.aquifers.features.map(f => f.properties.yield || 0);
  const ymax = Math.max(...yields);
  map.addLayer({id: 'o-watersheds', type: 'fill', source: 'o-watersheds', layout: {visibility: L === 'watersheds' ? 'visible' : 'none'},
    paint: {'fill-color': ['interpolate', ['linear'], ['get', 'area'], 1, '#e3f1e6', 20, '#9fd0b0', 60, '#3a9b7a'], 'fill-opacity': 0.7}}, before);
  map.addLayer({id: 'o-watersheds-line', type: 'line', source: 'o-watersheds', layout: {visibility: L === 'watersheds' ? 'visible' : 'none'},
    paint: {'line-color': '#fff', 'line-width': 1}}, before);
  map.addLayer({id: 'o-aquifers', type: 'fill', source: 'o-aquifers', layout: {visibility: L === 'aquifers' ? 'visible' : 'none'},
    paint: {'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'yield'], 0], 0, '#f1eef6', ymax / 3, '#9ebcda', ymax, '#2b5c8a'], 'fill-opacity': 0.75}}, before);
  map.addLayer({id: 'o-aquifers-line', type: 'line', source: 'o-aquifers', layout: {visibility: L === 'aquifers' ? 'visible' : 'none'},
    paint: {'line-color': '#fff', 'line-width': 1.2}}, before);
  map.addLayer({id: 'o-streams', type: 'line', source: 'o-streams', layout: {visibility: 'visible'},
    paint: {'line-color': ['match', ['get', 'type'], 'PERENNIAL', '#1f6fae', '#8fb8d6'], 'line-width': ['match', ['get', 'type'], 'PERENNIAL', 1.4, 0.7],
      'line-opacity': L === 'streams' ? 1 : 0.55}}, before);
  map.addLayer({id: 'o-pick', type: 'line', source: L === 'aquifers' ? 'o-aquifers' : 'o-watersheds', filter: ['==', ['get', 'fid'], -1],
    paint: {'line-color': '#102a33', 'line-width': 3}}, before);
}

let oahuPick = null;
function pickBasin(id, {silent = false, fly = !silent} = {}) {
  const d = caseData[S.caseId];
  if (!d || !d.byB.has(id)) return;
  S.basin = id;
  const up = upstreamOf(d, id), down = downstreamOf(d, id);
  map.setFilter('c-up', ['in', ['get', 'id'], ['literal', up]]);
  map.setFilter('c-down', ['in', ['get', 'id'], ['literal', down]]);
  map.setFilter('c-pick', ['==', ['get', 'id'], id]);
  // Frame the area that drains here; zoom out if needed, but do not jump in far.
  if (fly) fitBox(bboxOf(up.map(b => d.featById.get(b))), {maxZoom: Math.max(map.getZoom(), 6)});
  if (!silent) { renderRight(); saveHash(); }
}
function clearBasin() {
  S.basin = null;
  if (map.getLayer('c-up')) {
    map.setFilter('c-up', ['in', ['get', 'id'], ['literal', []]]);
    map.setFilter('c-down', ['in', ['get', 'id'], ['literal', []]]);
    map.setFilter('c-pick', ['==', ['get', 'id'], -1]);
  }
  renderRight(); saveHash();
}
map.on('click', ev => {
  if (S.mode !== 'cases' || ev.defaultPrevented) return;
  const layers = ['o-watersheds', 'o-aquifers', 'c-basins'].filter(l => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
  const f = layers.length ? map.queryRenderedFeatures(ev.point, {layers})[0] : null;
  if (!f) return;
  if (f.layer.id === 'c-basins') pickBasin(f.properties.id);
  else {
    oahuPick = {layer: f.layer.id, props: f.properties};
    map.setFilter('o-pick', ['==', ['get', 'fid'], f.properties.fid]);
    const src = caseData.oahu[f.layer.id === 'o-aquifers' ? 'aquifers' : 'watersheds'].features.find(x => x.properties.fid === f.properties.fid);
    if (src) fitBox(bboxOf([src]), {maxZoom: 11.5});
    renderRight();
  }
});
map.on('mousemove', ev => {
  if (S.mode !== 'cases') return;
  if (map.queryRenderedFeatures(ev.point, {layers: ['entries'].filter(l => map.getLayer(l))}).length) return;
  const layers = ['o-watersheds', 'o-aquifers', 'c-basins'].filter(l => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
  const f = layers.length ? map.queryRenderedFeatures(ev.point, {layers})[0] : null;
  map.getCanvas().style.cursor = f ? 'pointer' : '';
  if (!f) { hideTip(); return; }
  const p = f.properties;
  let html;
  if (f.layer.id === 'c-basins') {
    html = `<b>Drainage unit ${p.pfaf}</b><span>${fmt(p.area)} km² · ${S.indicator === 'none' ? 'click to trace upstream' : esc(AQ[S.indicator]) + ': ' + esc(aqLabel(S.indicator, p[S.indicator] === undefined || p[S.indicator] === null ? null : p[S.indicator]))}</span>`;
  } else if (f.layer.id === 'o-aquifers') {
    html = `<b>${esc(p.name)} aquifer system</b><span>${esc(p.sector)} sector · ${p.yield ?? 'n/a'} million gallons a day (2019 sustainable yield)</span>`;
  } else {
    html = `<b>${esc(p.name)} watershed</b><span>${fmt(p.area)} km² · State code ${esc(p.code)}</span>`;
  }
  showTip(ev.originalEvent.clientX, ev.originalEvent.clientY, html);
});

function renderLeftCases() {
  const c = caseById[S.caseId];
  const lens = c.lenses[S.lens];
  const src = id => C.sources[id] ? `<a href="${esc(C.sources[id].url)}" target="_blank" rel="noopener">${esc(C.sources[id].label)}</a>${C.sources[id].period ? `, ${esc(C.sources[id].period)}` : ''}` : '';
  const linked = E.filter(e => e.caseId === c.id || (c.family && e.groups.includes(c.family)));
  $('#left').innerHTML = `
    <button class="sheet-close btn small" data-close-sheet>Close</button>
    <div class="section"><span class="label">${C.cases.length} detailed systems</span>
      <div class="casegrid">${C.cases.map(x => `<button class="casecard" data-case="${x.id}" aria-pressed="${x.id === c.id}"><b>${esc(x.name)}</b><span>${esc(x.kind)}</span></button>`).join('')}</div>
    </div>
    <div class="section">
      <p class="kicker">${esc(c.kind)}</p>
      <h2 class="case-title">${esc(c.name)}</h2>
      <p class="case-q">${esc(c.question)}</p>
      <div class="factgrid">${c.facts.map(f => `<div class="fact"><b>${esc(f.value)}</b><div class="l">${esc(f.label)}</div><div class="s">${esc(f.scope)}. ${src(f.source)}</div></div>`).join('')}</div>
    </div>
    <div class="section">
      <span class="label">Four ways to read this system</span>
      <div class="seg lens-tabs" role="group">${[['water', 'Water'], ['life', 'Life'], ['people', 'People'], ['change', 'Change']].map(([k, l]) => `<button data-lens="${k}" aria-pressed="${S.lens === k}">${l}</button>`).join('')}</div>
      <h3 class="lens-title">${esc(lens.title)}</h3>
      <p class="small" style="margin:0;color:var(--ink-2)">${esc(lens.text)}</p>
      ${lens.path ? `<div class="flow">${lens.path.map((p, i) => `${i ? '<i>→</i>' : ''}<span style="animation-delay:${i * 90}ms">${esc(p)}</span>`).join('')}</div>` : ''}
      <p class="src">Source: ${src(lens.source)}</p>
    </div>
    ${caseExtras(c)}
    ${linked.length ? `<div class="section"><span class="label">Survey entries in this system (${linked.length})</span>
      <div class="chips">${linked.map(e => `<button class="chip" data-case-entry="${e.id}" data-id="${e.id}">${esc(short(e.name))}</button>`).join('')}</div>
      <p class="hint">Orange circles on the map. Click a name to go there.</p></div>` : ''}`;
}
function caseExtras(c) {
  const R = C.research;
  const ev = R.evidence.filter(x => x.system === c.id).map(x => `<div class="evid"><b>${esc(x.value)}</b><div class="t">${esc(x.title)}</div><p>${esc(x.meaning)}</p><p class="lim">${esc(x.period)}. ${esc(x.limit)}</p></div>`).join('');
  if (c.id === 'yangtze') {
    const max = Math.max(...R.sediment.map(s => s.before));
    return `<div class="section"><div class="minichart"><h3>Sediment reaching three stations</h3>
      <p class="hint" style="margin-top:0">Mean load, million tonnes a year. Toggle the period.</p>
      <div class="seg" role="group" style="margin:6px 0 8px">${['before', 'after'].map(p => `<button data-sed="${p}" aria-pressed="${(S.sed || 'before') === p}">${p === 'before' ? '1960–2002' : '2003–2019'}</button>`).join('')}</div>
      ${R.sediment.map(s => { const v = s[S.sed || 'before']; return `<div class="hbar"><span>${esc(s.name)}</span><span class="t"><i style="width:${v / max * 100}%;background:#b07a3a"></i></span><span class="v">${fmt(v)}</span></div>`; }).join('')}
      <p class="src">Zhu et al. (2023). The Three Gorges Dam closed in 2003.</p></div>${ev}</div>`;
  }
  if (c.id === 'nile') {
    const f = R.nileFlow;
    const steps = [['Natural flow', f.naturalized, '#3a7fa8'], ['Upstream use', -f.abstraction, '#d9711c'], ['Reservoir evaporation', -f.reservoirEvaporation, '#e3a21a'], ['Arrives at the dam', f.baseline, '#1f6f6b']];
    return `<div class="section"><div class="minichart"><h3>Where the Nile's water goes</h3>
      <p class="hint" style="margin-top:0">${esc(f.unit)} at the ${esc(f.location.toLowerCase())}, modeled for ${esc(f.climatePeriod)}.</p>
      ${steps.map(([l, v, col]) => `<div class="hbar"><span>${esc(l)}</span><span class="t"><i style="width:${Math.abs(v) / f.naturalized * 100}%;background:${col}"></i></span><span class="v">${v > 0 ? '' : '−'}${Math.abs(v)}</span></div>`).join('')}
      </div>${ev}</div>`;
  }
  if (c.id === 'greatlakes') {
    const max = Math.max(...C.lakes.map(l => l.retention));
    return `<div class="section"><div class="minichart"><h3>How long water stays in each lake</h3>
      <p class="hint" style="margin-top:0">Retention time in years (log scale), with the 2025 condition rating.</p>
      ${C.lakes.map(l => `<div class="hbar"><span>${esc(l.name)}</span><span class="t"><i style="width:${Math.log10(1 + l.retention) / Math.log10(1 + max) * 100}%;background:${{Good: '#2ca25f', Poor: '#d1495b'}[l.condition] || '#e3a21a'}"></i></span><span class="v">${fmt(l.retention)} yr</span></div><div class="small muted" style="margin:-2px 0 4px 84px">${esc(l.condition)}, ${esc(l.trend.toLowerCase())}</div>`).join('')}
      <p class="src">A short retention time does not mean good condition: Erie flushes fastest and rates poorest.</p></div></div>`;
  }
  return ev ? `<div class="section">${ev}</div>` : '';
}

function renderRightCases() {
  const c = caseById[S.caseId];
  const d = caseData[S.caseId];
  const right = $('#right');
  const isOahu = c.id === 'oahu';
  let inspector;
  if (!d) inspector = '<p class="muted">Loading geography…</p>';
  else if (isOahu) inspector = oahuInspector(d);
  else inspector = basinInspector(d);
  right.innerHTML = `
    <div class="tabs"><button role="tab" aria-selected="true">Map and drainage</button><span class="spacer"></span><button class="icon sheet-close" data-close-sheet aria-label="Close">✕</button></div>
    <div class="tabbody">
      ${isOahu ? `<span class="label">State layers for Oʻahu</span>
        <div class="seg" role="group">${[['watersheds', 'Watersheds'], ['aquifers', 'Aquifers'], ['streams', 'Streams']].map(([k, l]) => `<button data-oahu="${k}" aria-pressed="${S.oahuLayer === k}">${l}</button>`).join('')}</div>`
    : `<span class="label">Color drainage units by</span>
        <select class="sel" id="indicator"><option value="none" ${S.indicator === 'none' ? 'selected' : ''}>Drainage only</option>${Object.entries(AQ).map(([k, l]) => `<option value="${k}" ${S.indicator === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${S.indicator !== 'none' && d ? aqLegend(d) : ''}`}
      <div class="section" style="margin-top:12px">${inspector}</div>
      <div class="section"><span class="label">Layers</span>
        <div class="layer-toggles">${[['basins', isOahu ? 'Hydro basins' : 'Drainage units'], ['rivers', 'Rivers'], ['lakes', 'Lakes'], ['marine', 'Sea areas'], ['borders', 'Borders'], ['cities', 'Cities'], ['ports', 'Ports'], ['entries', 'Survey entries']]
          .filter(([k]) => !(isOahu && ['basins', 'rivers', 'lakes', 'marine', 'borders'].includes(k)))
          .map(([k, l]) => `<label class="check"><input type="checkbox" data-layer="${k}" ${S.layers[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <p class="src" style="margin-top:8px">${isOahu ? 'Hawaiʻi State CWRM watersheds (2024), DAR streams (2008), aquifer sectors with 2019 sustainable yields.' : `HydroBASINS v1c level ${c.level} drainage units.${c.level !== 6 ? ' Each shows the Aqueduct value of the level 6 unit that contains it.' : ''} ${esc(C.waterPressure.citation.replace(/\.$/, ''))}. Model inputs ${esc(C.waterPressure.baseline.split('.')[0].toLowerCase())}.`}</p>
      </div>
    </div>`;
}
function aqLegend(d) {
  const k = S.indicator;
  const area = new Map();
  let total = 0;
  for (const p of d.byB.values()) { const c = p[k] ?? 'none'; area.set(c, (area.get(c) || 0) + p.area); total += p.area; }
  const cats = [-1, 0, 1, 2, 3, 4, 'none'].filter(c => area.get(c));
  return `<div class="sharebar">${cats.map(c => `<i title="${esc(c === 'none' ? 'No data' : aqLabel(k, c))}" style="width:${(area.get(c) / total * 100).toFixed(2)}%;background:${c === 'none' ? '#e4e4e4' : AQ_COLORS[c]}"></i>`).join('')}</div>
    <div class="legend">${cats.map(c => `<div class="stepnote"><i class="sw" style="background:${c === 'none' ? '#e4e4e4' : AQ_COLORS[c]}"></i><span>${esc(c === 'none' ? 'No data' : aqLabel(k, c))}</span><span class="n" style="margin-left:auto">${(v => (v < 0.5 ? '<1' : v.toFixed(0)))(area.get(c) / total * 100)}% of area</span></div>`).join('')}</div>`;
}
function basinInspector(d) {
  if (!S.basin || !d.byB.has(S.basin)) {
    return `<div class="inspector"><h3>Trace the water</h3>
      <p class="small" style="margin:6px 0 10px">Click any drainage unit on the map. Everything that drains into it turns teal; the path it takes downstream is outlined in orange.</p>
      <button class="btn" data-trace-parent style="white-space:normal;text-align:left">Trace the main basin: ${esc(caseById[S.caseId].parentLabel || 'parent basin')}</button></div>`;
  }
  const p = d.byB.get(S.basin);
  const up = upstreamOf(d, S.basin), down = downstreamOf(d, S.basin);
  const upArea = up.reduce((a, id) => a + d.byB.get(id).area, 0);
  const k = S.indicator === 'none' ? 'bws' : S.indicator;
  const share = new Map();
  for (const id of up) { const b = d.byB.get(id); const c = b[k] ?? 'none'; share.set(c, (share.get(c) || 0) + b.area); }
  const cats = [-1, 0, 1, 2, 3, 4, 'none'].filter(c => share.get(c));
  const outlet = down.length ? d.byB.get(down[down.length - 1]) : p;
  const end = outlet.endo ? 'an inland sink' : outlet.down === 0 ? 'the sea' : 'the edge of this map extract';
  const pct = v => (v < 0.5 ? '<1' : v.toFixed(0)) + '%';
  const cities = d.cities.features.filter(f => up.includes(f.properties.basin)).map(f => f.properties.name);
  return `<div class="inspector">
    <p class="kicker">Drainage unit ${p.pfaf}</p>
    <h3>${fmt(upArea)} km² drain here</h3>
    <div class="stats">
      <div class="stat"><b>${up.length}</b><span>units upstream, including this one</span></div>
      <div class="stat"><b>${down.length}</b><span>${down.length ? `units downstream before ${end}` : `units downstream: drains straight to ${end}`}</span></div>
    </div>
    <span class="label" style="margin-top:10px">${esc(AQ[k])} upstream</span>
    <div class="sharebar">${cats.map(c => `<i title="${esc(c === 'none' ? 'No data' : aqLabel(k, c))}" style="width:${(share.get(c) / upArea * 100).toFixed(2)}%;background:${c === 'none' ? '#e4e4e4' : AQ_COLORS[c]}"></i>`).join('')}</div>
    <p class="small muted" style="margin:0">${cats.map(c => `${esc(c === 'none' ? 'No data' : aqLabel(k, c))} ${pct(share.get(c) / upArea * 100)}`).join(' · ')}</p>
    ${cities.length ? `<p class="small" style="margin:10px 0 0"><b>Cities in the upstream area:</b> ${cities.slice(0, 12).map(esc).join(', ')}${cities.length > 12 ? ` and ${cities.length - 12} more` : ''}</p>` : ''}
    <p class="hint">Source upstream area for this unit, including parts outside this extract: ${fmt(p.up)} km².</p>
    <div style="display:flex;gap:8px;margin-top:8px"><button class="btn small" data-zoom-up>Zoom to upstream</button><button class="btn small" data-clear-basin>Clear</button>${p.down && d.byB.has(p.down) ? '<button class="btn small" data-step-down>Step downstream</button>' : ''}</div>
  </div>`;
}
function oahuInspector(d) {
  const total = d.aquifers.features.reduce((a, f) => a + (f.properties.yield || 0), 0);
  const perennial = d.streams.features.filter(f => f.properties.type === 'PERENNIAL').length;
  let pick = '';
  if (oahuPick) {
    const p = oahuPick.props;
    pick = oahuPick.layer === 'o-aquifers'
      ? `<div class="inspector" style="margin-top:10px"><p class="kicker">Aquifer system ${esc(p.code)}</p><h3>${esc(p.name)}</h3><p class="small">${esc(p.sector)} sector · ${fmt(p.area)} km²<br><b>${p.yield ?? 'n/a'}</b> million gallons a day sustainable yield (2019), ${p.yield ? (p.yield / total * 100).toFixed(0) : 0}% of the island total.</p></div>`
      : `<div class="inspector" style="margin-top:10px"><p class="kicker">State watershed ${esc(p.code)}</p><h3>${esc(p.name)}</h3><p class="small">${fmt(p.area)} km²</p></div>`;
  }
  return `<div class="inspector"><h3>An island of short rivers</h3>
    <p class="small" style="margin:6px 0">87 watersheds and ${d.streams.features.length.toLocaleString('en-US')} stream segments (${perennial.toLocaleString('en-US')} flow all year). Groundwater supplies most drinking water: the aquifer systems have an adopted sustainable yield of ${total} million gallons a day.</p>
    <p class="hint">Click a watershed or aquifer for details. Yields are planning figures, not measured pumping.</p></div>${pick}`;
}

// ---------- about ----------
function renderAbout() {
  const k = C.counts;
  const onMap = E.filter(e => e.points.length).length;
  $('#about').innerHTML = `<article>
    <p class="kicker">About the data</p>
    <h1>What this atlas shows</h1>
    <p>The atlas maps a survey of port cities and the waters they depend on. Each entry is a port-metro: one or more cities that share a port system. Several entries can sit on the same sea or river, so the survey also groups them into shared waters.</p>
    <div class="bignums">
      <div><b>${k.entries}</b><span>port-metro entries</span></div>
      <div><b>${onMap}</b><span>on the map (${k.matched} matched by city name and country)</span></div>
      <div><b>${E.length - onMap}</b><span>listed but not drawn: no confident location yet</span></div>
      <div><b>${C.cases.length}</b><span>case studies with drainage maps</span></div>
    </div>
    <h2>The survey</h2>
    <p>${esc(C.source.filename)}. Definitions follow ${esc(C.source.definitionReference.replace(/\.$/, ''))}. Population, GDP and container figures are approximate source estimates. Scores of 1 to 5 are the survey's own rubric.</p>
    <ul>${C.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <p>The Patterns tab describes regularities in the survey. Its numbers are computed from these ${k.entries} entries when the tab opens. They describe the survey, with the limits above, not measured conditions in the world.</p>
    <h2>How places are mapped</h2>
    <p>A circle marks a named city from Natural Earth that matches the entry's name and country. It is a reference point, not a port footprint or metro boundary. Entries without a confident match are listed but not drawn.</p>
    <h2>Case-study geography</h2>
    <p>Drainage units are HydroBASINS v1c (Lehner and Grill, 2013): level 6, except Tokyo Bay and New York at the finer level 8, where each unit shows the water-risk value of the level 6 unit that contains it. Water stress, depletion and variability come from ${esc(C.waterPressure.citation)}. ${esc(C.waterPressure.baseline)} Oʻahu layers are Hawaiʻi State datasets: CWRM watersheds, DAR streams, and aquifer sectors with 2019 sustainable yields.</p>
    <h2>Map</h2>
    <p>Basemap from OpenFreeMap with OpenMapTiles and OpenStreetMap contributors. Rendering by MapLibre GL.</p>
    <p>The atlas is part of the <a href="../">CADT Workshop 2026</a> website.</p>
    <p><button class="btn primary" data-mode-link="explore">Back to the map</button></p>
  </article>`;
}

// ---------- tour ----------
const TOUR = [
  {k: 'Urban Sea Atlas', t: 'Cities live inside water systems', p: `${E.length} port-metros, from Tokyo Bay to small river towns. Each circle is sized by metro population. Rivers and seas connect many of them.`, go: () => { setMode('explore'); map.flyTo({center: [15, 22], zoom: 2.1, duration: 2200}); }},
  ...['salish', 'chesapeake', 'newyork', 'greatlakes', 'neworleans', 'oahu', 'tokyo', 'yangtze', 'nile'].map(id => ({
    k: caseById[id].kind, t: caseById[id].name, p: `${caseById[id].tagline} ${caseById[id].facts[0].value}: ${caseById[id].facts[0].label.toLowerCase()}.`,
    go: () => { S.basin = null; setMode('cases', id); },
  })),
  {k: 'Your turn', t: 'Explore on your own', p: 'Filter the survey, re-weight a ranking, draw a box on the chart, or click any drainage unit to trace where its water goes.', go: () => { setMode('explore'); map.flyTo({center: [15, 22], zoom: 2.1, duration: 2000}); }},
];
let tourStep = -1, tourTimer = null, tourPlay = true;
function tour(step) {
  stopSpin();
  clearTimeout(tourTimer);
  if (step < 0 || step >= TOUR.length) { $('#tour').hidden = true; tourStep = -1; syncPadding(); return; }
  tourStep = step;
  syncPadding();
  const s = TOUR[step];
  s.go();
  const el = $('#tour');
  el.hidden = false;
  el.innerHTML = `<p class="k">${esc(s.k)}</p><h2>${esc(s.t)}</h2><p>${esc(s.p)}</p>
    <div class="progress"><i id="tourbar"></i></div>
    <div class="nav"><div class="dots">${TOUR.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn small" data-tour="close">Close</button>
      ${step ? '<button class="btn small" data-tour="prev">Back</button>' : ''}
      <button class="btn small" data-tour="pause">${tourPlay ? 'Pause' : 'Play'}</button>
      <button class="btn small primary" data-tour="next">${step === TOUR.length - 1 ? 'Finish' : 'Next'}</button></div>`;
  if (tourPlay && step < TOUR.length - 1) {
    const bar = $('#tourbar');
    bar.animate([{width: '0%'}, {width: '100%'}], {duration: 9000, fill: 'forwards'});
    tourTimer = setTimeout(() => tour(step + 1), 9000);
  }
}

// ---------- modes ----------
function setMode(mode, caseId) {
  const prev = S.mode;
  S.mode = mode;
  document.body.dataset.mode = mode;
  $$('[data-mode-link]').forEach(b => b.getAttribute('aria-pressed') !== null && b.setAttribute('aria-pressed', b.dataset.modeLink === mode));
  $('#about').hidden = mode !== 'about';
  if (mode === 'about') renderAbout();
  if (mode !== 'cases' && prev === 'cases') { clearCaseLayers(); oahuPick = null; }
  if (mode === 'cases') { stopSpin(); oahuPick = null; showCase(caseId || S.caseId); }
  else {
    S.layers.entries = true;
    for (const l of ['entries', 'entry-labels', 'sel-ring', 'sel-line']) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', 'visible');
    refreshEntries(); renderLeft(); renderRight();
  }
  if (prev !== mode) resetScroll();
  if (map.isStyleLoaded()) syncPadding();
  closeSheets();
  saveHash();
}
function renderLeft() { if (S.mode === 'cases') renderLeftCases(); else renderLeftExplore(); }
function resetScroll() { $('#left').scrollTop = 0; const b = $('#tabbody'); if (b) b.scrollTop = 0; }
function update({keepRight = false} = {}) {
  rankCache = null;
  refilter();
  refreshEntries();
  renderLeft();
  if (!keepRight) renderRight();
  saveHash();
}

// ---------- events ----------
document.addEventListener('click', ev => {
  const t = ev.target.closest('button, a[data-mode-link]');
  if (!t) return;
  const d = t.dataset;
  if (d.modeLink) { ev.preventDefault(); if (S.mode === d.modeLink && d.modeLink === 'explore' && t.classList.contains('brand')) { map.flyTo({center: [15, 22], zoom: 2.1}); } setMode(d.modeLink); return; }
  if (d.tier !== undefined) { S.tier = d.tier; update(); return; }
  if (d.facet) {
    const set = {region: S.regions, type: S.types, band: S.bands}[d.facet];
    set.has(d.v) ? set.delete(d.v) : set.add(d.v); update(); return;
  }
  if (d.legend !== undefined) { S.hidden.has(d.legend) ? S.hidden.delete(d.legend) : S.hidden.add(d.legend); update(); return; }
  if (d.reset !== undefined) { Object.assign(S, {q: '', tier: '', strategic: false, crossBorder: false, hasCase: false, group: '', brush: null, pattern: null, topN: 0}); S.regions.clear(); S.types.clear(); S.bands.clear(); S.hidden.clear(); update(); return; }
  if (d.clearBrush !== undefined) { S.brush = null; S.pattern = null; update(); return; }
  if (d.pattern) { showPattern(d.pattern); return; }
  if (d.plot) { [S.cx, S.cy] = d.plot.split(','); S.tab = 'chart'; renderRight(); saveHash(); return; }
  if (d.clearTop !== undefined) { S.topN = 0; update(); return; }
  if (d.pick) { S.q = ''; sugIndex = -1; update(); select(+d.pick); return; }
  if (d.select) { select(+d.select); return; }
  if (d.selectRank) { select(+d.selectRank, {tab: 'rank'}); return; }
  if (d.tab) { S.tab = d.tab; renderRight(); saveHash(); return; }
  if (d.wide !== undefined) { S.wide = !S.wide; renderRight(); syncPadding(); return; }
  if (d.axis) { S.axis = d.axis; S.weights = null; rankLimit = 120; rankCache = null; if (S.colorBy === 'band') S.hidden.clear(); update(); return; }
  if (d.gotoAxis) { S.axis = d.gotoAxis; S.weights = null; S.tab = 'rank'; update(); requestAnimationFrame(() => $('.rk.sel')?.scrollIntoView({block: 'center', behavior: 'smooth'})); return; }
  if (d.resetWeights !== undefined) {
    flipRanks(() => { S.weights = null; rankCache = null; refilter(); refreshRankList(); });
    $$('[data-weight]').forEach(i => { i.value = 1; i.nextElementSibling.textContent = '1'; });
    refreshEntries(); saveHash(); return;
  }
  if (d.moreRanks !== undefined) { rankLimit += 120; refreshRankList(); return; }
  if (d.q) { [S.cx, S.cy] = d.q.split(','); renderRight(); return; }
  if (d.setGroup) { S.group = d.setGroup; update({keepRight: true}); fitEntries(groupById[d.setGroup].entryIds.map(i => byId.get(i))); return; }
  if (d.openCase) { S.basin = null; setMode('cases', d.openCase); return; }
  if (d.openEntry) { if (popup) popup.remove(); setMode('explore'); select(+d.openEntry); return; }
  if (d.caseEntry) {
    const e = byId.get(+d.caseEntry);
    if (e.points.length) {
      const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]);
      fitBox([Math.min(...xs) - 1, Math.min(...ys) - 0.8, Math.max(...xs) + 1, Math.max(...ys) + 0.8], {maxZoom: 7});
    }
    casePopup(e);
    if (isNarrow()) closeSheets();
    return;
  }
  if (d.case) { S.basin = null; oahuPick = null; if (popup) popup.remove(); showCase(d.case).then(resetScroll); saveHash(); if (isNarrow()) closeSheets(); return; }
  if (d.lens) { S.lens = d.lens; renderLeftCases(); return; }
  if (d.sed) { S.sed = d.sed; renderLeftCases(); return; }
  if (d.oahu) { S.oahuLayer = d.oahu; oahuPick = null; showCase('oahu', {fly: false}); return; }
  if (d.traceParent !== undefined) { const dd = caseData[S.caseId]; const p = dd && dd.byB.get(dd.parent) ? dd.parent : [...(dd?.byB.values() || [])].sort((a, b) => b.up - a.up)[0]?.id; if (p) pickBasin(p); return; }
  if (d.clearBasin !== undefined) { clearBasin(); return; }
  if (d.stepDown !== undefined) { const dd = caseData[S.caseId]; pickBasin(dd.byB.get(S.basin).down); return; }
  if (d.zoomUp !== undefined) { zoomUp(); return; }
  if (d.tour) {
    if (d.tour === 'close') tour(-1);
    if (d.tour === 'next') tour(tourStep + 1);
    if (d.tour === 'prev') tour(tourStep - 1);
    if (d.tour === 'pause') { tourPlay = !tourPlay; tour(tourStep); }
    return;
  }
  if (d.closeSheet !== undefined) { closeSheets(); return; }
});
function zoomUp() {
  const dd = caseData[S.caseId];
  if (!dd || !S.basin) return;
  fitBox(bboxOf(upstreamOf(dd, S.basin).map(id => dd.featById.get(id))), {maxZoom: 8});
}

document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'q') {
    S.q = t.value; sugIndex = -1;
    rankCache = null; refilter(); refreshEntries();
    // update counter and right panel without rebuilding the input
    const counter = $('.counter');
    if (counter) counter.innerHTML = `<b>${visible.length}</b><span>of ${E.length} port-metro entries · ${visible.filter(e => e.points.length).length} on the map</span>`;
    $('.bar-total i') && ($('.bar-total i').style.width = (visible.length / E.length * 100).toFixed(1) + '%');
    renderSuggest(); renderRight(); saveHash();
    return;
  }
  if (t.dataset.weight !== undefined) {
    const ax = axisById[S.axis];
    const w = S.weights ? [...S.weights] : ax.components.map(() => 1);
    w[+t.dataset.weight] = +t.value;
    t.nextElementSibling.textContent = t.value;
    flipRanks(() => { S.weights = w; rankCache = null; refilter(); refreshRankList(); });
    refreshEntries(); saveHash();
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'group') { S.group = t.value; update(); if (t.value) fitEntries(groupById[t.value].entryIds.map(i => byId.get(i))); }
  if (t.id === 'fStrategic') { S.strategic = t.checked; update(); }
  if (t.id === 'fCross') { S.crossBorder = t.checked; update(); }
  if (t.id === 'fCase') { S.hasCase = t.checked; update(); }
  if (t.id === 'colorBy') { S.colorBy = t.value; S.hidden.clear(); update(); }
  if (t.id === 'sizeBy') { S.sizeBy = t.value; update(); }
  if (t.id === 'topN') { S.topN = +t.value; update(); }
  if (t.id === 'cx') { S.cx = t.value; renderRight(); }
  if (t.id === 'cy') { S.cy = t.value; renderRight(); }
  if (t.id === 'listView') { S.listView = t.checked; renderRight(); }
  if (t.id === 'listSort') { S.listSort = t.value; renderRight(); }
  if (t.id === 'indicator') {
    S.indicator = t.value;
    if (map.getLayer('c-basins')) map.setPaintProperty('c-basins', 'fill-color', S.indicator === 'none' ? '#cfe3d6' : aqColorExpr(S.indicator));
    renderRight(); saveHash();
  }
  if (t.dataset.layer) {
    S.layers[t.dataset.layer] = t.checked;
    const ids = {basins: ['c-basins', 'c-basins-line'], rivers: ['c-rivers'], lakes: ['c-lakes'], marine: ['c-marine', 'c-marine-labels'], borders: ['c-borders'], cities: ['c-cities', 'c-city-labels'], ports: ['c-ports'], entries: ['entries', 'entry-labels', 'sel-ring', 'sel-line']}[t.dataset.layer];
    for (const l of ids) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', t.checked ? 'visible' : 'none');
  }
});
document.addEventListener('focusin', ev => { if (ev.target.id === 'q') renderSuggest(); });
document.addEventListener('focusout', ev => { if (ev.target.id === 'q') setTimeout(() => { const b = $('#suggest'); if (b) b.hidden = true; }, 150); });
document.addEventListener('keydown', ev => {
  if (ev.key === '/' && document.activeElement?.tagName !== 'INPUT' && S.mode === 'explore') { ev.preventDefault(); $('#q')?.focus(); return; }
  if (ev.target.id === 'q') {
    const list = suggestions(S.q);
    if (ev.key === 'ArrowDown') { sugIndex = Math.min(list.length - 1, sugIndex + 1); renderSuggest(); ev.preventDefault(); }
    if (ev.key === 'ArrowUp') { sugIndex = Math.max(-1, sugIndex - 1); renderSuggest(); ev.preventDefault(); }
    if (ev.key === 'Enter' && list.length) { const e = list[Math.max(0, sugIndex)]; S.q = ''; sugIndex = -1; ev.target.blur(); update(); select(e.id); }
    if (ev.key === 'Escape') { ev.target.blur(); }
    return;
  }
  if (ev.key === 'Escape') {
    if (tourStep >= 0) { tour(-1); return; }
    if (S.mode === 'about') { setMode('explore'); return; }
    if (S.mode === 'cases' && S.basin) { clearBasin(); return; }
    if (S.selected !== null) { select(null); }
  }
});
document.addEventListener('mouseover', ev => {
  const t = ev.target.closest('[data-id]');
  if (!t || t.closest('#chart')) return;
  setHover(+t.dataset.id, 'list');
});
document.addEventListener('mouseout', ev => {
  const t = ev.target.closest('[data-id]');
  if (t && !t.contains(ev.relatedTarget) && !t.closest('#chart')) setHover(null, 'list');
});
$('#tourBtn').addEventListener('click', () => { tourPlay = true; tour(0); });
$('#shareBtn').addEventListener('click', async () => {
  saveHash();
  try { await navigator.clipboard.writeText(location.href); toast('Link copied. It reopens this view.'); }
  catch (_) { toast('Copy the address bar to share this view.'); }
});

// mobile sheets
function openSheet(which) { closeSheets(); $('#' + which).classList.add('open'); document.body.classList.add('sheet-open'); }
function closeSheets() { $$('.panel').forEach(p => p.classList.remove('open')); document.body.classList.remove('sheet-open'); }
$('#leftToggle').addEventListener('click', () => openSheet('left'));
$('#rightToggle').addEventListener('click', () => openSheet('right'));

let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }

// ---------- shareable links ----------
let hashTimer;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    p.set('m', S.mode);
    if (S.mode === 'cases') { p.set('case', S.caseId); if (S.indicator !== 'bws') p.set('ind', S.indicator); if (S.basin) p.set('basin', S.basin); }
    else {
      if (S.selected !== null) p.set('e', S.selected);
      if (S.tab !== 'rank') p.set('tab', S.tab);
      if (S.axis !== 'A') p.set('axis', S.axis);
      if (isScenario()) p.set('w', S.weights.join('_'));
      if (S.colorBy !== 'type') p.set('color', S.colorBy);
      if (S.sizeBy !== 'population') p.set('size', S.sizeBy);
      if (S.tier) p.set('tier', S.tier);
      if (S.regions.size) p.set('region', [...S.regions].join('|'));
      if (S.types.size) p.set('type', [...S.types].join('|'));
      if (S.bands.size) p.set('band', [...S.bands].join('|'));
      if (S.group) p.set('group', S.group);
      if (S.q) p.set('q', S.q);
      if (S.topN) p.set('top', S.topN);
      if (S.tab === 'chart') { p.set('x', S.cx); p.set('y', S.cy); }
      if (S.pattern) p.set('pattern', S.pattern);
    }
    history.replaceState(null, '', '#' + p.toString());
  }, 250);
}
function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const get = k => p.get(k);
  if (get('axis') && axisById[get('axis')]) S.axis = get('axis');
  if (get('w')) { const w = get('w').split('_').map(Number); if (w.length === axisById[S.axis].components.length && w.every(Number.isFinite)) S.weights = w; }
  if (get('color') && COLOR_BY[get('color')]) S.colorBy = get('color');
  if (get('size') && SIZE_BY[get('size')]) S.sizeBy = get('size');
  if (['M', 'I'].includes(get('tier'))) S.tier = get('tier');
  if (get('region')) get('region').split('|').forEach(v => S.regions.add(v));
  if (get('type')) get('type').split('|').forEach(v => S.types.add(v));
  if (get('band')) get('band').split('|').forEach(v => S.bands.add(v));
  if (get('group') && groupById[get('group')]) S.group = get('group');
  if (get('q')) S.q = get('q');
  if (get('top')) S.topN = +get('top') || 0;
  if (get('x') && numByKey[get('x')]) S.cx = get('x');
  if (get('y') && numByKey[get('y')]) S.cy = get('y');
  if (['entry', 'rank', 'chart', 'patterns', 'list'].includes(get('tab'))) S.tab = get('tab');
  if (get('pattern') && patternById[get('pattern')]) { const pt = patternById[get('pattern')]; S.pattern = pt.id; S.brush = pt.ids ? new Set(pt.ids().map(e => e.id)) : null; }
  if (get('e') && byId.has(+get('e'))) { S.selected = +get('e'); if (!get('tab')) S.tab = 'entry'; }
  if (get('ind') && (AQ[get('ind')] || get('ind') === 'none')) S.indicator = get('ind');
  if (get('basin')) S.basin = +get('basin');
  const mode = ['explore', 'cases', 'about'].includes(get('m')) ? get('m') : 'explore';
  const caseId = caseById[get('case')] ? get('case') : 'salish';
  return {mode, caseId};
}

// ---------- start ----------
const start = loadHash();
refilter();
if (start.mode !== 'explore' || S.selected !== null || location.hash.length > 3) stopSpin();
S.caseId = start.caseId;
setMode(start.mode, start.caseId);
if (S.selected !== null) map.once('style.load', () => {
  const e = byId.get(S.selected);
  syncPadding();
  if (e.points.length) map.jumpTo({center: [e.points[0][0], e.points[0][1]], zoom: 4.5});
});
window.atlas = {S, map, select, setMode, update, tour};
})();
