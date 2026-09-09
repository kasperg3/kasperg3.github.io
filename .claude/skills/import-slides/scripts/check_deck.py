#!/usr/bin/env python3
"""Check a knowledge deck against the engine's rules and the site's writing rules.

    python3 check_deck.py knowledge/<slug>/index.html

Run from anywhere inside the repository. Exit code 1 on any FAIL; WARN lines
are things to look at, not blockers. Standard library only.

Checks:
  engine   every <section> in #stage has class "slide" and a data-t; exactly the
           first slide carries "active"; <title> and meta description exist;
           content slides have a .slide-foot; every <img src> resolves on disk
  images   every figure-sized image the source deck had, as recorded in
           assets/source-images.json by extract_pptx.py or extract_pdf.py, is
           either shown by a slide or written off in the manifest's `dropped`
           array with a reason. A placeholder is not a disposition
  layout   no `flex:0 0 <n>px` on a direct child of a column container
           (.stack or an inline flex-direction:column), the README gotcha
  writing  no em-dash and no § in reader-visible text (CLAUDE.md rules);
           no leftover `todo` spans or `draft-flag` unless you mean them
  wiring   knowledge/index.html links the deck, sitemap.xml lists it and
           tools/build_search_index.py DECKS registers it (WARN, since a
           draft may deliberately stay unlisted)
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import slidemedia as sm

REF = re.compile(r"""(?:src|srcset|href|poster|data-src)\s*=\s*["']([^"']+)["']"""
                 r"""|url\(\s*['"]?([^'")]+)""", re.I)


class Deck(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []            # open elements: (tag, attrs)
        self.slides = []           # dicts: classes, data_t, has_foot, line
        self.in_stage = False
        self.stage_depth = None
        self.title = None
        self.description = None
        self.text = []             # (line, text) for visible text
        self.imgs = []             # (line, src)
        self.layout = []           # (line, message)
        self.todo = 0
        self.draft = 0
        self.skip_depth = None     # inside script/style

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        classes = (a.get("class") or "").split()
        style = (a.get("style") or "").replace(" ", "")
        if tag in ("script", "style") and self.skip_depth is None:
            self.skip_depth = len(self.stack)
        if tag == "title":
            self.title = ""
        if tag == "meta" and a.get("name") == "description":
            self.description = a.get("content", "")
        if a.get("id") == "stage":
            self.in_stage = True
            self.stage_depth = len(self.stack)
        if self.in_stage and tag == "section" and len(self.stack) == self.stage_depth + 1:
            self.slides.append({"classes": classes, "data_t": a.get("data-t"), "has_foot": False, "line": line})
        if "slide-foot" in classes and self.slides:
            self.slides[-1]["has_foot"] = True
        if tag == "img":
            self.imgs.append((line, a.get("src", "")))
        if "todo" in classes:
            self.todo += 1
        if "draft-flag" in classes:
            self.draft += 1
        # the column-container gotcha
        if re.search(r"flex:0\s*0\s*\d+px", style) and self.stack:
            ptag, pattrs = self.stack[-1]
            pclasses = (pattrs.get("class") or "").split()
            pstyle = (pattrs.get("style") or "").replace(" ", "")
            if "stack" in pclasses or "flex-direction:column" in pstyle:
                self.layout.append((line, f"<{tag}> has a px flex-basis inside a column container "
                                          f"(<{ptag} class=\"{' '.join(pclasses)}\">): in a column that sets height"))
        if tag not in ("img", "br", "meta", "link", "i", "input", "path", "rect", "circle", "line", "polyline", "polygon", "use", "stop"):
            self.stack.append((tag, a))
        elif tag == "i":
            self.stack.append((tag, a))

    def handle_endtag(self, tag):
        for k in range(len(self.stack) - 1, -1, -1):
            if self.stack[k][0] == tag:
                del self.stack[k:]
                break
        if self.skip_depth is not None and len(self.stack) <= self.skip_depth:
            self.skip_depth = None
        if self.in_stage and self.stage_depth is not None and len(self.stack) <= self.stage_depth:
            self.in_stage = False

    def handle_data(self, data):
        if self.title == "" and self.stack and self.stack[-1][0] == "title":
            self.title = data.strip()
            return
        if self.skip_depth is None and data.strip():
            self.text.append((self.getpos()[0], data))


def referenced(html):
    """Basenames of every file the page points at, from markup and CSS alike."""
    out = set()
    for a, b in REF.findall(html):
        for value in (a, b):
            for candidate in value.split(","):
                url = candidate.strip().split()[0] if candidate.strip() else ""
                if url:
                    out.add(url.split("?")[0].split("#")[0].rsplit("/", 1)[-1])
    return out


def check_images(deck_dir, html, fails, warns, oks):
    """Hold the deck to the images the source deck had.

    The importers write assets/source-images.json listing every figure-sized
    visual on every source slide. A deck that quietly leaves one out looks
    finished and is not: the audience saw that figure. So each one has to be on
    a slide, or written off in the manifest's `dropped` array with a reason.
    """
    assets = deck_dir / "assets"
    man = sm.load_manifest(assets)
    used = referenced(html)
    if man is None:
        if assets.exists():
            warns.append("no assets/source-images.json: if this deck came from slides, rerun "
                         "extract_pptx.py or extract_pdf.py so the figures can be accounted for")
        return

    dropped = {}
    for item in man.get("dropped", []):
        if isinstance(item, str):
            dropped[item] = ""
        elif isinstance(item, dict) and item.get("file"):
            dropped[item["file"]] = (item.get("reason") or "").strip()

    figures, seen = [], set()
    for e in man.get("images", []):
        f = e.get("file")
        if not f or f in seen or e.get("auto_drop") or e.get("role") not in sm.FIGURE_ROLES:
            continue
        seen.add(f)
        figures.append(e)

    missing, written_off, placed = [], [], []
    for e in figures:
        f = e["file"]
        if f in used:
            placed.append(e)
            if not (assets / f).exists():
                fails.append(f"assets/{f} is used by the deck but is not on disk")
        elif f in dropped:
            if len(dropped[f]) < 8:
                fails.append(f"assets/{f} is in the manifest's dropped list with no real reason; "
                             f"say why the deck does not need a figure the audience saw")
            else:
                written_off.append(e)
        else:
            missing.append(e)

    for e in missing:
        where = f"source slide {e['slide']}"
        fails.append(f"assets/{e['file']} ({e['role']}, {e['area_pct']}% of {where}) is neither "
                     f"shown by a slide nor dropped with a reason in assets/"
                     f"{sm.MANIFEST_NAME}: the source slide had it, so this deck is not at parity")
    if missing and re.search(r'class="[^"]*(?:fig-todo|todo)', html):
        fails.append("a placeholder stands in for a figure the source deck actually contained: "
                     "place the extracted image, or crop it out of the render with crop_figure.py")
    if figures:
        oks.append(f"{len(placed)}/{len(figures)} source figures placed" +
                   (f", {len(written_off)} dropped with a reason" if written_off else ""))

    if assets.exists():
        stray = sorted(p.name for p in assets.iterdir()
                       if p.is_file() and p.name != sm.MANIFEST_NAME and p.name not in used)
        if stray:
            warns.append(f"assets/ holds {len(stray)} file(s) the deck never references, delete "
                         f"them or use them: {', '.join(stray[:6])}"
                         + (" …" if len(stray) > 6 else ""))


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    path = Path(sys.argv[1]).resolve()
    repo = next((p for p in path.parents if (p / "deck" / "deck.css").exists()), None)
    if repo is None:
        print("FAIL  cannot find the repository root (no deck/deck.css above the file)")
        sys.exit(1)
    slug = path.parent.name
    html = path.read_text(encoding="utf-8")
    d = Deck()
    d.feed(html)

    fails, warns, oks = [], [], []

    # engine
    if not d.slides:
        fails.append("no <section> inside #stage")
    for i, s in enumerate(d.slides, start=1):
        if "slide" not in s["classes"]:
            fails.append(f"line {s['line']}: section {i} lacks class \"slide\"")
        if not s["data_t"]:
            fails.append(f"line {s['line']}: slide {i} has no data-t (contents drawer and tab title need it)")
        is_active = "active" in s["classes"]
        if i == 1 and not is_active:
            fails.append(f"line {s['line']}: the first slide must carry class \"active\"")
        if i > 1 and is_active:
            fails.append(f"line {s['line']}: slide {i} carries \"active\"; only the first slide may")
        plain = not ({"title-slide", "section", "closing-slide"} & set(s["classes"]))
        if plain and not s["has_foot"]:
            warns.append(f"line {s['line']}: content slide {i} has no .slide-foot")
    oks.append(f"{len(d.slides)} slides")
    if not d.title:
        fails.append("no <title>")
    if not d.description:
        warns.append("no <meta name=\"description\">; the knowledge index and search use it")
    for line, src in d.imgs:
        if src.startswith(("http://", "https://", "data:")):
            continue
        target = (repo / src.lstrip("/")) if src.startswith("/") else (path.parent / src)
        if not target.exists():
            fails.append(f"line {line}: <img src=\"{src}\"> does not exist on disk")
    if d.imgs:
        oks.append(f"{len(d.imgs)} images resolve" if not any("img src" in f for f in fails) else "")

    # images: parity with the source deck
    check_images(path.parent, html, fails, warns, oks)

    # layout
    for line, msg in d.layout:
        fails.append(f"line {line}: {msg}")

    # writing rules
    for line, text in d.text:
        if "—" in text:
            fails.append(f"line {line}: em-dash in visible text: {text.strip()[:70]!r}")
        if "§" in text:
            fails.append(f"line {line}: § in visible text, write \"Section N\": {text.strip()[:70]!r}")
    if d.title and "—" in d.title and not re.search(r"—\s*Kasper", d.title):
        fails.append("em-dash in <title> outside the site's \"Page — Kasper Rømer Grøntved\" separator")
    if d.todo:
        warns.append(f"{d.todo} <span class=\"todo\"> placeholder(s) remain")
    if d.draft:
        warns.append(f"{d.draft} .draft-flag badge(s); remove when the deck is final")

    # wiring
    url = f"/knowledge/{slug}/"
    idx = (repo / "knowledge" / "index.html").read_text(encoding="utf-8")
    if url not in idx:
        warns.append(f"knowledge/index.html has no card linking {url}")
    sm = (repo / "sitemap.xml").read_text(encoding="utf-8")
    if url not in sm:
        warns.append(f"sitemap.xml does not list {url}")
    build = repo / "tools" / "build_search_index.py"
    if build.exists() and f'"{slug}"' not in build.read_text(encoding="utf-8"):
        warns.append(f"tools/build_search_index.py DECKS does not register \"{slug}\", so search will not index it")

    for o in oks:
        if o:
            print(f"ok    {o}")
    for w in warns:
        print(f"WARN  {w}")
    for f in fails:
        print(f"FAIL  {f}")
    print(f"\n{len(fails)} fail, {len(warns)} warn")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
