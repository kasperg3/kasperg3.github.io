/* ============================================================================
   demo.js — the search box at the top of the post.

   The same widget /search/ and the front page use, pointed at the same index,
   so the post opens with the thing it is about rather than a description of
   it. Nothing is fetched until the box is focused. Pressing a result hands off
   to /search/?q=…&r=…, where the scoring behind it is laid out in full.
   ============================================================================ */

import { Autocomplete } from '/search/autocomplete.js';

const $ = id => document.getElementById(id);
const input = $('q');

if (input) {
  const ac = new Autocomplete({
    input,
    panel: $('ac'), list: $('ac-list'), foot: $('ac-foot'),
    status: $('status'), skeleton: $('skeleton'), clear: $('clear'),
    base: '/search/', limit: 4,
    onSelect(hit) {
      const q = encodeURIComponent(input.value.trim());
      location.href = `/search/?q=${q}&r=${encodeURIComponent(hit.doc.id)}`;
    },
  });

  for (const b of document.querySelectorAll('#examples .sp-ex')) {
    b.addEventListener('click', () => {
      input.value = b.textContent;
      input.focus();
      ac.run();
    });
  }
}
