#!/usr/bin/env python
"""Render content/ + templates/ into a static site.

    pixi run build              # writes _site/
    python scripts/build.py --out /tmp/site
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

import jinja2
import markdown
from markupsafe import Markup, escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import (  # noqa: E402
    ASSETS, ROOT, SITE, TEMPLATES, as_date, date_range_label, day_label,
    initials, load_content, load_pages, published, slugify,
)


def render_markdown(text, inline: bool = False) -> Markup:
    if text is None or text == "":
        return Markup("")
    html = markdown.markdown(str(text), extensions=["extra", "sane_lists"])
    if inline:
        m = re.fullmatch(r"\s*<p>(.*)</p>\s*", html, re.S)
        if m:
            html = m.group(1)
    return Markup(html)


def accent(heading, sub) -> Markup:
    heading = "" if heading is None else str(heading)
    if not sub or str(sub) not in heading:
        return escape(heading)
    before, after = heading.split(str(sub), 1)
    return Markup(f'{escape(before)}<span class="accent">{escape(sub)}</span>{escape(after)}')


def make_env() -> jinja2.Environment:
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATES)),
        autoescape=jinja2.select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["md"] = render_markdown
    env.filters["md_inline"] = lambda t: render_markdown(t, inline=True)
    env.filters["accent"] = accent
    env.filters["slug"] = slugify
    env.filters["initials"] = initials
    env.filters["daylabel"] = day_label
    return env


def git_short() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip() or "local"
    except Exception:
        return "local"


def build_context() -> dict:
    data = load_content()

    site = data["site"]
    ev = site["event"]
    ev["date_label"] = date_range_label(ev["start"], ev.get("end"))
    ev["year"] = as_date(ev["start"]).year
    ev["start_iso"] = as_date(ev["start"]).isoformat()
    ev["end_iso"] = as_date(ev.get("end") or ev["start"]).isoformat()
    site["status_label"] = (site.get("status_labels") or {}).get(site.get("status"), "")

    figs = {f["id"]: f for f in published(data["figures"].get("figures"))}
    data["figures"]["by_id"] = figs
    data["figures"]["gallery"] = [f for f in figs.values() if f.get("gallery", True)]

    team = data["team"]
    people = published(team.get("people"))
    for p in people:
        p["slug"] = slugify(p["name"])
    team["published"] = people
    team["by_group"] = [
        (g, [p for p in people if p.get("group") == g])
        for g in team.get("groups", []) if any(p.get("group") == g for p in people)
    ]
    team["by_name"] = {p["name"]: p for p in people}

    partners = data["partners"]
    orgs = published(partners.get("organizations"))
    partners["published"] = orgs
    partners["by_tier"] = [
        (t, [o for o in orgs if o.get("tier") == t])
        for t in partners.get("tiers", []) if any(o.get("tier") == t for o in orgs)
    ]

    mods = data["modules"]
    scale = mods.get("readiness_scale") or []
    for m in mods.get("modules", []):
        r = int(m.get("readiness", 0) or 0)
        m["readiness"] = r
        m["readiness_label"] = scale[r - 1] if 0 < r <= len(scale) else ""
        m["readiness_max"] = len(scale) or 5

    prog = data["program"]
    for d in prog.get("days", []):
        d["date_label"] = day_label(d["date"]) if d.get("date") else ""
        for s in d.get("sessions", []):
            s.setdefault("type", "session")

    ctx = dict(data)
    ctx["fig"] = figs
    ctx["pages"] = load_pages()
    now = dt.datetime.now(dt.timezone.utc)
    ctx["build"] = {"time": now.strftime("%Y-%m-%d %H:%M UTC"), "year": now.year, "commit": git_short()}
    return ctx


def build(out: Path = SITE) -> Path:
    env = make_env()
    ctx = build_context()
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    (out / "index.html").write_text(
        env.get_template("index.html").render(**ctx, is_index=True), encoding="utf-8"
    )
    for page in ctx["pages"]:
        html = env.get_template("page.html").render(
            **ctx, is_index=False, page=page, page_html=render_markdown(page["body"])
        )
        (out / f"{page['slug']}.html").write_text(html, encoding="utf-8")
    (out / "404.html").write_text(
        env.get_template("404.html").render(**ctx, is_index=False), encoding="utf-8"
    )

    shutil.copytree(ASSETS, out / "assets")
    (out / ".nojekyll").write_text("")
    base = ctx["site"]["url"]
    urls = [base] + [f"{base}{p['slug']}.html" for p in ctx["pages"]]
    (out / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls)
        + "</urlset>\n"
    )
    (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(SITE), help="output directory (default: _site)")
    args = ap.parse_args()
    out = build(Path(args.out))
    files = [p for p in out.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files) / 1e6
    print(f"built {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}: {len(files)} files, {size:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
