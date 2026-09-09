#!/usr/bin/env python3
"""Turn a .pptx (a Google Slides export) into a Markdown outline plus its images.

    python3 extract_pptx.py deck.pptx --out outline.md --assets knowledge/<slug>/assets

For every slide, in presentation order, the outline lists the title
placeholder, every other text shape as its own block, the hyperlinks, every
image on the slide and the speaker notes. The outline is the raw material for
the hand-written deck; it is not itself a deck.

Every visual on a slide comes over, not only the ones stored as picture parts:

  * pictures (`p:pic`), including inside groups and inside a graphic frame,
    cropped and rotated the way the slide cropped and rotated them, with the
    SVG preferred when the file carries an SVG alternate;
  * pictures used as a shape fill or as the slide background;
  * charts, SmartArt, tables, embedded objects, grouped drawings and clusters
    of loose shapes, which have no picture part at all: those are cropped out
    of a LibreOffice render of the slide, so the deck can show what the
    audience saw instead of a placeholder.

Alongside the images it writes `<assets>/source-images.json`, the manifest that
`check_deck.py` uses to fail the deck if a figure from the source silently went
missing. Standard library only; Pillow, LibreOffice and poppler's pdftoppm are
used when present and their absence is reported.
"""
import argparse
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
import slidemedia as sm

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "asvg": "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
}
R_ID = "{%s}id" % NS["r"]
R_EMBED = "{%s}embed" % NS["r"]
SVG_EXT_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}"
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".emf", ".wmf", ".bmp", ".tif", ".tiff"}
GRAPHIC_KIND = {
    "chart": "chart", "diagram": "smartart", "table": "table",
    "picture": "pic", "oleObject": "embed", "ole": "embed",
}
# A visual smaller than this fraction of the stage, or lighter than this, is
# chrome: a bullet glyph, a spacer, a logo in the corner.
SPACER_BYTES = 1024
CLUSTER_MIN_AREA = 0.045
CLUSTER_GAP = 0.02
CHROME_MAX_AREA = 0.85


def q(tag):
    pre, _, local = tag.partition(":")
    return "{%s}%s" % (NS[pre], local)


# ----------------------------------------------------------------- package bits

def rels_for(z, part):
    """Map rId -> (target path inside the zip, relationship type, is_external)."""
    part = PurePosixPath(part)
    rels_path = part.parent / "_rels" / (part.name + ".rels")
    out = {}
    if str(rels_path) not in z.namelist():
        return out
    root = ET.fromstring(z.read(str(rels_path)))
    for rel in root.findall("rel:Relationship", NS):
        target = rel.get("Target")
        external = rel.get("TargetMode") == "External"
        if not external:
            target = str((part.parent / target).as_posix())
            target = str(PurePosixPath(*_normalise(target)))
        out[rel.get("Id")] = (target, rel.get("Type", "").rsplit("/", 1)[-1], external)
    return out


def _normalise(path):
    parts = []
    for seg in path.split("/"):
        if seg == "..":
            if parts:
                parts.pop()
        elif seg and seg != ".":
            parts.append(seg)
    return parts


def slide_order(z):
    pres = ET.fromstring(z.read("ppt/presentation.xml"))
    rels = rels_for(z, "ppt/presentation.xml")
    order = []
    for sld in pres.findall("p:sldIdLst/p:sldId", NS):
        target = rels.get(sld.get(R_ID))
        if target:
            order.append(target[0])
    return order


def stage_size(z):
    pres = ET.fromstring(z.read("ppt/presentation.xml"))
    sz = pres.find("p:sldSz", NS)
    if sz is None:
        return 12192000, 6858000
    return int(sz.get("cx")), int(sz.get("cy"))


# ------------------------------------------------------------------------ text

def para_text(p, links):
    """Text of one <a:p>, collecting hyperlink rIds into `links`."""
    buf = []
    for node in p.iter():
        tag = node.tag.split("}")[-1]
        if tag == "t" and node.text:
            buf.append(node.text)
        elif tag == "br":
            buf.append("\n")
        elif tag == "hlinkClick" and node.get(R_ID):
            links.append(node.get(R_ID))
    return "".join(buf)


