/* ============================================================================
   meet.js — /search/: "when does the query meet the document?"

   The panels above this one dissect one ranking. This file answers the question
   that ranking raises: the score was a sum of products over shared vocabulary
   dimensions — so *where* did the two sides actually touch, and what would the
   same question have cost under a different architecture?

   Four views, in the order a reader needs them:

     1. the meeting        every query wordpiece on the left, every dimension the
                           passage activates on the right, an edge wherever the
                           two coincide. The score is the sum of those edges.
     2. over the passage   the same vector painted back onto the text, so the
                           terms that have no anchor in the prose are visible as
                           absences rather than as a list.
     3. four architectures  dense, learned sparse, late interaction and full
                           interaction — the slide-18 comparison from the deck,
                           instantiated with the reader's own query.
     4. what it costs      FLOPs per document scored, and per query if you were
                           foolish enough to run it over the whole corpus.

   Views 3 and 4 are the reason the numbers here are labelled so heavily. The
   query side is measured — it is whatever the reader typed. The document side
   is measured for SPLADE and assumed for everything else, because this site
   ships no dense vectors and no token embeddings to measure. Every assumption
   is a named constant below and is printed on the page next to the number it
   produced.
   ============================================================================ */

import { escapeHTML, fmt, tokenHTML } from './autocomplete.js';

/**
 * `tokenHTML` wraps the `##` of a continuation piece in a `<span>`, which is
 * right everywhere on this page except inside an `<svg>`: the HTML parser
 * treats an HTML element in foreign content as a breakout and closes the SVG
 * around it, so one `##token` in the meeting graph would spill the rest of the
 * figure into the document as plain text. Same markup, `<tspan>`.
 */
function tokenSVG(token) {
  return token.startsWith('##')
    ? `<tspan class="cont">##</tspan>${escapeHTML(token.slice(2))}`
    : escapeHTML(token);
}

/* ------------------------------------------------------------- assumptions */

/* The document side of three architectures this site does not run. Each is a
   round number from the literature rather than a measurement, and each is
   printed on the page beside whatever it produced. */
const DENSE_DIM = 1024;   // a current text embedding: one vector, this wide
const TOKEN_DIM = 128;    // ColBERT's per-token dimension after projection
const DOC_TOKENS = 80;    // tokens per passage — the deck's MS MARCO average
const CE_PARAMS = 110e6;  // a base-size cross-encoder reranker
const MSMARCO_NQ = 32;    // query tokens, same worked example, used as a stand-in
                          // before the reader has typed anything

/* Corpus sizes worth comparing. The first is this site, the last is the corpus
   the deck does its arithmetic on, so the numbers here can be checked against
   slide 24. */
const CORPORA = [
  { n: 0, label: 'this site', note: 'the corpus you are searching' },
  { n: 1e4, label: '10k', note: 'one team\'s document store' },
  { n: 1e6, label: '1M', note: 'a mid-size DAM tenant' },
  { n: 9e6, label: '9M', note: 'MS MARCO — the deck\'s worked example' },
];

const GRAPH_LEFT_MAX = 12;   // query rows before the graph stops drawing them
const GRAPH_RIGHT_MAX = 14;  // document rows before the rest are collapsed
const GHOST_MAX = 24;        // matched-but-absent chips before "and N more"
/* The passage tint is `--a` (0-1, the word's share of the strongest weight in
   the vector) times a ceiling the stylesheet owns, because the ceiling that
   keeps text legible on white is too loud on the dark canvas. */

/* --------------------------------------------------------------- formatting */

/** 2184 → "2.2k", 5.9e12 → "5.9T". Big numbers are the whole point here. */
function si(n) {
  if (!isFinite(n)) return '—';
  if (n < 1000) return n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n).toString();
  const units = ['k', 'M', 'B', 'T', 'P', 'E'];
  let u = -1, v = n;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + units[u];
}

/**
 * Ratios here span eight orders of magnitude in both directions, so "×9.5M"
 * and a five-hundredth of the cost both have to be legible. Below 1 a fraction
 * reads better than a string of zeroes: ×1/512, not ×0.00.
 */
function ratio(n) {
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return '×' + si(n);
  if (n >= 10) return '×' + Math.round(n);
  if (n >= 1) return '×' + n.toFixed(1).replace(/\.0$/, '');
  if (n >= 0.1) return '×' + n.toFixed(2);
  return '×1/' + si(1 / n);
}

