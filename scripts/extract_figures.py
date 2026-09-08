#!/usr/bin/env python
"""Extract embedded images from PDFs and DOCX files under materials/.

    pixi run figures                      # all documents
    pixi run figures -- --min 600 400     # raise the size threshold
    pixi run figures -- --no-pages        # skip page thumbnails

Output: materials/_extracted/<document-slug>/pNN-MM.png, page thumbnails in
pages/, and a manifest.yaml per document. Nothing here is tracked by git.
Pick images to publish with scripts/import_figure.py.
"""
from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import MATERIALS, slugify  # noqa: E402

OUT = MATERIALS / "_extracted"


def extract_pdf(pdf: Path, out: Path, min_w: int, min_h: int, pages: bool) -> list[dict]:
    import fitz  # PyMuPDF

    doc = fitz.open(pdf)
    out.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    seen_xrefs: set[int] = set()
    for pno, page in enumerate(doc, start=1):
        if pages:
            (out / "pages").mkdir(exist_ok=True)
            page.get_pixmap(dpi=50).save(out / "pages" / f"p{pno:02d}.png")
        for k, img in enumerate(page.get_images(full=True), start=1):
            xref, smask = img[0], img[1]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)
            try:
                pix = fitz.Pixmap(doc, xref)
                if smask > 0:
                    try:
                        mask = fitz.Pixmap(doc, smask)
                        if pix.alpha:
                            pix = fitz.Pixmap(pix, 0)
                        pix = fitz.Pixmap(pix, mask)
                    except Exception:
                        pass
                if pix.n - pix.alpha >= 4:  # CMYK etc.
                    pix = fitz.Pixmap(fitz.csRGB, pix)
            except Exception as ex:
                print(f"  skip xref {xref} on page {pno}: {ex}")
                continue
            if pix.width < min_w or pix.height < min_h:
                continue
            name = f"p{pno:02d}-{k:02d}.png"
            pix.save(out / name)
            items.append({"file": name, "page": pno, "width": pix.width, "height": pix.height})
            print(f"  {name}  {pix.width}x{pix.height}")
    return items


def extract_docx(docx: Path, out: Path, min_w: int, min_h: int) -> list[dict]:
    from PIL import Image

    out.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    with zipfile.ZipFile(docx) as z:
        media = [n for n in z.namelist() if n.startswith("word/media/")]
        for k, name in enumerate(sorted(media), start=1):
            data = z.read(name)
            ext = Path(name).suffix.lower() or ".bin"
            target = out / f"m{k:02d}{ext}"
            target.write_bytes(data)
            try:
                with Image.open(target) as im:
                    w, h = im.size
            except Exception:
                target.unlink(missing_ok=True)
                continue
            if w < min_w or h < min_h:
                target.unlink(missing_ok=True)
                continue
            items.append({"file": target.name, "page": None, "width": w, "height": h})
            print(f"  {target.name}  {w}x{h}")
    return items


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--min", nargs=2, type=int, default=(400, 300), metavar=("W", "H"),
                    help="minimum width and height in pixels (default 400 300)")
    ap.add_argument("--no-pages", action="store_true", help="skip page thumbnails for PDFs")
    ap.add_argument("paths", nargs="*", help="specific files (default: everything under materials/)")
    args = ap.parse_args()

    if args.paths:
        docs = [Path(p) for p in args.paths]
    else:
        docs = [p for p in MATERIALS.rglob("*")
                if p.suffix.lower() in (".pdf", ".docx") and "_extracted" not in p.parts]
    if not docs:
        print(f"no PDF or DOCX files found under {MATERIALS.relative_to(MATERIALS.parent)}/")
        return 0

    min_w, min_h = args.min
    for doc in sorted(docs):
        slug = slugify(doc.stem)
        out = OUT / slug
        print(f"{doc.name} → {out.relative_to(MATERIALS.parent)}/")
        if doc.suffix.lower() == ".pdf":
            items = extract_pdf(doc, out, min_w, min_h, pages=not args.no_pages)
        else:
            items = extract_docx(doc, out, min_w, min_h)
        (out / "manifest.yaml").write_text(
            yaml.safe_dump({"source": str(doc.relative_to(MATERIALS.parent)), "images": items},
                           sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        print(f"  {len(items)} image(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
