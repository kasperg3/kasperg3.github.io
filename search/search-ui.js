/* ============================================================================
   search-ui.js — the visible half of the SPLADE demo.

   Four views, all drawn from data that is already in index.json:

     1. sparsity strip      every one of the ~30k vocabulary dimensions, with
                            the handful this document activates lit up
     2. query decomposition what WordPiece did to what you typed, and what each
                            piece is worth in the static query table
     3. score decomposition which terms produced a result's score, and how much
     4. expansion reveal    terms the model added that the text never contained

   Facets (kind / year) are handled entirely outside the model, on the metadata.
   That separation is deliberate — see the note on the page.
   ============================================================================ */

import { load } from './splade.js';

const $ = sel => document.querySelector(sel);

const LIMIT = 12;          // results shown
const TERMS_SHOWN = 120;   // expansion-panel terms before "and N more"
const STACK_SEGMENTS = 14; // segments in a result's score bar

const el = {
  q: $('#q'),
  clear: $('#clear'),
  status: $('#status'),
  skeleton: $('#skeleton'),
  examples: $('#examples'),
  facets: $('#facets'),
  results: $('#results'),
  resultsNote: $('#results-note'),
  qterms: $('#qterms'),
  qsplit: $('#qsplit'),
  strip: $('#strip'),
  stripAlt: $('#strip-alt'),
  facts: $('#facts'),
  terms: $('#terms'),
  docHead: $('#doc-head'),
  docMeta: $('#doc-meta'),
  docLink: $('#doc-link'),
  termsNote: $('#terms-note'),
};

const KIND_LABEL = {
  publication: 'Paper',
  slide: 'Slide',
  project: 'Project',
  'cv-role': 'CV',
  thesis: 'Thesis',
  supervision: 'Supervision',
};

let engine = null;        // the Splade instance, once loaded
let loading = null;       // in-flight load promise, so focus + type race safely
let selected = null;      // { doc, parts } currently in the inspector
let lastResults = [];
const filters = { kind: new Set(), year: new Set() };

/* ------------------------------------------------------------------ helpers */

const fmt = n => n.toFixed(2);

function tokenHTML(token) {
  // WordPiece continuations start with ##; grey the marker so the split reads.
  return token.startsWith('##')
    ? `<span class="cont">##</span>${escapeHTML(token.slice(2))}`
    : escapeHTML(token);
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** The year a document belongs to, dug out of its metadata. */
function yearOf(doc) {
  const m = /\b(19|20)\d{2}\b/.exec(doc.meta || '');
  return m ? m[0] : null;
}

/* ------------------------------------------------------------------- boot */

function ready() {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;

  el.skeleton.hidden = false;
  el.status.textContent = 'Loading the index…';
  el.status.classList.remove('err');

  loading = load('./').then(e => {
    engine = e;
    el.skeleton.hidden = true;
    buildFacets();
    el.status.textContent =
      `${e.docs.length} passages indexed over ${e.vocabSize.toLocaleString('en')} `
      + 'vocabulary dimensions. No model runs in your browser.';
    return e;
  }).catch(err => {
    loading = null;
    el.skeleton.hidden = true;
    el.status.classList.add('err');
    el.status.textContent = `Could not load the index: ${err.message}`;
    throw err;
  });
  return loading;
}

/* ----------------------------------------------------------------- facets */

function buildFacets() {
  const kinds = new Map();
  const years = new Map();
  for (const d of engine.docs) {
    kinds.set(d.kind, (kinds.get(d.kind) || 0) + 1);
    const y = yearOf(d);
    if (y) years.set(y, (years.get(y) || 0) + 1);
  }

  const rows = [
    ['kind', 'Kind', [...kinds.keys()].sort((a, b) => kinds.get(b) - kinds.get(a)),
      k => `${KIND_LABEL[k] || k} ${kinds.get(k)}`],
    ['year', 'Year', [...years.keys()].sort().reverse(), y => y],
  ];

  el.facets.innerHTML = '';
  for (const [group, label, values, text] of rows) {
    if (!values.length) continue;
    const row = document.createElement('div');
    row.className = 'sp-facet';
    row.innerHTML = `<span id="facet-${group}">${label}</span>`;
    const holder = document.createElement('div');
    holder.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    holder.setAttribute('role', 'group');
    holder.setAttribute('aria-labelledby', `facet-${group}`);
    for (const v of values) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-chip';
      b.setAttribute('aria-pressed', 'false');
      b.textContent = text(v);
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') === 'true';
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
        on ? filters[group].delete(v) : filters[group].add(v);
        run();
      });
      holder.appendChild(b);
    }
    row.appendChild(holder);
    el.facets.appendChild(row);
  }
  el.facets.hidden = false;
}

