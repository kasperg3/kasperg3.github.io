/* ============================================================================
   search-ui.js — /search/: the autocomplete, plus the breakdown it feeds.

   The search box and its five ranked results are the page. Everything under
   them dissects whichever result you pressed:

     1. query decomposition  what WordPiece did to what you typed, and what
                             each piece is worth in the static query table
     2. score decomposition  every term the query and the passage share, and
                             how much each one contributed
     3. sparsity strip       all ~30k vocabulary dimensions, with the ~150 this
                             passage activates lit up
     4. expansion reveal     terms the model added that the text never had

   Everything below that — where the two sides met, the same vector painted
   over the passage, and what the comparison would have cost under a different
   architecture — lives in ./meet.js, which this file feeds from `show()`.

   Facets (kind / year) are handled outside the model, on the metadata — see
   the note on the page.
   ============================================================================ */

import { Autocomplete, KIND_LABEL, escapeHTML, fmt, tokenHTML, yearOf } from './autocomplete.js';
import { Meet } from './meet.js';

const $ = sel => document.querySelector(sel);

const TERMS_SHOWN = 120;   // expansion-panel terms before "and N more"
const CONTRIB_ROWS = 18;   // rows in the score decomposition

const el = {
  q: $('#q'), clear: $('#clear'), status: $('#status'), skeleton: $('#skeleton'),
  ac: $('#ac'), acList: $('#ac-list'), acFoot: $('#ac-foot'),
  examples: $('#examples'), facets: $('#facets'), corpusNote: $('#corpus-note'),
  picker: $('#picker'), pickerLabel: $('#picker-label'),
  qterms: $('#qterms'), qsplit: $('#qsplit'),
  contrib: $('#contrib'),
  strip: $('#strip'), stripAlt: $('#strip-alt'), facts: $('#facts'),
  terms: $('#terms'), termsNote: $('#terms-note'),
  docHead: $('#doc-head'), docMeta: $('#doc-meta'), docLink: $('#doc-link'),
};

/* The "when the query meets the document" section owns its own elements. */
const meet = new Meet({
  graph: $('#meet-graph'), graphFoot: $('#meet-graph-foot'),
  graphReadout: $('#meet-graph-readout'),
  passage: $('#meet-passage'), ghosts: $('#meet-ghosts'),
  passageNote: $('#meet-passage-note'),
  archCards: document.querySelectorAll('.mt-arch'),
  corpusChips: $('#meet-corpus'), cost: $('#meet-cost'), costNote: $('#meet-cost-note'),
});

let engine = null;
let hits = [];          // the results currently listed
let selected = null;    // the hit being dissected
let lastTerms = [];
const filters = { kind: new Set(), year: new Set() };

/* ------------------------------------------------------------------ widget */

const ac = new Autocomplete({
  input: el.q, panel: el.ac, list: el.acList, foot: el.acFoot,
  status: el.status, skeleton: el.skeleton, clear: el.clear,
  base: './', limit: 5,
  filter: passesFilters,
  onReady(e) {
    engine = e;
    meet.ready(e);
    buildFacets();
    el.corpusNote.textContent =
      `${e.docs.length} passages · ${e.vocabSize.toLocaleString('en')} dimensions`;
    applyDeepLink();
  },
  onQuery({ terms, results, total, query }) {
    hits = results;
    lastTerms = terms;
    renderPicker();
    // Pressing a result is what commits a selection, but the breakdown should
    // never be stale: follow the top hit until the reader picks another.
    show(results.length ? (keepSelected(results) ?? results[0]) : null);
    renderQuery(terms);
    syncURL(query);
    if (!query) el.qsplit.textContent = '';
    void total;
  },
  onHighlight(hit) { if (hit) show(hit); },   // arrow keys preview as they move
  onSelect(hit, i) {
    show(hit);
    renderPicker(i);
    ac.close();
    syncURL(el.q.value.trim(), hit.doc.id);
    el.picker.scrollIntoView({ block: 'start', behavior: prefersMotion() ? 'smooth' : 'auto' });
  },
});

function prefersMotion() {
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Keep dissecting the same document across keystrokes when it is still a hit. */
function keepSelected(results) {
  if (!selected) return null;
  return results.find(r => r.doc.id === selected.doc.id) || null;
}

/* ----------------------------------------------------------------- facets */

function passesFilters(doc) {
  if (filters.kind.size && !filters.kind.has(doc.kind)) return false;
  if (filters.year.size) {
    const y = yearOf(doc);
    if (!y || !filters.year.has(y)) return false;
  }
  return true;
}

function buildFacets() {
  const kinds = new Map(), years = new Map();
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
    holder.className = 'sp-facet-chips';
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
        ac.run();
      });
      holder.appendChild(b);
    }
    row.appendChild(holder);
    el.facets.appendChild(row);
  }
  el.facets.hidden = false;
}

/* ------------------------------------------------- the result being shown */

