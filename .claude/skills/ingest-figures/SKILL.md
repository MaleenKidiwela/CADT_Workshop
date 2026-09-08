---
name: ingest-figures
description: Pull figures out of an organizer PDF or DOCX in materials/ and publish the chosen ones on the site with proper alt text, caption, and credit. Use when a new document arrives with graphics, or when the user says "add the figure from ...".
---

# Ingest figures from a document

1. Confirm the document is in `materials/` (any subfolder). If the user gave a
   path elsewhere, copy it in; never move it into a tracked folder.
2. Run `pixi run figures`. It writes every embedded image larger than
   400×300 px to `materials/_extracted/<document-slug>/pNN-MM.png` and a
   `manifest.yaml` with sizes and page numbers. Page thumbnails land in
   `materials/_extracted/<document-slug>/pages/` for context.
3. Look at the thumbnails and the extracted images. Decide which figures the
   site needs. Prefer diagrams that explain the concept over decorative
   images. Skip figures adapted from third-party publications unless the
   credit is clear.
4. Import each chosen image:
   `pixi run python scripts/import_figure.py <src> --id <kebab-id> [--max-width 1800] [--format jpg|png]`
   This optimizes the image into `assets/img/figures/` and appends a stub
   entry to `content/figures.yaml`.
5. Fill in the stub: `alt` (what the image shows, one sentence), `caption`
   (what it means, one or two sentences), `credit` (authors of the source
   document). Set `gallery: false` if it should only appear where referenced.
6. Reference the figure by `id` where it belongs (`site.yaml` hero,
   `about.yaml`, `modules.yaml`), or leave it in the gallery.
7. Add a row to `docs/SOURCES.md` for the document if it is new.
8. Run `pixi run check`, then `pixi run build`, and look at the result.
