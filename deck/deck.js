/* ============================================================
   deck.js — runtime for the fixed-stage slide engine.
   Drop it at the end of <body>. It expects:
     #stage  containing .slide elements, each with data-t="Slide title"
   Everything else (HUD, drawers, lightbox) is injected here.

   Keys: → / space / PageDown  next        ← / PageUp  previous
         Home / End            first/last  n  speaker notes
         o or g                contents    f  fullscreen
         t                     light/dark  p  print (export PDF)
         Esc                   close panels
   ============================================================ */
(() => {
const stage  = document.getElementById('stage');
const slides = [...stage.querySelectorAll('.slide')];
if (!slides.length) return;
const DECK_TITLE = document.title;

/* ---------- chrome ---------- */
document.body.insertAdjacentHTML('beforeend', `
<div id="progress"></div>
<div id="hud">
  <button id="tocBtn"  title="Contents (o)">☰</button>
  <button id="noteBtn" title="Speaker notes (n)">✎</button>
  <button id="prevBtn" title="Previous (←)">‹</button>
  <span id="ctr"></span>
  <button id="nextBtn" title="Next (→)">›</button>
  <button id="fsBtn"   title="Fullscreen (f)">⛶</button>
</div>
<aside class="drawer" id="notes">
  <button class="drawer-close" data-close="notes">×</button>
  <div class="tk">Speaker notes</div><h2>${DECK_TITLE}</h2>
  <div class="nt"></div><div class="nb"></div>
</aside>
<aside class="drawer" id="toc"></aside>
<div id="lightbox"><img alt=""></div>`);

const notesEl = document.getElementById('notes');
const tocEl   = document.getElementById('toc');
const lightbox = document.getElementById('lightbox');

/* ---------- scale the 1920x1080 stage to fit ---------- */
function fit(){
  let w = innerWidth, h = innerHeight;
  if (document.body.classList.contains('notes-open')) {
    if (innerWidth >= 1200) w -= 480; else h -= Math.min(innerHeight * .42, 320);
  } else if (document.body.classList.contains('toc-open') && innerWidth >= 1200) {
    w -= 440;
  }
  stage.style.transform = `scale(${Math.min(w / 1920, h / 1080)})`;
}
let raf = 0;
const scheduleFit = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fit(); }); };
addEventListener('resize', scheduleFit, { passive: true });
fit();

/* ---------- slide furniture ---------- */
slides.forEach((s, i) => {
  s.setAttribute('aria-hidden', 'true');
  if (s.classList.contains('title-slide')) return;
  if (!s.querySelector('.slide-number')) {
    const n = document.createElement('div');
    n.className = 'slide-number'; n.textContent = i + 1; s.append(n);
  }
});

/* ---------- navigation ---------- */
let cur = 0;
function prepare(i, priority = 'low'){
  slides[i]?.querySelectorAll('img').forEach(img => {
    img.loading = 'eager'; img.fetchPriority = priority;
    if (priority === 'high' && img.decode) img.decode().catch(() => {});
  });
}
function show(i){
  i = Math.max(0, Math.min(slides.length - 1, i));
  slides[cur].classList.remove('active');
  slides[cur].setAttribute('aria-hidden', 'true');
  cur = i;
  slides[cur].classList.add('active');
  slides[cur].setAttribute('aria-hidden', 'false');
  prepare(cur, 'high');
  const warm = () => { prepare(cur - 1); prepare(cur + 1); };
  'requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 900 }) : setTimeout(warm, 80);

  history.replaceState(null, '', '#' + (cur + 1));
  document.getElementById('ctr').textContent = `${cur + 1} / ${slides.length}`;
  document.title = (slides[cur].dataset.t ? slides[cur].dataset.t + ' · ' : '') + DECK_TITLE;
  document.getElementById('progress').style.transform = `scaleX(${cur / (slides.length - 1 || 1)})`;
  document.getElementById('prevBtn').disabled = cur === 0;
  document.getElementById('nextBtn').disabled = cur === slides.length - 1;

  const n = slides[cur].querySelector('.notes');
  notesEl.querySelector('.nt').textContent = slides[cur].dataset.t || '';
  notesEl.querySelector('.nb').textContent = n ? n.textContent.trim() : '(no notes)';
  if (document.body.classList.contains('toc-open')) buildToc();
}
window.show = show;

