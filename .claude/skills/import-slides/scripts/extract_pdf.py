#!/usr/bin/env python3
"""Turn a .pdf of a slide deck into a Markdown outline plus its images.

    python3 extract_pdf.py deck.pdf --out outline.md --assets knowledge/<slug>/assets

The companion to extract_pptx.py for when a .pptx is not available: Google
refuses to export presentations over roughly 10 MB, and a PDF is what a
conference or a co-author usually hands over.

It writes, per page: the page's text, every embedded image (deduplicated, sized
and re-encoded for the web), and a render of the whole page. A PDF says nothing
about where an image sits, only how large it is printed, so the manifest carries
the size and not the position; anything drawn as vectors (a chart, a plot, a
diagram) has no embedded image at all and is cropped out of the page render
with crop_figure.py. The renders under `<assets>/../.source-pages/` are the
parity reference: no figure that is on a page may be missing from the deck.

Needs poppler-utils (pdfimages, pdftotext, pdftoppm, pdfinfo); Pillow is used
for re-encoding when present.
"""
import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import slidemedia as sm


def need(*tools):
    missing = [t for t in tools if not sm.have(t)]
    if missing:
        raise SystemExit(f"missing {', '.join(missing)}: install poppler-utils")


def page_size(pdf):
    """(width, height) in points, from the first page."""
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    m = re.search(r"Page size:\s+([\d.]+) x ([\d.]+)", out)
    return (float(m.group(1)), float(m.group(2))) if m else (960.0, 540.0)


def page_count(pdf):
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    m = re.search(r"Pages:\s+(\d+)", out)
    return int(m.group(1)) if m else 0


def page_text(pdf, n):
    out = subprocess.run(["pdftotext", "-layout", "-f", str(n), "-l", str(n), str(pdf), "-"],
                         capture_output=True, text=True).stdout
    lines = [l.rstrip() for l in out.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def listed_images(pdf):
    """Rows of `pdfimages -list`, keyed by (page, num)."""
    out = subprocess.run(["pdfimages", "-list", str(pdf)], capture_output=True, text=True).stdout
    rows = {}
    for line in out.splitlines()[2:]:
        f = line.split()
        if len(f) < 15 or not f[0].isdigit():
            continue
        try:
            rows[(int(f[0]), int(f[1]))] = {
                "page": int(f[0]), "num": int(f[1]), "type": f[2],
                "w": int(f[3]), "h": int(f[4]), "object": f[10],
                "xppi": float(f[12]), "yppi": float(f[13]),
            }
        except ValueError:
            continue
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--out", default="outline.md", help="Markdown outline to write")
    ap.add_argument("--assets", help="directory to copy page images into (created if missing)")
    ap.add_argument("--pages", help="directory for the rendered pages "
                                    "(default: <assets>/../.source-pages)")
    ap.add_argument("--dpi", type=int, default=150, help="render resolution (default 150)")
    ap.add_argument("--no-render", action="store_true", help="skip rendering the pages")
    ap.add_argument("--no-reencode", action="store_true", help="copy images through untouched")
    args = ap.parse_args()

    need("pdfinfo", "pdftotext", "pdfimages")
    pdf = Path(args.pdf)
    assets = Path(args.assets) if args.assets else None
    if assets:
        assets.mkdir(parents=True, exist_ok=True)
    pw, ph = page_size(pdf)
    n_pages = page_count(pdf)

    pages = []
    if not args.no_render:
        pages_dir = Path(args.pages) if args.pages else \
            (assets.parent / ".source-pages" if assets else Path("source-pages"))
        pages = sm.render_pages(pdf, pages_dir, dpi=args.dpi)
        if pages:
            print(f"rendered {len(pages)} pages to {pages_dir}", file=sys.stderr)

    rows = listed_images(pdf)
    entries, by_sha, big = [], {}, []
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["pdfimages", "-all", "-p", str(pdf), str(Path(td) / "img")],
                       capture_output=True)
        files = {}
        for f in sorted(Path(td).iterdir()):
            m = re.match(r"img-(\d+)-(\d+)\.", f.name)
            if m:
                files[(int(m.group(1)), int(m.group(2)))] = f

        lines = [f"# Outline of {pdf.name}", "",
                 f"{n_pages} pages, {pw:.0f}×{ph:.0f} pt."]
        if pages:
            lines += ["", f"Rendered pages: `{pages[0].parent}` (page-NN.png). These are the "
                          "parity reference: every figure visible on a page has to reach the deck, "
                          "as an embedded image below or as a crop of the render "
                          "(`crop_figure.py`).", ""]
        lines += ["A PDF carries no speaker notes unless it was exported with them, and no "
                  "shape structure: read the renders to see what each page looked like.", ""]

        for page in range(1, n_pages + 1):
            lines.append(f"## Page {page}")
            lines.append("")
            text = page_text(pdf, page)
            if text:
                lines.append("**text**")
                lines.append("")
                lines.append("```")
                lines.extend(text)
                lines.append("```")
                lines.append("")
            page_imgs = sorted(k for k in files if k[0] == page)
            rendered = []
            for key in page_imgs:
                meta = rows.get(key, {})
                e = emit(files[key], meta, page, assets, by_sha, pw, ph, args)
                if e is None:
                    continue
                entries.append(e)
                if not e["file"]:
                    continue
                if e.get("needs_reencode"):
                    big.append(e["file"])
                bits = [f"{e['role']} image", f"{e['area_pct']}% of the page"]
                if e["px"]:
                    bits.append(f"{e['px'][0]}×{e['px'][1]}")
                if e["bytes"]:
                    bits.append(f"{e['bytes']/1024:.0f} KB")
                if e["auto_drop"]:
                    bits.append("chrome, dropped unless you want it")
                bits += e["notes"]
                rendered.append(f"- `{e['file']}` · " + " · ".join(bits))
            if rendered:
                lines.append("**images**" + (f" (in {assets})" if assets else ""))
                lines.extend(rendered)
                lines.append("")
            elif pages:
                lines.append("**images** none embedded. If the page shows a figure it is drawn "
                             "as vectors: crop it from the render.")
                lines.append("")

    figures, seen = [], set()
    for e in entries:
        if e["role"] in sm.FIGURE_ROLES and not e["auto_drop"] and e["file"] not in seen:
            seen.add(e["file"])
            figures.append(e)
    lines += ["---", "", "## Parity checklist", "",
              f"{len(figures)} figure-sized images to place, plus whatever the renders show that "
              "is drawn as vectors. Every image is either used by a slide or listed in the "
              "manifest's `dropped` array with a reason; `check_deck.py` fails otherwise. A "
              "placeholder is not a disposition.", ""]
    for e in figures:
        also = f" (also on pages {', '.join(map(str, e['also_on_slides']))})" if e["also_on_slides"] else ""
        lines.append(f"- page {e['slide']} · `{e['file']}` · {e['role']} · "
                     f"{e['area_pct']}% of the page{also}")
    lines.append("")
    if big:
        lines += [f"Still over {sm.MAX_KB} KB or {sm.MAX_PX} px, re-encode before committing:", ""] \
                 + [f"- {n}" for n in big] + [""]

    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    if assets:
        sm.save_manifest(assets, {
            "source": pdf.name,
            "stage": {"w": sm.STAGE_W, "h": sm.STAGE_H},
            "slides": n_pages,
            "pages": str(pages[0].parent) if pages else None,
            "images": entries,
            "dropped": [],
        })
    print(f"{n_pages} pages → {args.out}" + (f", {len(entries)} images → {assets}" if assets else ""))
    print(f"{len(figures)} figure-sized images; see the parity checklist at the end of the outline",
          file=sys.stderr)


