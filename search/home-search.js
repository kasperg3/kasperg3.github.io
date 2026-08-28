/* ============================================================================
   home-search.js — the "Ask this site" band on the front page.

   Same engine and ranking as /search/. Three things are different, all of them
   about getting someone to type in the first place:

     · the top hit is quoted back as an answer, not just listed as a row
     · the placeholder cycles through real questions, so the box suggests
       what it is for instead of describing it
     · "Surprise me" runs one, because a click is cheaper than a sentence

   Pressing a result hands off to /search/ with the query and the chosen
   document, so the reader lands on the analysis of what they picked. The
   corner link on each row still goes straight to the source.

   Nothing is fetched until the box is focused, so the front page pays no
   bytes for this unless someone actually searches.
   ============================================================================ */

import { Autocomplete, KIND_LABEL, escapeHTML } from './autocomplete.js';

const input = document.getElementById('hq');

/* ---------------------------------------------------------------------------
   The generated answer.

   Everything above this line works with no network beyond the index itself.
   This part talks to a worker that holds a Mistral key, and it is deliberately
   the weakest link in the page: if it 4xxs, 5xxs, times out, runs out of quota
   or simply is not there, we render nothing at all and the retrieved passage —
   already on screen before the button was pressed — is the answer. There is no
   error state to design because there is no moment where the reader is looking
   at an empty box.

   We send passage ids rather than passage text, so the worker can only ever
   generate from this site's own corpus. Citations come back as bare [n] and are
   resolved here against the same ordered id list we sent, which means a
   fabricated link is not something the model is able to express.
   --------------------------------------------------------------------------- */

const ASK_URL = 'https://ask.grontved.xyz/ask';
const COOLDOWN = 4000;
const MAX_Q = 200;      // must match the worker; a longer question is refused there

const PROMPTS = [
  'How do drones divide up a search area?',
  'Why does keyword search fail on images?',
  'What keeps the models inside Europe?',
  'How do robots agree without a leader?',
  'What is late interaction?',
  'Where do you actually find someone who is lost?',
];

/**
 * The indexed snippet starts with the passage title, because the encoder is fed
 * "title. body". The title is already in the citation line underneath, so strip
 * it here rather than printing it twice.
 */
function quote(doc) {
  const snip = (doc.snippet || '').trim();
  const lead = doc.title.trim().replace(/[.?!]$/, '');
  if (snip.toLowerCase().startsWith(lead.toLowerCase())) {
    const rest = snip.slice(lead.length).replace(/^[.\s·—-]+/, '');
    if (rest.length > 60) return rest;
  }
  return snip;
}

