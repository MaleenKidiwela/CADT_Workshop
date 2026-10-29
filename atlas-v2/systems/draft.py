"""Draft Urban Sea Systems from the survey entries, following Greene and Delaney (2025).

    python3 atlas-v2/systems/draft.py

A system is one or more port cities, the proximal sea connected to the open
ocean, and the entire watershed draining to it. This script applies that
definition mechanically to the 582 survey entries in the atlas and reports three variants
of the one choice the paper leaves open: how large a "proximal sea" can be.

Inputs: atlas-v2/site/data/catalog.js (survey entries and mapped points),
HydroBASINS v1c level 6 for all regions, Natural Earth 10m marine polygons
(all in ~/Downloads). Output: atlas-v2/systems/draft.json. Draft only; it does
not change the atlas or the website.
"""
import collections, json, math, pathlib, re, sys, unicodedata

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / 'atlas-src'))
sys.path.insert(0, str(HERE))
from geodata import dbf, contains, in_ring, DOWNLOADS  # noqa: E402
import seas  # noqa: E402
import struct, zipfile  # noqa: E402

REGIONS = ['af', 'ar', 'as', 'au', 'eu', 'na', 'sa', 'si']
VARIANTS = [
    ('watershed', 'Shared watershed only', 0),
    ('bays', 'Shared watershed, or the same bay, sound or small sea up to 50,000 km2', 50_000),
    ('seas', 'Shared watershed, or the same enclosed sea up to 600,000 km2 (Baltic, Black Sea, Persian Gulf scale)', 600_000),
    ('enclosed', 'Shared watershed, the same bay or sound up to 50,000 km2, or the same semi-enclosed sea', 50_000),
]
# Semi-enclosed seas joined to the ocean by a narrow passage, as the paper's Salish Sea,
# Chesapeake Bay and Baltic Sea examples are. Natural Earth splits several of them into
# parts; each list rejoins the parts. A hand-made list: it needs review.
SEMI_ENCLOSED = {
    'Baltic Sea': ['Baltic Sea', 'Gulf of Bothnia', 'Gulf of Finland', 'Gulf of Riga', 'Bay of Mecklenburg', 'Kaliningrad', 'Szczecin Lagoon', 'Øresund', '#generic-15182'],
    'Black Sea': ['Black Sea', 'Sea of Azov'],
    'Red Sea': ['Red Sea', 'Gulf of Suez', 'Gulf of Aqaba', 'Bab-el-Mandeb'],
    'Persian Gulf': ['Persian Gulf'],
    'Adriatic Sea': ['Adriatic Sea'],
    'Bohai Sea': ['Bohai Sea'],
    'White Sea': ['White Sea'],
    'Gulf of California': ['Gulf of California'],
    'Irish Sea': ['Irish Sea'],
}
FAR_UPSTREAM_KM = 1000


def read_basins(region):
    base = f'hybas_{region}_lev06_v1c'
    with zipfile.ZipFile(DOWNLOADS / f'{base}.zip') as z:
        rows = dbf(z.read(base + '.dbf'))
        data = z.read(base + '.shp')
    offset, out = 100, []
    while offset < len(data):
        number, words = struct.unpack_from('>II', data, offset)
        offset += 8
        rec = data[offset:offset + words * 2]
        offset += words * 2
        bbox = list(struct.unpack_from('<4d', rec, 4))
        parts_n, points_n = struct.unpack_from('<II', rec, 36)
        starts = list(struct.unpack_from('<' + 'I' * parts_n, rec, 44)) + [points_n]
        pts = list(struct.iter_unpack('<2d', rec[44 + parts_n * 4:44 + parts_n * 4 + points_n * 16]))
        out.append({**rows[number - 1], 'bbox': bbox, 'rings': [pts[starts[i]:starts[i + 1]] for i in range(parts_n)], 'region': region})
    return out


