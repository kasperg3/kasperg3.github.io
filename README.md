# grontved.xyz

Personal site for Kasper Rømer Grøntved — publications, CV, projects, and a
browser-native slide deck engine for talks.

Plain static HTML. No Jekyll, no Ruby, no npm, no build step. GitHub Actions uploads
the repo as-is to Pages.

## Layout

```
index.html              landing page (hero, current work, projects, talks, research)
publications.html       full publication list with abstracts
cv.html                 CV in HTML  ·  assets/cv/cv.pdf is the downloadable version
404.html
talks/index.html        talk index + how the deck engine works
talks/<slug>/index.html one deck = one HTML file
talks/_template/        copy this to start a new deck
site/site.css           shared design system for the site pages
deck/deck.css           slide styles, same tokens as site.css
deck/deck.js            slide runtime (~200 lines, vanilla JS)
assets/img/             web-optimized images
assets/cv/cv.pdf
sitemap.xml robots.txt CNAME .nojekyll
```

`.nojekyll` matters: without it GitHub Pages runs Jekyll and ignores files starting
with `_`, which would break `talks/_template/`.

## Local preview

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Use a server, not `file://` — pages reference assets with absolute paths (`/deck/deck.css`).

## Adding a talk

```bash
cp -r talks/_template talks/my-new-talk
# edit talks/my-new-talk/index.html
# add a card to talks/index.html, and optionally to index.html
# add the URL to sitemap.xml
```

### How the deck engine works

Slides are `<section class="slide">` elements inside a fixed **1920×1080** `#stage`.
`deck.js` scales that stage with a single CSS transform so it fills any window, shows one
slide at a time, and syncs the index to the URL hash — `…/my-talk/#7` deep-links to slide 7.
Because the canvas is a fixed pixel size you design in absolute px and it renders
identically on a laptop, a projector, and a phone.

Rules the engine relies on:

- every slide is `<section class="slide" data-t="Slide title">…</section>`
- the **first** slide also gets `class="… active"`
- `data-t` feeds the contents drawer and the browser tab title
- `<div class="notes">…</div>` inside a slide is speaker-only (press `n`)
- `class="slide section"` marks a divider and starts a new contents group
- `<img class="zoom">` becomes click-to-enlarge

### Presenter keys

| Key | Action |
| --- | --- |
| `→` `space` `PageDown` | next slide |
| `←` `PageUp` | previous slide |
| `Home` / `End` | first / last slide |
| `n` | speaker notes |
| `o` or `g` | contents |
| `f` | fullscreen |
| `t` | light / dark |
| `p` | print → PDF, one slide per page |
| `Esc` | close drawers |

Swipe and scroll wheel also advance.

### Slide building blocks

**Kinds** — `title-slide`, `section`, `closing-slide`, or plain.
**Header** — `.kicker`, `h1.t` (`.sm` for smaller), `.sub`, `.grad` for gradient text.
**Layout** — `.body`, `.cols` + `.grow`, `.grid-2` / `.grid-3` / `.grid-4`, `.stack`, `.center`.
**Content** — `.card` (`.solid` `.dark` `.accent`), `.card .num` for a big figure, `ul.bullets`,
`.chip`, `pre.code` (with `.k` `.s` `.c` spans), `figure` + `figcaption`, `.quote` + `.by`.
**Footer** — `.slide-foot`; slide numbers inject themselves.

## Theming

Colour and type tokens live in the `:root` block at the top of both `site/site.css` and
`deck/deck.css` — they are deliberately the same values, so site and slides read as one
system. Change `--accent` and `--canvas` and everything follows. For a one-off deck
palette, add `<style>:root{--accent:#7a3ea1}</style>` to that deck's `<head>`.

Dark mode: the site follows `prefers-color-scheme`; decks toggle with `t` and remember
the choice in `localStorage`.

## Charts

Hand-written inline SVG (see `talks/decentralized-task-allocation/assets/tasks.svg`). Stays
crisp at projector resolution, needs no JS, and uses the same palette tokens.

## Images

Keep them small — the previous version of this site shipped 41 MB of unoptimized photos.
Re-encode before committing:

```bash
python3 -c "
from PIL import Image
im = Image.open('photo.jpg'); w = 1800
im.resize((w, round(im.height*w/im.width)), Image.LANCZOS).save(
    'assets/img/photo.jpg', quality=82, optimize=True, progressive=True)"
```

Animations belong in WebP, not GIF — a 15 MB GIF here became a 363 KB animated WebP.

## Deploy

Push to `master`. `.github/workflows/pages.yml` uploads and deploys. Custom domain
`www.grontved.xyz` is set by `CNAME`.
