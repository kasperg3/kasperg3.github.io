/* ============================================================================
   splade.js — inference-free SPLADE retrieval, entirely in the browser.

   SPLADE is asymmetric, and that asymmetry is what makes this page possible.

     document side   a 67M-parameter masked language model that expands a
                     passage into a sparse vector over the whole 30,522-token
                     vocabulary. Expensive. Runs offline, at build time, in
                     tools/build_search_index.py.

     query side      a WordPiece tokenizer and a lookup into a static table of
                     per-token weights. No neural network at all.

   So the browser needs no ONNX, no WASM, no model download — just the table,
   the vocabulary, and the postings this site's corpus compresses to. Scoring is
   a sparse dot product; the whole retrieval engine is the inner loop of
   `search()` below, and it is six lines long.

   Nothing here hardcodes the vocabulary size or the paths. V-SPLADE
   (naver/v-splade-*, vocab 50,368) has the identical query-table structure, so
   a visual sibling could reuse this file unchanged.
   ============================================================================ */

export const UNK = '[UNK]';
const MAX_CHARS_PER_WORD = 100;

/* ---------------------------------------------------------------- tokenizer */

/**
 * WordPiece, matching HuggingFace `bert-base-uncased` (do_lower_case=true).
 * Lowercase, strip accents, split on punctuation, then greedy longest-match
 * from the left with `##` continuations.
 */
export class WordPiece {
  constructor(vocabText) {
    this.tokens = vocabText.split('\n');
    // A trailing newline leaves an empty last entry; drop it, keep every index.
    if (this.tokens.length && this.tokens[this.tokens.length - 1] === '') this.tokens.pop();
    this.ids = new Map();
    for (let i = 0; i < this.tokens.length; i++) this.ids.set(this.tokens[i], i);
    this.unkId = this.ids.get(UNK) ?? 0;
  }

  get size() { return this.tokens.length; }

  tokenOf(id) { return this.tokens[id] ?? UNK; }

  /** BERT's BasicTokenizer: clean, lowercase, NFD-strip accents, split. */
  static basic(text) {
    const cleaned = text
      .normalize('NFC')
      .replace(/[\u0000\ufffd]/g, '')          // nulls and replacement chars
      .replace(/[\u200b-\u200d\ufeff]/g, '')  // zero-width joiners and BOM
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '');   // combining marks: é -> e, but ø stays ø

    if (!cleaned) return [];
    const out = [];
    for (const chunk of cleaned.split(' ')) {
      if (!chunk) continue;
      // Punctuation becomes its own token, exactly as BERT does it.
      let buf = '';
      for (const ch of chunk) {
        if (WordPiece.isPunct(ch)) {
          if (buf) { out.push(buf); buf = ''; }
          out.push(ch);
        } else {
          buf += ch;
        }
      }
      if (buf) out.push(buf);
    }
    return out;
  }

  static isPunct(ch) {
    const c = ch.codePointAt(0);
    if ((c >= 33 && c <= 47) || (c >= 58 && c <= 64) ||
        (c >= 91 && c <= 96) || (c >= 123 && c <= 126)) return true;
    return /\p{P}|\p{S}/u.test(ch);
  }

  /**
   * @returns {{token: string, id: number, word: string, unknown: boolean}[]}
   *   one entry per wordpiece, carrying the source word so the UI can show how
   *   a query term was split.
   */
  encode(text) {
    const pieces = [];
    for (const word of WordPiece.basic(text)) {
      const chars = [...word];
      if (chars.length > MAX_CHARS_PER_WORD) {
        pieces.push({ token: UNK, id: this.unkId, word, unknown: true });
        continue;
      }
      let start = 0;
      const sub = [];
      let bad = false;
      while (start < chars.length) {
        let end = chars.length;
        let found = null;
        while (start < end) {
          let piece = chars.slice(start, end).join('');
          if (start > 0) piece = '##' + piece;
          if (this.ids.has(piece)) { found = piece; break; }
          end--;
        }
        if (found === null) { bad = true; break; }
        sub.push(found);
        start = end;
      }
      if (bad || !sub.length) {
        pieces.push({ token: UNK, id: this.unkId, word, unknown: true });
      } else {
        for (const t of sub) {
          pieces.push({ token: t, id: this.ids.get(t), word, unknown: false });
        }
      }
    }
    return pieces;
  }
}