def shape_blocks(root, links):
    """Yield (placeholder_type, [paragraph strings]) per text-bearing shape."""
    for sp in root.iter(q("p:sp")):
        ph = sp.find("p:nvSpPr/p:nvPr/p:ph", NS)
        ph_type = ph.get("type", "body") if ph is not None else None
        tx = sp.find("p:txBody", NS)
        if tx is None:
            continue
        paras = []
        for p in tx.findall("a:p", NS):
            text = para_text(p, links).strip()
            if text:
                lvl = int(p.find("a:pPr", NS).get("lvl", "0")) if p.find("a:pPr", NS) is not None else 0
                paras.append(("  " * lvl) + text)
        if paras:
            yield ph_type, paras


def notes_text(z, slide_part):
    rels = rels_for(z, slide_part)
    for target, kind, external in rels.values():
        if kind == "notesSlide" and not external:
            root = ET.fromstring(z.read(target))
            out = []
            for sp in root.iter(q("p:sp")):
                ph = sp.find("p:nvSpPr/p:nvPr/p:ph", NS)
                if ph is not None and ph.get("type") in ("sldNum", "sldImg", "hdr", "ftr", "dt"):
                    continue
                tx = sp.find("p:txBody", NS)
                if tx is None:
                    continue
                for p in tx.findall("a:p", NS):
                    t = para_text(p, []).strip()
                    if t:
                        out.append(t)
            return "\n".join(out)
    return ""


# -------------------------------------------------------------------- geometry

IDENT = (0.0, 1.0, 0.0, 1.0)   # (ox, sx, oy, sy): abs = ox + local * sx


def compose(parent, xfrm):
    """Fold a group's a:xfrm into the transform its children live under."""
    off, ext = xfrm.find("a:off", NS), xfrm.find("a:ext", NS)
    ch_off, ch_ext = xfrm.find("a:chOff", NS), xfrm.find("a:chExt", NS)
    if off is None or ext is None:
        return parent
    ox, sx, oy, sy = parent
    cx0 = float(ch_off.get("x", 0)) if ch_off is not None else 0.0
    cy0 = float(ch_off.get("y", 0)) if ch_off is not None else 0.0
    cw = float(ch_ext.get("cx", 0)) if ch_ext is not None else 0.0
    chh = float(ch_ext.get("cy", 0)) if ch_ext is not None else 0.0
    kx = float(ext.get("cx", 0)) / cw if cw else 1.0
    ky = float(ext.get("cy", 0)) / chh if chh else 1.0
    return (ox + (float(off.get("x", 0)) - cx0 * kx) * sx, kx * sx,
            oy + (float(off.get("y", 0)) - cy0 * ky) * sy, ky * sy)


def rect_of(el, transform, stage, *, tag="a:xfrm"):
    """(x, y, w, h) as fractions of the stage, or None when the shape inherits."""
    xfrm = el.find(f".//{q(tag)}") if tag == "p:xfrm" else None
    if xfrm is None:
        xfrm = el.find("p:spPr/a:xfrm", NS)
    if xfrm is None:
        xfrm = el.find("p:grpSpPr/a:xfrm", NS)
    if xfrm is None:
        xfrm = el.find("p:xfrm", NS)
    if xfrm is None:
        return None, 0
    off, ext = xfrm.find("a:off", NS), xfrm.find("a:ext", NS)
    if off is None or ext is None:
        return None, 0
    ox, sx, oy, sy = transform
    x = ox + float(off.get("x", 0)) * sx
    y = oy + float(off.get("y", 0)) * sy
    w = float(ext.get("cx", 0)) * sx
    h = float(ext.get("cy", 0)) * sy
    rot = round(int(xfrm.get("rot", "0")) / 60000.0) % 360
    sw, sh = stage
    return [x / sw, y / sh, w / sw, h / sh], rot


def area(rect):
    return max(0.0, rect[2]) * max(0.0, rect[3]) if rect else 0.0


def overlap(a, b):
    """Fraction of a covered by b."""
    if not a or not b:
        return 0.0
    ix = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    return (ix * iy / area(a)) if area(a) else 0.0