if (input) {
  const answer = document.getElementById('hanswer');
  const gen = document.getElementById('hgen');
  const askBtn = document.getElementById('hask');
  const out = document.getElementById('hout');

  let hits = [];        // what the last query retrieved, and what we would cite
  let inflight = null;  // AbortController — Autocomplete has no cancellation of its own
  let cooling = 0;

  /** A new query invalidates whatever was generated for the previous one. */
  function resetGen(available) {
    inflight?.abort();
    inflight = null;
    if (!gen) return;
    gen.hidden = !available;
    if (out) { out.hidden = true; out.innerHTML = ''; }
    if (askBtn) { askBtn.hidden = false; askBtn.disabled = false; }
  }

  /**
   * Turn the model's bare [n] markers into links to the passage they cite.
   * n indexes the same ordered list we sent, so the URL never comes from the
   * model — a fabricated citation resolves to nothing and is left as text.
   */
  function linkCitations(text, cited) {
    return escapeHTML(text).replace(/\[(\d{1,2})\]/g, (m, n) => {
      const d = cited[+n - 1]?.doc;
      return d ? `<a class="ref" href="${escapeHTML(d.url)}" title="${escapeHTML(d.title)}">${m}</a>` : m;
    });
  }

  async function askLLM() {
    const question = input.value.trim();
    if (!question || question.length > MAX_Q || !hits.length) return;
    if (Date.now() < cooling) return;
    cooling = Date.now() + COOLDOWN;

    const cited = hits.slice(0, 4);
    inflight?.abort();
    const ctl = new AbortController();
    inflight = ctl;

    askBtn.disabled = true;
    askBtn.hidden = true;
    out.hidden = false;
    out.innerHTML = '<span class="lbl">Answer</span><p><span class="cur"></span></p>';
    const para = out.querySelector('p');

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
      return giveUp();
    }

    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
      return giveUp(res.status === 429 ? 'Asked too often just now — the passage below still stands.' : '');
    }

    // Parse the SSE here rather than in the worker: the worker passes the
    // upstream body through untouched, which costs it no CPU per chunk and
    // lets it cache the response with a plain clone().
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    let text = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
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
              para.innerHTML = `${linkCitations(text, cited)}<span class="cur"></span>`;
            }
          } catch { /* a partial frame; the next chunk completes it */ }
        }
      }
    } catch {
      if (ctl.signal.aborted) return;
    }

    if (ctl.signal.aborted) return;
    inflight = null;
    if (!text.trim()) return giveUp();
    para.innerHTML = linkCitations(text, cited);

    function giveUp(note) {
      inflight = null;
      if (ctl.signal.aborted) return;
      // Silence is the correct fallback: "Closest passage" is already rendered.
      out.innerHTML = note ? `<p class="quiet">${escapeHTML(note)}</p>` : '';
      out.hidden = !note;
      askBtn.hidden = !!note;
      askBtn.disabled = false;
    }
  }

  askBtn?.addEventListener('click', askLLM);

  const widget = new Autocomplete({
    input,
    panel: document.getElementById('hac'),
    list: document.getElementById('hac-list'),
    foot: document.getElementById('hac-foot'),
    clear: document.getElementById('hclear'),
    base: '/search/',
    limit: 4,

    onQuery({ results, query }) {
      hits = results;
      resetGen(Boolean(query) && results.length > 0);
      if (!answer) return;
      if (!query || !results.length) { answer.innerHTML = ''; return; }
      const d = results[0].doc;
      answer.innerHTML = `
        <span class="lbl">Closest passage</span>
        <blockquote>${escapeHTML(quote(d))}</blockquote>
        <p class="cite">
          <span>${escapeHTML(KIND_LABEL[d.kind] || d.kind)} · ${escapeHTML(d.title)}</span>
          <a href="${escapeHTML(d.url)}">Read it →</a>
        </p>`;
    },

    onSelect(hit) {
      const p = new URLSearchParams({ q: input.value.trim(), r: hit.doc.id });
      location.href = `/search/?${p}`;
    },
  });

  const ask = text => {
    input.value = text;
    input.focus();
    widget.ready().then(() => widget.run());
  };

  document.getElementById('hexamples')?.addEventListener('click', e => {
    const b = e.target.closest('.sp-ex');
    if (!b || b.id === 'hdice') return;
    ask(b.textContent.trim());
  });

  document.getElementById('hdice')?.addEventListener('click', () => {
    const pool = PROMPTS.filter(p => p !== input.value);
    ask(pool[Math.floor(Math.random() * pool.length)]);
  });

  // Enter with nothing highlighted: hand the raw query to the full page.
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && widget.active < 0 && input.value.trim()) {
      location.href = `/search/?q=${encodeURIComponent(input.value.trim())}`;
    }
  });

  /* -------- the placeholder types itself, until someone starts typing ----- */

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0;
  let stopped = false;

  function stop() {
    stopped = true;
    clearTimeout(timer);
    input.placeholder = PROMPTS[0];
  }

  function cycle(i = 0) {
    if (stopped) return;
    const text = PROMPTS[i % PROMPTS.length];
    let n = 0;
    const type = () => {
      if (stopped) return;
      input.placeholder = text.slice(0, ++n);
      timer = setTimeout(n < text.length ? type : () => erase(), n < text.length ? 34 : 2600);
    };
    const erase = () => {
      if (stopped) return;
      input.placeholder = text.slice(0, --n);
      timer = setTimeout(n > 0 ? erase : () => cycle(i + 1), n > 0 ? 16 : 260);
    };
    type();
  }

  // Once the box is theirs, it stops performing.
  input.addEventListener('focus', stop, { once: true });
  input.addEventListener('input', stop, { once: true });

  if (reduced.matches) input.placeholder = PROMPTS[0];
  else {
    input.placeholder = '';
    cycle();
    reduced.addEventListener('change', e => { if (e.matches) stop(); });
  }
}
