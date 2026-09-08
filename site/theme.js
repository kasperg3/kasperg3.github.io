/* ============================================================================
   theme.js — the light/dark switch in the header.

   The site opens light and dark is opted into, rather than following the
   operating system. The preference lives under the same localStorage key the
   slide decks already use, so one toggle covers the whole site and a reader who
   switches here finds the decks switched too.

   The attribute itself is applied by a two-line inline script in each page's
   <head>, because it has to happen before the first paint or the page flashes
   the wrong colour. This file only wires the button.
   ============================================================================ */

const root = document.documentElement;
const btn = document.getElementById('theme');

function sync() {
  const dark = root.dataset.theme === 'dark';
  btn.setAttribute('aria-pressed', String(dark));
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

if (btn) {
  btn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('deck-theme', root.dataset.theme); } catch { /* private mode */ }
    sync();
  });
  sync();
}
