#!/usr/bin/env python3
"""Cut one figure out of a rendered source slide and add it to a deck's assets.

    python3 crop_figure.py <pages>/page-30.png --rect 6,24,52,60 \
        --assets knowledge/<slug>/assets --name range-plot

`--rect` is x,y,width,height in percent of the page, read straight off the
render. The crop is re-encoded for the web and recorded in the deck's
`source-images.json`, so `check_deck.py` counts it as a figure that came over.

Use it for anything the extractor could not lift as a file: a chart, a plot, a
SmartArt diagram, a figure drawn as vectors in a PDF. A screenshot of the
original beats a placeholder, and beats a redrawing that quietly changes what
the slide claimed.

    --whole            take the entire page (a full-bleed slide image)
    --pad 2            extra margin in percent, default 1.2
    --no-reencode      keep PNG at full size instead of WebP at 1800 px
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import slidemedia as sm


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page", help="a rendered page PNG from the extractor's --pages directory")
    ap.add_argument("--rect", help="x,y,w,h in percent of the page")
    ap.add_argument("--whole", action="store_true", help="take the whole page")
    ap.add_argument("--assets", required=True, help="the deck's assets directory")
    ap.add_argument("--name", required=True, help="file name without extension, say what it shows")
    ap.add_argument("--slide", type=int, help="source slide number, for the manifest")
    ap.add_argument("--pad", type=float, default=1.2, help="margin in percent (default 1.2)")
    ap.add_argument("--no-reencode", action="store_true")
    args = ap.parse_args()

    if not args.rect and not args.whole:
        raise SystemExit("give --rect x,y,w,h in percent, or --whole")
    if args.whole:
        rect = [0.0, 0.0, 1.0, 1.0]
        pad = 0.0
    else:
        try:
            rect = [float(v) / 100 for v in args.rect.replace(" ", "").split(",")]
        except ValueError:
            raise SystemExit("--rect wants four numbers: x,y,w,h in percent")
        if len(rect) != 4:
            raise SystemExit("--rect wants four numbers: x,y,w,h in percent")
        pad = args.pad / 100

    page = Path(args.page)
    if not page.exists():
        raise SystemExit(f"no such page render: {page}")
    assets = Path(args.assets)
    wrote = sm.crop_from_page(page, rect, assets / args.name, pad=pad,
                              reencode=not args.no_reencode)
    if wrote is None:
        raise SystemExit("the region is too small to crop; check --rect")

    slide = args.slide
    if slide is None:
        digits = "".join(c for c in page.stem.split("-")[-1] if c.isdigit())
        slide = int(digits) if digits else 0

    man = sm.load_manifest(assets)
    if man is not None:
        area = max(0.0, rect[2]) * max(0.0, rect[3])
        man["images"].append({
            "id": f"crop-{args.name}", "slide": slide, "kind": "crop",
            "role": sm.role_for(min(area, 1.0)), "rect": [round(v, 4) for v in rect],
            "area_pct": round(min(area, 1.0) * 100, 1), "rot": 0, "crop": None, "alt": "",
            "shape_name": "", "source": f"render:{page.name}", "file": wrote["file"],
            "px": wrote["px"], "bytes": wrote["bytes"], "sha1": wrote["sha1"],
            "notes": wrote["notes"], "also_on_slides": [], "auto_drop": False,
        })
        sm.save_manifest(assets, man)
        print(f"{assets / wrote['file']} ({wrote['bytes']/1024:.0f} KB), recorded in "
              f"{sm.MANIFEST_NAME} for slide {slide}")
    else:
        print(f"{assets / wrote['file']} ({wrote['bytes']/1024:.0f} KB); no "
              f"{sm.MANIFEST_NAME} in {assets}, so nothing recorded")


if __name__ == "__main__":
    main()