def haversine(a, b):
    (x1, y1), (x2, y2) = a, b
    p1, p2 = math.radians(y1), math.radians(y2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(x2 - x1) / 2) ** 2
    return 2 * seas.R * math.asin(math.sqrt(h))


def climate_zone(lat):
    a = abs(lat)
    return 'Polar or Arctic' if a > 70 else 'Sub-polar or Boreal' if a >= 50 else 'Temperate or Mediterranean' if a >= 35 else 'Sub-tropical' if a >= 15 else 'Tropical'


def size_class(area):
    # Appendix A thresholds. The paper's Meso (1,000-100,000) and Macro (>10,000) overlap;
    # here Macro starts at 100,000 km2.
    return None if area is None else 'Micro' if area < 1_000 else 'Meso' if area < 100_000 else 'Macro' if area < 10_000_000 else 'Mega'


catalog_js = (HERE.parent / 'site' / 'data' / 'catalog.js').read_text()
C = json.loads(catalog_js[catalog_js.index('{'):catalog_js.rstrip().rstrip(';').rindex('}') + 1])
E = C['entries']
byE = {e['id']: e for e in E}

basins = [b for r in REGIONS for b in read_basins(r)]
by_id = {b['HYBAS_ID']: b for b in basins}
print('basins', len(basins))
meta, grid = seas.load(HERE / '.seas-cache.pkl')
sea = {m['id']: m for m in meta}
for m in meta:
    m['name'] = m['name'] or f"unnamed {m['cla']}"
semi_group = {}
for g, names in SEMI_ENCLOSED.items():
    for n in names:
        ids = [m['id'] for m in meta if (m['name'] == n) or (n.startswith('#generic-') and m['cla'] == 'generic' and str(m['area']) == n.split('-')[1])]
        assert ids, n
        for i in ids:
            semi_group[i] = g
group_sids = collections.defaultdict(set)
for i, g in semi_group.items():
    group_sids[g].add(i)

# Grid index of basins by 1 degree cell for point lookups.
cells = collections.defaultdict(list)
for b in basins:
    x0, y0, x1, y1 = b['bbox']
    for cx in range(math.floor(x0), math.floor(x1) + 1):
        for cy in range(math.floor(y0), math.floor(y1) + 1):
            cells[(cx, cy)].append(b)


def basin_at(pt):
    for b in cells.get((math.floor(pt[0]), math.floor(pt[1])), []):
        if contains(pt, {'bbox': b['bbox'], 'rings': b['rings']}):
            return b, 0.0
    # Points on the shoreline can fall just outside HydroSHEDS land: snap to the nearest vertex within ~30 km.
    best = (None, 1e9)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for b in cells.get((math.floor(pt[0]) + dx, math.floor(pt[1]) + dy), []):
                for ring in b['rings']:
                    for v in ring[::4]:
                        d = haversine(pt, v)
                        if d < best[1]:
                            best = (b, d)
    return best if best[1] <= 30 else (None, best[1])


def outlet(b):
    seen = 0
    while b['NEXT_DOWN']:
        b = by_id[b['NEXT_DOWN']]
        seen += 1
        assert seen < 10000
    return b


receiving_cache = {}


