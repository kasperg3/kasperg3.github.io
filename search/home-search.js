/* ============================================================================
   home-search.js — the conversation on the front page.

   A search box asks you to know what to type. A conversation does not, and the
   front page is where someone arrives knowing least. So the band is a thread:
   you ask, the page answers, and the answer says which passages it was built
   from.

   What has not changed is where the work happens. All 78 passages are still
   scored in the browser by search/splade.js — no query is sent anywhere to be
   retrieved. Only generation leaves the machine, and only after retrieval has
   already picked the passages it may use.

   Two deliberate limits:

     · Each question is retrieved and answered on its own. Nothing is carried
       between turns, so "what about indoors?" is not understood as a follow-up.
       The thread is a record, not a memory, and the copy never claims otherwise.

     · Generation is the optional half. If the worker 4xxs, 5xxs, is rate
       limited or simply is not there, the turn falls back to quoting the best
       retrieved passage. Retrieval alone is still an answer, so there is no
       failure that leaves the reader with nothing.

   The retrieval analysis is not gone, it has moved. Every turn carries a "How
   this was retrieved" button that opens the scoring — query terms and their
   weights, the ranked passages, and which of them the model was actually given.
   It renders with the same .sp-opt rows /search/ uses, so the two surfaces
   agree by construction rather than by discipline.
   ============================================================================ */

import { load } from './splade.js';
import { KIND_LABEL, escapeHTML, fmt, tokenHTML } from './autocomplete.js';

const ASK_URL = 'https://ask.grontved.xyz/ask';
const MAX_Q = 200;     // the worker refuses anything longer, so stop it here
const SENT = 4;        // passages handed to the model
const SHOWN = 6;       // passages listed in the retrieval modal
const COOLDOWN = 4000;
const STACK = 10;      // segments in a score bar

const $ = id => document.getElementById(id);
const chat = $('hchat'), form = $('hform'), input = $('hq'), send = $('hsend');
const tries = $('htries'), modal = $('hrt'), rtTitle = $('hrt-title'), rtBody = $('hrt-body');

let engine = null, loading = null, inflight = null, cooling = 0, seq = 0;
const analyses = new Map();   // turn id → what retrieval saw, for the modal

/** Memoise the promise, and clear it on failure so a retry is possible. */
function ready() {
  loading ??= load('/search/')
    .then(e => (engine = e))
    .catch(err => { loading = null; throw err; });
  return loading;
}

/**
 * The indexed snippet starts with the passage title, because the encoder is fed
 * "title. body". Anywhere the title is already shown, strip it rather than
 * printing it twice.
 */
function quote(doc) {
  let rest = (doc.snippet || '').trim();
  // The passage is encoded as "title. venue. body", and both the title and the
  // venue are already on the citation line above the quote. Peel them off
  // rather than saying each of them twice.
  const leads = [doc.title, ...(doc.meta || '').split('·')]
    .map(t => t.trim().replace(/[.?!]$/, ''))
    .filter(t => t.length > 3);
  for (const lead of leads) {
    if (rest.toLowerCase().startsWith(lead.toLowerCase())) {
      const cut = rest.slice(lead.length).replace(/^[.\s·—-]+/, '');
      if (cut.length > 60) rest = cut;
    }
  }
  return rest;
}

/**
 * Turn the model's bare [n] markers into links to the passage they cite. n
 * indexes the list we sent, so the URL never comes from the model: a citation
 * it invented resolves to nothing and is left as plain text.
 */
function linkCitations(text, cited) {
  return escapeHTML(text).replace(/\[(\d{1,2})\]/g, (m, n) => {
    const d = cited[+n - 1]?.doc;
    return d
      ? `<a class="ref" href="${escapeHTML(d.url)}" title="${escapeHTML(d.title)}">${m}</a>`
      : m;
  });
}

/* -------------------------------------------------------------------------
   one turn
   ------------------------------------------------------------------------- */

