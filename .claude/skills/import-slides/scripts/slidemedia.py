#!/usr/bin/env python3
"""Shared helpers for the slide importers: geometry, image probing, cropping,
page rendering and the source-image manifest.

Imported by extract_pptx.py, extract_pdf.py, crop_figure.py and check_deck.py.
Standard library only, except that re-encoding and cropping use Pillow when it
is installed; without it the original bytes are copied through and the caller
is told.
"""
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

EMU_PER_IN = 914400
STAGE_W, STAGE_H = 1920, 1080          # the deck engine's fixed stage
MANIFEST_NAME = "source-images.json"   # lives in knowledge/<slug>/assets/
MAX_KB = 300                           # README, Images
MAX_PX = 1800

# Roles, widest to narrowest. The deck must account for everything down to
# "inset"; "icon" and "spacer" are chrome and auto-dropped.
FIGURE_ROLES = ("background", "full-bleed", "hero", "figure", "inset")


def have(cmd):
    return shutil.which(cmd) is not None


def sha1(data):
    return hashlib.sha1(data).hexdigest()


# ---------------------------------------------------------------- image probing

def probe(data):
    """(width, height, kind) for the formats a Slides export can contain."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", data[16:24])
        return w, h, "png"
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h, "jpeg"
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            seg = struct.unpack(">H", data[i + 2:i + 4])[0]
            i += 2 + seg
        return None, None, "jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        w, h = struct.unpack("<HH", data[6:10])
        return w, h, "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        if data[12:16] == b"VP8X":
            w = int.from_bytes(data[24:27], "little") + 1
            h = int.from_bytes(data[27:30], "little") + 1
            return w, h, "webp"
        return None, None, "webp"
    if data[:4] in (b"\x01\x00\x00\x00", b"\xd7\xcd\xc6\x9a") or data[:2] == b"\xd7\xcd":
        return None, None, "emf" if data[:4] == b"\x01\x00\x00\x00" else "wmf"
    head = data[:4096].lstrip()
    if head[:5] == b"<?xml" or head[:4] == b"<svg":
        return _svg_dims(data) + ("svg",)
    return None, None, "bin"


def _svg_dims(data):
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return None, None
    def num(v):
        m = re.match(r"\s*([-\d.]+)", v or "")
        return float(m.group(1)) if m else None
    w, h = num(root.get("width")), num(root.get("height"))
    if w and h:
        return round(w), round(h)
    vb = (root.get("viewBox") or "").replace(",", " ").split()
    if len(vb) == 4:
        return round(float(vb[2])), round(float(vb[3]))
    return None, None


# --------------------------------------------------------------- writing images

def _pil():
    try:
        from PIL import Image
        return Image
    except ImportError:
        return None


def write_media(assets, name, data, *, reencode=True, crop=None, rot=0):
    """Write one image into the assets directory, cropped and sized for the web.

    `crop` is a (left, top, right, bottom) tuple of fractions to cut away, as
    DrawingML's a:srcRect gives it. `rot` is degrees clockwise. Returns a dict
    describing what landed on disk.
    """
    assets = Path(assets)
    assets.mkdir(parents=True, exist_ok=True)
    w, h, kind = probe(data)
    notes = []
    stem = Path(name).stem
    ext = Path(name).suffix.lower()

    if kind in ("emf", "wmf"):
        was = kind.upper()
        conv = _convert_vector(data, ext)
        if conv:
            data, ext = conv, ".png"
            w, h, kind = probe(data)
            notes.append(f"converted from {was} to PNG")
        else:
            notes.append(f"{was} metafile: no converter available, redraw it or re-export the slide")

    if kind == "svg":
        # Vector stays vector: no crop, no resize, nothing to gain.
        if crop and any(crop):
            notes.append("crop from the source slide not applied to the SVG")
        out = assets / f"{stem}.svg"
        out.write_bytes(data)
        return _result(out, data, w, h, "svg", notes)

    Image = _pil()
    if Image and (crop and any(crop) or rot):
        data, w, h = _transform(Image, data, crop, rot, notes)
    elif crop and any(crop):
        notes.append("crop from the source slide not applied (Pillow missing)")

    too_big = len(data) / 1024 > MAX_KB or (w and w > MAX_PX)
    if reencode and too_big:
        if Image:
            data, w, h, ext = _shrink(Image, data, notes)
        else:
            notes.append(f"{len(data)/1024:.0f} KB / {w} px: re-encode by hand (Pillow missing)")
    out = assets / f"{stem}{ext}"
    out.write_bytes(data)
    return _result(out, data, w, h, probe(data)[2], notes)


def _result(path, data, w, h, kind, notes):
    return {
        "file": path.name,
        "bytes": len(data),
        "px": [w, h] if w and h else None,
        "kind": kind,
        "sha1": sha1(data),
        "notes": notes,
    }


def _transform(Image, data, crop, rot, notes):
    import io
    im = Image.open(io.BytesIO(data))
    if crop and any(crop):
        l, t, r, b = crop
        box = (round(im.width * l), round(im.height * t),
               round(im.width * (1 - r)), round(im.height * (1 - b)))
        if box[2] - box[0] > 8 and box[3] - box[1] > 8:
            im = im.crop(box)
            notes.append("cropped as the source slide cropped it")
    if rot:
        im = im.rotate(-rot, expand=True, resample=Image.BICUBIC)
        notes.append(f"rotated {rot}° as on the source slide")
    return _dump(im, data), im.width, im.height


def _dump(im, original):
    import io
    buf = io.BytesIO()
    fmt = "PNG" if im.mode in ("RGBA", "LA", "P") else "JPEG"
    im.save(buf, fmt, quality=92) if fmt == "JPEG" else im.save(buf, fmt)
    return buf.getvalue() or original


def _shrink(Image, data, notes):
    import io
    im = Image.open(io.BytesIO(data))
    if im.width > MAX_PX:
        im = im.resize((MAX_PX, round(im.height * MAX_PX / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=85, method=6)
    notes.append(f"re-encoded to WebP at {im.width} px ({len(buf.getvalue())/1024:.0f} KB)")
    return buf.getvalue(), im.width, im.height, ".webp"


def _soffice():
    return shutil.which("libreoffice") or shutil.which("soffice")


def _lo_workdir(tag):
    """A directory LibreOffice can actually read and write.

    A snap-packaged LibreOffice is confined: it sees neither /tmp (where the
    session scratchpad lives) nor hidden directories under $HOME. Handing it a
    deck in either place fails with "source file could not be loaded" or "user
    installation could not be completed", so for a snap the work happens in a
    plain visible directory in $HOME, removed again afterwards.
    """
    soffice = _soffice() or ""
    if os.path.realpath(soffice).startswith("/snap") or "/snap/" in soffice:
        work = Path.home() / "import-slides-render" / f"{tag}-{os.getpid()}"
    else:
        work = Path(tempfile.gettempdir()) / f"import-slides-{tag}-{os.getpid()}"
    work.mkdir(parents=True, exist_ok=True)
    return work


def _lo_convert(src, fmt, work, timeout=900):
    """Convert one file with LibreOffice inside `work`; return (output, error).

    The profile lives in `work` too, so a LibreOffice the user already has open
    does not fight this one over the profile lock.
    """
    soffice = _soffice()
    if not soffice:
        return None, "no LibreOffice on PATH"
    src = Path(src)
    staged = work / src.name
    if not staged.exists() or staged.resolve() != src.resolve():
        shutil.copyfile(src, staged)
    cmd = [soffice, f"-env:UserInstallation=file://{work / 'profile'}", "--headless",
           "--convert-to", fmt, "--outdir", str(work), str(staged)]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=timeout, text=True)
    except (subprocess.SubprocessError, OSError) as e:
        return None, str(e)
    out = work / (staged.stem + "." + fmt.split(":")[0])
    if not out.exists():
        tail = (p.stdout + p.stderr).strip().splitlines()
        return None, tail[-1] if tail else f"LibreOffice produced no {fmt}"
    return out, None


def _lo_cleanup(work):
    shutil.rmtree(work, ignore_errors=True)
    parent = Path(work).parent
    if parent.name == "import-slides-render":
        try:
            parent.rmdir()
        except OSError:
            pass


def _convert_vector(data, ext):
    """EMF/WMF to PNG through LibreOffice, which is what rendered the deck anyway."""
    if not _soffice():
        return None
    work = _lo_workdir("vector")
    src = work / f"in{ext or '.emf'}"
    src.write_bytes(data)
    out, _ = _lo_convert(src, "png", work, timeout=180)
    data = out.read_bytes() if out else None
    _lo_cleanup(work)
    return data


# ------------------------------------------------------------- page rendering

def render_pages(source, outdir, dpi=150):
    """Render every slide of a .pptx or .pdf to <outdir>/page-NN.png.

    Returns the sorted list of PNG paths, or [] with a reason on stderr. The
    renders are the parity reference: they are what the audience saw, and any
    figure that is not a picture part in the file gets cropped out of them.
    """
    source = Path(source)
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    pdf = source
    if source.suffix.lower() != ".pdf":
        work = _lo_workdir("render")
        out, err = _lo_convert(source, "pdf", work)
        if out is None:
            print(f"cannot render the slides ({err}). Export a PDF of the deck alongside the "
                  f".pptx and pass that to --pdf, or every chart and grouped drawing has to be "
                  f"redrawn by hand.", file=sys.stderr)
            _lo_cleanup(work)
            return []
        pdf = outdir / (source.stem + ".pdf")
        shutil.copyfile(out, pdf)
        _lo_cleanup(work)
    tool = "pdftoppm" if have("pdftoppm") else ("pdftocairo" if have("pdftocairo") else None)
    if tool is None:
        print("no pdftoppm or pdftocairo (poppler-utils): cannot render slides to PNG",
              file=sys.stderr)
        return []
    try:
        subprocess.run([tool, "-r", str(dpi), "-png", str(pdf), str(outdir / "page")],
                       check=True, capture_output=True, timeout=900)
    except (subprocess.SubprocessError, OSError) as e:
        print(f"{tool} failed: {e}", file=sys.stderr)
        return []
    return sorted(outdir.glob("page-*.png"))


def page_for(pages, n):
    """The render of slide n, whatever width pdftoppm zero-padded the name to."""
    for p in pages:
        m = re.search(r"-(\d+)\.png$", p.name)
        if m and int(m.group(1)) == n:
            return p
    return None


def crop_from_page(page, rect, out_path, pad=0.012, reencode=True):
    """Cut `rect` (x, y, w, h as fractions of the page) out of a rendered page.

    This is how a chart, a SmartArt diagram, a grouped drawing or anything else
    that is not stored as a picture part still reaches the deck looking like it
    did on the original slide.
    """
    Image = _pil()
    out_path = Path(out_path)
    if Image is None:
        shutil.copyfile(page, out_path.with_suffix(".png"))
        return {"file": out_path.with_suffix('.png').name, "bytes": Path(page).stat().st_size,
                "px": None, "kind": "png", "sha1": sha1(Path(page).read_bytes()),
                "notes": ["whole page copied: Pillow missing, crop it by hand"]}
    im = Image.open(page)
    x, y, w, h = rect
    box = (max(0, round((x - pad) * im.width)), max(0, round((y - pad) * im.height)),
           min(im.width, round((x + w + pad) * im.width)), min(im.height, round((y + h + pad) * im.height)))
    if box[2] - box[0] < 8 or box[3] - box[1] < 8:
        return None
    im = im.crop(box)
    notes = [f"cropped from the rendered source slide at {im.width}×{im.height}"]
    if im.width > MAX_PX:
        im = im.resize((MAX_PX, round(im.height * MAX_PX / im.width)), Image.LANCZOS)
    import io
    buf = io.BytesIO()
    if reencode:
        im.save(buf, "WEBP", quality=88, method=6)
        out_path = out_path.with_suffix(".webp")
    else:
        im.save(buf, "PNG")
        out_path = out_path.with_suffix(".png")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(buf.getvalue())
    return _result(out_path, buf.getvalue(), im.width, im.height, probe(buf.getvalue())[2], notes)


# ------------------------------------------------------------------- manifest

def role_for(area, is_bg=False):
    if is_bg:
        return "background"
    if area >= 0.80:
        return "full-bleed"
    if area >= 0.22:
        return "hero"
    if area >= 0.045:
        return "figure"
    if area >= 0.006:
        return "inset"
    return "icon"


def manifest_path(assets):
    return Path(assets) / MANIFEST_NAME


def save_manifest(assets, data):
    p = manifest_path(assets)
    p.parent.mkdir(parents=True, exist_ok=True)
    data.setdefault("dropped", [])
    data["generated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return p


def load_manifest(assets):
    p = manifest_path(assets)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"{p} is not valid JSON: {e}")