def receiving(o):
    """The marine polygon most of the outlet unit's shoreline vertices touch."""
    if o['HYBAS_ID'] in receiving_cache:
        return receiving_cache[o['HYBAS_ID']]
    votes = collections.Counter()
    verts = [v for ring in o['rings'] for v in ring]
    step = max(1, len(verts) // 400)
    for v in verts[::step]:
        sid, d = seas.nearest(grid, v[0], v[1], radius=3)
        if sid:
            votes[sid] += 1
    sid = votes.most_common(1)[0][0] if votes else None
    receiving_cache[o['HYBAS_ID']] = sid
    return sid


# ---------- place each survey entry ----------
placed, unplaced = {}, []
for e in E:
    hits = []
    for lon, lat, name in e['points']:
        b, snap = basin_at((lon, lat))
        if b:
            hits.append((b, snap, name, (lon, lat)))
    if not hits:
        unplaced.append({'id': e['id'], 'name': e['name'], 'reason': 'no mapped point' if not e['points'] else 'point not within 30 km of a HydroBASINS unit'})
        continue
    # Anchor the entry at its most seaward city: the port, not an inland partner city.
    b, snap, name, pt = min(hits, key=lambda h: h[0]['DIST_MAIN'])
    o = outlet(b)
    placed[e['id']] = {'entry': e, 'basin': b, 'outlet': o, 'snap_km': round(snap, 1), 'point': pt,
                       'endorheic': o['ENDO'] == 2, 'upstream_km': b['DIST_MAIN'],
                       'other_outlets': sorted({outlet(h[0])['MAIN_BAS'] for h in hits} - {o['MAIN_BAS']})}
print('placed', len(placed), 'unplaced', len(unplaced))
ocean_outlets = [b for b in basins if b['NEXT_DOWN'] == 0 and b['ENDO'] == 0]
outlet_cells = collections.defaultdict(list)
for o in ocean_outlets:
    if o['COAST'] == 0:
        x0, y0, x1, y1 = o['bbox']
        for cx in range(math.floor(x0), math.floor(x1) + 1):
            for cy in range(math.floor(y0), math.floor(y1) + 1):
                outlet_cells[(cx, cy)].append(o)
# A port inside a lumped coastal unit often sits at the mouth of a river whose own
# outlet unit is next door (Manhattan and the Hudson). Attach the largest river
# reaching the sea within 25 km of the port.
for p in placed.values():
    if p['outlet']['COAST'] != 1 or p['upstream_km'] > 0:
        continue
    pt, best = p['point'], None
    for o in {id(o): o for dx in (-1, 0, 1) for dy in (-1, 0, 1) for o in outlet_cells.get((math.floor(pt[0]) + dx, math.floor(pt[1]) + dy), [])}.values():
        if best and o['UP_AREA'] <= best['UP_AREA']:
            continue
        if any(haversine(pt, v) <= 25 for ring in o['rings'] for v in ring[::3]):
            best = o
    if best:
        p['river_mouth'] = {'from': p['outlet']['HYBAS_ID'], 'to': best['HYBAS_ID'], 'km2': round(best['UP_AREA'])}
        p['outlet'] = best
# HydroSHEDS draws the Caspian shore as a coastline, but the Caspian has no
# connection to the open ocean, which the paper requires.
NO_OCEAN = {'Caspian Sea'}


def norm_name(n):
    return re.sub(r'[^a-z ]', ' ', unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode().lower()).split()


def named_in_survey(p):
    """A nearby marine area whose name the survey's own Water body column uses."""
    text = ' ' + ' '.join(norm_name(p['entry']['water'] or '')) + ' '
    c, r = int((p['point'][0] + 180) / seas.RES), int((p['point'][1] + 90) / seas.RES)
    near = set()
    for rr in range(max(r - 25, 0), min(r + 26, seas.H)):
        row = grid[rr]
        for dc in range(-25, 26):
            v = row[(c + dc) % seas.W]
            if v:
                near.add(v)
    hits = [sid for sid in near if not sea[sid]['name'].startswith('unnamed') and f" {' '.join(norm_name(sea[sid]['name']))} " in text]
    return min(hits, key=lambda sid: sea[sid]['area']) if hits else None


for p in placed.values():
    o = p['outlet']
    real_river = o['COAST'] == 0 and o['UP_AREA'] > 1.5 * o['SUB_AREA']
    sid = named_in_survey(p)
    p['seaSource'] = 'survey water body' if sid else None
    if not sid and p['upstream_km'] == 0 and not real_river:
        sid = seas.nearest(grid, p['point'][0], p['point'][1], radius=6)[0]
    sid = sid or receiving(o)
    p['sea'] = sid
# Cities upstream on a river take the sea of a city at that river's mouth.
mouth_sea = {}
for p in placed.values():
    if p['upstream_km'] == 0 and p['sea']:
        mouth_sea.setdefault(p['outlet']['MAIN_BAS'], p['sea'])
for p in placed.values():
    if p['upstream_km'] > 0 and p['outlet']['MAIN_BAS'] in mouth_sea:
        p['sea'] = mouth_sea[p['outlet']['MAIN_BAS']]
for p in placed.values():
    if p['sea'] and sea[p['sea']]['name'] in NO_OCEAN:
        p['endorheic'] = True

# Receiving water for every ocean outlet near a sea that receives a survey entry, so that a
# sea-defined system includes all the watersheds draining to it, not only those with survey cities.


def sea_key(sid, cap, semi):
    if not cap or not sid:
        return None
    if semi and sid in semi_group:
        return ('sea', semi_group[sid])
    m = sea[sid]
    # Straits and channels are passages, not enclosed water; the semi-enclosed version leaves them out.
    if semi and m['cla'] in ('strait', 'channel'):
        return None
    if m['cla'] not in ('ocean', 'generic', 'reef') and m['area'] <= cap:
        return ('sea', sid)
    return None


def build(cap, semi=False):
    parent = {}

    def find(k):
        while parent.setdefault(k, k) != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def union(a, b):
        parent[find(a)] = find(b)

    # Within one HydroBASINS river system: cities upstream share the river network;
    # cities in the outlet unit share it only within 75 km, because level 6 lumps
    # many small coastal catchments (all of Taiwan's coast, for example) into one unit.
    live = [p for p in placed.values() if not p['endorheic']]
    by_main = collections.defaultdict(list)
    for p in live:
        by_main[p['outlet']['MAIN_BAS']].append(p)
    for main, ps in by_main.items():
        up = [p for p in ps if p['upstream_km'] > 0]
        mouth = [p for p in ps if p['upstream_km'] == 0]
        for p in ps:
            p['key'] = ('city', p['entry']['id'])
            find(p['key'])
        for a, b in zip(up, up[1:]):
            union(a['key'], b['key'])
        for i, a in enumerate(mouth):
            for b in mouth[i + 1:]:
                # A real river's outlet unit links its cities; a lumped coastal unit only within 75 km.
                if (a['outlet']['COAST'] == 0 and a['outlet']['UP_AREA'] > 1.5 * a['outlet']['SUB_AREA']) or haversine(a['point'], b['point']) <= 75:
                    union(a['key'], b['key'])
        if up and mouth:
            near = min(mouth, key=lambda m: min(haversine(m['point'], u['point']) for u in up))
            union(up[0]['key'], near['key'])
        if up:
            union(up[0]['key'], ('river', main))
    for p in live:
        key = p['key']
        sid = p['sea']
        k = sea_key(sid, cap, semi)
        if k:
            union(key, k)
    groups = collections.defaultdict(list)
    for p in live:
        groups[find(p['key'])].append(p)
    systems = []
    for root, members in groups.items():
        sea_keys = sorted({k[1] for k in parent if k[0] == 'sea' and find(k) == root}, key=str)
        seas_in = sorted({i for k in sea_keys for i in (group_sids[k] if isinstance(k, str) else {k})})
        group_names = [k for k in sea_keys if isinstance(k, str)]
        rivers = {k[1] for k in parent if k[0] == 'river' and find(k) == root}
        if seas_in:
            # Entire enclosing watershed: every ocean outlet draining to these seas.
            bb = [min(sea_bbox[s][0] for s in seas_in) - 1, min(sea_bbox[s][1] for s in seas_in) - 1, max(sea_bbox[s][2] for s in seas_in) + 1, max(sea_bbox[s][3] for s in seas_in) + 1]
            for o in ocean_outlets:
                ob = o['bbox']
                if ob[2] >= bb[0] and ob[0] <= bb[2] and ob[3] >= bb[1] and ob[1] <= bb[3] and receiving(o) in seas_in:
                    rivers.add(o['MAIN_BAS'])
        outlets = {r: by_id[r] for r in rivers}
        for p in members:
            o = p['outlet']
            outlets.setdefault(o['MAIN_BAS'], o)
            # The coastal unit the port itself sits in, when its river mouth is next door.
            own = by_id[p['basin']['MAIN_BAS']]
            outlets.setdefault(own['MAIN_BAS'], own)
        outlets = list(outlets.values())
        # A lumped coastal unit (COAST = 1) is many small catchments, not one river: count only the unit.
        land = sum(o['SUB_AREA'] if o['COAST'] == 1 else o['UP_AREA'] for o in outlets)
        sea_area = sum(sea[s]['area'] for s in seas_in) if seas_in else None
        members.sort(key=lambda p: -(p['entry']['population'] or 0))
        lead = min(members, key=lambda p: (p['upstream_km'], -(p['entry']['population'] or 0)))
        biggest = max(outlets, key=lambda o: o['UP_AREA'])
        name = (' / '.join(group_names + [sea[s]['name'] for s in seas_in if s not in semi_group]) if seas_in
                else lead['entry']['watershed'] if len(members) > 1 and lead['entry']['watershed']
                else short(lead['entry']['name']))
        systems.append({
            'name': name, 'definedBy': 'sea' if seas_in else 'watershed',
            'seas': [sea[s]['name'] for s in seas_in],
            'seaIds': seas_in,
            'mainBasins': sorted(o['MAIN_BAS'] for o in outlets),
            'lumpedCoast': sorted(o['HYBAS_ID'] for o in outlets if o['COAST'] == 1),
            'receivingWater': sea[lead['sea']]['name'] if lead.get('sea') else None,
            'members': [{'id': p['entry']['id'], 'name': p['entry']['name'], 'country': p['entry']['country'], 'tier': p['entry']['tier'],
                         'population': p['entry']['population'], 'upstreamKm': p['upstream_km'], 'snapKm': p['snap_km'], 'lon': round(p['point'][0], 3), 'lat': round(p['point'][1], 3)} for p in members],
            'countries': sorted({p['entry']['country'] for p in members}),
            'watershedKm2': round(land), 'seaKm2': sea_area,
            'areaKm2': round(land + (sea_area or 0)),
            'sizeClass': size_class(land + (sea_area or 0)),
            'largestRiverKm2': round(biggest['UP_AREA']),
            'riverSystems': len(outlets),
            'climate': climate_zone(lead['point'][1]),
            'lat': round(lead['point'][1], 3), 'lon': round(lead['point'][0], 3),
            'surveyMetroPopulation': round(sum(p['entry']['population'] or 0 for p in members), 2),
            'coastalPort': any(p['upstream_km'] == 0 for p in members),
        })
    # Small islands are missing from HydroBASINS level 6. The paper treats an island
    # (O'ahu) as one system, so each becomes its own system with unknown area.
    for u in unplaced:
        e = byE[u['id']]
        if not e['points']:
            continue
        lon, lat = e['points'][0][:2]
        systems.append({'name': short(e['name']), 'definedBy': 'island', 'seas': [], 'receivingWater': None,
                        'members': [{'id': e['id'], 'name': e['name'], 'country': e['country'], 'tier': e['tier'], 'population': e['population'], 'upstreamKm': 0, 'snapKm': None, 'lon': round(lon, 3), 'lat': round(lat, 3)}],
                        'countries': [e['country']], 'watershedKm2': None, 'seaKm2': None, 'areaKm2': None, 'sizeClass': None,
                        'largestRiverKm2': None, 'riverSystems': None, 'climate': climate_zone(lat), 'lat': round(lat, 3), 'lon': round(lon, 3),
                        'surveyMetroPopulation': e['population'] or 0, 'coastalPort': True})
    systems.sort(key=lambda s: -s['surveyMetroPopulation'])
    # Two systems can share a name (two Cartagenas; the Pearl River Delta split in two).
    seen = collections.Counter(s['name'] for s in systems)
    for s in systems:
        if seen[s['name']] > 1:
            s['name'] += f", {s['countries'][0]}" if len(s['members']) == 1 else f", {short(s['members'][0]['name'])}"
    return systems


def short(n):
    return n.split(' (')[0]


sea_bbox = {}
for sid in range(1, len(meta) + 1):
    rows = [r for r in range(seas.H) if sid in grid[r]]
    if not rows:
        continue
    cols = set()
    for r in rows[::max(1, len(rows) // 50)]:
        row = grid[r]
        cols.update(c for c in range(seas.W) if row[c] == sid)
    sea_bbox[sid] = [min(cols) * seas.RES - 180, rows[0] * seas.RES - 90, (max(cols) + 1) * seas.RES - 180, (rows[-1] + 1) * seas.RES - 90]

results = {}
for key, label, cap in VARIANTS:
    s = build(cap, semi=key == 'enclosed')
    results[key] = {'label': label, 'cap': cap, 'count': len(s), 'multiEntry': sum(len(x['members']) > 1 for x in s),
                    'inlandOnly': sum(not x['coastalPort'] for x in s), 'systems': s}
    print(key, len(s), 'systems;', results[key]['multiEntry'], 'with more than one entry;', results[key]['inlandOnly'], 'with no city at the coast')

endo = [p for p in placed.values() if p['endorheic']]
far = sorted([p for p in placed.values() if not p['endorheic'] and p['upstream_km'] > FAR_UPSTREAM_KM], key=lambda p: -p['upstream_km'])
snapped = [p for p in placed.values() if p['snap_km'] > 0]
split = [p for p in placed.values() if p['other_outlets']]
hard = {
    'endorheic': [{'id': p['entry']['id'], 'name': p['entry']['name'], 'country': p['entry']['country'], 'water': p['entry']['water'], 'drainsTo': sea[p['sea']]['name'] if p.get('sea') else None} for p in endo],
    'farUpstream': [{'id': p['entry']['id'], 'name': p['entry']['name'], 'upstreamKm': p['upstream_km'], 'outletRiver': p['entry']['watershed']} for p in far],
    'islands': [u for u in unplaced if u['reason'] != 'no mapped point'],
    'notMapped': [u for u in unplaced if u['reason'] == 'no mapped point'],
    'snapped': [{'id': p['entry']['id'], 'name': p['entry']['name'], 'snapKm': p['snap_km']} for p in snapped],
    'riverMouth': [{'id': p['entry']['id'], 'name': p['entry']['name'], 'riverKm2': p['river_mouth']['km2']} for p in placed.values() if p.get('river_mouth')],
    'spansOutlets': [{'id': p['entry']['id'], 'name': p['entry']['name'], 'rivers': len(p['other_outlets']) + 1} for p in split],
}
for k, v in hard.items():
    print(k, len(v))
(HERE / 'draft.json').write_text(json.dumps({
    'generated': '2026-10-29', 'definition': 'Greene and Delaney (2025): one or more port cities, the proximal marine portion connected directly to the open ocean, and the entire enclosing watershed.',
    'sources': ['UrbSea_Systems_Global_Survey_R3_corrected.xlsx via atlas-v2/site/data/catalog.js', 'HydroBASINS v1c level 6 (Lehner and Grill 2013)', 'Natural Earth 10m marine polygons'],
    'variants': results, 'hardCases': hard,
}, ensure_ascii=False, indent=1))
print('wrote', HERE / 'draft.json')


# ---------- outlines for the atlas (semi-enclosed version) ----------
# Each system's land is the union of its HydroBASINS units: edges shared by two
# units cancel, and the remaining edges chain into the outer boundary.
TOL = 0.02  # degrees, about 2 km


def simplify(pts, tol):
    if len(pts) < 5:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, idx = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            t = ((px - ax) * dx + (py - ay) * dy) / L if L else 0
            t = max(0, min(1, t))
            d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, idx = d, i
        if best > tol * tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def signed_area(r):
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1])) / 2


