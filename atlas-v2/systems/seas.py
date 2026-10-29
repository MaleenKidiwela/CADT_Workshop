"""Natural Earth 10m marine polygons: areas and a 0.1 degree raster of which sea covers each cell."""
import array, json, math, pathlib, pickle

DOWNLOADS = pathlib.Path.home() / 'Downloads'
RES = 0.1
W, H = int(360 / RES), int(180 / RES)
R = 6371.0088


def polygons(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']


def ring_area(ring):
    # Lambert cylindrical equal-area: exact for the projected polygon, km2.
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        s += math.radians(x1) * math.sin(math.radians(y2)) - math.radians(x2) * math.sin(math.radians(y1))
    return abs(s) / 2 * R * R


def load(cache=None):
    if cache and pathlib.Path(cache).exists():
        return pickle.loads(pathlib.Path(cache).read_bytes())
    feats = json.loads((DOWNLOADS / 'ne_10m_geography_marine_polys.geojson').read_text())['features']
    meta, grid = [], [array.array('H', [0]) * W for _ in range(H)]
    for i, f in enumerate(feats, start=1):
        p = f['properties']
        polys = polygons(f['geometry'])
        area = sum(ring_area(poly[0]) - sum(ring_area(h) for h in poly[1:]) for poly in polys)
        meta.append({'id': i, 'name': p.get('name_en') or p['name'], 'cla': p['featurecla'], 'area': round(area), 'wikidata': p.get('wikidataid')})
        rows = {}
        for poly in polys:
            for ring in poly:
                for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                    if y1 == y2:
                        continue
                    lo, hi = sorted((y1, y2))
                    r0, r1 = math.ceil((lo + 90) / RES - 0.5), math.ceil((hi + 90) / RES - 0.5)
                    for r in range(max(r0, 0), min(r1, H)):
                        yc = (r + 0.5) * RES - 90
                        rows.setdefault(r, []).append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        fill = array.array('H', [i])
        for r, xs in rows.items():
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                c0, c1 = max(math.ceil((a + 180) / RES - 0.5), 0), min(math.ceil((b + 180) / RES - 0.5), W)
                if c1 > c0:
                    grid[r][c0:c1] = fill * (c1 - c0)
    out = (meta, grid)
    if cache:
        pathlib.Path(cache).write_bytes(pickle.dumps(out))
    return out


def nearest(grid, lon, lat, radius=4):
    """Id of the nearest sea cell within `radius` cells, with its distance in cells."""
    c, r = int((lon + 180) / RES), int((lat + 90) / RES)
    best = (None, 99)
    for dr in range(-radius, radius + 1):
        rr = r + dr
        if not 0 <= rr < H:
            continue
        row = grid[rr]
        for dc in range(-radius, radius + 1):
            v = row[(c + dc) % W]
            if v:
                d = dr * dr + dc * dc
                if d < best[1]:
                    best = (v, d)
    return best