def union(a, b):
    x0, y0 = min(a[0], b[0]), min(a[1], b[1])
    x1, y1 = max(a[0] + a[2], b[0] + b[2]), max(a[1] + a[3], b[1] + b[3])
    return [x0, y0, x1 - x0, y1 - y0]


def near(a, b, gap=CLUSTER_GAP):
    return (a[0] - gap < b[0] + b[2] and b[0] - gap < a[0] + a[2]
            and a[1] - gap < b[1] + b[3] and b[1] - gap < a[1] + a[3])


# ------------------------------------------------------------------ collecting

def blip_media(blip, rels):
    """(part, note) for an a:blip, preferring an SVG alternate over its raster."""
    if blip is None:
        return None, None
    svg = blip.find(f"a:extLst/a:ext[@uri='{SVG_EXT_URI}']/asvg:svgBlip", NS)
    if svg is not None and svg.get(R_EMBED):
        target = rels.get(svg.get(R_EMBED))
        if target and not target[2]:
            return target[0], "SVG alternate preferred over the raster fallback"
    if blip.get(R_EMBED):
        target = rels.get(blip.get(R_EMBED))
        if target and not target[2]:
            return target[0], None
    return None, None


def src_rect(fill):
    sr = fill.find("a:srcRect", NS) if fill is not None else None
    if sr is None:
        return None
    v = [int(sr.get(k, "0")) / 100000.0 for k in ("l", "t", "r", "b")]
    return v if any(v) else None


def has_text(sp):
    tx = sp.find("p:txBody", NS)
    return tx is not None and any((t.text or "").strip() for t in tx.iter(q("a:t")))


def children(el):
    """Shape-tree children, taking the mc:Choice branch so nothing is doubled."""
    for child in el:
        if child.tag == q("mc:AlternateContent"):
            branch = child.find("mc:Choice", NS)
            if branch is None:
                branch = child.find("mc:Fallback", NS)
            if branch is not None:
                yield from children(branch)
        else:
            yield child


def collect(el, transform, stage, rels, out, shapes, depth=0):
    """Walk one shape tree, appending picture visuals to `out` and every
    drawing shape's rectangle to `shapes` (the raw material for clustering)."""
    for child in children(el):
        tag = child.tag
        if tag == q("p:pic"):
            rect, rot = rect_of(child, transform, stage)
            fill = child.find("p:blipFill", NS)
            part, note = blip_media(fill.find("a:blip", NS) if fill is not None else None, rels)
            desc = child.find("p:nvPicPr/p:cNvPr", NS)
            out.append({
                "kind": "pic", "part": part, "rect": rect, "rot": rot,
                "crop": src_rect(fill), "alt": alt_of(desc), "note": note,
                "name": name_of(desc),
            })
            if rect:
                shapes.append(("pic", rect, child))
        elif tag == q("p:sp"):
            rect, rot = rect_of(child, transform, stage)
            fill = child.find("p:spPr/a:blipFill", NS)
            if fill is not None:
                part, note = blip_media(fill.find("a:blip", NS), rels)
                if part:
                    desc = child.find("p:nvSpPr/p:cNvPr", NS)
                    out.append({
                        "kind": "fill", "part": part, "rect": rect, "rot": rot,
                        "crop": src_rect(fill), "alt": alt_of(desc), "name": name_of(desc),
                        "note": note or "used as a shape fill on the source slide",
                    })
            if rect:
                shapes.append(("text" if has_text(child) else "shape", rect, child))
        elif tag == q("p:grpSp"):
            rect, _ = rect_of(child, transform, stage)
            inner = compose(transform, child.find("p:grpSpPr/a:xfrm", NS)) \
                if child.find("p:grpSpPr/a:xfrm", NS) is not None else transform
            sub_out, sub_shapes = [], []
            collect(child, inner, stage, rels, sub_out, sub_shapes, depth + 1)
            out.extend(sub_out)
            shapes.extend(sub_shapes)
            if rect:
                pics = [s for s in sub_shapes if s[0] == "pic"]
                # A group is a drawing in its own right unless it is just one
                # picture in a wrapper: then the picture part already has it.
                single_pic = len(pics) == 1 and len(sub_shapes) <= 2
                shapes.append(("group" if not single_pic else "pic", rect, child))
        elif tag == q("p:graphicFrame"):
            rect, rot = rect_of(child, transform, stage, tag="p:xfrm")
            data = child.find("a:graphic/a:graphicData", NS)
            uri = (data.get("uri") if data is not None else "") or ""
            kind = GRAPHIC_KIND.get(uri.rsplit("/", 1)[-1], "frame")
            desc = child.find("p:nvGraphicFramePr/p:cNvPr", NS)
            if kind == "pic":
                blip = child.find(".//pic:blipFill/a:blip", NS) or child.find(".//a:blip", NS)
                part, note = blip_media(blip, rels)
                out.append({"kind": "pic", "part": part, "rect": rect, "rot": rot,
                            "crop": src_rect(child.find(".//pic:blipFill", NS)),
                            "alt": alt_of(desc), "name": name_of(desc), "note": note})
            else:
                out.append({"kind": kind, "part": None, "rect": rect, "rot": rot,
                            "crop": None, "alt": alt_of(desc), "name": name_of(desc),
                            "note": f"{kind} on the source slide, no picture part to copy"})
            if rect:
                shapes.append(("pic" if kind == "pic" else "frame", rect, child))
        elif tag == q("p:cxnSp"):
            rect, _ = rect_of(child, transform, stage)
            if rect:
                shapes.append(("shape", rect, child))