def outline(units):
    count = collections.Counter()
    directed = []
    for u in units:
        for ring in u['rings']:
            for a, b in zip(ring, ring[1:]):
                if a == b:
                    continue
                count[frozenset((a, b))] += 1
                directed.append((a, b))
    nxt = collections.defaultdict(list)
    for a, b in directed:
        if count[frozenset((a, b))] == 1:
            nxt[a].append(b)
    rings = []
    while nxt:
        start = next(iter(nxt))
        ring, cur = [start], start
        while True:
            b = nxt[cur].pop()
            if not nxt[cur]:
                del nxt[cur]
            if b == start:
                break
            ring.append(b)
            cur = b
            if cur not in nxt:
                break
        if len(ring) >= 3:
            rings.append(ring)
    polys = []
    rings = [simplify(r + [r[0]], TOL)[:-1] for r in rings]
    rings = [r for r in rings if len(r) >= 3 and abs(signed_area(r)) > TOL * TOL]
    outers = [r for r in rings if signed_area(r) < 0]   # shapefile outer rings run clockwise
    holes = [r for r in rings if signed_area(r) > 0]
    for o in sorted(outers, key=lambda r: signed_area(r)):
        polys.append([o[::-1]])                          # GeoJSON outer rings run counter-clockwise
    for h in holes:
        for poly in polys:
            if in_ring(h[0], poly[0]):
                poly.append(h[::-1])
                break
    return [[[[round(x, 3), round(y, 3)] for x, y in ring + [ring[0]]] for ring in poly] for poly in polys]


