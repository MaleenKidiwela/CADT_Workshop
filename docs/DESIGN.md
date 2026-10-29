# Design system

The site should read as calm, credible, and specific: a scientific meeting
with real institutions behind it, addressed to scientists, agency staff, port
and utility operators, tribal and First Nation partners, and technology
companies alike.

## Tokens (`assets/css/site.css` → `:root`)

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#0b1f33` | Body text, dark sections |
| `--navy` | `#12395b` | Headings on light, dark surfaces |
| `--navy-deep` | `#081a2e` | Footer, deepest surfaces |
| `--teal` | `#0f7c86` | Accent: kickers, links, meters, primary button |
| `--teal-deep` | `#0a5b63` | Hover states |
| `--teal-soft` | `#d7eef0` | Accent tints on light surfaces |
| `--teal-light` | `#8fd6d9` | Accent on dark surfaces |
| `--amber` | `#e29a3c` | Warnings only (draft program chip) |
| `--fog` / `--fog-2` | `#f4f7fa` / `#e9eff4` | Page background, tinted sections |
| `--paper` | `#ffffff` | Cards, alternate sections |
| `--stone` | `#5b6b7a` | Secondary text |

Typography: Montserrat 600–800 for headings and numbers, Inter 400–600 for
everything else. Body 16–17 px, line-height 1.65. Headings tight
(line-height 1.1–1.2, slight negative tracking).

Spacing: sections 5.5 rem top and bottom on desktop, 3.5 rem on mobile.
Content width 1320 px, the hero included, so the page stays centered at any zoom. Cards 14 px radius, 1 px hairline border, soft
shadow.

## Section rhythm

Hero (dark) → key numbers (paper) → about (fog) → foundations (paper) →
prototype (fog) → modules (paper) → program (fog) → participate (dark) →
venue (paper) → conveners (fog) → partners (paper) → resources (fog) →
footer (deep).

Alternate light surfaces; use the dark surface twice only (hero, participate)
so it stays a signal.

## Components

- **Kicker + heading + lead** opens every section.
- **Cards** for pillars, modules, people, audiences. Hover lifts 2 px.
- **Module card** carries a number, an icon, existing capabilities as tags,
  and a five-segment readiness meter with a label.
- **Layer stack** for the four-layer architecture, numbered 4 → 1 top to
  bottom, each with its own left rule color.
- **Tabs** for program days, keyboard navigable, deep-linkable (`#day-2`).
- **Timeline** rows: time column, title, type label, description, leads.
  Breaks are muted.
- **People** cards: circular photo or initials monogram.
- **Logo tiles**: fixed height, logo centered, name text as fallback.
- **Figure gallery** with a native `<dialog>` lightbox.

## Voice

- Short sentences. One idea each. Concrete nouns and active verbs.
- Say what is known. When something is not decided, say "to be announced".
- No hype vocabulary: cutting-edge, robust, leverage, delve, tapestry,
  navigate, paradigm, holistic, seamless, unlock, empower, transformative.
- No em dashes. Use commas, colons, or a new sentence. En dashes only in
  numeric ranges (December 15–17).
- Numbers as figures (200+, six modules spelled out when under ten in prose).
- Name institutions and programs; name people only in `team.yaml`.

## Images

Figures are JPEG, max 1800 px wide, quality 85, optimized with
`scripts/import_figure.py`. Diagrams with fine text may use PNG. Every image
has real `alt` text describing what it shows. Partner logos are SVG when
possible.

## Themes

`content/site.yaml` → `theme` picks the look. Layout and content are the same
in both.

- `classic`: `site.css` alone, with the tokens and type above.
- `chart` (current): `assets/css/theme-chart.css` layered on `site.css`. Drawn
  from nautical charts of the Salish Sea. Archivo semi-condensed for headings,
  IBM Plex Sans for text, IBM Plex Mono for times and countdown numbers, and
  Source Serif 4 italic only for the name of a water system (the hero's
  "Urban Sea Systems"), as charts set hydrographic names in italic. Ink hero
  with a faint graticule and a chart-border scale along its foot. Chart blue
  (`#1f5f86`) is the single accent; chart magenta marks only the seams layer.
  Shallow-water tint (`#eef4f8`) for alternate sections. Square corners
  (3–4 px), hairline borders, no shadows or hover lift. Section labels in
  sentence case. People sit on spacing, not cards.

To go back to the original look, set `theme: classic` and rebuild.