def alt_of(desc):
    if desc is None:
        return ""
    alt = (desc.get("descr") or "").strip()
    return "" if alt.lower() in ("preencoded.png", "image") else alt


def name_of(desc):
    return (desc.get("name") or "").strip() if desc is not None else ""


def background(root, rels):
    bg = root.find("p:cSld/p:bg", NS)
    if bg is None:
        return None
    fill = bg.find("p:bgPr/a:blipFill", NS)
    if fill is None:
        return None
    part, note = blip_media(fill.find("a:blip", NS), rels)
    if not part:
        return None
    return {"kind": "background", "part": part, "rect": [0.0, 0.0, 1.0, 1.0], "rot": 0,
            "crop": src_rect(fill), "alt": "", "name": "slide background",
            "note": note or "the slide's background image"}


def clusters(shapes, pic_rects):
    """Figure-sized drawings that have no picture part: grouped art, charts,
    and the loose boxes-and-arrows diagrams a Slides export is full of.

    Neighbouring drawing shapes are unioned into one region, then the region is
    widened to take in the labels sitting against it. A region that swallows
    most of the slide is layout rather than a figure, and falls back to the
    shapes it was built from.
    """
    seeds = [r for kind, r, _ in shapes if kind in ("group", "frame", "shape")
             and r and 0.0008 < area(r) < CHROME_MAX_AREA]
    groups = [r for kind, r, _ in shapes if kind in ("group", "frame") and r]
    text_rects = [r for kind, r, _ in shapes if kind == "text" and r]

    boxes = [[r, [r]] for r in seeds]           # [union, members]
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                if near(boxes[i][0], boxes[j][0]):
                    boxes[i] = [union(boxes[i][0], boxes[j][0]), boxes[i][1] + boxes[j][1]]
                    del boxes[j]
                    merged = True
                    break
            if merged:
                break

    def is_group(rect):
        return any(overlap(g, rect) > 0.85 and overlap(rect, g) > 0.85 for g in groups)

    def covered(rect):
        return sum(overlap(rect, p) for p in pic_rects) > 0.75

    out = []
    for rect, members in boxes:
        if area(rect) >= CHROME_MAX_AREA:
            # Everything ran together: keep the members that stand alone as
            # figures rather than losing the slide's drawings entirely.
            for m in members:
                if area(m) >= CLUSTER_MIN_AREA and not covered(m):
                    out.append(m)
            continue
        if area(rect) < CLUSTER_MIN_AREA:
            continue
        if len(members) < 2 and not is_group(rect):
            continue
        if covered(rect):
            continue                            # a picture part already has it
        for t in text_rects:                    # the drawing's own labels
            if near(rect, t, gap=0.015) and area(t) < 0.25:
                grown = union(rect, t)
                if area(grown) < CHROME_MAX_AREA:
                    rect = grown
        out.append(rect)
    return out


