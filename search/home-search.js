/* ============================================================================
   home-search.js — the compact search widget on the front page.

   Same engine, same ranking, same rows as /search/; only two things differ.
   It is smaller (no metadata line), and pressing a result hands off to
   /search/ with the query and the chosen document in the URL, so the reader
   lands on the analysis of the thing they picked rather than a blank page.
   The corner link on each row still goes straight to the source.

   Nothing is fetched until the box is focused, so the front page pays no
   bytes for this unless someone actually searches.
   ============================================================================ */

import { Autocomplete } from './autocomplete.js';

const input = document.getElementById('hq');
if (input) {
  const widget = new Autocomplete({
    input,
    panel: document.getElementById('hac'),
    list: document.getElementById('hac-list'),
    foot: document.getElementById('hac-foot'),
    status: document.getElementById('hstatus'),
    clear: document.getElementById('hclear'),
    base: '/search/',
    limit: 5,
    compact: true,
    onSelect(hit) {
      const p = new URLSearchParams({ q: input.value.trim(), r: hit.doc.id });
      location.href = `/search/?${p}`;
    },
  });

  // Enter with nothing highlighted: hand the raw query over to the full page.
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && widget.active < 0 && input.value.trim()) {
      location.href = `/search/?q=${encodeURIComponent(input.value.trim())}`;
    }
  });
}