/* -------------------------------------------------------------------- engine */

export class Splade {
  /**
   * @param {object} index    parsed index.json
   * @param {string} vocabTxt newline-separated vocabulary
   * @param {Uint16Array} qw  quantised static query weights, one per vocab id
   */
  constructor(index, vocabTxt, qw) {
    this.index = index;
    this.docs = index.docs;
    this.tokenizer = new WordPiece(vocabTxt);
    this.qw = qw;
    this.qryScale = index.qryScale;
    this.docScale = index.docScale;
    this.vocabSize = index.vocabSize;
    if (qw.length !== this.vocabSize) {
      throw new Error(`query table has ${qw.length} entries, index expects ${this.vocabSize}`);
    }
    if (this.tokenizer.size !== this.vocabSize) {
      throw new Error(`vocab.txt has ${this.tokenizer.size} lines, index expects ${this.vocabSize}`);
    }
  }

  /**
   * Build the sparse query vector. Repeated tokens do not accumulate — the
   * weight is a property of the token, not of how often it was typed.
   */
  encodeQuery(text) {
    const pieces = this.tokenizer.encode(text);
    const byId = new Map();
    const terms = [];
    for (const p of pieces) {
      const weight = p.unknown ? 0 : this.qw[p.id] / this.qryScale;
      terms.push({ ...p, weight });
      if (weight > 0 && !byId.has(p.id)) byId.set(p.id, weight);
    }
    return { terms, byId };
  }

  /**
   * Score every document against the query. At this corpus size an inverted
   * index would buy nothing — a few dozen documents at ~160 terms each is some
   * twelve thousand multiply-adds — and brute force keeps the loop legible,
   * which matters more here than the microseconds.
   *
   * Per-term contributions are kept, not discarded: the point of the page is
   * to explain a ranking, not to assert one.
   */
  search(text, limit = 10) {
    const { terms, byId } = this.encodeQuery(text);
    if (!byId.size) return { terms, results: [], total: 0 };

    const results = [];
    for (let d = 0; d < this.docs.length; d++) {
      const doc = this.docs[d];
      const t = doc.t, w = doc.w;
      let score = 0;
      const parts = [];
      for (let k = 0; k < t.length; k++) {
        const qwv = byId.get(t[k]);
        if (qwv === undefined) continue;
        const contribution = qwv * (w[k] / this.docScale);
        score += contribution;
        parts.push({ id: t[k], contribution, literal: doc.lit[k] === 1 });
      }
      if (score > 0) {
        parts.sort((a, b) => b.contribution - a.contribution);
        results.push({ doc, score, parts });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return { terms, results: results.slice(0, limit), total: results.length };
  }

  /** The activated terms of one document, largest weight first. */
  termsOf(doc, limit = Infinity) {
    const out = [];
    for (let k = 0; k < doc.t.length && k < limit; k++) {
      out.push({
        id: doc.t[k],
        token: this.tokenizer.tokenOf(doc.t[k]),
        weight: doc.w[k] / this.docScale,
        literal: doc.lit[k] === 1,
      });
    }
    return out;
  }

  tokenOf(id) { return this.tokenizer.tokenOf(id); }

  /** Static query weight for a vocabulary id, unquantised. */
  queryWeightOf(id) { return this.qw[id] / this.qryScale; }
}

/* --------------------------------------------------------------------- load */

/**
 * Fetch the three artefacts in parallel. Deliberately not cached in
 * localStorage: it is a few hundred KB, the HTTP cache already handles it, and
 * a stale copy would outlive a content change.
 */
export async function load(base = '/search/') {
  const [index, vocabTxt, qwBuf] = await Promise.all([
    fetch(base + 'index.json').then(r => ok(r).json()),
    fetch(base + 'vocab.txt').then(r => ok(r).text()),
    fetch(base + 'qweights.u16.bin').then(r => ok(r).arrayBuffer()),
  ]);
  return new Splade(index, vocabTxt, littleEndianU16(qwBuf));
}

function ok(r) {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${r.url}`);
  return r;
}

/** The file is little-endian; DataView reads it correctly on any host. */
function littleEndianU16(buf) {
  const view = new DataView(buf);
  const out = new Uint16Array(buf.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}