# ----------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pptx")
    ap.add_argument("--out", default="outline.md", help="Markdown outline to write")
    ap.add_argument("--assets", help="directory to copy slide images into (created if missing)")
    ap.add_argument("--pages", help="directory for the rendered slide PNGs "
                                    "(default: <assets>/../.source-pages, kept out of the deck)")
    ap.add_argument("--pdf", help="a PDF export of the same deck, rendered instead of asking "
                                  "LibreOffice to convert the .pptx (use it when the .pptx "
                                  "renders badly or LibreOffice is unavailable)")
    ap.add_argument("--no-render", action="store_true",
                    help="skip rendering the slides; charts, SmartArt and grouped "
                         "drawings then arrive as a note instead of an image")
    ap.add_argument("--dpi", type=int, default=150, help="render resolution (default 150)")
    ap.add_argument("--no-reencode", action="store_true", help="copy images through untouched")
    args = ap.parse_args()

    src = Path(args.pptx)
    z = zipfile.ZipFile(src)
    slides = slide_order(z)
    stage = stage_size(z)
    assets = Path(args.assets) if args.assets else None
    if assets:
        assets.mkdir(parents=True, exist_ok=True)

    pages = []
    if not args.no_render:
        pages_dir = Path(args.pages) if args.pages else \
            (assets.parent / ".source-pages" if assets else Path("source-pages"))
        pages = sm.render_pages(Path(args.pdf) if args.pdf else src, pages_dir, dpi=args.dpi)
        if pages:
            print(f"rendered {len(pages)} slides to {pages_dir}", file=sys.stderr)

    lines = [f"# Outline of {src.name}", "",
             f"{len(slides)} slides in presentation order. Stage {stage[0]}×{stage[1]} EMU."]
    if pages:
        lines += ["", f"Rendered slides: `{pages[0].parent}` (page-NN.png). Compare these against "
                      "`snap_deck.sh` output slide by slide; they are the parity reference."]
    lines.append("")

    entries, by_sha, taken, big, unresolved = [], {}, set(), [], []
    for i, part in enumerate(slides, start=1):
        root = ET.fromstring(z.read(part))
        rels = rels_for(z, part)
        links = []
        blocks = list(shape_blocks(root, links))
        title = next((ps for t, ps in blocks if t in ("title", "ctrTitle")), None)
        lines.append(f"## Slide {i}" + (f": {' / '.join(title)}" if title else ""))
        lines.append("")
        # Google Slides exports rarely use placeholders: most text arrives as
        # free text boxes, one per shape. Merge runs of them so the outline
        # reads as a list rather than a column of one-line headings.
        merged, prev = [], None
        for t, paras in blocks:
            if t in ("title", "ctrTitle"):
                continue
            label = {"subTitle": "subtitle", "body": "body", None: "text boxes"}.get(t, t)
            if label == prev:
                merged[-1][1].extend(paras)
            else:
                merged.append((label, list(paras)))
            prev = label
        for label, paras in merged:
            lines.append(f"**{label}**")
            lines.extend(f"- {p}" if not p.startswith("  ") else f"  - {p.strip()}" for p in paras)
            lines.append("")
        urls = []
        for rid in links:
            target = rels.get(rid)
            if target and target[2] and target[0] not in urls:
                urls.append(target[0])
        if urls:
            lines.append("**links**")
            lines.extend(f"- {u}" for u in urls)
            lines.append("")

        visuals, shapes = [], []
        bg = background(root, rels)
        if bg:
            visuals.append(bg)
        tree = root.find("p:cSld/p:spTree", NS)
        if tree is not None:
            collect(tree, IDENT, stage, rels, visuals, shapes)
        # A background or full-bleed picture sits under everything, so it never
        # counts as already carrying a drawing that is painted on top of it.
        pic_rects = [v["rect"] for v in visuals
                     if v["part"] and v["rect"] and area(v["rect"]) < CHROME_MAX_AREA]
        for rect in clusters(shapes, pic_rects):
            visuals.append({"kind": "drawing", "part": None, "rect": rect, "rot": 0,
                            "crop": None, "alt": "", "name": "",
                            "note": "shapes drawn on the slide, no picture part to copy"})

        rows = []
        for n, v in enumerate(visuals, start=1):
            e = emit(z, v, i, n, assets, pages, by_sha, taken, args)
            if e is None:
                continue
            entries.append(e)
            rows.append(row(e))
            if e.get("needs_reencode"):
                big.append(e["file"])
            if e.get("unresolved"):
                unresolved.append(f"slide {i}: {e['role']} {e['kind']}, {e.get('why', '')}")
        if rows:
            lines.append("**images**" + (f" (in {assets})" if assets else ""))
            lines.extend(rows)
            lines.append("")

        notes = notes_text(z, part)
        if notes:
            lines.append("**speaker notes**")
            lines.append("")
            lines.append("> " + notes.replace("\n", "\n> "))
            lines.append("")

    # The parity ledger: what the deck has to show, slide by slide.
    figures = dedupe(e for e in entries if e["role"] in sm.FIGURE_ROLES and not e["auto_drop"])
    lines += ["---", "", "## Parity checklist", "",
              f"{len(figures)} figure-sized visuals to place. Every one is either used by a slide "
              "or listed in the manifest's `dropped` array with a reason; `check_deck.py` fails "
              "otherwise. A placeholder is not a disposition.", ""]
    for e in figures:
        also = f" (also on slides {', '.join(map(str, e['also_on_slides']))})" if e["also_on_slides"] else ""
        lines.append(f"- slide {e['slide']} · `{e['file']}` · {e['role']} {e['kind']} · "
                     f"{e['area_pct']}% of the stage{also}")
    lines.append("")
    if unresolved:
        lines += ["Not resolved to an image, decide what happens to each:", ""] + \
                 [f"- {u}" for u in unresolved] + [""]
    if big:
        lines += ["Still over " + f"{sm.MAX_KB} KB or {sm.MAX_PX} px, re-encode before committing "
                  "(README, Images):", ""] + [f"- {n}" for n in big] + [""]

    Path(args.out).write_text("\n".join(lines), encoding="utf-8")

    if assets:
        sm.save_manifest(assets, {
            "source": src.name,
            "stage": {"w": sm.STAGE_W, "h": sm.STAGE_H},
            "slides": len(slides),
            "pages": str(pages[0].parent) if pages else None,
            "images": entries,
            "dropped": [],
        })

    print(f"{len(slides)} slides → {args.out}" +
          (f", {len(entries)} images → {assets}" if assets else ""))
    print(f"{len(figures)} figure-sized visuals; see the parity checklist at the end of the outline",
          file=sys.stderr)
    if unresolved:
        print(f"{len(unresolved)} visual(s) could not be turned into an image", file=sys.stderr)
    if big:
        print(f"{len(big)} image(s) still need re-encoding", file=sys.stderr)