/* ================================================================== module */

export class Meet {
  /**
   * @param {object} el  the elements from search-ui.js, already looked up
   */
  constructor(el) {
    this.el = el;
    this.engine = null;
    this.terms = [];
    this.hit = null;
    this.corpus = 0;        // index into CORPORA
    this.focus = null;      // vocabulary id being hovered, or null
    this.wireStatic();
  }

  /* -------------------------------------------------------------- lifecycle */

  ready(engine) {
    this.engine = engine;
    this.buildCorpusChips();
    this.render();
  }

  /** Called from search-ui's `show()`, so terms and hit always arrive together. */
  update(terms, hit) {
    this.terms = terms || [];
    this.hit = hit || null;
    this.render();
  }

  render() {
    if (!this.engine) return;
    this.renderGraph();
    this.renderPassage();
    this.renderArch();
    this.renderCost();
  }

  /* ------------------------------------------------------- static wiring */

  wireStatic() {
    const cards = this.el.archCards;
    if (!cards) return;
    // The four architecture cards are static SVG in the HTML — they have to be
    // readable with scripting off. All this adds is which one is open.
    for (const card of cards) {
      const head = card.querySelector('.mt-arch-btn');
      if (!head) continue;
      head.addEventListener('click', () => {
        const open = card.classList.toggle('open');
        head.setAttribute('aria-expanded', String(open));
      });
    }
  }