function addTurn(question) {
  const id = ++seq;
  const node = document.createElement('div');
  node.className = 'turn';
  node.innerHTML =
    `<p class="turn-q">${escapeHTML(question)}</p>
     <div class="turn-a"><p class="turn-text"><span class="caret"></span></p></div>`;
  chat.appendChild(node);
  node.scrollIntoView({ block: 'nearest' });
  return { id, node, text: node.querySelector('.turn-text'), a: node.querySelector('.turn-a') };
}

/**
 * What names a source. For a section of a paper it is the paper: two different
 * papers both have an "Introduction", and the heading on its own does not
 * answer "where did this come from".
 */
function sourceName(doc) {
  if (doc.kind !== 'paper-section') return doc.title;
  return (doc.meta || '').split('·')[0].trim() || doc.title;
}

/** The sources row: what the answer drew on, and the way into the scoring. */
function addFoot(turn, cited) {
  const cards = cited.map((h, i) =>
    `<a class="src-card" href="${escapeHTML(h.doc.url)}" title="${escapeHTML(h.doc.title)}">
       <b>${i + 1}</b><span>${escapeHTML(sourceName(h.doc))}</span>
     </a>`).join('');
  const foot = document.createElement('div');
  foot.className = 'turn-foot';
  foot.innerHTML = `${cards}<button class="turn-retr" type="button" data-retr="${turn.id}">
    How this was retrieved</button>`;
  turn.a.appendChild(foot);
  turn.node.scrollIntoView({ block: 'nearest' });
}

/** Retrieval still answered, even when generation did not. */
function fallback(turn, hits, note) {
  const d = hits[0].doc;
  turn.text.innerHTML =
    `<span class="turn-quiet">${escapeHTML(note)} Closest passage —
     ${escapeHTML(KIND_LABEL[d.kind] || d.kind)}, ${escapeHTML(d.title)}:</span><br>
     ${escapeHTML(quote(d))}`;
}

function setBusy(on) {
  if (send) send.disabled = on;
}

/* -------------------------------------------------------------------------
   asking
   ------------------------------------------------------------------------- */

async function ask(question) {
  question = question.trim().slice(0, MAX_Q);
  if (!question || inflight || Date.now() < cooling) return;

  if (tries) tries.hidden = true;
  input.value = '';
  const turn = addTurn(question);
  setBusy(true);

  let terms = [], hits = [], total = 0;
  try {
    const e = await ready();
    ({ terms, results: hits, total } = e.search(question, SHOWN));
  } catch {
    turn.text.innerHTML =
      '<span class="turn-quiet">The search index could not be loaded, so there is nothing ' +
      'to answer from. Reloading the page usually fixes it.</span>';
    setBusy(false);
    return;
  }

  if (!hits.length) {
    turn.text.innerHTML =
      '<span class="turn-quiet">Nothing on this site matches that. The index covers papers, ' +
      'slides, projects and the CV — try one of those.</span>';
    setBusy(false);
    return;
  }

  analyses.set(turn.id, { query: question, terms, hits, total });
  const cited = hits.slice(0, SENT);

  cooling = Date.now() + COOLDOWN;
  const ctl = new AbortController();
  inflight = ctl;
  const timer = setTimeout(() => ctl.abort(), 25000);

  let res;
  try {
    res = await fetch(ASK_URL, {
      method: 'POST',
      // text/plain is CORS-safelisted, so this sends no preflight — and a
      // preflight would be a second billable worker invocation per question.
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ q: question, ids: cited.map(h => h.doc.id) }),
      signal: ctl.signal,
    });
  } catch {
    clearTimeout(timer);
    return done(turn, cited, () => fallback(turn, hits,
      ctl.signal.aborted ? 'The answer took too long.' : 'Could not reach the answer service.'));
  }

  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
    clearTimeout(timer);
    const note = res.status === 429
      ? 'Asked too often just now.'
      : 'Could not generate an answer just now.';
    return done(turn, cited, () => fallback(turn, hits, note));
  }

  // The worker passes Mistral's stream through untouched, which costs it no
  // CPU per chunk and lets it cache the response with a plain clone().
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '', text = '';
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            turn.text.innerHTML = `${linkCitations(text, cited)}<span class="caret"></span>`;
            turn.node.scrollIntoView({ block: 'nearest' });
          }
        } catch { /* a partial frame; the next chunk completes it */ }
      }
    }
  } catch { /* a truncated stream still leaves whatever arrived */ }

  clearTimeout(timer);
  done(turn, cited, () => {
    if (text.trim()) turn.text.innerHTML = linkCitations(text, cited);
    else fallback(turn, hits, 'The answer came back empty.');
  });
}