def dedupe(entries):
    """One line per file: a logo repeated on ten slides is one thing to place."""
    seen, out = set(), []
    for e in entries:
        if e["file"] and e["file"] not in seen:
            seen.add(e["file"])
            out.append(e)
    return out


def row(e):
    """One line in the outline's image list for a manifest entry."""
    bits = [f"{e['role']} {e['kind']}", f"{e['area_pct']}% of the stage"]
    if e["px"]:
        bits.append(f"{e['px'][0]}×{e['px'][1]}")
    if e["bytes"]:
        bits.append(f"{e['bytes']/1024:.0f} KB")
    if e["alt"]:
        bits.append(f"alt: {e['alt']}")
    if e["shape_name"] and not e["alt"]:
        bits.append(f"named \"{e['shape_name']}\" in the source")
    if e["auto_drop"]:
        bits.append("chrome, dropped unless you want it")
    for note in e["notes"]:
        bits.append(note)
    head = f"`{e['file']}`" if e["file"] else "(no file)"
    return f"- {head} · " + " · ".join(bits)


def emit(z, v, slide, n, assets, pages, by_sha, taken, args):
    """Turn one collected visual into a manifest entry, writing its file."""
    rect = v["rect"] or [0.0, 0.0, 1.0, 1.0]
    a = area(rect)
    role = sm.role_for(a, is_bg=v["kind"] == "background")
    e = {
        "id": f"s{slide:02d}-{n}", "slide": slide, "kind": v["kind"], "role": role,
        "rect": [round(x, 4) for x in rect], "area_pct": round(a * 100, 1),
        "rot": v["rot"], "crop": v["crop"], "alt": v["alt"], "shape_name": v["name"],
        "source": v["part"], "file": None, "px": None, "bytes": None,
        "notes": [v["note"]] if v.get("note") else [], "also_on_slides": [], "auto_drop": False,
    }
    if v["part"]:
        ext = PurePosixPath(v["part"]).suffix.lower()
        if ext not in IMAGE_EXT:
            e["notes"].append(f"unsupported media type {ext or '?'}")
            e["unresolved"], e["why"] = True, f"media part {v['part']} is not an image"
            return e
        data = z.read(v["part"])
        e["src_bytes"] = len(data)
        if len(data) < SPACER_BYTES and a < 0.006:
            e["auto_drop"], e["role"] = True, "spacer"
            e["notes"].append("under 1 KB and tiny on the slide: a spacer or a bullet glyph")
            return e
        key = (sm.sha1(data), tuple(v["crop"] or ()), v["rot"])
        if key in by_sha:                       # the same logo on twenty slides
            first = by_sha[key]
            if slide != first["slide"] and slide not in first["also_on_slides"]:
                first["also_on_slides"].append(slide)
            e.update({k: first[k] for k in ("file", "px", "bytes", "sha1", "kind")})
            e["notes"].append(f"same image as {first['id']} on slide {first['slide']}")
            e["auto_drop"] = first["auto_drop"]
            return e
        if assets is None:
            e["notes"].append("no --assets given, image not written")
            return e
        # One media part can appear twice on a slide with different crops or
        # rotations, and those are two different pictures: keep both files.
        stem = f"s{slide:02d}-{PurePosixPath(v['part']).stem}"
        if f"{stem}{ext}" in taken:
            stem = f"s{slide:02d}-{n}-{PurePosixPath(v['part']).stem}"
        taken.add(f"{stem}{ext}")
        wrote = sm.write_media(assets, f"{stem}{ext}", data, reencode=not args.no_reencode,
                              crop=v["crop"], rot=v["rot"])
        taken.add(wrote["file"])
        e.update({k: wrote[k] for k in ("file", "px", "bytes", "sha1", "kind")})
        e["notes"] += wrote["notes"]
        if role == "icon":
            e["auto_drop"] = True
            e["notes"].append("small on the slide: probably a logo or an icon")
        e["needs_reencode"] = e["bytes"] / 1024 > sm.MAX_KB or (e["px"] and e["px"][0] > sm.MAX_PX)
        by_sha[key] = e
        return e

    # No picture part: a chart, SmartArt, a table, an embedded object or a
    # drawing. Crop it out of the render so the deck can show the real thing.
    if role in ("icon", "spacer"):
        e["auto_drop"] = True
        return e
    page = sm.page_for(pages, slide) if pages else None
    if page is None or assets is None:
        e["unresolved"], e["why"] = True, (
            "no render available; export a PDF of the deck and rerun, or redraw it as SVG"
            if page is None else "no --assets given")
        return e
    stem = f"s{slide:02d}-{v['kind']}-{n}"
    wrote = sm.crop_from_page(page, rect, Path(assets) / stem, reencode=not args.no_reencode)
    if wrote:
        taken.add(wrote["file"])
    if wrote is None:
        e["unresolved"], e["why"] = True, "the region is too small to crop"
        return e
    e.update({k: wrote[k] for k in ("file", "px", "bytes", "sha1")})
    e["notes"] += wrote["notes"]
    e["source"] = f"render:{page.name}"
    key = (wrote["sha1"], (), 0)
    if key in by_sha:
        first = by_sha[key]
        if slide != first["slide"] and slide not in first["also_on_slides"]:
            first["also_on_slides"].append(slide)
    else:
        by_sha[key] = e
    return e


if __name__ == "__main__":
    main()
