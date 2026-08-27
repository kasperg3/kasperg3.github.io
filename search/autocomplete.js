/* ============================================================================
   autocomplete.js — the search box and its results dropdown.

   Shared by the front page (a compact widget in the spotlight card) and
   /search/ (the full page, which also dissects whatever you pick). Both get
   the same engine, the same ranking and the same rows; they differ only in
   what happens when you press a result, which is the `onSelect` callback.

   The ARIA combobox pattern: focus never leaves the input, the listbox is
   `aria-controls`, and the highlighted row is named by `aria-activedescendant`.
   ============================================================================ */

import { load } from './splade.js';

export const KIND_LABEL = {
  publication: 'Paper',
  slide: 'Slide',
  project: 'Project',
  'cv-role': 'CV',
  thesis: 'Thesis',
  supervision: 'Supervision',
};

export const fmt = n => n.toFixed(2);

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** WordPiece continuations start with ##; grey the marker so the split reads. */
export function tokenHTML(token) {
  return token.startsWith('##')
    ? `<span class="cont">##</span>${escapeHTML(token.slice(2))}`
    : escapeHTML(token);
}

/** The year a document belongs to, dug out of its metadata. */
export function yearOf(doc) {
  const m = /\b(19|20)\d{2}\b/.exec(doc.meta || '');
  return m ? m[0] : null;
}

const STACK_SEGMENTS = 10;   // segments in a row's score bar

export class Autocomplete {
  /**
   * @param {object} o
   * @param {HTMLInputElement} o.input
   * @param {HTMLElement} o.panel   wrapper shown/hidden with the results
   * @param {HTMLElement} o.list    the `role="listbox"`
   * @param {HTMLElement} [o.foot]  a line under the list for counts
   * @param {HTMLElement} [o.status]
   * @param {HTMLElement} [o.skeleton]
   * @param {HTMLElement} [o.clear]
   * @param {string}  [o.base]      where index.json lives
   * @param {number}  [o.limit]     rows to show
   * @param {boolean} [o.compact]   denser rows, for the front page
   * @param {function} o.onSelect   (hit, index) => void — pressing a result
   * @param {function} [o.onQuery]  ({terms, results, total, query}) => void
   * @param {function} [o.onReady]  (engine) => void
   * @param {function} [o.onHighlight] (hit, index) => void
   * @param {function} [o.filter]   (doc) => boolean, applied after scoring
   */
  constructor(o) {
    this.o = o;
    this.input = o.input;
    this.panel = o.panel;
    this.list = o.list;
    this.limit = o.limit ?? 5;
    this.base = o.base ?? '/search/';
    this.engine = null;
    this.loading = null;
    this.hits = [];
    this.active = -1;
    this.debounce = 0;
    this.wire();
  }

  /* ------------------------------------------------------------- loading */

  ready() {
    if (this.engine) return Promise.resolve(this.engine);
    if (this.loading) return this.loading;

    if (this.o.skeleton) this.o.skeleton.hidden = false;
    this.setStatus('Loading the index…');

    this.loading = load(this.base).then(e => {
      this.engine = e;
      if (this.o.skeleton) this.o.skeleton.hidden = true;
      this.setStatus(`${e.docs.length} passages indexed. No model runs in your browser.`);
      this.o.onReady?.(e);
      return e;
    }).catch(err => {
      this.loading = null;
      if (this.o.skeleton) this.o.skeleton.hidden = true;
      this.setStatus(`Could not load the index — ${err.message}`, true);
      throw err;
    });
    return this.loading;
  }

  setStatus(text, isError = false) {
    if (!this.o.status) return;
    this.o.status.textContent = text;
    this.o.status.classList.toggle('err', isError);
  }

  /* -------------------------------------------------------------- search */