function done(turn, cited, render) {
  inflight = null;
  render();
  addFoot(turn, cited);
  setBusy(false);
}

/* -------------------------------------------------------------------------
   the retrieval modal
   ------------------------------------------------------------------------- */

function openModal(id) {
  const a = analyses.get(id);
  if (!a) return;

  const max = Math.max(...a.terms.map(t => t.weight), 0.001);
  const matched = new Set();
  for (const h of a.hits) for (const p of h.parts) matched.add(p.id);

  const termChips = a.terms.map(t => {
    const dead = t.unknown || t.weight === 0;
    const note = t.unknown ? 'out of vocabulary'
      : t.weight === 0 ? 'no query weight'
      : matched.has(t.id) ? 'matched' : 'matched nothing';
    return `<li class="retr-term" title="${escapeHTML(t.word)} → ${escapeHTML(t.token)} · ${note}"
                style="opacity:${dead || !matched.has(t.id) ? '.45' : '1'}">
      ${tokenHTML(t.token)}<em>${dead ? '—' : fmt(t.weight)}</em></li>`;
  }).join('');

  const rows = a.hits.map((hit, i) => {
    const d = hit.doc;
    const segs = hit.parts.slice(0, STACK).map(p =>
      `<i class="${p.literal ? '' : 'exp'}" style="width:${100 * p.contribution / hit.score}%"></i>`
    ).join('');
    return `<li class="sp-opt">
      <span class="sp-rank">${i + 1}</span>
      <span class="sp-opt-main">
        <span class="sp-opt-head">
          <span class="sp-kind">${escapeHTML(KIND_LABEL[d.kind] || d.kind)}</span>
          ${i < SENT ? '' : '<span class="sp-opt-meta">not sent to the model</span>'}
          <span class="sp-score">${fmt(hit.score)}</span>
        </span>
        <span class="sp-opt-title">${escapeHTML(d.title)}</span>
        <span class="sp-opt-meta">${escapeHTML(d.meta || '')}</span>
        <span class="sp-stack" aria-hidden="true">${segs}</span>
      </span>
      <a class="sp-src" href="${escapeHTML(d.url)}" aria-label="Open ${escapeHTML(d.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
      </a>
    </li>`;
  }).join('');

  rtTitle.textContent = a.query;
  rtBody.innerHTML = `
    <p class="retr-lead">${a.total} of 78 passages matched. The top
    ${Math.min(SENT, a.hits.length)} went to the model.
    <a href="/search/?q=${encodeURIComponent(a.query)}">Full analysis →</a></p>

    <p class="retr-sub">Query terms</p>
    <ul class="retr-terms">${termChips}</ul>

    <p class="retr-sub">Ranked passages</p>
    <ul class="retr-list">${rows}</ul>

    <p class="retr-key">
      <span><i class="lit"></i>term is literally in the passage</span>
      <span><i class="exp"></i>term the document encoder added</span>
    </p>`;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.retr-close')?.focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

/* -------------------------------------------------------------------------
   wiring
   ------------------------------------------------------------------------- */

if (form && input && chat) {
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });

  tries?.addEventListener('click', e => {
    const b = e.target.closest('.sp-ex');
    if (b) ask(b.textContent);
  });

  // Nothing is fetched until someone shows intent, so the page still pays no
  // bytes for the index unless it is going to be used.
  input.addEventListener('focus', () => ready().catch(() => {}), { once: true });

  chat.addEventListener('click', e => {
    const b = e.target.closest('.turn-retr');
    if (b) openModal(+b.dataset.retr);
  });

  modal?.addEventListener('click', e => {
    if (e.target.closest('[data-retr-close]')) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
  });
}
