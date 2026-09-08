#!/usr/bin/env python
"""Optimize an image into assets/img/figures/ and register it in figures.yaml.

    pixi run python scripts/import_figure.py SRC --id salish-sea-basin
    pixi run python scripts/import_figure.py SRC --id six-modules --format png --max-width 1600

Writes assets/img/figures/<id>.<ext> and appends a stub entry to
content/figures.yaml (unless the id already exists). Then fill in alt,
caption, and credit by hand.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import ASSETS, CONTENT, ROOT, slugify  # noqa: E402

FIG_DIR = ASSETS / "img" / "figures"
FIG_YAML = CONTENT / "figures.yaml"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", help="source image (png/jpg/tiff)")
    ap.add_argument("--id", required=True, help="figure id (kebab-case)")
    ap.add_argument("--max-width", type=int, default=1800)
    ap.add_argument("--format", choices=["jpg", "png"], default="jpg")
    ap.add_argument("--quality", type=int, default=85, help="JPEG quality (default 85)")
    ap.add_argument("--credit", default="", help="credit text for the stub entry")
    ap.add_argument("--no-register", action="store_true", help="do not touch figures.yaml")
    args = ap.parse_args()

    from PIL import Image

    fid = slugify(args.id)
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    target = FIG_DIR / f"{fid}.{args.format}"

    with Image.open(args.src) as im:
        im.load()
        if im.width > args.max_width:
            ratio = args.max_width / im.width
            im = im.resize((args.max_width, round(im.height * ratio)), Image.LANCZOS)
        if args.format == "jpg":
            if im.mode in ("RGBA", "LA", "P"):
                bg = Image.new("RGB", im.size, (255, 255, 255))
                rgba = im.convert("RGBA")
                bg.paste(rgba, mask=rgba.split()[-1])
                im = bg
            elif im.mode != "RGB":
                im = im.convert("RGB")
            im.save(target, "JPEG", quality=args.quality, optimize=True, progressive=True)
        else:
            if im.mode not in ("RGB", "RGBA", "L", "LA"):
                im = im.convert("RGBA")
            im.save(target, "PNG", optimize=True)
        w, h = im.size

    rel = target.relative_to(ROOT).as_posix()
    print(f"wrote {rel}  {w}x{h}  {target.stat().st_size / 1024:.0f} KB")

    if args.no_register:
        return 0
    data = yaml.safe_load(FIG_YAML.read_text(encoding="utf-8")) or {}
    if any(f.get("id") == fid for f in data.get("figures") or []):
        print(f"figures.yaml already has id {fid!r}; file replaced, entry left unchanged")
        return 0
    stub = (
        f"\n  - id: {fid}\n"
        f"    file: {rel}\n"
        f"    alt: \"\"        # what the image shows, one sentence\n"
        f"    caption: \"\"    # what it means, one or two sentences\n"
        f"    credit: \"{args.credit}\"\n"
        f"    published: false\n"
        f"    note: Imported from {Path(args.src).name}; fill alt, caption, credit, then publish.\n"
    )
    with open(FIG_YAML, "a", encoding="utf-8") as fh:
        fh.write(stub)
    print(f"appended stub entry {fid!r} to content/figures.yaml (published: false)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