function passesFilters(doc) {
  if (filters.kind.size && !filters.kind.has(doc.kind)) return false;
  if (filters.year.size) {
    const y = yearOf(doc);
    if (!y || !filters.year.has(y)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ search */

let debounce = 0;
function schedule() {
  clearTimeout(debounce);
  debounce = setTimeout(run, 90);
}

async function run() {
  const text = el.q.value.trim();
  el.clear.hidden = !text;
  if (!engine) {
    if (!text) return;
    await ready().catch(() => {});
    if (!engine) return;
  }

  if (!text) {
    el.qterms.innerHTML = '<p class="sp-empty">Type a query — its pieces and their static weights appear here.</p>';
    el.qsplit.textContent = '';
    el.results.innerHTML = '';
    el.resultsNote.textContent = '';
    lastResults = [];
    showDoc(null);
    return;
  }

  // Search the whole corpus, then apply the metadata facets. Filtering after
  // scoring keeps the two paths honestly separate: the model never sees a year.
  const { terms, results } = engine.search(text, engine.docs.length);
  const kept = results.filter(r => passesFilters(r.doc)).slice(0, LIMIT);

  renderQuery(terms);
  renderResults(kept, results.length);
  showDoc(kept.length ? kept[0] : null);
}

/* ------------------------------------------------- view 2: query breakdown */

function renderQuery(terms) {
  if (!terms.length) {
    el.qterms.innerHTML = '<p class="sp-empty">Nothing tokenizable in that query.</p>';
    el.qsplit.textContent = '';
    return;
  }
  const max = Math.max(...terms.map(t => t.weight), 0.001);
  const matched = new Set();
  for (const r of lastResults) for (const p of r.parts) matched.add(p.id);

  el.qterms.innerHTML = terms.map(t => {
    const dead = t.unknown || t.weight === 0;
    const missing = !dead && !matched.has(t.id);
    const cls = ['sp-qterm', dead ? 'dead' : '', missing ? 'miss' : ''].filter(Boolean).join(' ');
    const note = t.unknown ? 'out of vocabulary'
      : t.weight === 0 ? 'no query weight'
      : missing ? 'matched nothing' : 'matched';
    return `<div class="${cls}" title="${escapeHTML(t.word)} → ${escapeHTML(t.token)} · ${note}">
      <div class="tk">${tokenHTML(t.token)}</div>
      <div class="wt">${dead ? '—' : fmt(t.weight)}</div>
      <div class="rail"><i style="width:${dead ? 100 : Math.max(4, 100 * t.weight / max)}%"></i></div>
    </div>`;
  }).join('');

  // Show the splitting itself when a word was broken into more than one piece.
  const byWord = new Map();
  for (const t of terms) {
    if (!byWord.has(t.word)) byWord.set(t.word, []);
    byWord.get(t.word).push(t.token);
  }
  const split = [...byWord.entries()].filter(([, ts]) => ts.length > 1);
  const oov = terms.filter(t => t.unknown).map(t => t.word);
  const bits = [];
  if (split.length) {
    bits.push('WordPiece split ' + split
      .map(([w, ts]) => `<code>${escapeHTML(w)}</code> into <code>${ts.map(escapeHTML).join(' + ')}</code>`)
      .join(', ') + '.');
  }
  if (oov.length) {
    bits.push(`<code>${oov.map(escapeHTML).join('</code>, <code>')}</code> `
      + `${oov.length > 1 ? 'are' : 'is'} out of vocabulary entirely — the model was trained on `
      + 'English MS MARCO, and nothing it knows can stand in.');
  }
  el.qsplit.innerHTML = bits.join(' ');
}

/* ------------------------------------- views 1 + 3: results and their scores */

function renderResults(hits, totalBeforeFilter) {
  lastResults = hits;
  if (!hits.length) {
    el.results.innerHTML = '<li class="sp-empty" style="padding:8px 0">No passage shares a term with that query.</li>';
    el.resultsNote.textContent = totalBeforeFilter
      ? `${totalBeforeFilter} scored above zero, but the filters excluded all of them.`
      : '';
    return;
  }
  const top = hits[0].score;

  el.results.innerHTML = hits.map((hit, i) => {
    const d = hit.doc;
    const segs = hit.parts.slice(0, STACK_SEGMENTS).map(p => {
      const pct = 100 * p.contribution / hit.score;
      const tk = engine.tokenOf(p.id);
      return `<i class="${p.literal ? '' : 'exp'}" style="width:${pct}%"
        title="${escapeHTML(tk)} — ${fmt(p.contribution)} of ${fmt(hit.score)}${p.literal ? '' : ' · expansion'}"></i>`;
    }).join('');
    return `<li class="sp-result${i === 0 ? ' on' : ''}" data-i="${i}">
      <button type="button" class="sp-hit" aria-expanded="${i === 0}">
        <div class="row">
          <span class="sp-kind">${KIND_LABEL[d.kind] || d.kind}</span>
          <span class="ti">${escapeHTML(d.title)}</span>
          <span class="sc">${fmt(hit.score)}</span>
        </div>
        <div class="mt">${escapeHTML(d.meta || '')}</div>
        <div class="sn">${escapeHTML(d.snippet || '')}</div>
        <div class="sp-stack" role="img"
             aria-label="Score ${fmt(hit.score)}, built from ${hit.parts.length} matching terms, the largest being ${escapeHTML(engine.tokenOf(hit.parts[0].id))}.">${segs}</div>
      </button>
      <a class="sp-open" href="${escapeHTML(d.url)}">Open ${d.kind === 'slide' ? 'the slide' : 'the page'} →</a>
    </li>`;
  }).join('');

  const filtered = totalBeforeFilter - hits.length;
  el.resultsNote.textContent =
    `${totalBeforeFilter} passage${totalBeforeFilter === 1 ? '' : 's'} scored above zero`
    + (filtered > 0 ? `, showing ${hits.length}` : '')
    + (top < 0.6 ? ' — every score here is weak, so read them as leads, not answers.' : '.');

  el.results.querySelectorAll('.sp-hit').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.sp-result');
      showDoc(hits[+li.dataset.i]);
      el.results.querySelectorAll('.sp-result').forEach(n => {
        const on = n === li;
        n.classList.toggle('on', on);
        n.querySelector('.sp-hit').setAttribute('aria-expanded', String(on));
      });
    });
  });
}