units_by_main = collections.defaultdict(list)
for b in basins:
    units_by_main[b['MAIN_BAS']].append(b)
marine = {i + 1: f for i, f in enumerate(json.loads((DOWNLOADS / 'ne_10m_geography_marine_polys.geojson').read_text())['features'])}
features, sea_features = [], []
for i, s in enumerate(results['enclosed']['systems']):
    s['id'] = i
    if s['definedBy'] == 'island':
        continue
    units = [u for m in s['mainBasins'] for u in units_by_main[m]]
    polys = outline(units)
    if polys:
        features.append({'type': 'Feature', 'id': i, 'properties': {'id': i}, 'geometry': {'type': 'MultiPolygon', 'coordinates': polys}})
    for sid in s['seaIds']:
        g = marine[sid]['geometry']
        out = []
        for poly in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
            rings = [simplify([tuple(p) for p in ring], TOL) for ring in poly]
            rings = [[[round(x, 3), round(y, 3)] for x, y in r] for r in rings if len(r) >= 4]
            if rings:
                out.append(rings)
        if out:
            sea_features.append({'type': 'Feature', 'properties': {'id': i}, 'geometry': {'type': 'MultiPolygon', 'coordinates': out}})
(HERE / 'systems-geo.json').write_text(json.dumps({'land': {'type': 'FeatureCollection', 'features': features},
                                                   'sea': {'type': 'FeatureCollection', 'features': sea_features}}, separators=(',', ':')))
(HERE / 'draft.json').write_text(json.dumps({
    'generated': '2026-10-29', 'definition': 'Greene and Delaney (2025): one or more port cities, the proximal marine portion connected directly to the open ocean, and the entire enclosing watershed.',
    'sources': ['UrbSea_Systems_Global_Survey_R3_corrected.xlsx via atlas-v2/site/data/catalog.js', 'HydroBASINS v1c level 6 (Lehner and Grill 2013)', 'Natural Earth 10m marine polygons'],
    'semiEnclosed': SEMI_ENCLOSED, 'variants': results, 'hardCases': hard,
}, ensure_ascii=False, indent=1))
print('outlines', len(features), 'seas', len(sea_features), round((HERE / 'systems-geo.json').stat().st_size / 1e6, 2), 'MB')
