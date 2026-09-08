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
/* The query encoder dense and late interaction each need. 110M is the small end
   of what is actually deployed — plenty of dense retrievers are billions — so
   this is the assumption most charitable to the two architectures the page is
   implicitly arguing against, which is the direction an assumption should err. */
const QENC_PARAMS = 110e6;
const MSMARCO_NQ = 32;    // query tokens, same worked example, used as a stand-in
                          // before the reader has typed anything

/* When no result is selected there is no measured overlap, and the query's own
   dimension count is a bad stand-in for it — over this corpus the top-5 hits of
   ten sample queries shared a median of 2 dimensions and never more than 7,
   against queries of 4-13 dimensions. So the unmeasured case gets a constant,
   labelled as one on the page, rather than a number dressed as a measurement. */
const ASSUMED_SHARED = 3;

/* FLOPs for a transformer forward pass are counted as 2 · params · tokens
   (Kaplan et al.'s convention). It overstates by roughly a third here, because
   ~24M of a base model's 110M parameters are embeddings, which are gathers and
   not multiply-adds; attention's quadratic term gives a couple of per cent
   back at these sequence lengths. On an axis spanning nine decades neither
   matters, but the convention should be named rather than implied. */
const FLOPS_PER_PARAM_TOKEN = 2;

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
    const colW = 218;
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
      <g class="mt-node ${cls}" data-id="${label.id}" tabindex="0" role="button"
         aria-label="${escapeHTML(sub)} — ${escapeHTML(this.engine.tokenOf(label.id))}">
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

  /**
   * Hovering either end of an edge isolates it and reads the arithmetic out.
   * Keyboard focus does the same thing: the nodes are focusable, so the readout
   * is reachable without a pointer rather than being mouse-only trivia.
   */
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
      n.addEventListener('focus', () => enter(+n.dataset.id));
      n.addEventListener('blur', leave);
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
      if (r) {
        // Per passage scored, against dense — which is what the figure above it
        // describes. The query-encoder pass that dense and late interaction also
        // pay is a per-query cost, so it belongs in the cost panel, not here;
        // the title says so rather than leaving the reader to assume.
        r.textContent = ratio(per[arch] / dense);
        r.title = `${si(per[arch])} FLOPs to score one passage, against dense's `
          + `${si(dense)}. Excludes the once-per-query encoder pass — see the cost panel.`;
      }
    };

    const q = m.measured
      ? `your ${m.nq} wordpiece${m.nq === 1 ? '' : 's'}`
      : `${m.nq} query tokens (assumed)`;

    fill('dense',
      `<b>1</b> dot product of <b>${DENSE_DIM}</b> floats`,
      `Both sides are already collapsed to one vector, so ${q} and the whole passage `
      + `meet exactly once. Nothing about the passage survives that the pooling threw away.`);

    fill('sparse',
      `<b>${m.shared}</b> multiply-add${m.shared === 1 ? '' : 's'}`
        + (m.sharedMeasured ? '' : ' <small>(assumed)</small>'),
      m.sharedMeasured
        ? `Measured, not assumed: this is the graph at the top of this section. Only the `
          + `dimensions both sides activate cost anything, and an inverted index never even `
          + `visits a passage that shares none. The query side is a table lookup, so unlike `
          + `its two neighbours it pays no encoder pass either.`
        : `One per shared dimension — a stand-in until you pick a result, since over this `
          + `corpus a query's overlap runs nearer 2 or 3 than its own length.`);

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

  /**
   * What the reader's query actually is, or a labelled stand-in where there
   * isn't one. `measured` and `sharedMeasured` are tracked separately because
   * they fail independently: a typed query with no result selected gives a
   * measured length and an unmeasured overlap.
   */
  measure() {
    const live = this.terms.filter(t => !t.unknown && t.weight > 0);
    const ids = new Set(live.map(t => t.id));
    return {
      measured: ids.size > 0,
      nq: ids.size || MSMARCO_NQ,
      sharedMeasured: !!this.hit,
      shared: this.hit ? this.hit.parts.length : ASSUMED_SHARED,
    };
  }

  /** FLOPs to score one document. A multiply-add is two, throughout. */
  perDoc(m) {
    return {
      sparse: 2 * m.shared,                // one product per shared dimension
      dense: 2 * DENSE_DIM,                // one dot product, pooled to pooled
      late: 2 * m.nq * DOC_TOKENS * TOKEN_DIM,
      full: FLOPS_PER_PARAM_TOKEN * CE_PARAMS * (m.nq + DOC_TOKENS),
    };
  }

  /**
   * FLOPs paid once per query, before any document is scored — and the term
   * this panel used to leave out, which was the worst thing about it. Dense and
   * late interaction have to run the query through an encoder; at this site's
   * 78 passages that single forward pass is 44,000× the entire scoring cost of
   * dense, so a scoring-only chart got the answer wrong by four orders of
   * magnitude at its own default setting.
   *
   * It is also exactly the term that makes inference-free SPLADE what it is:
   * zero here, because the query side is a tokenizer and a table lookup. A
   * comparison that omits it silently drops the page's whole thesis. The
   * cross-encoder pays nothing separately because it encodes each pair, so its
   * query cost is already inside perDoc.
   */
  perQuery(m) {
    const enc = FLOPS_PER_PARAM_TOKEN * QENC_PARAMS * m.nq;
    return { sparse: 0, dense: enc, late: enc, full: 0 };
  }

  renderCost() {
    const host = this.el.cost;
    if (!host) return;
    const m = this.measure();
    const per = this.perDoc(m);
    const once = this.perQuery(m);
    const N = CORPORA[this.corpus].n || this.engine.docs.length;

    const shared = m.sharedMeasured
      ? `${m.shared} shared dim${m.shared === 1 ? '' : 's'}`
      : `${m.shared} shared dims (assumed)`;
    const nq = m.measured ? `${m.nq}` : `${m.nq} (assumed)`;

    const rows = [
      ['sparse', 'Learned sparse', 'this page', shared],
      ['dense', 'Dense, pooled', 'one vector each', `dim ${DENSE_DIM}`],
      ['late', 'Late interaction', 'MaxSim, token by token',
        `${nq} × ${DOC_TOKENS} × dim ${TOKEN_DIM}`],
      ['full', 'Full interaction', 'cross-encoder',
        `${si(CE_PARAMS)} params × ${m.nq + DOC_TOKENS} tokens, per pair`],
    ];

    const total = k => once[k] + per[k] * N;
    const totals = rows.map(([k]) => total(k));
    const max = Math.max(...totals), min = Math.min(...totals);

    /* This span is nine to twelve decades depending on the query, and on a
       linear axis that is three visible bars and one invisible one — so the
       axis is log. A log axis whose decades are not marked is decoration
       rather than a measurement, which is what the ticks below are for. */
    const lo = Math.pow(10, Math.floor(Math.log10(min)));
    const hi = Math.pow(10, Math.ceil(Math.log10(max)));
    const span = Math.log10(hi / lo) || 1;   // guard the degenerate single-decade case
    const at = v => (100 * Math.log10(v / lo) / span);
    const decades = [];
    for (let e = Math.log10(lo); e <= Math.log10(hi) + 1e-9; e++) {
      decades.push({ x: at(Math.pow(10, e)), e: Math.round(e) });
    }
    // Twelve decades of labels collide even in a wide bar; four or five fit.
    const step = Math.ceil(decades.length / 5);

    host.innerHTML = rows.map(([k, name, kind, how], i) => `
      <li class="mt-cost-row mt-${k}">
        <span class="mt-cost-name">${name}<small>${kind}</small>
          <code>${escapeHTML(how)}</code></span>
        <span class="mt-cost-bar"><i style="width:${Math.max(0.6, at(totals[i])).toFixed(1)}%"></i></span>
        <span class="mt-cost-val"><b>${si(totals[i])}</b> FLOPs
          <small>${once[k] ? `${si(once[k])} encode + ` : ''}${si(per[k])} × ${si(N)}</small></span>
      </li>`).join('')
      + `<li class="mt-cost-axis" aria-hidden="true"><span></span>
          <span class="mt-ticks">${decades.map((d, i) => i % step ? '' :
            `<i style="left:${d.x.toFixed(1)}%"><b>10<sup>${d.e}</sup></b></i>`).join('')}</span>
          <span></span></li>`;

    if (this.el.costNote) {
      // 99.997% rounds to "100%", which would be a false claim: scoring is a
      // small share, not a zero one.
      const encShare = 100 * once.dense / total('dense');
      const shareText = encShare > 99.5 ? 'over 99%'
        : encShare > 1 ? `${encShare.toFixed(0)}%` : 'under 1%';
      const li = per.late * N / (2 * TOKEN_DIM);   // back out the dot-product count
      this.el.costNote.innerHTML =
        `Scoring <b>${si(N)}</b> passages exhaustively, with `
        + (m.measured
            ? `the <b>${m.nq}</b> wordpieces you actually typed`
            : `an assumed <b>${m.nq}</b>-token query`)
        + (m.sharedMeasured ? '' : ', and an assumed overlap because no result is selected')
        + `. Totals include the <b>one</b> query-encoder pass dense and late interaction each need `
        + `before they can score anything — <b>${shareText}</b> of dense's bill at this corpus `
        + `size, and the term inference-free SPLADE does not pay at all. Late interaction's `
        + `scoring alone is <b>${si(li)}</b> dot products`
        + (N === 9e6 && !m.measured
            ? ` — the deck's 23B, since these are the deck's assumptions.` : `.`)
        /* At small N both are just one encoder pass, so they land on top of each
           other. That is the most useful thing the corrected accounting says and
           it looks like a rendering fault unless it is named. */
        + (Math.abs(total('late') / total('dense') - 1) < 0.1
            ? ` Which is why dense and late interaction come out level here: at this corpus size `
              + `both are one encoder pass and a rounding error, and the choice between them is `
              + `not a cost decision at all.`
            : '')
        + ` The point of the ordering is not that the right-hand columns are unaffordable: it is `
        + `that they are unaffordable <em>over the whole corpus</em>. Every deployed system runs `
        + `the cheap column wide and the expensive one narrow — `
        + `<a href="/knowledge/ml-and-data-at-colourbox/#25">that funnel is a slide of its own</a>.`;
    }
  }

  /* ------------------------------------------------------------ what is not here

     Three limits this panel does not model, listed because a number without its
     boundaries is worse than no number:

       · index size and memory traffic. Late interaction stores one vector per
         token, so its real constraint is usually bytes moved, not FLOPs. On a
         corpus this small nothing is ever paged in from anywhere.
       · the funnel. Every architecture right of dense is deployed behind an
         approximate index, so the exhaustive totals here are an upper bound on
         a plan nobody executes — which is the point the closing note makes.
       · what this page actually runs. The sparse row is the idealised sparse
         dot product: one multiply-add per shared dimension, as an inverted
         index would pay it. `splade.js` is brute force over all 78 documents
         (~11,600 map lookups per query) because at this corpus size an index
         would buy nothing. The row is the architecture's cost, not this
         script's.
     -------------------------------------------------------------------------- */

}