/* ------------------------- views 1 + 4: the inspector for one document ---- */

function showDoc(hit) {
  selected = hit;
  if (!hit) {
    el.docHead.textContent = 'No document selected';
    el.docMeta.textContent = '';
    el.docLink.hidden = true;
    el.terms.innerHTML = '<p class="sp-empty">Run a search, then pick a result to see the vector behind it.</p>';
    el.facts.innerHTML = '';
    el.termsNote.textContent = '';
    drawStrip(null);
    return;
  }
  const d = hit.doc;
  const all = engine.termsOf(d);
  const expansions = all.filter(t => !t.literal).length;
  const matchedIds = new Set(hit.parts ? hit.parts.map(p => p.id) : []);

  el.docHead.textContent = d.title;
  el.docMeta.textContent = d.meta || '';
  el.docLink.hidden = false;
  el.docLink.href = d.url;

  el.facts.innerHTML = [
    [all.length, 'terms activated'],
    [`${(100 * all.length / engine.vocabSize).toFixed(2)}%`, 'of the vocabulary'],
    [expansions, 'not in the text'],
    [matchedIds.size, 'matched this query'],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');

  const shown = all.slice(0, TERMS_SHOWN);
  el.terms.innerHTML = shown.map(t =>
    `<span class="sp-term ${t.literal ? 'lit' : 'exp'}${matchedIds.has(t.id) ? ' hit' : ''}"
       title="${t.literal ? 'in the text' : 'added by the model'} · weight ${fmt(t.weight)}"
     >${tokenHTML(t.token)}<span class="w">${fmt(t.weight)}</span></span>`).join('')
    + (all.length > shown.length
        ? `<span class="sp-more">and ${all.length - shown.length} more</span>` : '');

  el.termsNote.textContent = expansions
    ? `${expansions} of these ${all.length} terms never appear in the passage. `
      + 'The model put them there because a query might use them instead.'
    : 'Every activated term is literally present in this passage.';

  drawStrip(d);
}

/* ------------------------------------------------ view 1: the sparsity strip */

let stripDoc = null;

function drawStrip(doc) {
  stripDoc = doc;
  const c = el.strip;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const css = getComputedStyle(document.body);
  const hair = css.getPropertyValue('--hair-soft').trim();
  const accent = css.getPropertyValue('--accent').trim();
  const accent2 = css.getPropertyValue('--accent-2').trim();

  // The empty vocabulary, as a baseline the eye can measure the lit ticks against.
  ctx.fillStyle = hair || 'rgba(0,0,0,.07)';
  ctx.fillRect(0, h - 1.5, w, 1.5);

  if (!doc) {
    el.stripAlt.textContent = '';
    return;
  }

  const n = engine.vocabSize;
  const maxW = Math.max(...doc.w) / engine.docScale;
  for (let k = 0; k < doc.t.length; k++) {
    const x = Math.round((doc.t[k] / n) * (w - 2)) + 1;
    const weight = doc.w[k] / engine.docScale;
    const tall = Math.max(3, (h - 6) * (weight / maxW));
    ctx.fillStyle = doc.lit[k] === 1 ? (accent || '#1f6f68') : (accent2 || '#b4531f');
    ctx.globalAlpha = 0.55 + 0.45 * (weight / maxW);
    ctx.fillRect(x, h - 1.5 - tall, 1.4, tall);
  }
  ctx.globalAlpha = 1;

  const lit = doc.lit.reduce((a, b) => a + b, 0);
  el.stripAlt.textContent =
    `Sparsity strip: ${doc.t.length} of ${n.toLocaleString('en')} vocabulary dimensions are `
    + `non-zero for “${doc.title}”. Each is drawn as a tick at its own vocabulary position, `
    + `with height proportional to its weight — ${lit} for terms present in the passage, `
    + `${doc.t.length - lit} added by the model. Everything else is exactly zero.`;
}

/* -------------------------------------------------------------------- wire */

el.q.addEventListener('focus', ready, { once: true });
el.q.addEventListener('input', () => { el.clear.hidden = !el.q.value; schedule(); });
el.q.addEventListener('keydown', e => { if (e.key === 'Escape') { el.q.value = ''; run(); } });

el.clear.addEventListener('click', () => { el.q.value = ''; el.q.focus(); run(); });

el.examples.addEventListener('click', e => {
  const b = e.target.closest('.sp-ex');
  if (!b) return;
  el.q.value = b.textContent;
  ready().then(run);
  el.q.focus();
});

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => drawStrip(stripDoc), 120);
});
// The strip is painted from CSS custom properties, so it has to be repainted
// when the OS theme flips underneath it.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawStrip(stripDoc));

// A query in the URL (?q=…) makes any search on this page shareable.
const initial = new URLSearchParams(location.search).get('q');
if (initial) {
  el.q.value = initial;
  ready().then(run);
} else {
  showDoc(null);
}
