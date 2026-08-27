#!/usr/bin/env python3
"""Check the browser engine against a reference implementation.

Two things can silently drift and both would be invisible on the page — the
results would just be quietly wrong:

  1. the WordPiece tokenizer in search/splade.js versus HuggingFace's, and
  2. the scorer in search/splade.js versus the sparse dot product the index
     was built for.

So this tokenizes a fixture of deliberately awkward strings both ways and
compares, then scores the same queries both ways and compares. Run after
building the index; CI runs it on every rebuild.

Usage:
    python3 tools/check_search_index.py [--out search]
"""

from __future__ import annotations

import argparse
import json
import struct
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Names, Danish, hyphenated protocol names, CamelCase, an acronym, an accent,
# and a word BERT has certainly never seen. Every one of these breaks a naive
# tokenizer in a different way.
FIXTURE = [
    "grøntved",
    "søgning efter droner",
    "U-space operation planning",
    "ESP-NOW mesh networking",
    "TrajAllocPy",
    "café résumé naïve",
    "ICUAS 2024",
    "how do drones divide up a search area?",
    "why keyword search fails on images",
    "decentralized task allocation without a leader",
    "keeping customer data inside the EU",
    "late interaction and MaxSim",
    "coverage path planning for wilderness search and rescue",
    "SPLADE sparse retrieval",
]

TOL = 1e-4


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="search")
    args = ap.parse_args()
    out = REPO / args.out

    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    vocab = (out / "vocab.txt").read_text(encoding="utf-8").split("\n")
    if vocab and vocab[-1] == "":
        vocab.pop()
    raw = (out / "qweights.u16.bin").read_bytes()
    qw = struct.unpack(f"<{len(raw) // 2}H", raw)

    failures: list = []

    # ---- shape ---------------------------------------------------------
    v = index["vocabSize"]
    for name, got in (("vocab.txt lines", len(vocab)), ("query table entries", len(qw))):
        if got != v:
            failures.append(f"{name}: {got}, index says vocabSize {v}")

    for d in index["docs"]:
        if not (len(d["t"]) == len(d["w"]) == len(d["lit"])):
            failures.append(f"{d['id']}: t/w/lit lengths disagree")
            break
        if any(not 1 <= x <= 255 for x in d["w"]):
            failures.append(f"{d['id']}: a quantised weight is outside 1..255")
            break
        if any(not 0 <= t < v for t in d["t"]):
            failures.append(f"{d['id']}: a token id is outside the vocabulary")
            break

    # ---- run the browser engine ----------------------------------------
    qfile = out / ".fixture.json"
    qfile.write_text(json.dumps(FIXTURE), encoding="utf-8")
    try:
        proc = subprocess.run(
            ["node", str(REPO / "tools" / "check_client.mjs"), str(qfile), str(out)],
            capture_output=True, text=True)
    finally:
        qfile.unlink(missing_ok=True)
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        print("FAIL: the client engine did not run", file=sys.stderr)
        return 1
    client = json.loads(proc.stdout)

    # ---- 1. tokenizer parity -------------------------------------------
    try:
        from transformers import AutoTokenizer
        tok = AutoTokenizer.from_pretrained(index["model"])
    except Exception as e:                                   # noqa: BLE001
        print(f"  ! transformers unavailable ({e.__class__.__name__}), "
              "skipping tokenizer parity", file=sys.stderr)
        tok = None

    if tok is not None:
        for q, got in zip(FIXTURE, client["queries"]):
            want = tok.tokenize(q)
            if want != got["tokens"]:
                failures.append(f"tokenizer {q!r}:\n    HF {want}\n    JS {got['tokens']}")

    # ---- 2. scorer parity ----------------------------------------------
    qry_scale, doc_scale = index["qryScale"], index["docScale"]
    for got in client["queries"]:
        # reference query vector: one weight per distinct token, no accumulation
        ids = [vocab.index(t) if t in vocab else None for t in got["tokens"]]
        qvec = {}
        for t, i in zip(got["tokens"], ids):
            if i is None:
                continue
            w = qw[i] / qry_scale
            if w > 0:
                qvec.setdefault(i, w)

        ref = []
        for d in index["docs"]:
            s = sum(qvec[t] * (w / doc_scale)
                    for t, w in zip(d["t"], d["w"]) if t in qvec)
            if s > 0:
                ref.append((d["id"], s))
        ref.sort(key=lambda kv: -kv[1])
        ref = ref[:10]

        js = [(i, s) for i, s in got["scores"]]
        if [i for i, _ in ref] != [i for i, _ in js]:
            failures.append(f"ranking {got['query']!r}:\n"
                            f"    ref {[i for i, _ in ref]}\n"
                            f"    JS  {[i for i, _ in js]}")
            continue
        for (i, a), (_, b) in zip(ref, js):
            if abs(a - b) > TOL:
                failures.append(f"score {got['query']!r} / {i}: ref {a:.6f} vs JS {b:.6f}")

    # ---- report ---------------------------------------------------------
    if failures:
        print(f"\n{len(failures)} check(s) failed:\n", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1

    matched = sum(1 for q in client["queries"] if q["scores"])
    print(f"\nOK — {client['docs']} documents, {client['vocabSize']:,} dimensions.")
    print(f"     {len(FIXTURE)} fixture queries tokenize identically to HuggingFace"
          if tok is not None else
          f"     {len(FIXTURE)} fixture queries scored (tokenizer parity skipped)")
    print(f"     and score within {TOL} of the reference; {matched} retrieved something.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
