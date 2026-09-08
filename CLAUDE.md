# CADT Workshop 2026 site

Landing page for "Complex Adaptive Digital Twins for Urban Sea Systems", a
working meeting on a digital twin of the Salish Sea (Seattle, December 2026).
Static site: YAML content → Jinja2 templates → `_site/` → GitHub Pages.

## Rules

1. **Content lives in `content/`.** Edit `content/*.yaml` and
   `content/pages/*.md`. Never hand-edit `_site/`, it is build output and
   git-ignored.
2. **Templates and CSS change the look, not the facts.** Touch `templates/`
   and `assets/css/site.css` only when asked to change design or to support a
   new kind of content. Keep the design system in `docs/DESIGN.md`.
3. **Run `pixi run check` before every commit.** It validates the content,
   checks that referenced files exist, and does a dry-run build. Fix every
   error it reports. Warnings are advisory but read them.
4. **Do not invent facts.** Dates, names, titles, affiliations, sponsors,
   quotes, and numbers come from the organizers' documents in `materials/` or
   from public sources listed in `docs/SOURCES.md`. If something is unknown,
   write "to be announced" or leave the entry with `published: false`. Never
   guess.
5. **`materials/` is private.** It holds email exports, PDFs, and DOCX from
   the organizers. It is git-ignored. Never commit it, never copy email text
   into the site, never put anyone's email address on the site except the
   contact in `site.yaml`. Figures from those documents may be published only
   through `content/figures.yaml`, with a `credit`.
6. **`published` gates visibility.** People, organizations, and figures render
   only when `published: true`. New entries for people or sponsors default to
   `published: false` with a `note` saying what needs confirming.
7. **Plain voice.** Short sentences. Concrete nouns. No hype words
   (cutting-edge, robust, leverage, delve, tapestry, navigate, paradigm,
   holistic, seamless). No em dashes; use commas, colons, or a new sentence.
   See "Voice" in `docs/DESIGN.md`.
8. **Relative links only.** `assets/...`, `index.html#program`,
   `code-of-conduct.html`. The site is served under a sub-path on GitHub Pages,
   so links starting with `/` break.
9. **Small, reviewable changes.** One concern per commit or pull request. Say
   what changed and which source document supports it.

## Commands

```bash
pixi run build      # render to _site/
pixi run serve      # build + http://localhost:8000
pixi run check      # validate content + dry-run build (must pass)
pixi run figures    # extract images from materials/**/*.pdf|docx → materials/_extracted/
pixi run python scripts/import_figure.py SRC --id ID [--max-width 1800] [--format jpg|png]
scripts/screenshot.sh   # full-page screenshot of _site/index.html → _screenshots/ (needs Chrome)
```

Python runs through pixi only. Do not create virtualenvs or install packages
with pip.

## Layout

```
content/          all editable content (YAML + Markdown)
  site.yaml       event facts, hero, nav, buttons, contact, footer
  about.yaml      why, pillars, key numbers, the Salish prototype
  modules.yaml    six modules, readiness, four-layer architecture, partnership note
  program.yaml    days and sessions
  team.yaml       people, grouped
  partners.yaml   organizations, tiered
  venue.yaml      venue and travel
  faq.yaml        audiences, outputs, questions
  resources.yaml  reading list
  figures.yaml    figure registry (id → file, alt, caption, credit)
  pages/*.md      long-form pages with YAML front matter
templates/        Jinja2: base.html, index.html, page.html, 404.html, partials/
assets/           css/, js/, img/ (figures/, partners/, favicon)
scripts/          build.py, check.py, extract_figures.py, import_figure.py, screenshot.sh
docs/             CONTENT_MODEL.md, DESIGN.md, DEPLOY.md, SOURCES.md
materials/        PRIVATE source documents (git-ignored)
.github/          Pages deploy workflow, Claude workflow, issue and PR templates
```

## Recipes

- **Change dates.** `site.yaml` → `event.start`, `event.end`,
  `event.countdown_iso`, and set `dates_confirmed`. Update the day `date`
  fields in `program.yaml`. Update `hero.eyebrow` if the month changes.
- **Add a session.** Append to the right day in `program.yaml`. `time` is a
  string, `type` is one of `plenary | talk | working | session | social |
  break`. `leads` are names that should match `team.yaml` exactly so they
  link.
- **Add a person.** Append to `team.yaml` with `published: false` and a
  `note` unless the maintainer has confirmed. `group` must be one of
  `groups`. Photos: a URL, or a file under `assets/img/people/`. Without a
  photo the site shows initials.
- **Add a partner.** Append to `partners.yaml`. Logos go in
  `assets/img/partners/` (SVG preferred, PNG at least 400 px wide). Without a
  logo the site shows the name in a tile.
- **Add a figure from a PDF.** Put the PDF in `materials/`, run
  `pixi run figures`, look at `materials/_extracted/<doc>/`, import the image
  with `scripts/import_figure.py`, then fill `alt`, `caption`, `credit` in
  `figures.yaml`. Reference the figure by `id` from `site.yaml`,
  `about.yaml`, or `modules.yaml`. Set `gallery: false` to keep it out of the
  figure gallery.
- **Open or close participation.** `site.yaml` → `status` (one of the keys in
  `status_labels`) and `cta.primary`.
- **Add a page.** Create `content/pages/<slug>.md` with front matter
  (`title`, `description`, optional `kicker`). It renders to `<slug>.html` and
  is listed in the footer.

## Checks that must pass

`pixi run check` fails on: missing required keys, unknown figure ids,
missing files, `readiness` outside the scale, unknown `group` or `tier`,
non-boolean `published`, malformed dates or URLs, placeholder text (TODO,
FIXME, lorem) in published content, and any template error.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` runs `pixi run ci` and
publishes `_site/` to GitHub Pages. Pull requests build but do not deploy.
The `pixi.lock` file must be committed; CI installs with `frozen: true`.
