# Urban Sea Atlas, version 2

An interactive rebuild of `Urban_Sea_Atlas.html`. The old atlas and
`atlas-src/` are unchanged.

## Open it

Open `site/index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8002 --directory atlas-v2/site
# then visit http://localhost:8002
```

MapLibre GL 5.24 loads from cdnjs (Cloudflare) with a subresource-integrity
check; if that fails, the page uses the identical copy bundled in
`site/vendor/` (BSD-3 license included). GitHub Pages was slow to serve the
1 MB library from some locations. The globe view draws a small Natural Earth
world layer (`site/data/world.js`); street-detail tiles from OpenFreeMap load
only once you zoom in past level 3.4, because their zoomed-out tiles are over
1 MB each. The basemap tiles and fonts need an internet connection. Without
one, the atlas layers still show on the Natural Earth background.

Case-study geography loads in the background after the first view, so
opening a case is instant. `atlasTiming` in the browser console shows load
times in milliseconds.

To publish, upload the contents of `site/` to any static host (GitHub Pages
works). Links copied with "Copy link" reopen the same view.

## What it does

- **Explore.** All 583 entries on a 3D globe, sized by population, GDP or
  container volume and colored by water setting, region, cargo, marine or
  inland, or ranking band. Live filters and search with suggestions. Click a
  legend item to hide a category.
- **Entry panel.** Key numbers, where the entry sits in all six rankings,
  survey notes, location evidence, shared-water groups, and the five most
  similar entries.
- **Rankings.** All six survey rankings. For Hinterland reach and Ecological
  stakes, drag the weight sliders to re-rank live; rows animate to their new
  places and show how far they moved. Scenarios are labeled illustrative and
  never change source values. "Map: top N" shows only the leaders.
- **Chart.** Scatter of any two numeric fields with a rank correlation. Hover
  a dot to find it on the map; drag a box to select a group and filter the map
  to it.
- **Patterns.** Thirteen patterns found in the survey, for example where the
  largest cities sit, how container traffic concentrates, which ports are
  inland, and how the ranking scores are built. Every number is computed from
  the catalog when the tab opens, so the text follows the data. "Show on the
  map" filters and frames the entries behind a pattern; "Plot it" opens the
  matching chart.
- **Systems (draft).** The survey entries grouped into Urban Sea Systems as
  Greene and Delaney (2025) define them: port cities, the nearby sea and the
  whole watershed. Each system is drawn as its watershed plus its sea, colored
  by size class, climate zone, countries, or land draining into each km² of
  sea, with its own Patterns tab. Explore is unchanged: it still works on the
  583 port-metro entries.
- **Case studies.** Nine systems, including Tokyo Bay, New Orleans / Mississippi and New York Harbor / Hudson. Drainage units are colored by WRI Aqueduct
  water stress, depletion or variability. Click any unit to light up
  everything upstream, outline the path downstream, and list the stress mix and
  cities in that area. Oʻahu has State watersheds, aquifers (2019 sustainable
  yields) and streams. Yangtze, Nile and Great Lakes have small charts from the
  research evidence.
- **Tour.** A guided fly-through of the globe and the nine cases.

## Tokyo Bay, New Orleans and New York

These three cases were added in v2. `extra-cases.py` builds their geography from
the same public downloads as `atlas-src/geodata.py`, plus HydroBASINS level 8
for Asia and North America (`hybas_as_lev08_v1c.zip`, `hybas_na_lev08_v1c.zip`,
from data.hydrosheds.org) so the Tokyo Bay and Hudson rivers are separate units. Level 8 units show the WRI Aqueduct value of the
level 6 unit that contains them, because Aqueduct is published at level 6.
Each level 8 case's main basin is the largest one whose outlet reaches the
receiving water. For Tokyo that excludes the Tone, which HydroBASINS routes to
the Pacific. For New York it is the Hudson, 34,790 km² including the Mohawk. New Orleans uses the
whole Mississippi parent basin (319 units) plus the coastal delta units.

The facts and lens text are in `extra-cases-content.json`, each with its
source: Kubo and Kanda (2020), Kubo et al. (2017), Endo et al. (2023), the IAH
urban groundwater database, NPS, NOAA NCCOS (2025), USGS SIM 3381, NASA
Earthdata, NYSDEC (Hudson estuary; NYC combined sewer overflows), US EPA
(Hudson River PCBs) and NOAA Tides and Currents (the Battery).

```sh
pixi run python atlas-v2/extra-cases.py
node atlas-v2/prepare.mjs
```

## Urban Sea Systems (draft)

`systems/draft.py` groups the survey entries into systems. It places each
entry at its most seaward city, follows the water downstream through
HydroBASINS level 6 (all eight regions, from ~/Downloads) to the sea, and
joins entries that share a river, a bay or sound of up to 50,000 km², or one of
a hand-made list of semi-enclosed seas (`SEMI_ENCLOSED`). The sea a river opens
onto comes from Natural Earth's 10m marine areas, using the name in the
survey's Water body column where it gives one. Caspian ports are left out
because the paper requires a connection to the open ocean.

The paper does not settle how large the nearby sea can be, so the script also
reports three other versions (shared watershed only, bays only, any enclosed
sea up to 600,000 km²). The list of semi-enclosed seas, the treatment of open
coasts and the size-class boundary are choices made here for review.

```sh
python3 atlas-v2/systems/draft.py   # writes systems/draft.json and systems-geo.json
node atlas-v2/prepare.mjs           # writes site/data/systems.js
```

## Rebuild the data

The data files in `site/data/` come from the derived snapshots in
`atlas-src/`:

```sh
node atlas-v2/prepare.mjs
```

It checks that the rankings and location files belong to the same workbook as
`atlas-src/source.json`. Case geometry is simplified for regional display
(about 400 m for drainage units, 30 m on Oʻahu) and stored as integer
coordinate deltas, which `atlas.js` decodes. The Natural Earth 1:110m files in
`source/` feed the world layer.

## Files

```
prepare.mjs        builds site/data/ from atlas-src/ and the extra cases
extra-cases.py     Tokyo Bay, New Orleans and New York geography (writes extra-cases.json)
extra-cases-content.json   their facts, lenses and sources
site/index.html    page shell
site/atlas.css     styles
site/atlas.js      app (map, filters, rankings, chart, cases, tour)
site/data/         catalog.js, world.js, systems.js, and one case-<id>.js per case study
systems/           draft.py and seas.py (Urban Sea Systems); draft.json and systems-geo.json are their output
site/vendor/       MapLibre GL JS and CSS
source/            Natural Earth 1:110m land, lakes and borders (public domain)
```
