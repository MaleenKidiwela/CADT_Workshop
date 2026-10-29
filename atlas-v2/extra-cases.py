"""Build drainage geography for the atlas v2 cases added after the original six.

    pixi run python atlas-v2/extra-cases.py

Reads the same public downloads as atlas-src/geodata.py (HydroBASINS v1c,
Natural Earth 10m, WRI Aqueduct 4.0) from ~/Downloads, plus HydroBASINS
level 8 for Asia and North America so the Tokyo Bay and Hudson rivers are
separate units. Writes atlas-v2/extra-cases.json. atlas-src/ is not modified.
"""
import csv, hashlib, io, json, math, pathlib, struct, sys, zipfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'atlas-src'))
from geodata import dbf, contains, ne, geometry_bbox, overlaps, generalize, shape_geometry, DOWNLOADS  # noqa: E402


def read_basins(region, level):
    path = DOWNLOADS / f'hybas_{region}_lev{level:02d}_v1c.zip'
    base = f'hybas_{region}_lev{level:02d}_v1c'
    with zipfile.ZipFile(path) as z:
        rows = dbf(z.read(base + '.dbf'))
        data = z.read(base + '.shp')
        assert 'WGS_1984' in z.read(base + '.prj').decode()
    offset, output = 100, []
    while offset < len(data):
        number, words = struct.unpack_from('>II', data, offset)
        offset += 8
        record = data[offset:offset + words * 2]
        offset += words * 2
        assert struct.unpack_from('<I', record)[0] == 5
        bbox = list(struct.unpack_from('<4d', record, 4))
        parts_n, points_n = struct.unpack_from('<II', record, 36)
        starts = list(struct.unpack_from('<' + 'I' * parts_n, record, 44)) + [points_n]
        points = list(struct.iter_unpack('<2d', record[44 + parts_n * 4:44 + parts_n * 4 + points_n * 16]))
        output.append({'p': rows[number - 1], 'bbox': bbox, 'rings': [points[starts[i]:starts[i + 1]] for i in range(parts_n)]})
    return output, path


places = ne('populated_places_simple')


def city(name, country):
    return next(f['geometry']['coordinates'] for f in places
                if f['properties'].get('name') == name and f['properties'].get('adm0name') == country)


# id: (region, level, anchor city, local window, parent label, tolerance)
CASES = {
    'tokyo': ('as', 8, ('Tokyo', 'Japan'), [139.5, 34.9, 140.3, 35.8], 'Largest river basin draining to inner Tokyo Bay', .003),
    'neworleans': ('na', 6, ('New Orleans', 'United States of America'), [-91.6, 28.8, -88.8, 30.8], 'Mississippi parent basin in HydroBASINS', .008),
    'newyork': ('na', 8, ('New York', 'United States of America'), [-74.4, 40.4, -73.6, 41.0], 'Hudson basin: largest river draining to New York Harbor', .003),
}
# Level 8 cases: map window, and the receiving-water window that the main
# basin's outlet must touch.
WINDOWS = {
    'tokyo': ([138.2, 34.8, 141.0, 37.2], [139.6, 35.3, 140.2, 35.75]),
    'newyork': ([-76.6, 39.9, -71.8, 44.6], [-74.3, 40.45, -73.85, 40.85]),
}

layers = {name: ne(name) for name in ['rivers_lake_centerlines', 'rivers_north_america', 'lakes', 'geography_marine_polys',
                                      'admin_0_boundary_lines_land', 'admin_1_states_provinces_lines', 'ports', 'populated_places_simple']}
for name, features in layers.items():
    for f in features:
        f['_bbox'] = geometry_bbox(f['geometry'])
    layers[name] = [f for f in features if f['_bbox'] is not None]

