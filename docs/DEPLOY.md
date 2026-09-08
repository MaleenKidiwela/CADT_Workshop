# Deployment

## GitHub Pages (once)

1. Push the repository to GitHub (`mdenolle/CADT_workshop_2026`).
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` runs
   `pixi run ci` (check + build) and publishes `_site/`.

The site URL is <https://mdenolle.github.io/CADT_workshop_2026/>. It must
match `url` in `content/site.yaml` (used for the sitemap and social cards).

Pull requests run the same build without deploying, so a broken content file
fails the check before it reaches `main`.

## Custom domain (optional)

Add a `CNAME` record at your DNS provider pointing to
`mdenolle.github.io`, then set the custom domain in Settings → Pages. Add a
file `assets/CNAME` containing the domain so it is copied into every build,
and update `url` in `content/site.yaml`.

## Claude Code workflow (optional)

`.github/workflows/claude.yml` lets anyone with write access ask Claude to
make a change by mentioning `@claude` in an issue or a pull request comment.
It needs one repository secret: `ANTHROPIC_API_KEY`. Without it the workflow
fails quietly and nothing else is affected.

The workflow installs the pixi environment so Claude can run
`pixi run check` before opening a pull request. It follows the rules in
`CLAUDE.md`.

## Local preview

```bash
pixi run serve      # http://localhost:8000
```

`scripts/screenshot.sh` writes a full-page screenshot of the built home page
to `_screenshots/index.png` using a local Chrome or Edge. Useful for design
review by agents.
