#!/usr/bin/env python3
"""Turn a .pptx (a Google Slides export) into a Markdown outline plus its images.

    python3 extract_pptx.py deck.pptx --out outline.md --assets knowledge/<slug>/assets

Standard library only. For every slide, in presentation order, the outline
lists the title placeholder, every other text shape as its own block, the
hyperlinks, the images placed on the slide (copied into --assets under a
slide-numbered name) and the speaker notes. The outline is the raw material
for the hand-written deck; it is not itself a deck.
"""
import argparse
import struct
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
R_ID = "{%s}id" % NS["r"]
R_EMBED = "{%s}embed" % NS["r"]
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".emf", ".wmf", ".bmp", ".tif", ".tiff"}


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
    for sp in root.iter("{%s}sp" % NS["p"]):
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


def image_dims(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", data[16:24])
        return w, h
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            seg = struct.unpack(">H", data[i + 2:i + 4])[0]
            i += 2 + seg
    return None


def notes_text(z, slide_part):
    rels = rels_for(z, slide_part)
    for target, kind, external in rels.values():
        if kind == "notesSlide" and not external:
            root = ET.fromstring(z.read(target))
            out = []
            for sp in root.iter("{%s}sp" % NS["p"]):
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pptx")
    ap.add_argument("--out", default="outline.md", help="Markdown outline to write")
    ap.add_argument("--assets", help="directory to copy slide images into (created if missing)")
    args = ap.parse_args()

    z = zipfile.ZipFile(args.pptx)
    slides = slide_order(z)
    assets = Path(args.assets) if args.assets else None
    if assets:
        assets.mkdir(parents=True, exist_ok=True)

    lines = [f"# Outline of {Path(args.pptx).name}", "", f"{len(slides)} slides in presentation order.", ""]
    big = []
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
        pics = []
        for pic in root.iter("{%s}pic" % NS["p"]):
            blip = pic.find(".//a:blip", NS)
            if blip is None:
                continue
            target = rels.get(blip.get(R_EMBED))
            if not target or target[2]:
                continue
            src = target[0]
            ext = PurePosixPath(src).suffix.lower()
            if ext not in IMAGE_EXT:
                continue
            data = z.read(src)
            dims = image_dims(data)
            name = f"s{i:02d}-{PurePosixPath(src).stem}{ext}"
            if assets:
                (assets / name).write_bytes(data)
            desc = pic.find("p:nvPicPr/p:cNvPr", NS)
            alt = (desc.get("descr") or desc.get("title") or "") if desc is not None else ""
            size_kb = len(data) / 1024
            dim_s = f"{dims[0]}×{dims[1]}" if dims else "?"
            pics.append(f"- `{name}` · {dim_s} · {size_kb:.0f} KB" + (f" · alt: {alt}" if alt else ""))
            if size_kb > 300 or (dims and dims[0] > 1800):
                big.append(name)
        if pics:
            lines.append("**images**" + (f" (copied to {assets})" if assets else ""))
            lines.extend(pics)
            lines.append("")
        notes = notes_text(z, part)
        if notes:
            lines.append("**speaker notes**")
            lines.append("")
            lines.append("> " + notes.replace("\n", "\n> "))
            lines.append("")
    if big:
        lines.append("---")
        lines.append("")
        lines.append("Images over 300 KB or wider than 1800 px, re-encode before committing "
                     "(see README, Images):")
        lines.extend(f"- {n}" for n in big)
        lines.append("")
    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(slides)} slides → {args.out}" + (f", images → {assets}" if assets else ""))
    if big:
        print(f"{len(big)} image(s) need re-encoding, listed at the end of the outline", file=sys.stderr)


if __name__ == "__main__":
    main()