output, inputs = {}, {}
for cid, (region, level, anchor, local, parent_label, tol) in CASES.items():
    basins, path = read_basins(region, level)
    inputs[path.name] = path
    point = city(*anchor)
    home = next(b for b in basins if contains(point, b))
    parent = home['p']['MAIN_BAS']
    if cid in WINDOWS:
        extent, inner_bay = WINDOWS[cid]
        chosen = [b for b in basins if overlaps(b['bbox'], extent)]
        # Keep units mostly inside the window (drop large neighbours that only clip it).
        chosen = [b for b in chosen if b['bbox'][0] >= extent[0] - 0.5 and b['bbox'][2] <= extent[2] + 0.5
                  and b['bbox'][1] >= extent[1] - 0.5 and b['bbox'][3] <= extent[3] + 0.5]
        # Main basin: the largest one whose outlet unit touches the receiving water.
        totals = {}
        for b in chosen:
            totals[b['p']['MAIN_BAS']] = totals.get(b['p']['MAIN_BAS'], 0) + b['p']['SUB_AREA']
        outlets = [b for b in chosen if b['p']['NEXT_DOWN'] == 0 and overlaps(b['bbox'], inner_bay)]
        parent = max(outlets, key=lambda b: totals[b['p']['MAIN_BAS']])['p']['MAIN_BAS']
    else:
        main = [b for b in basins if b['p']['MAIN_BAS'] == parent]
        delta = [b for b in basins if overlaps(b['bbox'], local) and b['p']['MAIN_BAS'] != parent]
        chosen = main + delta
        bb = [min(b['bbox'][0] for b in main), min(b['bbox'][1] for b in main), max(b['bbox'][2] for b in main), max(b['bbox'][3] for b in main)]
        extent = [bb[0], min(bb[1], local[1]), bb[2], bb[3]]
    result = {'extent': extent, 'local': local, 'parent': parent, 'parentLabel': parent_label,
              'hydrobasinsLevel': level, 'basins': [], 'layers': {}}
    for b in chosen:
        p = b['p']
        result['basins'].append({'id': p['HYBAS_ID'], 'down': p['NEXT_DOWN'], 'parent': p['MAIN_BAS'], 'area': p['SUB_AREA'],
                                 'up': p['UP_AREA'], 'endo': p['ENDO'], 'coast': p['COAST'], 'order': p['ORDER'],
                                 'pfaf': p['PFAF_ID'], 'geometry': shape_geometry(b['rings'], tol)})
    main_units = [b for b in chosen if b['p']['MAIN_BAS'] == parent]
    for name, features in layers.items():
        if name == 'rivers_north_america' and region != 'na':
            continue
        sel = [f for f in features if overlaps(f['_bbox'], extent)]
        if name == 'geography_marine_polys':
            sel = [f for f in sel if f['properties'].get('featurecla') != 'ocean']
        if name == 'populated_places_simple':
            sel = sorted(sel, key=lambda f: (f['properties'].get('scalerank', 20), f['properties'].get('name', '')))[:60]
        out = []
        for i, f in enumerate(sel):
            p = f['properties']
            rec = {'id': str(p.get('ne_id') or p.get('NE_ID') or i), 'name': p.get('name_en') or p.get('name') or p.get('NAME') or '',
                   'geometry': generalize(f['geometry'], tol / 2)}
            if name == 'populated_places_simple':
                rec['country'] = p.get('adm0name')
                rec['rank'] = p.get('scalerank', 10)
                hit = [b for b in chosen if contains(f['geometry']['coordinates'], b)]
                rec['basin'] = hit[0]['p']['HYBAS_ID'] if hit else None
            if name.startswith('rivers'):
                rec['rank'] = p.get('scalerank', p.get('SCALERANK', 8))
            out.append(rec)
        result['layers'][name] = out
    output[cid] = result
    print(cid, 'level', level, 'units', len(chosen), 'parent', parent, 'parent units', len(main_units),
          'parent area', round(sum(b['p']['SUB_AREA'] for b in main_units)), {k: len(v) for k, v in result['layers'].items()})

# WRI Aqueduct 4.0 is keyed to level 6 Pfafstetter codes. Level 8 codes nest
# inside them: the first six digits are the containing level 6 unit.
aq = DOWNLOADS / 'aqueduct-4-0-water-risk-data.zip'
inputs[aq.name] = aq
needed = set()
for g in output.values():
    for b in g['basins']:
        b['aqPfaf'] = int(str(b['pfaf'])[:6])
        needed.add(b['aqPfaf'])


def number(x):
    try:
        v = float(x)
        return None if not math.isfinite(v) or v == -9999 else v
    except (ValueError, TypeError):
        return None


values = {}
with zipfile.ZipFile(aq) as z:
    name = next(n for n in z.namelist() if n.endswith('baseline_annual_y2023m07d05.csv'))
    with z.open(name) as stream:
        for r in csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig')):
            key = int(float(r['pfaf_id']))
            if key not in needed:
                continue
            row = {}
            for m in ['bws', 'bwd', 'iav', 'sev']:
                raw, score, cat = (number(r[m + '_' + k]) for k in ['raw', 'score', 'cat'])
                row[m] = [raw, score, int(cat) if cat is not None else None]
            assert values.get(key, row) == row, f'Conflicting Aqueduct rows for {key}'
            values[key] = row
missing = sorted(needed - set(values))
print('Aqueduct units needed', len(needed), 'found', len(values), 'missing', len(missing))

sources = [{'file': n, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size} for n, p in sorted(inputs.items())]
(HERE / 'extra-cases.json').write_text(json.dumps({
    'retrieved': '2026-10-28', 'sources': sources, 'cases': output,
    'aqueduct': {str(k): v for k, v in values.items()},
    'method': 'HydroBASINS v1c (level 8 for Tokyo and New York, level 6 for the Mississippi). Level 8 units show the WRI Aqueduct 4.0 value of the level 6 unit that contains them. Natural Earth 10m reference layers. Generalized for display.',
}, ensure_ascii=False, separators=(',', ':')))
print('wrote', HERE / 'extra-cases.json', round((HERE / 'extra-cases.json').stat().st_size / 1e6, 2), 'MB')