  schedule() {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.run(), 90);
  }

  async run() {
    const query = this.input.value.trim();
    if (this.o.clear) this.o.clear.hidden = !query;

    if (!this.engine) {
      if (!query) return;
      await this.ready().catch(() => {});
      if (!this.engine) return;
    }

    if (!query) {
      this.hits = [];
      this.close();
      this.list.innerHTML = '';
      this.o.onQuery?.({ terms: [], results: [], total: 0, query: '' });
      return;
    }

    // Score everything, then apply the metadata filters. Filtering after
    // scoring keeps the two paths honestly separate: the model never sees a
    // year or a kind.
    const { terms, results } = this.engine.search(query, this.engine.docs.length);
    const kept = this.o.filter ? results.filter(r => this.o.filter(r.doc)) : results;
    this.hits = kept.slice(0, this.limit);

    this.render(kept.length);
    this.o.onQuery?.({ terms, results: this.hits, total: kept.length, query });
  }

  /* -------------------------------------------------------------- render */

  render(total) {
    if (!this.hits.length) {
      this.list.innerHTML =
        '<li class="sp-opt-empty" role="presentation">No matches.</li>';
      if (this.o.foot) this.o.foot.textContent = '';
      this.open();
      this.setActive(-1);
      return;
    }

    this.list.innerHTML = this.hits.map((hit, i) => {
      const d = hit.doc;
      const kind = KIND_LABEL[d.kind] || d.kind;
      const segs = hit.parts.slice(0, STACK_SEGMENTS).map(p => {
        const pct = 100 * p.contribution / hit.score;
        return `<i class="${p.literal ? '' : 'exp'}" style="width:${pct}%"></i>`;
      }).join('');
      return `<li class="sp-opt" role="option" id="ac-opt-${i}" data-i="${i}"
                  aria-selected="false"
                  aria-label="Result ${i + 1}, ${escapeHTML(kind)}, ${escapeHTML(d.title)}, score ${fmt(hit.score)}">
        <span class="sp-rank">${i + 1}</span>
        <span class="sp-opt-main">
          <span class="sp-opt-head">
            <span class="sp-kind">${escapeHTML(kind)}</span>
            <span class="sp-score">${fmt(hit.score)}</span>
          </span>
          <span class="sp-opt-title">${escapeHTML(d.title)}</span>
          ${this.o.compact ? '' : `<span class="sp-opt-meta">${escapeHTML(d.meta || '')}</span>`}
          <span class="sp-stack" aria-hidden="true">${segs}</span>
        </span>
        <a class="sp-src" href="${escapeHTML(d.url)}" tabindex="-1"
           aria-label="Open the page for ${escapeHTML(d.title)}"
           title="Go straight to the page">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
        </a>
      </li>`;
    }).join('');

    if (this.o.foot) {
      const shown = this.hits.length;
      this.o.foot.textContent = total > shown
        ? `Top ${shown} of ${total} matches`
        : `${total} match${total === 1 ? '' : 'es'}`;
    }

    this.open();
    this.setActive(0, false);
  }

  /* --------------------------------------------------------- open / close */

  open() {
    this.panel.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.panel.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
    this.active = -1;
    for (const el of this.list.querySelectorAll('.sp-opt')) {
      el.classList.remove('on');
      el.setAttribute('aria-selected', 'false');
    }
  }

  /**
   * @param {number} i
   * @param {boolean} scroll keep the row in view (arrow keys, not first paint)
   */
  setActive(i, scroll = true) {
    this.active = i;
    const opts = [...this.list.querySelectorAll('.sp-opt')];
    opts.forEach((el, k) => {
      const on = k === i;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', String(on));
    });
    if (i < 0 || !opts[i]) {
      this.input.removeAttribute('aria-activedescendant');
      return;
    }
    this.input.setAttribute('aria-activedescendant', `ac-opt-${i}`);
    if (scroll) opts[i].scrollIntoView({ block: 'nearest' });
    this.o.onHighlight?.(this.hits[i], i);
  }

  move(delta) {
    if (this.panel.hidden && this.hits.length) { this.open(); this.setActive(0); return; }
    if (!this.hits.length) return;
    const n = this.hits.length;
    this.setActive((this.active + delta + n) % n);
  }

  select(i) {
    const hit = this.hits[i];
    if (hit) this.o.onSelect(hit, i);
  }

  /* ---------------------------------------------------------------- wire */

  wire() {
    const reopen = () => {
      this.ready();
      if (this.hits.length && this.input.value.trim() && this.panel.hidden) {
        this.open();
        this.setActive(Math.max(0, this.active), false);
      }
    };
    // `focus` alone misses the case where the box already had focus — after
    // Escape, clicking it again should bring the results back.
    this.input.addEventListener('focus', reopen);
    this.input.addEventListener('click', reopen);

    this.input.addEventListener('input', () => {
      if (this.o.clear) this.o.clear.hidden = !this.input.value;
      this.schedule();
    });

    this.input.addEventListener('keydown', e => {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); this.move(1); break;
        case 'ArrowUp':   e.preventDefault(); this.move(-1); break;
        case 'Home':      if (this.hits.length) { e.preventDefault(); this.setActive(0); } break;
        case 'End':       if (this.hits.length) { e.preventDefault(); this.setActive(this.hits.length - 1); } break;
        case 'Enter':
          if (this.active >= 0 && !this.panel.hidden) { e.preventDefault(); this.select(this.active); }
          break;
        case 'Escape':
          if (!this.panel.hidden) { e.preventDefault(); this.close(); }
          else if (this.input.value) { this.input.value = ''; this.run(); }
          break;
        default: break;
      }
    });

    // Pointer: the row opens the analysis, the corner link goes to the page.
    this.list.addEventListener('click', e => {
      if (e.target.closest('.sp-src')) return;          // let the link be a link
      const li = e.target.closest('.sp-opt');
      if (!li) return;
      e.preventDefault();
      this.select(+li.dataset.i);
    });

    // mousedown would blur the input before the click lands
    this.list.addEventListener('mousedown', e => {
      if (!e.target.closest('.sp-src')) e.preventDefault();
    });

    document.addEventListener('click', e => {
      if (!this.panel.hidden
          && !this.panel.contains(e.target)
          && e.target !== this.input) this.close();
    });

    this.o.clear?.addEventListener('click', () => {
      this.input.value = '';
      this.input.focus();
      this.run();
    });
  }
}
