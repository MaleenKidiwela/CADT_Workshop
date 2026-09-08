#!/usr/bin/env python
"""Validate content/ and do a dry-run build. Exit 1 on errors.

    pixi run check
"""
from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import ROOT, as_date, load_content, load_pages, published  # noqa: E402

errors: list[str] = []
warnings: list[str] = []


def err(where: str, msg: str) -> None:
    errors.append(f"{where}: {msg}")


def warn(where: str, msg: str) -> None:
    warnings.append(f"{where}: {msg}")


def req(obj, keys, where) -> None:
    if not isinstance(obj, dict):
        err(where, f"expected a mapping, got {type(obj).__name__}")
        return
    for k in keys:
        if k not in obj or obj[k] in (None, "", []):
            err(where, f"missing required key '{k}'")


URL_RE = re.compile(r"^(https?://|mailto:|#|[A-Za-z0-9_./-]+$)")


def check_url(u, where, allow_none=True) -> None:
    if u is None:
        if not allow_none:
            err(where, "missing url")
        return
    if not URL_RE.match(str(u)):
        err(where, f"suspicious url {u!r}")
    if str(u).startswith("/"):
        err(where, f"absolute path {u!r}; use a relative link")


def check_file(rel, where) -> None:
    if rel and not (ROOT / str(rel)).exists():
        err(where, f"file not found: {rel}")


def check_bool(obj, key, where) -> None:
    if key in obj and not isinstance(obj[key], bool):
        err(where, f"'{key}' must be true or false")


PLACEHOLDER = re.compile(r"\b(TODO|FIXME|XXX|lorem ipsum)\b", re.I)


