# CADT Workshop 2026

Landing page for **Complex Adaptive Digital Twins for Urban Sea Systems**, a
three-day working meeting on a digital twin of the Salish Sea.
Seattle, December 2026.

Live site: <https://mdenolle.github.io/CADT_workshop_2026/>

The site is static. Content lives in YAML files, a short Python script renders
it through Jinja2 templates, and GitHub Actions publishes the result to GitHub
Pages. No database, no framework, nothing to keep running.

## Quick start

Requires [pixi](https://pixi.sh). Everything else is installed for you.

```bash
pixi install          # once
pixi run serve        # build, then serve at http://localhost:8000
pixi run check        # validate content and do a dry-run build
```

## Where things live

| You want to change            | Edit                                   |
| ----------------------------- | -------------------------------------- |
| Dates, venue line, buttons, nav, contact | `content/site.yaml`         |
| Why the workshop exists, the Salish prototype, key numbers | `content/about.yaml` |
| The six modules and the four-layer architecture | `content/modules.yaml` |
| Program and sessions          | `content/program.yaml`                 |
| Conveners and committee       | `content/team.yaml`                    |
| Partners and supporters       | `content/partners.yaml`                |
| Venue and travel              | `content/venue.yaml`                   |
| Who should attend, outputs, FAQ | `content/faq.yaml`                   |
| Reading list                  | `content/resources.yaml`               |
| Figures and their captions    | `content/figures.yaml` + `assets/img/figures/` |
| Long-form pages (code of conduct) | `content/pages/*.md`               |
| Look and feel                 | `assets/css/site.css`, `templates/`    |

Every person, organization, and figure has a `published` flag. Entries with
`published: false` are kept in the files but never rendered. Use it for people
and sponsors who have not yet confirmed.

The content model is documented field by field in
[docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md).

## Figures from PDFs

Organizer documents (PDF, DOCX) go in `materials/`, which git ignores. To pull
their figures out:

```bash
pixi run figures                                  # extracts to materials/_extracted/
pixi run python scripts/import_figure.py \
    materials/_extracted/<doc>/<image>.png \
    --id salish-sea-basin --max-width 1800        # optimizes into assets/img/figures/
```

Then give the new entry in `content/figures.yaml` an `alt`, `caption`, and
`credit`, and reference it by `id` from other content files.

## Deploying

Pushing to `main` builds and publishes the site. One-time setup in the GitHub
repository: Settings → Pages → Source: **GitHub Actions**. Details, custom
domains, and the optional Claude Code workflow are in
[docs/DEPLOY.md](docs/DEPLOY.md).

## Working with AI agents

This repository is written to be edited by coding agents (Claude Code and
similar) as well as people. The rules they follow are in [CLAUDE.md](CLAUDE.md)
(mirrored in [AGENTS.md](AGENTS.md)). In short: edit YAML, not HTML; run
`pixi run check`; never invent facts; never commit `materials/`.

Mention `@claude` in an issue or pull request comment to have the GitHub
workflow in `.github/workflows/claude.yml` make the change, once the
`ANTHROPIC_API_KEY` secret is set.

## Lineage

The structure follows the UW eScience Institute hackweek splash page and the
SCOPED 2024 workshop site (YAML content, single landing page, schedule tabs,
team cards, sponsor logos). The visual language follows the GAIA HazLab site.
The build is a deliberately small replacement for cookiecutter.

## License

Code: MIT. Figures and text belong to their credited authors; see
[docs/SOURCES.md](docs/SOURCES.md).