def emit(path, meta, page, assets, by_sha, pw, ph, args):
    """One manifest entry for an embedded image, sized as the page prints it."""
    data = path.read_bytes()
    w, h = meta.get("w"), meta.get("h")
    xppi, yppi = meta.get("xppi") or 0, meta.get("yppi") or 0
    # Printed size in points: the pixel size divided by the resolution it is
    # placed at. That is what says whether this is a hero figure or a bullet.
    area = 0.0
    if w and h and xppi > 0 and yppi > 0:
        area = (w / xppi * 72 / pw) * (h / yppi * 72 / ph)
    role = sm.role_for(min(area, 1.0))
    e = {
        "id": f"p{page:02d}-{meta.get('num', 0)}", "slide": page, "kind": "pic", "role": role,
        "rect": None, "area_pct": round(min(area, 1.0) * 100, 1), "rot": 0, "crop": None,
        "alt": "", "shape_name": "", "source": f"pdfimages:{path.name}", "file": None,
        "px": [w, h] if w and h else None, "bytes": len(data), "notes": [],
        "also_on_slides": [], "auto_drop": False,
        "sha1": sm.sha1(data), "src_bytes": len(data),
    }
    if not area:
        e["notes"].append("printed size unknown, judge it from the render")
    if len(data) < 1024 and area < 0.006:
        e["auto_drop"], e["role"] = True, "spacer"
        e["notes"].append("tiny: a spacer or a bullet glyph")
        return e
    if e["sha1"] in by_sha:
        first = by_sha[e["sha1"]]
        if page != first["slide"] and page not in first["also_on_slides"]:
            first["also_on_slides"].append(page)
        e.update({k: first[k] for k in ("file", "px", "bytes", "auto_drop")})
        e["notes"].append(f"same image as {first['id']} on page {first['slide']}")
        return e
    if assets is None:
        e["notes"].append("no --assets given, image not written")
        return e
    wrote = sm.write_media(assets, f"p{page:02d}-{path.stem.split('-')[-1]}{path.suffix}", data,
                           reencode=not args.no_reencode)
    e.update({k: wrote[k] for k in ("file", "px", "bytes", "sha1", "kind")})
    e["notes"] += wrote["notes"]
    if role == "icon":
        e["auto_drop"] = True
        e["notes"].append("small on the page: probably a logo or an icon")
    e["needs_reencode"] = e["bytes"] / 1024 > sm.MAX_KB or (e["px"] and e["px"][0] > sm.MAX_PX)
    by_sha[e["sha1"]] = e
    return e


if __name__ == "__main__":
    main()
