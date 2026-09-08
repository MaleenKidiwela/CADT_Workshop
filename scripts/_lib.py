"""Shared helpers for the build and check scripts."""
from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
PAGES = CONTENT / "pages"
TEMPLATES = ROOT / "templates"
ASSETS = ROOT / "assets"
SITE = ROOT / "_site"
MATERIALS = ROOT / "materials"

CONTENT_FILES = (
    "site", "about", "modules", "program", "team",
    "partners", "venue", "figures", "resources", "faq",
)


def load_yaml(path: Path):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load_content() -> dict:
    return {name: load_yaml(CONTENT / f"{name}.yaml") for name in CONTENT_FILES}


def published(items):
    return [i for i in (items or []) if isinstance(i, dict) and i.get("published", True)]


def slugify(text) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return text or "item"


def initials(name) -> str:
    parts = [p for p in re.split(r"[\s.]+", str(name)) if p and p[0].isalpha()]
    return "".join(p[0].upper() for p in parts[:2]) or "?"


def as_date(value) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value))


def date_range_label(start, end=None) -> str:
    s = as_date(start)
    e = as_date(end) if end else None
    if not e or e == s:
        return f"{s:%B} {s.day}, {s.year}"
    if s.year != e.year:
        return f"{s:%B} {s.day}, {s.year} – {e:%B} {e.day}, {e.year}"
    if s.month != e.month:
        return f"{s:%B} {s.day} – {e:%B} {e.day}, {e.year}"
    return f"{s:%B} {s.day}–{e.day}, {e.year}"


def day_label(value) -> str:
    d = as_date(value)
    return f"{d:%A}, {d:%B} {d.day}"


FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)


def load_pages() -> list[dict]:
    pages = []
    for path in sorted(PAGES.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        meta, body = {}, text
        m = FRONT_MATTER.match(text)
        if m:
            meta = yaml.safe_load(m.group(1)) or {}
            body = text[m.end():]
        pages.append({"slug": meta.get("slug") or path.stem, "meta": meta, "body": body, "path": path})
    return pages
