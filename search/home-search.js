/* ============================================================================
   home-search.js — the "Ask this site" band on the front page.

   Same engine and ranking as /search/. Three things are different, all of them
   about getting someone to type in the first place:

     · the top hit is quoted back as an answer, not just listed as a row
     · that quote can be written up by a language model, if one is configured
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
import { askRelay, relayEnabled } from './ask.js';

const input = document.getElementById('hq');

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

/**
 * Add the "Write this up" control under the quoted passage. The quote stays
 * put: a generated sentence appears beside the evidence, never instead of it.
 */
function offerGeneratedAnswer(into, question, results) {
  const box = document.createElement('div');
  box.className = 'ask-gen';
  box.innerHTML = `
    <button type="button" class="ask-gen-go">Write this up →</button>
    <p class="ask-gen-out" role="status" aria-live="polite"></p>`;
  into.appendChild(box);

  const button = box.querySelector('.ask-gen-go');
  const out = box.querySelector('.ask-gen-out');

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Reading the passages…';
    out.classList.remove('err');
    try {
      out.textContent = await askRelay(question, results);
      box.classList.add('done');
      button.remove();
    } catch (err) {
      out.textContent = err.message;
      out.classList.add('err');
      button.disabled = false;
      button.textContent = 'Try again →';
    }
  }, { once: false });
}

if (input) {
  const answer = document.getElementById('hanswer');

  const widget = new Autocomplete({
    input,
    panel: document.getElementById('hac'),
    list: document.getElementById('hac-list'),
    foot: document.getElementById('hac-foot'),
    clear: document.getElementById('hclear'),
    base: '/search/',
    limit: 4,

    onQuery({ results, query }) {
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
      if (relayEnabled()) offerGeneratedAnswer(answer, query, results);
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