function renderPicker(activeIndex = -1) {
  const on = hits.length > 0;
  el.picker.hidden = !on;
  el.pickerLabel.hidden = !on;
  if (!on) { el.picker.innerHTML = ''; return; }

  const current = activeIndex >= 0 ? activeIndex
    : Math.max(0, hits.findIndex(h => h.doc.id === selected?.doc.id));

  el.picker.innerHTML = hits.map((h, i) => `
    <button type="button" role="tab" class="sp-pick${i === current ? ' on' : ''}"
            aria-selected="${i === current}" data-i="${i}">
      <span class="n">${i + 1}</span>${escapeHTML(h.doc.title)}
    </button>`).join('');

  for (const b of el.picker.querySelectorAll('.sp-pick')) {
    b.addEventListener('click', () => {
      const i = +b.dataset.i;
      show(hits[i]);
      renderPicker(i);
      syncURL(el.q.value.trim(), hits[i].doc.id);
    });
  }
}

/** Keep ?q= and ?r= in step so any view of this page is shareable. */
function syncURL(query, docId) {
  const p = new URLSearchParams();
  if (query) p.set('q', query);
  if (docId) p.set('r', docId);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

/** Open on a specific result when arriving from the front page. */
function applyDeepLink() {
  const p = new URLSearchParams(location.search);
  const q = p.get('q');
  if (!q) return;
  el.q.value = q;
  ac.run().then(() => {
    const want = p.get('r');
    const i = want ? hits.findIndex(h => h.doc.id === want) : -1;
    if (i >= 0) { show(hits[i]); renderPicker(i); }
    ac.close();
  });
}

/* ------------------------------------------------- view 1: query breakdown */

function renderQuery(terms) {
  if (!terms.length) {
    el.qterms.innerHTML = '<p class="sp-empty">Type a query.</p>';
    el.qsplit.textContent = '';
    return;
  }
  const max = Math.max(...terms.map(t => t.weight), 0.001);
  const matched = new Set();
  for (const h of hits) for (const p of h.parts) matched.add(p.id);

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
      + `${oov.length > 1 ? 'are' : 'is'} out of vocabulary — the model is English-only.`);
  }
  el.qsplit.innerHTML = bits.join(' ');
}

/* ------------------------------- views 2-4: everything about one result --- */

function show(hit) {
  selected = hit;
  if (!hit) {
    el.docHead.textContent = 'No result selected';
    el.docMeta.textContent = '';
    el.docLink.hidden = true;
    el.contrib.innerHTML = '<p class="sp-empty">Pick a result.</p>';
    el.terms.innerHTML = '<p class="sp-empty">Pick a result.</p>';
    el.facts.innerHTML = '';
    el.termsNote.textContent = '';
    drawStrip(null);
    meet.update(lastTerms, null);
    return;
  }

  const d = hit.doc;
  el.docHead.textContent = d.title;
  el.docMeta.textContent = d.meta || '';
  el.docLink.hidden = false;
  el.docLink.href = d.url;

  renderContributions(hit);

  const all = engine.termsOf(d);
  const expansions = all.filter(t => !t.literal).length;
  const matchedIds = new Set(hit.parts.map(p => p.id));

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
    ? `${expansions} of these ${all.length} terms never appear in the passage — `
      + 'the model added them in case a query uses them instead.'
    : 'Every activated term is literally present in this passage.';

  drawStrip(d);
  // onQuery assigns lastTerms before calling show(), so the meeting views
  // always see the query that produced this hit.
  meet.update(lastTerms, hit);
}

/** View 2: the score, term by term. */
function renderContributions(hit) {
  const rows = hit.parts.slice(0, CONTRIB_ROWS);
  const max = rows[0]?.contribution || 1;
  el.contrib.innerHTML = `
    <p class="sp-contrib-sum">Score <b>${fmt(hit.score)}</b> — from
      ${hit.parts.length} shared term${hit.parts.length === 1 ? '' : 's'}.</p>
    <ol class="sp-contrib-list">
      ${rows.map(p => {
        const q = engine.queryWeightOf(p.id);
        const dw = p.contribution / (q || 1);
        return `<li>
          <span class="tk ${p.literal ? 'lit' : 'exp'}">${tokenHTML(engine.tokenOf(p.id))}</span>
          <span class="bar"><i class="${p.literal ? '' : 'exp'}"
                style="width:${Math.max(2, 100 * p.contribution / max)}%"></i></span>
          <span class="mul">${fmt(q)} × ${fmt(dw)}</span>
          <span class="val">${fmt(p.contribution)}</span>
        </li>`;
      }).join('')}
    </ol>
    ${hit.parts.length > rows.length
      ? `<p class="sp-note">and ${hit.parts.length - rows.length} smaller.</p>` : ''}`;
}

/* ------------------------------------------------ view 3: the sparsity strip */

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

  // The empty vocabulary, as a baseline the eye can measure the ticks against.
  ctx.fillStyle = hair || 'rgba(0,0,0,.07)';
  ctx.fillRect(0, h - 1.5, w, 1.5);

  if (!doc) { el.stripAlt.textContent = ''; return; }

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

el.examples.addEventListener('click', e => {
  const b = e.target.closest('.sp-ex');
  if (!b) return;
  el.q.value = b.textContent.trim();
  el.q.focus();
  ac.ready().then(() => ac.run());
});

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => drawStrip(stripDoc), 120);
});
// The strip is painted from CSS custom properties, so it has to be repainted
// when the OS theme flips underneath it.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawStrip(stripDoc));

// Arriving with ?q= (from the front page, or a shared link) loads immediately;
// otherwise nothing is fetched until the box is focused.
if (new URLSearchParams(location.search).get('q')) ac.ready();
else show(null);