  buildCorpusChips() {
    const box = this.el.corpusChips;
    if (!box) return;
    box.innerHTML = CORPORA.map((c, i) => {
      const n = c.n || this.engine.docs.length;
      return `<button type="button" class="sp-chip" data-i="${i}"
        aria-pressed="${i === this.corpus}"
        title="${escapeHTML(c.note)}">${escapeHTML(c.label)}
        <span class="mt-chip-n">${si(n)}</span></button>`;
    }).join('');
    box.addEventListener('click', e => {
      const b = e.target.closest('.sp-chip');
      if (!b) return;
      this.corpus = +b.dataset.i;
      for (const other of box.querySelectorAll('.sp-chip')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      this.renderCost();
    });
  }

  /* --------------------------------------------------- view 1: the meeting */

  /**
   * A bipartite graph is an odd choice for SPLADE at first glance — both sides
   * are indexed by the same vocabulary, so a matched term carries the same
   * label twice. That repetition is the point. What the picture is really for
   * is the two kinds of *non*-edge: query pieces that hit nothing, and the
   * hundred-odd document dimensions the query never mentions. The score lives
   * in the narrow band where the two columns happen to coincide.
   */
  renderGraph() {
    const host = this.el.graph;
    if (!host) return;

    const live = this.terms.filter(t => !t.unknown && t.weight > 0);
    if (!live.length || !this.hit) {
      host.innerHTML = `<p class="sp-empty">${this.terms.length
        ? 'Pick a result to see where it meets your query.'
        : 'Type a query.'}</p>`;
      if (this.el.graphFoot) this.el.graphFoot.textContent = '';
      return;
    }

    const eng = this.engine;
    const hit = this.hit;
    const byId = new Map();   // vocabulary id → its contribution to this score
    for (const p of hit.parts) byId.set(p.id, p);

    /* Left column: the query as typed, de-duplicated. A repeated wordpiece is
       one dimension, not two — same rule as encodeQuery. */
    const seen = new Set();
    const left = [];
    for (const t of live) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      left.push({ id: t.id, token: t.token, weight: t.weight, part: byId.get(t.id) || null });
    }
    const leftShown = left.slice(0, GRAPH_LEFT_MAX);

    /* Right column: the document's dimensions, matched ones first and largest
       first, then however many are left over as a single collapsed block. */
    const all = eng.termsOf(hit.doc);
    const matched = all.filter(t => byId.has(t.id))
      .sort((a, b) => byId.get(b.id).contribution - byId.get(a.id).contribution);
    const rest = all.length - matched.length;
    const rightShown = matched.slice(0, GRAPH_RIGHT_MAX);
    const hiddenMatched = matched.length - rightShown.length;

    /* Geometry. The SVG is authored at a fixed width and scaled by CSS, so the
       type sizes below are in the same units as the coordinates. */
    const W = 760, ROW = 30, GAP = 6, PAD = 10;
    const colW = 218, midGap = 60;
    const xL = PAD, xR = W - PAD - colW;
    const rowsL = leftShown.length;
    const rowsR = rightShown.length + (rest || hiddenMatched ? 1 : 0);
    const spill = left.length > leftShown.length ? 18 : 0;
    const H = PAD * 2 + Math.max(rowsL, rowsR) * (ROW + GAP) - GAP + 26 + spill;
    const yOf = i => PAD + 26 + i * (ROW + GAP);

    const maxContrib = matched.length ? byId.get(matched[0].id).contribution : 1;
    const maxQw = Math.max(...left.map(t => t.weight), 0.001);
    const maxDw = Math.max(...all.map(t => t.weight), 0.001);

    /* Edges first, so the chips paint over their ends. */
    const rowOfRight = new Map(rightShown.map((t, i) => [t.id, i]));
    const edges = [];
    for (const [i, t] of leftShown.entries()) {
      if (!t.part) continue;
      const j = rowOfRight.get(t.id);
      if (j === undefined) continue;          // matched, but below the fold
      const y1 = yOf(i) + ROW / 2, y2 = yOf(j) + ROW / 2;
      const x1 = xL + colW, x2 = xR;
      const c = (x2 - x1) * 0.42;
      const wide = 1.2 + 5.6 * (t.part.contribution / maxContrib);
      edges.push(`<path class="mt-edge${t.part.literal ? '' : ' exp'}" data-id="${t.id}"
        d="M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}"
        stroke-width="${wide.toFixed(2)}"/>`);
    }

    const chip = (x, y, cls, label, sub, frac) => `
      <g class="mt-node ${cls}" data-id="${label.id}">
        <rect x="${x}" y="${y}" width="${colW}" height="${ROW}" rx="8"/>
        <rect class="mt-fill" x="${x}" y="${y + ROW - 3}" height="3"
              width="${Math.max(4, (colW - 2) * frac).toFixed(1)}" rx="1.5"/>
        <text class="mt-tk" x="${x + 10}" y="${y + ROW / 2 + 4}">${label.html}</text>
        <text class="mt-wt" x="${x + colW - 10}" y="${y + ROW / 2 + 4}"
              text-anchor="end">${sub}</text>
      </g>`;

    const leftRows = leftShown.map((t, i) => chip(
      xL, yOf(i),
      t.part ? (t.part.literal ? 'hit' : 'hit exp') : 'miss',
      { id: t.id, html: tokenSVG(t.token) },
      fmt(t.weight),
      t.weight / maxQw,
    )).join('');

    const rightRows = rightShown.map((t, i) => chip(
      xR, yOf(i),
      t.literal ? 'hit' : 'hit exp',
      { id: t.id, html: tokenSVG(t.token) },
      fmt(t.weight),
      t.weight / maxDw,
    )).join('');

    const leftover = rest || hiddenMatched
      ? `<g class="mt-node rest">
           <rect x="${xR}" y="${yOf(rightShown.length)}" width="${colW}"
                 height="${ROW}" rx="8"/>
           <text class="mt-rest" x="${xR + colW / 2}"
                 y="${yOf(rightShown.length) + ROW / 2 + 4}" text-anchor="middle"
           >+ ${rest + hiddenMatched} more dimensions${hiddenMatched
             ? `, ${hiddenMatched} of them matched` : ', none matched'}</text>
         </g>` : '';

    const overflowL = left.length > leftShown.length
      ? `<text class="mt-cap" x="${xL}" y="${H - 4}">and ${left.length - leftShown.length}
         more wordpiece${left.length - leftShown.length === 1 ? '' : 's'}</text>` : '';

    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="mt-graph" role="img"
           aria-label="${escapeHTML(this.graphAlt(left, matched, all, hit))}">
        <text class="mt-col" x="${xL}" y="${PAD + 10}">YOUR QUERY · ${left.length} dimension${
          left.length === 1 ? '' : 's'}</text>
        <text class="mt-col" x="${xR + colW}" y="${PAD + 10}" text-anchor="end"
        >THIS PASSAGE · ${all.length} dimensions</text>
        <g class="mt-edges">${edges.join('')}</g>
        ${leftRows}${rightRows}${leftover}${overflowL}
      </svg>`;
    void midGap;

    this.wireGraphHover(host);

    if (this.el.graphFoot) {
      const misses = left.filter(t => !t.part).length;
      this.el.graphFoot.innerHTML =
        `<b>${fmt(hit.score)}</b> is the sum of ${matched.length} product${
          matched.length === 1 ? '' : 's'} — one per dimension the two sides share, `
        + `out of ${eng.vocabSize.toLocaleString('en')} the vocabulary offers. `
        + (misses
            ? `${misses} of your wordpiece${misses === 1 ? ' finds' : 's find'} nothing in this passage, and `
            : '')
        + `${all.length - matched.length} of the passage's dimensions go untouched. `
        + `Everything else on both sides is exactly zero, which is why the sum is cheap.`;
    }
  }

  graphAlt(left, matched, all, hit) {
    return `${left.length} query dimensions on the left, ${all.length} activated document `
      + `dimensions on the right, joined by ${matched.length} edges where the two coincide. `
      + `Edge thickness is the product of the two weights; the ${matched.length} products sum `
      + `to the score of ${fmt(hit.score)}.`;
  }

  /** Hovering either end of an edge isolates it and reads the arithmetic out. */
  wireGraphHover(host) {
    const svg = host.querySelector('svg');
    if (!svg) return;
    const readout = this.el.graphReadout;
    const enter = id => {
      svg.classList.add('focused');
      for (const n of svg.querySelectorAll('[data-id]')) {
        n.classList.toggle('lit', n.dataset.id === String(id));
      }
      if (!readout) return;
      const part = this.hit?.parts.find(p => p.id === id);
      const token = this.engine.tokenOf(id);
      if (!part) {
        readout.innerHTML = `<code>${escapeHTML(token)}</code> — not in this passage's vector, `
          + `so it contributes nothing.`;
        return;
      }
      const q = this.engine.queryWeightOf(id);
      readout.innerHTML = `<code>${escapeHTML(token)}</code> — query weight `
        + `<b>${fmt(q)}</b> × document weight <b>${fmt(part.contribution / (q || 1))}</b> = `
        + `<b>${fmt(part.contribution)}</b>, ${(100 * part.contribution / this.hit.score).toFixed(0)}% `
        + `of the score. ${part.literal ? 'It is in the text.' : 'The model added it.'}`;
    };
    const leave = () => {
      svg.classList.remove('focused');
      for (const n of svg.querySelectorAll('.lit')) n.classList.remove('lit');
      if (readout) readout.innerHTML = '';
    };
    for (const n of svg.querySelectorAll('[data-id]')) {
      n.addEventListener('pointerenter', () => enter(+n.dataset.id));
      n.addEventListener('pointerleave', leave);
    }
    svg.addEventListener('pointerleave', leave);
  }

  /* ------------------------------------------------ view 2: over the passage */

  /**
   * The term list further up the page is complete but flat: it cannot show that
   * a matched term has no home in the prose. Painting the vector back onto the
   * text can. Words carry their document weight as a tint; the terms with
   * nowhere to land are listed underneath, which is the honest way to draw a
   * dimension that exists only in the model's head.
   */
  renderPassage() {
    const host = this.el.passage;
    if (!host) return;
    if (!this.hit) {
      host.innerHTML = '<p class="sp-empty">Pick a result.</p>';
      if (this.el.ghosts) this.el.ghosts.innerHTML = '';
      if (this.el.passageNote) this.el.passageNote.textContent = '';
      return;
    }

    const eng = this.engine;
    const doc = this.hit.doc;
    const docW = new Map();      // vocabulary id → document weight
    for (let k = 0; k < doc.t.length; k++) docW.set(doc.t[k], doc.w[k] / eng.docScale);
    const matchedIds = new Set(this.hit.parts.map(p => p.id));
    const maxW = Math.max(...docW.values(), 0.001);

    const text = doc.snippet || doc.title || '';
    const grounded = new Set();  // ids the visible text can actually account for

    /* One span per whitespace-separated word, weighted by the pieces WordPiece
       makes of it. A word split into three pieces is one visual unit — the
       reader typed words, not wordpieces. */
    const html = text.split(/(\s+)/).map(chunk => {
      if (/^\s+$/.test(chunk)) return chunk === ' ' ? ' ' : ' ';
      const pieces = eng.tokenizer.encode(chunk);
      let best = 0, isMatch = false, any = false;
      for (const p of pieces) {
        if (p.unknown) continue;
        const w = docW.get(p.id);
        if (w === undefined) continue;
        any = true;
        grounded.add(p.id);
        if (w > best) best = w;
        if (matchedIds.has(p.id)) isMatch = true;
      }
      if (!any) return `<span class="mt-w">${escapeHTML(chunk)}</span>`;
      const a = (best / maxW).toFixed(3);
      const ids = pieces.filter(p => docW.has(p.id)).map(p => p.id);
      return `<span class="mt-w on${isMatch ? ' match' : ''}" data-ids="${ids.join(',')}"
        style="--a:${a}" title="weight ${fmt(best)}${isMatch ? ' · matched your query' : ''}"
        >${escapeHTML(chunk)}</span>`;
    }).join('');

    host.innerHTML = html;

    /* Matched dimensions with no anchor in the excerpt. Two different reasons
       land here and the copy has to allow for both: the model invented the
       term, or the term is in the passage past the 240 characters the index
       ships. Both are worth seeing; neither is worth guessing between. */
    const ghosts = this.hit.parts
      .filter(p => !grounded.has(p.id))
      .sort((a, b) => b.contribution - a.contribution);

    if (this.el.ghosts) {
      const shown = ghosts.slice(0, GHOST_MAX);
      this.el.ghosts.innerHTML = shown.length
        ? shown.map(p => `<span class="mt-ghost${p.literal ? ' lit' : ''}"
            title="${p.literal ? 'in the passage, past the excerpt above'
              : 'added by the model — nowhere in the passage'} · contributed ${fmt(p.contribution)}"
            ><span class="tk">${tokenHTML(eng.tokenOf(p.id))}</span
            ><span class="w">${fmt(p.contribution)}</span></span>`).join('')
          + (ghosts.length > shown.length
              ? `<span class="sp-more">and ${ghosts.length - shown.length} more</span>` : '')
        : '<p class="sp-empty">Every dimension that scored is visible in the text above.</p>';
    }

    if (this.el.passageNote) {
      const invented = ghosts.filter(p => !p.literal).length;
      const past = ghosts.length - invented;
      const bits = [`Above is the excerpt the index ships to your browser — the passage's first `
        + `${text.length} characters, not all of it.`];
      if (invented) {
        bits.push(`${invented} of the dimensions that scored ${invented === 1 ? 'is' : 'are'} `
          + `nowhere in the passage at all: the model put ${invented === 1 ? 'it' : 'them'} in the `
          + `vector so a query could use ${invented === 1 ? 'that word' : 'those words'} instead of `
          + `the ones the author chose.`);
      }
      if (past) {
        bits.push(`${past} ${past === 1 ? 'is' : 'are'} in the passage, further down than this `
          + `excerpt reaches.`);
      }
      this.el.passageNote.innerHTML = bits.join(' ');
    }
  }

  /* ----------------------------------------------- view 3: four architectures */

  /**
   * The cards themselves are static SVG in index.html — the same three-panel
   * grammar as slide 18 of the deck, with learned sparse added as a fourth,
   * because that is the one the reader has just used. All this does is put the
   * reader's own counts into them.
   */
  renderArch() {
    const cards = this.el.archCards;
    if (!cards) return;
    const m = this.measure();

    const per = this.perDoc(m);
    const dense = per.dense;

    const fill = (arch, primary, secondary) => {
      const card = [...cards].find(c => c.dataset.arch === arch);
      if (!card) return;
      const a = card.querySelector('[data-live="primary"]');
      const b = card.querySelector('[data-live="secondary"]');
      if (a) a.innerHTML = primary;
      if (b) b.innerHTML = secondary;
      const r = card.querySelector('[data-live="ratio"]');
      if (r) r.textContent = ratio(per[arch] / dense);
    };

    const q = m.measured
      ? `your ${m.nq} wordpiece${m.nq === 1 ? '' : 's'}`
      : `${m.nq} query tokens (assumed)`;

    fill('dense',
      `<b>1</b> dot product of <b>${DENSE_DIM}</b> floats`,
      `Both sides are already collapsed to one vector, so ${q} and the whole passage `
      + `meet exactly once. Nothing about the passage survives that the pooling threw away.`);

    fill('sparse',
      `<b>${m.shared || '—'}</b> multiply-add${m.shared === 1 ? '' : 's'}`,
      m.measured && this.hit
        ? `Measured, not assumed: this is the graph at the top of this section. Only the `
          + `dimensions both sides activate cost anything, and an inverted index never even `
          + `visits a passage that shares none.`
        : `One per shared dimension. Type a query and this number becomes a measurement.`);

    fill('late',
      `<b>${si(m.nq * DOC_TOKENS)}</b> dot products of <b>${TOKEN_DIM}</b> floats`,
      `Nothing is pooled on either side, so ${q} each meet all ~${DOC_TOKENS} of the passage's `
      + `tokens and only the best match per query token counts. That operator is MaxSim.`);

    fill('full',
      `<b>1</b> forward pass, <b>${si(CE_PARAMS)}</b> parameters`,
      `Query and passage go into one encoder together, so every token attends to every token. `
      + `Scores best, and nothing can be precomputed — which is why it only ever runs on a `
      + `shortlist.`);
  }

  /* ------------------------------------------------------- view 4: the cost */

  /** What the reader's query actually is, or the deck's stand-in if there isn't one. */
  measure() {
    const live = this.terms.filter(t => !t.unknown && t.weight > 0);
    const ids = new Set(live.map(t => t.id));
    return {
      measured: ids.size > 0,
      nq: ids.size || MSMARCO_NQ,
      shared: this.hit ? this.hit.parts.length : 0,
    };
  }

  /** FLOPs to score one document. A multiply-add is two, throughout. */
  perDoc(m) {
    return {
      sparse: 2 * (m.shared || m.nq),      // one product per shared dimension
      dense: 2 * DENSE_DIM,                // one dot product, pooled to pooled
      late: 2 * m.nq * DOC_TOKENS * TOKEN_DIM,
      full: 2 * CE_PARAMS * (m.nq + DOC_TOKENS),
    };
  }

  renderCost() {
    const host = this.el.cost;
    if (!host) return;
    const m = this.measure();
    const per = this.perDoc(m);
    const N = CORPORA[this.corpus].n || this.engine.docs.length;

    const rows = [
      ['sparse', 'Learned sparse', 'this page', `${m.shared || m.nq} shared dimensions`],
      ['dense', 'Dense, pooled', 'one vector each', `dim ${DENSE_DIM}`],
      ['late', 'Late interaction', 'MaxSim, token by token',
        `${m.nq} × ${DOC_TOKENS} × dim ${TOKEN_DIM}`],
      ['full', 'Full interaction', 'cross-encoder',
        `${si(CE_PARAMS)} params × ${m.nq + DOC_TOKENS} tokens`],
    ];

    const totals = rows.map(([k]) => per[k] * N);
    const max = Math.max(...totals);
    const min = Math.min(...totals);
    // Eight orders of magnitude on a linear axis is three visible bars and one
    // invisible one. Log, with the smallest bar still wide enough to read.
    const span = Math.log10(max / min) || 1;
    const width = v => (6 + 94 * (Math.log10(v / min) / span)).toFixed(1);

    host.innerHTML = rows.map(([k, name, kind, how], i) => `
      <li class="mt-cost-row mt-${k}">
        <span class="mt-cost-name">${name}<small>${kind}</small></span>
        <span class="mt-cost-bar"><i style="width:${width(totals[i])}%"></i></span>
        <span class="mt-cost-how">${escapeHTML(how)}</span>
        <span class="mt-cost-val"><b>${si(totals[i])}</b> FLOPs
          <small>${si(per[k])} per passage</small></span>
      </li>`).join('');

    if (this.el.costNote) {
      const li = totals[2] / (2 * TOKEN_DIM);   // back out the dot-product count
      this.el.costNote.innerHTML =
        `Scoring <b>${si(N)}</b> passages exhaustively, with `
        + (m.measured
            ? `the <b>${m.nq}</b> wordpieces you actually typed`
            : `an assumed <b>${m.nq}</b>-token query`)
        + `. Late interaction comes to <b>${si(li)}</b> dot products per query here`
        + (N === 9e6 && !m.measured
            ? ` — the deck's 23B, since these are the deck's assumptions.` : `.`)
        + ` The point of the ordering is not that the right-hand columns are unaffordable: it is `
        + `that they are unaffordable <em>over the whole corpus</em>. Every deployed system runs `
        + `the cheap column wide and the expensive one narrow — `
        + `<a href="/knowledge/ml-and-data-at-colourbox/#25">that funnel is a slide of its own</a>.`;
    }
  }
}
