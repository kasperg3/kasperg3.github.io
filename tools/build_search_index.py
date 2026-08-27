#!/usr/bin/env python3
"""Build the inference-free SPLADE search index for grontved.xyz.

Two stages:

  1. Extraction  — walk the site's HTML with the stdlib parser and turn it into a
     flat list of passages, each with a stable URL fragment. Runs anywhere;
     `--dry-run` stops here and prints what it found.

  2. Encoding    — push each passage through the *document* side of an
     inference-free SPLADE model and write a sparse index the browser can score
     without running a model of its own. Needs torch + transformers.

The asymmetry is the whole point. The document encoder is a 67M-parameter
masked LM; the query encoder is a tokenizer plus a static weight lookup. So the
expensive half happens here, at build time, and the browser ships ~150 KB of
JSON and does a sparse dot product.

Usage:
    python3 tools/build_search_index.py --dry-run
    python3 tools/build_search_index.py --out search
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

MODEL_ID = "opensearch-project/opensearch-neural-sparse-encoding-doc-v3-distill"

# Quantisation. Document weights land in 1..255 as round(w * DOC_SCALE); query
# weights in a uint16 as round(w * QRY_SCALE). Both are generous: doc weights
# top out around 3 and query weights around 5.
DOC_SCALE = 100
QRY_SCALE = 1000

TOP_TERMS = 160        # keep at most this many activated terms per document
MIN_WEIGHT = 0.05      # ...and drop anything below this before the cut

# `cv-fact` rows (Skills: Languages -> "Python · C / C++ · Rust") are
# `·`-separated list fragments, not passages. SPLADE produces noise from them.
INCLUDE_CV_FACTS = False

# A slide with fewer words than this is a divider (title / section / closing),
# not content.
MIN_SLIDE_WORDS = 18

DECKS = [
    ("late-interaction-primer", "Late Interaction, Up Close"),
    ("decentralized-task-allocation", "Decentralized Multi-UAV Task Allocation"),
    ("ml-and-data-at-colourbox", "ML and Data at Colourbox"),
]

# Stable fragment ids. These are the anchors that must exist in the HTML — the
# extractor asserts each one is present so a renamed heading can never silently
# produce a dead link.
SLUG_MAP = {
    "publication": [
        "pub-sarenv",
        "pub-swarmtalk-espnow",
        "pub-task-generation-sar",
        "pub-volcanic-plume",
        "pub-uspace-planning",
        "pub-trajectory-task-allocation",
        "pub-drone-swarms-chapter",
        "pub-herd-project",
    ],
    "thesis": ["thesis-phd", "thesis-msc", "thesis-bsc"],
    "supervision": ["supervision-thomsen", "supervision-mansson-jensen"],
    "project": [
        "project-trajallocpy",
        "project-trajgenpy",
        "project-swarmtalk",
        "project-ddicp",
        "project-sarenv",
        "project-hopdatabase",
    ],
    "cv-role": [
        "cv-colourbox",
        "cv-esoft",
        "cv-sdu-phd",
        "cv-cmu",
        "cv-a2i-systems",
        "cv-a2i-student",
        "cv-edu-phd",
        "cv-edu-msc",
        "cv-edu-bsc",
    ],
}


# ---------------------------------------------------------------------------
# a very small DOM
# ---------------------------------------------------------------------------

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


@dataclass
class Node:
    tag: str = ""
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)
    parent: "Node | None" = None

    # -- queries ------------------------------------------------------------
    @property
    def classes(self) -> set:
        return set(self.attrs.get("class", "").split())

    def has_class(self, name: str) -> bool:
        return name in self.classes

    def walk(self):
        for c in self.children:
            if isinstance(c, Node):
                yield c
                yield from c.walk()

    def find_all(self, tag=None, cls=None):
        for n in self.walk():
            if tag and n.tag != tag:
                continue
            if cls and not n.has_class(cls):
                continue
            yield n

    def find(self, tag=None, cls=None):
        return next(self.find_all(tag, cls), None)

    # -- text ---------------------------------------------------------------
    def text(self, skip_classes=(), skip_tags=("script", "style")) -> str:
        out = []
        self._text(out, set(skip_classes), set(skip_tags))
        return normalise(" ".join(out))

    def _text(self, out, skip_classes, skip_tags):
        for c in self.children:
            if isinstance(c, str):
                out.append(c)
                continue
            if c.tag in skip_tags or (c.classes & skip_classes):
                continue
            # A diagram labelled for screen readers carries a better description
            # than its own markup does — take the label, skip the subtree.
            if c.attrs.get("role") == "img" and c.attrs.get("aria-label"):
                out.append(c.attrs["aria-label"])
                continue
            if c.tag == "img" and c.attrs.get("alt"):
                out.append(c.attrs["alt"])
                continue
            c._text(out, skip_classes, skip_tags)


class DOM(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node(tag="#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag=tag, attrs=dict(attrs), parent=self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag=tag, attrs=dict(attrs), parent=self.cur))

    def handle_endtag(self, tag):
        node = self.cur
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:
            self.cur = node.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse(path: Path) -> Node:
    dom = DOM()
    dom.feed(path.read_text(encoding="utf-8"))
    return dom.root


def normalise(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = s.replace(" ", " ").replace("‑", "-").replace("​", "")
    return re.sub(r"\s+", " ", s).strip()


def words(s: str) -> int:
    return len(s.split())


def snippet(s: str, n: int = 240) -> str:
    if len(s) <= n:
        return s
    cut = s[:n]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > n * 0.6 else cut).rstrip(" ,;:·—-") + "…"


# ---------------------------------------------------------------------------
# extraction
# ---------------------------------------------------------------------------

@dataclass
class Doc:
    id: str
    kind: str
    title: str
    url: str
    meta: str
    text: str

    def as_index_entry(self) -> dict:
        return {"id": self.id, "kind": self.kind, "title": self.title,
                "url": self.url, "meta": self.meta, "snippet": snippet(self.text)}


def require_anchors(found: list, kind: str) -> None:
    """Fail loudly if the HTML no longer carries the ids the index promises."""
    expected = SLUG_MAP.get(kind)
    if expected is None:
        return
    if found != expected:
        missing = [s for s in expected if s not in found]
        extra = [s for s in found if s not in expected]
        raise SystemExit(
            f"anchor mismatch for {kind}:\n"
            f"  expected {len(expected)}: {expected}\n"
            f"  found    {len(found)}: {found}\n"
            f"  missing  {missing}\n  unexpected {extra}\n"
            "Add the `id` attributes to the HTML, or update SLUG_MAP."
        )


def extract_publications() -> list:
    root = parse(REPO / "publications.html")
    docs, pub_ids, thesis_ids, sup_ids = [], [], [], []

    # -- papers, grouped under `p.pubyear` headings -------------------------
    year = ""
    main = root.find("main")
    for node in main.walk():
        if node.tag == "p" and node.has_class("pubyear"):
            year = node.text()
        elif node.tag == "details" and node.has_class("pub"):
            slug = node.attrs.get("id", "")
            pub_ids.append(slug)
            title = normalise(node.find("span", "ptitle").text())
            pmeta = node.find("span", "pmeta")
            venue_node = pmeta.find("span", "venue") if pmeta else None
            venue = venue_node.text() if venue_node is not None else ""
            meta_txt = pmeta.text() if pmeta is not None else ""
            abs_node = node.find("div", "abs")
            # drop the DOI/code links and the funding note
            body = abs_node.text(skip_classes=("links",),
                                 skip_tags=("script", "style", "p"))
            body = re.sub(r"^Abstract\s*", "", body).strip()
            docs.append(Doc(
                id=slug, kind="publication", title=title,
                url=f"/publications.html#{slug}",
                meta=normalise(f"{meta_txt} · {year}" if year else meta_txt),
                text=normalise(f"{title}. {venue}. {body}"),
            ))

    # -- theses and supervision, as dt/dd pairs -----------------------------
    for section in main.find_all("section"):
        head = section.find("div", "sec-head")
        if head is None:
            continue
        h2 = head.find("h2")
        label = h2.text() if h2 is not None else ""
        if label not in ("Theses", "Supervision"):
            continue
        kind = "thesis" if label == "Theses" else "supervision"
        dl = section.find("dl", "kv")
        pending = None
        for child in dl.children:
            if not isinstance(child, Node):
                continue
            if child.tag == "dt":
                pending = (child.attrs.get("id", ""), child.text())
            elif child.tag == "dd" and pending is not None:
                slug, when = pending
                (thesis_ids if kind == "thesis" else sup_ids).append(slug)
                body = child.text()
                strong = child.find("strong") or child.find("em")
                title = strong.text() if strong is not None else snippet(body, 80)
                docs.append(Doc(
                    id=slug, kind=kind, title=normalise(title),
                    url=f"/publications.html#{slug}",
                    meta=normalise(f"{label} · {when}"),
                    text=normalise(f"{title}. {body}"),
                ))
                pending = None

    require_anchors(pub_ids, "publication")
    require_anchors(thesis_ids, "thesis")
    require_anchors(sup_ids, "supervision")
    return docs


def extract_projects() -> list:
    root = parse(REPO / "projects.html")
    docs, ids = [], []
    for card in root.find("main").find_all("a", "card"):
        slug = card.attrs.get("id", "")
        ids.append(slug)
        h3 = card.find("h3")
        title = h3.text() if h3 is not None else ""
        tag = card.find("span", "tag")
        pills = " · ".join(p.text() for p in card.find_all("span", "pill"))
        body = " ".join(p.text() for p in card.find_all("p"))
        docs.append(Doc(
            id=slug, kind="project", title=normalise(title),
            url=f"/projects.html#{slug}",
            meta=normalise(" · ".join(x for x in
                                      [tag.text() if tag is not None else "", pills] if x)),
            text=normalise(f"{title}. {body}"),
        ))
    require_anchors(ids, "project")
    return docs


def extract_cv() -> list:
    root = parse(REPO / "cv.html")
    docs, role_ids = [], []
    main = root.find("main")

    for section in main.find_all("section"):
        head = section.find("div", "sec-head")
        h2 = head.find("h2") if head is not None else None
        label = h2.text() if h2 is not None else ""

        tl = section.find("ul", "tl")
        if tl is not None:
            for li in tl.children:
                if not isinstance(li, Node) or li.tag != "li":
                    continue
                slug = li.attrs.get("id", "")
                role_ids.append(slug)
                when = li.find("span", "when")
                what = li.find("div", "what")
                where = what.find("span", "where") if what is not None else None
                title = normalise(what.text() if what is not None else "")
                body = " ".join(p.text() for p in li.find_all("p"))
                docs.append(Doc(
                    id=slug, kind="cv-role", title=title,
                    url=f"/cv.html#{slug}",
                    meta=normalise(" · ".join(x for x in [
                        label, when.text() if when is not None else "",
                        where.text() if where is not None else ""] if x)),
                    text=normalise(f"{title}. {body}"),
                ))
            continue

        if not INCLUDE_CV_FACTS:
            continue
        dl = section.find("dl", "kv")
        if dl is None:
            continue
        pending = None
        for child in dl.children:
            if not isinstance(child, Node):
                continue
            if child.tag == "dt":
                pending = child.text()
            elif child.tag == "dd" and pending is not None:
                slug = f"cv-fact-{re.sub(r'[^a-z0-9]+', '-', pending.lower()).strip('-')}"
                docs.append(Doc(
                    id=slug, kind="cv-fact", title=normalise(pending),
                    url="/cv.html", meta=normalise(label),
                    text=normalise(f"{pending}: {child.text()}"),
                ))
                pending = None

    require_anchors(role_ids, "cv-role")
    return docs


def extract_decks() -> list:
    docs = []
    for slug, deck_title in DECKS:
        path = REPO / "knowledge" / slug / "index.html"
        if not path.exists():
            print(f"  ! deck missing, skipped: {path}", file=sys.stderr)
            continue
        root = parse(path)
        stage = next((n for n in root.walk() if n.attrs.get("id") == "stage"), None)
        if stage is None:
            raise SystemExit(f"{path}: no #stage element")
        # deck.js numbers `#stage .slide` in document order, 1-based, and
        # `history.replaceState` makes `#N` an address. Count every slide,
        # including the dividers we then drop, or the numbers shift.
        slides = [n for n in stage.walk() if n.has_class("slide")]
        for i, s in enumerate(slides, start=1):
            title = normalise(s.attrs.get("data-t", "")) or f"Slide {i}"
            body = s.text(skip_classes=("slide-foot", "notes", "sources", "src-drawer"))
            body = normalise(body)
            if words(body) < MIN_SLIDE_WORDS:
                continue  # title / section / closing divider
            docs.append(Doc(
                id=f"slide-{slug}-{i}",
                kind="slide",
                title=title,
                url=f"/knowledge/{slug}/#{i}",
                meta=f"{deck_title} · slide {i} of {len(slides)}",
                text=normalise(f"{title}. {body}"),
            ))
    return docs


def extract_all() -> list:
    docs = extract_publications() + extract_projects() + extract_cv() + extract_decks()
    seen = set()
    for d in docs:
        if not d.id:
            raise SystemExit(f"document with empty id: {d.title!r} ({d.url})")
        if d.id in seen:
            raise SystemExit(f"duplicate document id: {d.id}")
        seen.add(d.id)
    return docs


def report(docs: list) -> None:
    by_kind: dict = {}
    for d in docs:
        k = by_kind.setdefault(d.kind, [])
        k.append(words(d.text))
    total_w = sum(words(d.text) for d in docs)
    print(f"\n{len(docs)} documents, {total_w:,} words\n")
    print(f"  {'kind':<14}{'docs':>6}{'words':>9}{'median':>9}")
    for kind, ws in sorted(by_kind.items(), key=lambda kv: -sum(kv[1])):
        ws = sorted(ws)
        med = ws[len(ws) // 2]
        print(f"  {kind:<14}{len(ws):>6}{sum(ws):>9,}{med:>9}")
    print()
    for d in docs:
        print(f"  {d.url:<48} {words(d.text):>5}w  {d.title[:52]}")
    print()


# ---------------------------------------------------------------------------
# encoding
# ---------------------------------------------------------------------------

def encode(docs: list, out: Path) -> None:
    import torch
    from huggingface_hub import hf_hub_download
    from transformers import AutoModelForMaskedLM, AutoTokenizer

    print(f"\nloading {MODEL_ID} ...")
    tok = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForMaskedLM.from_pretrained(MODEL_ID)
    model.eval()

    vocab_size = int(model.config.vocab_size)
    special = torch.tensor(sorted(set(tok.all_special_ids)), dtype=torch.long)
    id_to_token = {v: k for k, v in tok.get_vocab().items()}
    print(f"  vocab {vocab_size:,}, {len(special)} special ids")

    # ---- document side: the 67M-parameter half, run once, here ------------
    texts = [d.text for d in docs]
    rows = []
    with torch.no_grad():
        for i in range(0, len(texts), 8):
            batch = tok(texts[i:i + 8], padding=True, truncation=True,
                        max_length=512, return_tensors="pt")
            logits = model(**batch).logits                      # B x T x V
            mask = batch["attention_mask"].unsqueeze(-1)        # B x T x 1
            pooled = torch.max(logits * mask, dim=1).values     # B x V
            # v3 activation. This is NOT the v1/v2 formula — do not "simplify".
            act = torch.log1p(torch.log1p(torch.relu(pooled)))
            act[:, special] = 0
            rows.append(act)
            print(f"  encoded {min(i + 8, len(texts))}/{len(texts)}", end="\r")
    acts = torch.cat(rows, dim=0)
    print(f"  encoded {len(texts)}/{len(texts)}   ")

    # ---- query side: no model, just a static lookup table -----------------
    qpath = hf_hub_download(MODEL_ID, "query_token_weights.txt")
    qweights = torch.zeros(vocab_size)
    vocab = tok.get_vocab()
    hits = 0
    for line in Path(qpath).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        token, _, weight = line.rpartition("\t")
        tid = vocab.get(token)
        if tid is None:
            continue
        qweights[tid] = float(weight)
        hits += 1
    print(f"  query table: {hits:,} / {vocab_size:,} tokens carry a weight")

    # ---- sparsify, quantise ----------------------------------------------
    used_tokens: set = set()
    entries, term_counts, lit_counts = [], [], []
    for d, act in zip(docs, acts):
        nz = torch.nonzero(act > MIN_WEIGHT, as_tuple=False).flatten()
        vals = act[nz]
        order = torch.argsort(vals, descending=True)[:TOP_TERMS]
        ids = nz[order].tolist()
        vals = vals[order].tolist()

        literal = set(tok(d.text, truncation=True, max_length=512,
                          add_special_tokens=False)["input_ids"])
        q = [max(1, min(255, round(v * DOC_SCALE))) for v in vals]
        lit = [1 if t in literal else 0 for t in ids]

        used_tokens.update(ids)
        term_counts.append(len(ids))
        lit_counts.append(sum(lit))
        entry = d.as_index_entry()
        entry.update({"t": ids, "w": q, "lit": lit})
        entries.append(entry)

    out.mkdir(parents=True, exist_ok=True)

    index = {
        "model": MODEL_ID,
        "vocabSize": vocab_size,
        "docScale": DOC_SCALE,
        "qryScale": QRY_SCALE,
        "topTerms": TOP_TERMS,
        "minWeight": MIN_WEIGHT,
        "docs": entries,
    }
    (out / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    qq = torch.clamp((qweights * QRY_SCALE).round(), 0, 65535).to(torch.int32).tolist()
    import array
    buf = array.array("H", qq)
    if sys.byteorder != "little":
        buf.byteswap()
    (out / "qweights.u16.bin").write_bytes(buf.tobytes())

    # vocab.txt is the id -> token map: line N is token N. The client needs that
    # for every id it might display, which is all of them — the demo must be able
    # to name a query token that matched nothing.
    vocab_txt = "\n".join(id_to_token[i] for i in range(vocab_size))
    (out / "vocab.txt").write_text(vocab_txt + "\n", encoding="utf-8")

    total_terms = sum(term_counts)
    total_lit = sum(lit_counts)
    print(f"\n  {total_terms / len(entries):.0f} terms/doc "
          f"(min {min(term_counts)}, max {max(term_counts)})")
    print(f"  expansion: {100 * (total_terms - total_lit) / total_terms:.0f}% "
          f"of activated terms are not literally in the text")
    print(f"  {len(used_tokens):,} distinct vocabulary dimensions used across the corpus\n")
    for f in ("index.json", "qweights.u16.bin", "vocab.txt"):
        print(f"  {f:<22}{(out / f).stat().st_size:>10,} B")
    print()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                    help="extract and report, but do not load the model")
    ap.add_argument("--out", default="search", help="output directory (default: search)")
    args = ap.parse_args()

    docs = extract_all()
    report(docs)
    if args.dry_run:
        return
    encode(docs, REPO / args.out)


if __name__ == "__main__":
    main()