def scan_placeholders(obj, where) -> None:
    """Flag placeholder text in published content only."""
    if isinstance(obj, dict):
        if obj.get("published") is False:
            return
        for k, v in obj.items():
            if k == "note":
                continue
            scan_placeholders(v, f"{where}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            scan_placeholders(v, f"{where}[{i}]")
    elif isinstance(obj, str):
        m = PLACEHOLDER.search(obj)
        if m:
            err(where, f"placeholder text {m.group(0)!r} in published content")


def main() -> int:
    try:
        data = load_content()
    except Exception as ex:  # YAML syntax error
        print(f"ERROR: cannot load content: {ex}")
        return 1

    # ---- site ------------------------------------------------------------
    site = data["site"]
    w = "site.yaml"
    req(site, ["name", "short_name", "title", "description", "url", "repo", "event",
               "status", "status_labels", "hero", "nav", "cta", "contact", "footer"], w)
    if isinstance(site.get("url"), str) and not site["url"].endswith("/"):
        err(w, "url must end with '/'")
    ev = site.get("event") or {}
    req(ev, ["start", "end", "timezone_label", "city", "host", "format", "attendance"], f"{w} → event")
    try:
        s, e = as_date(ev.get("start")), as_date(ev.get("end"))
        if e < s:
            err(f"{w} → event", "end date is before start date")
    except Exception as ex:
        err(f"{w} → event", f"bad date: {ex}")
    check_bool(ev, "dates_confirmed", f"{w} → event")
    if site.get("status") not in (site.get("status_labels") or {}):
        err(w, f"status {site.get('status')!r} is not a key of status_labels")
    for i, item in enumerate(site.get("nav") or []):
        req(item, ["label", "href"], f"{w} → nav[{i}]")
        check_url(item.get("href"), f"{w} → nav[{i}]")
    for key in ("primary", "secondary"):
        c = (site.get("cta") or {}).get(key)
        if c:
            req(c, ["label", "url"], f"{w} → cta.{key}")
            check_url(c.get("url"), f"{w} → cta.{key}")
    req(site.get("hero") or {}, ["eyebrow", "heading", "lead"], f"{w} → hero")
    req(site.get("contact") or {}, ["name", "email"], f"{w} → contact")
    check_file(site.get("og_image"), f"{w} → og_image")

    # ---- figures ---------------------------------------------------------
    figs = data["figures"].get("figures") or []
    seen = set()
    for i, f in enumerate(figs):
        where = f"figures.yaml → figures[{i}]"
        req(f, ["id", "file", "alt", "caption", "credit"], where)
        check_bool(f, "published", where)
        check_bool(f, "gallery", where)
        if f.get("id") in seen:
            err(where, f"duplicate figure id {f.get('id')!r}")
        seen.add(f.get("id"))
        if f.get("published", True):
            check_file(f.get("file"), where)
    fig_ids = {f["id"] for f in published(figs) if "id" in f}

    def check_fig_ref(ref, where):
        if ref and ref not in fig_ids:
            err(where, f"references unknown or unpublished figure {ref!r}")

    check_fig_ref((site.get("hero") or {}).get("figure"), f"{w} → hero.figure")

    # ---- about -----------------------------------------------------------
    about = data["about"]
    req(about, ["kicker", "heading", "lead", "pillars", "stats", "prototype"], "about.yaml")
    for i, p in enumerate(about.get("pillars") or []):
        req(p, ["icon", "title", "text"], f"about.yaml → pillars[{i}]")
    for i, s in enumerate(about.get("stats") or []):
        req(s, ["value", "label"], f"about.yaml → stats[{i}]")
    check_fig_ref(about.get("figure"), "about.yaml → figure")
    proto = about.get("prototype") or {}
    req(proto, ["kicker", "heading", "body", "points"], "about.yaml → prototype")
    check_fig_ref(proto.get("figure"), "about.yaml → prototype.figure")
    fo = about.get("foundations")
    if fo:
        req(fo, ["kicker", "heading", "intro", "items"], "about.yaml → foundations")
        for i, it in enumerate(fo.get("items") or []):
            req(it, ["name", "idea", "text", "obligation", "obligation_text"], f"about.yaml → foundations.items[{i}]")
        check_fig_ref(fo.get("figure"), "about.yaml → foundations.figure")

    # ---- modules ---------------------------------------------------------
    mods = data["modules"]
    req(mods, ["kicker", "heading", "intro", "readiness_scale", "modules", "architecture"], "modules.yaml")
    scale = len(mods.get("readiness_scale") or [])
    ids = set()
    for i, m in enumerate(mods.get("modules") or []):
        where = f"modules.yaml → modules[{i}]"
        req(m, ["id", "number", "icon", "name", "summary", "readiness"], where)
        r = m.get("readiness")
        if not isinstance(r, int) or not 0 <= r <= scale:
            err(where, f"readiness must be an integer from 0 to {scale}")
        if m.get("id") in ids:
            err(where, f"duplicate module id {m.get('id')!r}")
        ids.add(m.get("id"))
    arch = mods.get("architecture") or {}
    req(arch, ["kicker", "heading", "intro", "layers"], "modules.yaml → architecture")
    check_fig_ref(arch.get("figure"), "modules.yaml → architecture.figure")

    # ---- team ------------------------------------------------------------
    team = data["team"]
    req(team, ["kicker", "heading", "groups", "people"], "team.yaml")
    names = set()
    for i, p in enumerate(team.get("people") or []):
        where = f"team.yaml → people[{i}] ({p.get('name', '?')})"
        req(p, ["name", "role", "affiliation", "group"], where)
        check_bool(p, "published", where)
        if p.get("group") not in (team.get("groups") or []):
            err(where, f"group {p.get('group')!r} is not in groups")
        photo = p.get("photo")
        if photo and not str(photo).startswith("http"):
            check_file(photo, where)
        for j, l in enumerate(p.get("links") or []):
            req(l, ["label", "url"], f"{where} → links[{j}]")
            check_url(l.get("url"), f"{where} → links[{j}]")
        if p.get("name") in names:
            err(where, "duplicate person name")
        names.add(p.get("name"))
        if p.get("published", True) and not p.get("bio"):
            warn(where, "published person has no bio")
    pub_names = {p["name"] for p in published(team.get("people")) if "name" in p}

    # ---- program ---------------------------------------------------------
    prog = data["program"]
    req(prog, ["status", "timezone_label", "arc", "type_labels", "days"], "program.yaml")
    if prog.get("status") not in ("draft", "confirmed", "final"):
        err("program.yaml", "status must be draft, confirmed, or final")
    types = set((prog.get("type_labels") or {}).keys())
    day_ids = set()
    for i, d in enumerate(prog.get("days") or []):
        where = f"program.yaml → days[{i}]"
        req(d, ["id", "label", "theme", "date", "summary", "sessions"], where)
        try:
            as_date(d.get("date"))
        except Exception as ex:
            err(where, f"bad date: {ex}")
        if d.get("id") in day_ids:
            err(where, f"duplicate day id {d.get('id')!r}")
        day_ids.add(d.get("id"))
        for j, s in enumerate(d.get("sessions") or []):
            sw = f"{where} → sessions[{j}]"
            req(s, ["time", "title"], sw)
            if s.get("type") and s["type"] not in types:
                err(sw, f"type {s['type']!r} is not in type_labels")
            for lead in s.get("leads") or []:
                if lead not in pub_names:
                    warn(sw, f"lead {lead!r} is not a published person; rendered as plain text")
            for k, r in enumerate(s.get("resources") or []):
                req(r, ["title", "url"], f"{sw} → resources[{k}]")
                check_url(r.get("url"), f"{sw} → resources[{k}]")

    # ---- partners --------------------------------------------------------
    partners = data["partners"]
    req(partners, ["kicker", "heading", "tiers", "organizations"], "partners.yaml")
    for i, o in enumerate(partners.get("organizations") or []):
        where = f"partners.yaml → organizations[{i}] ({o.get('name', '?')})"
        req(o, ["name", "tier"], where)
        check_bool(o, "published", where)
        if o.get("tier") not in (partners.get("tiers") or []):
            err(where, f"tier {o.get('tier')!r} is not in tiers")
        check_url(o.get("url"), where)
        if o.get("published", True):
            check_file(o.get("logo"), where)

    # ---- venue, faq, resources ------------------------------------------
    venue = data["venue"]
    req(venue, ["kicker", "heading", "venue", "travel"], "venue.yaml")
    req(venue.get("venue") or {}, ["name", "address"], "venue.yaml → venue")
    check_url((venue.get("venue") or {}).get("map_url"), "venue.yaml → venue.map_url")
    for i, t in enumerate(venue.get("travel") or []):
        req(t, ["title", "text"], f"venue.yaml → travel[{i}]")

    faq = data["faq"]
    req(faq, ["kicker", "heading", "intro", "audiences", "outputs", "questions"], "faq.yaml")
    for i, a in enumerate(faq.get("audiences") or []):
        req(a, ["title", "text"], f"faq.yaml → audiences[{i}]")
    req(faq.get("outputs") or {}, ["heading", "items"], "faq.yaml → outputs")
    for i, q in enumerate(faq.get("questions") or []):
        req(q, ["q", "a"], f"faq.yaml → questions[{i}]")

    res = data["resources"]
    req(res, ["kicker", "heading", "items"], "resources.yaml")
    for i, r in enumerate(res.get("items") or []):
        where = f"resources.yaml → items[{i}]"
        req(r, ["title", "authors", "venue"], where)
        check_url(r.get("url"), where)

    # ---- placeholders in published content ------------------------------
    for name, d in data.items():
        scan_placeholders(d, f"{name}.yaml")

    # ---- pages -----------------------------------------------------------
    for page in load_pages():
        if not page["meta"].get("title"):
            err(f"pages/{page['path'].name}", "front matter needs a title")

    # ---- dry-run build ---------------------------------------------------
    if not errors:
        import build as builder
        with tempfile.TemporaryDirectory() as tmp:
            try:
                builder.build(Path(tmp) / "site")
            except Exception as ex:
                err("build", f"{type(ex).__name__}: {ex}")

    # ---- report ----------------------------------------------------------
    for wmsg in warnings:
        print(f"WARN  {wmsg}")
    for emsg in errors:
        print(f"ERROR {emsg}")
    n_pub_people = len(pub_names)
    n_hidden_people = len([p for p in (team.get('people') or []) if p.get('published') is False])
    n_hidden_orgs = len([o for o in (partners.get('organizations') or []) if o.get('published') is False])
    print(
        f"check: {len(errors)} error(s), {len(warnings)} warning(s); "
        f"{n_pub_people} people published ({n_hidden_people} hidden), "
        f"{n_hidden_orgs} organization(s) hidden"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