/* ---------- contents drawer, grouped by .section slides ---------- */
function buildToc(){
  const marks = slides.map((s, i) => [i, s]).filter(([, s]) => s.classList.contains('section'));
  const groups = marks.length ? marks : [[0, slides[0]]];
  let h = `<button class="drawer-close" data-close="toc">×</button>
           <div class="tk">Navigate</div><h2>Contents</h2><div>`;
  groups.forEach(([start, s], gi) => {
    const end = gi + 1 < groups.length ? groups[gi + 1][0] : slides.length;
    const here = cur >= start && cur < end;
    h += `<details name="toc" class="toc-section${here ? ' current' : ''}"${here ? ' open' : ''}>
            <summary>${s.dataset.t || 'Section ' + (gi + 1)}
              <span class="section-range">Slides ${start + 1}–${end}</span></summary>
            <div class="toc-list">`;
    for (let i = start; i < end; i++)
      h += `<button class="row${i === cur ? ' cur' : ''}" data-go="${i}">
              <span class="n">${i + 1}</span><span>${slides[i].dataset.t || ''}</span></button>`;
    h += `</div></details>`;
  });
  tocEl.innerHTML = h + '</div>';
}

/* ---------- panels ---------- */
function panel(name, on){
  const cls = name + '-open';
  const want = on === undefined ? !document.body.classList.contains(cls) : on;
  document.body.classList.remove('notes-open', 'toc-open');
  if (want) { document.body.classList.add(cls); if (name === 'toc') buildToc(); }
  fit();
}
const closePanels = () => panel('notes', false);

/* ---------- theme ---------- */
try { const t = localStorage.getItem('deck-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
function toggleTheme(){
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('deck-theme', next); } catch {}
}

/* ---------- lightbox ---------- */
function openLightbox(src, alt){
  lightbox.querySelector('img').src = src;
  lightbox.querySelector('img').alt = alt || '';
  lightbox.classList.add('open');
}
lightbox.addEventListener('click', () => lightbox.classList.remove('open'));

/* ---------- input ---------- */
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');       if (go)  { show(+go.dataset.go); panel('toc', false); return; }
  const cl = e.target.closest('[data-close]');    if (cl)  { closePanels(); return; }
  const zoom = e.target.closest('img.zoom');      if (zoom){ openLightbox(zoom.currentSrc || zoom.src, zoom.alt); return; }
  const id = e.target.closest('#hud button')?.id;
  if (id === 'prevBtn') show(cur - 1);
  else if (id === 'nextBtn') show(cur + 1);
  else if (id === 'tocBtn')  panel('toc');
  else if (id === 'noteBtn') panel('notes');
  else if (id === 'fsBtn')   toggleFullscreen();
});
function toggleFullscreen(){
  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
}
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (lightbox.classList.contains('open') && e.key === 'Escape') { lightbox.classList.remove('open'); return; }
  switch (e.key) {
    case 'ArrowRight': case ' ': case 'PageDown': show(cur + 1); break;
    case 'ArrowLeft':  case 'PageUp':             show(cur - 1); break;
    case 'Home': show(0); break;
    case 'End':  show(slides.length - 1); break;
    case 'n': case 'N': panel('notes'); break;
    case 'o': case 'O': case 'g': case 'G': panel('toc'); break;
    case 't': case 'T': toggleTheme(); break;
    case 'p': case 'P': print(); break;
    case 'f': case 'F': toggleFullscreen(); break;
    case 'Escape': closePanels(); break;
    default: return;
  }
  e.preventDefault();
});
let tx = null;
addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
addEventListener('touchend', e => {
  if (tx === null) return;
  const dx = e.changedTouches[0].clientX - tx;
  if (Math.abs(dx) > 60) show(cur + (dx < 0 ? 1 : -1));
  tx = null;
}, { passive: true });
let wheelLock = 0;
addEventListener('wheel', e => {
  if (document.body.classList.contains('notes-open') || document.body.classList.contains('toc-open')) return;
  const now = performance.now();
  if (now - wheelLock < 500 || Math.abs(e.deltaY) < 24) return;
  wheelLock = now; show(cur + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });
addEventListener('hashchange', () => {
  const n = parseInt(location.hash.slice(1), 10);
  if (!isNaN(n) && n - 1 !== cur) show(n - 1);
});

/* ---------- boot ---------- */
const start = parseInt(location.hash.slice(1), 10);
show(!isNaN(start) && start >= 1 ? start - 1 : 0);
})();
