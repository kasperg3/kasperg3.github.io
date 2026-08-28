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
knowledge/index.html    knowledge-dissemination index (featured + archive)
knowledge/<slug>/index.html  one deck = one HTML file
knowledge/_template/    copy this to start a new deck
search/index.html       SPLADE site search (see below)
search/splade.js        retrieval engine: WordPiece + sparse dot product
search/autocomplete.js  the search box and results dropdown, shared by both pages
search/search-ui.js     /search/ only: the breakdown panels
search/home-search.js   the front page band: the widget, and the generated answer
search/search.css       styles for the box, the dropdown and the panels
search/index.json …     the built index (generated — CI rebuilds it)
search/corpus.json      the same passages without their vectors (generated)
content/publications/   full paper text, read at build time (public, like everything here)
worker/                 the Cloudflare Worker behind "Answer this" (see below)
tools/build_search_index.py   extracts the corpus and encodes it
site/site.css           shared design system for the site pages
deck/deck.css           slide styles, same tokens as site.css
deck/deck.js            slide runtime (~200 lines, vanilla JS)
assets/img/             web-optimized images
assets/cv/cv.pdf        downloadable CV (generated — see below)
assets/cv/cv-print.html the print source the PDF is rendered from
blog/ posts/ hop-database/   redirect stubs for the retired blog (see below)
publications/ cv/         redirect stubs for the old Jekyll nav URLs
sitemap.xml robots.txt CNAME .nojekyll
```

`.nojekyll` matters: without it GitHub Pages runs Jekyll and ignores files starting
with `_`, which would break `knowledge/_template/`.

## Legacy URL redirects

The site used to be Jekyll with a blog under the permalink pattern `/:categories/:title/`.
The eight posts are gone and two pages changed address, but the old URLs are still linked to
and indexed, so each one keeps a tiny stub at its old path: `blog/`, `posts/`,
`hop-database/`, `publications/` and `cv/`. Every stub is a single
`index.html` with a `meta refresh`, `location.replace()`, a `canonical` link to the target,
`robots: noindex`, and a visible fallback link for anyone with JS off. An HTML comment at the
top of each names the page or post it replaces.

| Old URL | Now goes to |
| --- | --- |
| `/posts/` (blog index) | `/` |
| `/blog/swarm-simulator/` | `/knowledge/` |
| `/hop-database/` and `/blog/hop-database/` | `/projects.html` |
| `/posts/2025/08/trajgenpy-guide/` | `/projects.html` |
| `/posts/2025/08/trajallocpy-guide/` | `/projects.html` |
| `/posts/2025/08/swarmtalk-guide/` | `/projects.html` |
| `/posts/2025/08/sarenv-guide/` | `/projects.html` |
| `/posts/2025/08/agent-dsl-guide/` | `/knowledge/` |
| `/posts/2025/08/complete-multi-robot-guide/` | `/knowledge/decentralized-task-allocation/` |
| `/publications/` (old nav) | `/publications.html` |
| `/cv/` (old nav) | `/cv.html` |

GitHub Pages serves static files only — there is no server-side redirect and no `.htaccess`,
which is why these are client-side stubs rather than 301s. They are deliberately **not** in
`sitemap.xml`: they are `noindex` and exist only to catch inbound traffic.

That is the complete set — every `permalink:` in the last Jekyll commit (`8f9351a`) is either
covered above, still valid (`/404.html`, `/`), or a post URL listed in the table.

## Local preview

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Use a server, not `file://` — pages reference assets with absolute paths (`/deck/deck.css`).

## Adding a deck

```bash
cp -r knowledge/_template knowledge/my-new-talk
# edit knowledge/my-new-talk/index.html
# add a card to knowledge/index.html (Featured or Archive)
# add the URL to sitemap.xml
```

### How the deck engine works

Slides are `<section class="slide">` elements inside a fixed **1920×1080** `#stage`.
`deck.js` scales that stage with a single CSS transform so it fills any window, shows one
slide at a time, and syncs the index to the URL hash — `…/my-deck/#7` deep-links to slide 7.
Because the canvas is a fixed pixel size you design in absolute px and it renders
identically on a laptop, a projector, and a phone.

Rules the engine relies on:

- every slide is `<section class="slide" data-t="Slide title">…</section>`
- the **first** slide also gets `class="… active"`
- `data-t` feeds the contents drawer and the browser tab title
- `<div class="notes">…</div>` inside a slide is speaker-only (press `n`)
- `<ul class="sources"><li><a href="…">Label</a></li></ul>` inside a slide becomes its citation list
  (press `r`); the HUD shows a count badge when the current slide has any
- `class="slide deep-dive"` marks an optional slide — the HUD shows a "Deep dive" badge so you know
  it is safe to skip when short on time
- `class="slide section"` marks a divider and starts a new contents group
- `<img class="zoom">` becomes click-to-enlarge
- `<span class="todo">` marks placeholder content in a draft deck; `<div class="draft-flag">Draft</div>`
  puts a badge in the slide corner

### Presenter keys

| Key | Action |
| --- | --- |
| `→` `space` `PageDown` | next slide |
| `←` `PageUp` | previous slide |
| `Home` / `End` | first / last slide |
| `n` | speaker notes |
| `o` or `g` | contents |
| `r` | sources for the current slide |
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

### Layout gotchas

Three that have each cost a debugging round:

- **Never put `flex:0 0 NNNpx` on a child of a column container** (`.stack`, or anything
  `flex-direction:column`). In a column, flex-basis sets *height*, and the slide overflows.
- **`figure img` needs `min-height:0`** (it has it in `deck.css`). Without it, an image in a flex
  column overflows the moment a `<figcaption>` shares the box.
- **A `.cols` row followed by a sibling inside `.body` needs `flex:none`.** `.body` is a column flex
  container, so it will shrink the `.cols` box while the cards inside keep their height — they then
  paint over whatever follows. The stage-overflow scanner cannot see this one, only your eyes can.

## Theming

Colour and type tokens live in the `:root` block at the top of both `site/site.css` and
`deck/deck.css` — they are deliberately the same values, so site and slides read as one
system. Change `--accent` and `--canvas` and everything follows. For a one-off deck
palette, add `<style>:root{--accent:#7a3ea1}</style>` to that deck's `<head>`.

Dark mode: the site follows `prefers-color-scheme`; decks toggle with `t` and remember
the choice in `localStorage`.

## Animation

Two patterns, both pure CSS in `deck/deck.css`, both gated on `.slide.active` so they replay every
time you land on the slide. Shared easing throughout: `cubic-bezier(.16,1,.3,1)`.

**Staggered title.** Split the headline into words and they cascade in:

```html
<h1><span class="word">Late</span><span class="word">interaction,</span>
    <span class="word accent">up close</span></h1>
```

**Ambient loop.** A decorative `.signal` block (traced SVG paths + a drifting dot grid) runs
infinitely on title slides. Sibling paths get `.slow`, which applies a *negative* `animation-delay`
so they desynchronise immediately instead of waiting a cycle.

**Delay ladder.** The `.pipe` diagram reveals itself in stages — tokens at `.16s`, encoder `.3s`,
embeddings `.44s`, pool `.6s`, pooled vector `.78s`, score rail `.96s`, label `1.14s` — so the
audience reads it in the order you explain it. Per-arrow timing comes from an inline
`style="--d:.34s"`. See `knowledge/late-interaction-primer/` slide 2.

Everything is disabled under `@media (prefers-reduced-motion: reduce)`.

## Charts

Hand-written inline SVG (see `knowledge/decentralized-task-allocation/assets/tasks.svg`). Stays
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

## Site search

`/search/` searches the whole site with **inference-free SPLADE**, and puts the sparse vectors on
screen while it does. It runs on GitHub Pages with no inference server because SPLADE is asymmetric:

- **Documents** are encoded by a 67M-parameter masked LM
  ([`opensearch-neural-sparse-encoding-doc-v3-distill`](https://huggingface.co/opensearch-project/opensearch-neural-sparse-encoding-doc-v3-distill),
  Apache-2.0) into sparse vectors over BERT's 30,522-token vocabulary. That happens here, offline.
- **Passages** are the abstracts on `publications.html`, the slides, the projects and the CV
  rows — and, for the papers that may be redistributed, the *body* of the paper too.
  `content/publications/<id>.txt` is split on its numbered headings into passages the size of
  the rest of the corpus, each deep-linking to the paper it came from. The search UI never
  downloads these files — the browser only gets `index.json` — but the repo is uploaded to Pages
  as-is, so they are public, which is why only redistributable versions are kept here. The IEEE
  and Springer published versions are deliberately absent — indexing them
  would mean committing a publisher's typesetting to a public repository — so those two papers
  are still indexed from their abstracts alone.
- **Queries** need no model at all — just a WordPiece tokenizer and a static per-token weight table
  that ships as a text file. Scoring is a sparse dot product over every document; at this corpus
  size an inverted index would buy nothing.

So the browser downloads the table, the vocabulary and the postings, and `search/splade.js` does the
rest in about 200 lines with no dependencies. Retrieval is still the whole of `/search/`, and it is
still the whole of the front page until someone presses **Answer this** — see *The generated
answer* below, which is the one part of this site that talks to a server.

### The two search surfaces

`search/autocomplete.js` is the widget: a combobox whose listbox holds the top results — five on
`/search/`, four on the front page — each with its rank, kind, score and a bar splitting that score
by contributing term. Both pages use it and differ only in `onSelect`:

- **`/search/`** — pressing a result dissects it in the panels below, and the URL picks up
  `?q=…&r=<doc id>` so any view of the page is shareable.
- **the front page** — the `.asksite` band carries a compact copy, quotes the top hit back under
  *Closest passage*, and offers to generate an answer from it. Pressing a result hands off to
  `/search/?q=…&r=…`, so the reader lands on the analysis of the thing they picked.

Each row also carries a corner link straight to the source page, so you can skip the analysis. That
link is the one real `<a>` in a row: the row itself is a listbox option, activated by click or
Enter. Nothing is fetched until the box is focused, so the front page pays no bytes for this unless
someone actually searches, and nothing leaves the browser until someone presses a button.

### The generated answer

The front page band is a conversation. You ask, the page answers, and the answer carries the
passages it was built from. `/search/` is unchanged — it is still the surface that shows the
retrieval itself.

Retrieval has not moved: `search/splade.js` still scores every passage in the browser, and no
query is sent anywhere to be retrieved. Only generation leaves the machine, and only after
retrieval has already chosen the passages it may use.

Three things shape it:

- **Each question stands alone.** Nothing is carried between turns, so a follow-up is not
  understood as one. The thread is a record, not a memory, and the copy never implies otherwise.
- **Generation is the optional half.** If the worker 4xxs, 5xxs, is rate limited or simply is not
  there, the turn falls back to quoting the best retrieved passage. Retrieval alone is still an
  answer, so no failure leaves the reader with nothing. This is the common path in local
  development, where the worker rejects `localhost` on origin.
- **The analysis moved, it did not go.** Every turn has a *How this was retrieved* button opening
  the query terms and their weights, the ranked passages, and which of them the model was
  actually given. It renders with the same `.sp-opt` rows `/search/` uses, so the two agree by
  construction.

The worker behind it is `worker/`, on `ask.grontved.xyz` — its own hostname rather than a route on
`www`, so nothing it does can reach the static pages. If it breaks, runs out of quota, or is
deleted, the front page keeps working and stops offering to answer.

Two constraints on the worker:

- **The client sends passage ids, never passage text.** It resolves them against
  `search/corpus.json`, fetched from this site at runtime, so it can only generate from this
  site's own corpus. Fetching rather than bundling means CI never needs a Cloudflare deploy token.
- **Citations cannot be fabricated.** The model cites as bare `[1]`, `[2]` and never writes a URL.
  `search/home-search.js` resolves those against the ordered id list it sent, so an invented link
  is not representable — it stays plain text.

It stays free structurally rather than carefully: Workers Free has no overage billing, the account
carries no payment method, and Mistral stays on the Experiment tier, so every limit produces an
error rather than a charge. The caps inside the worker — 200 characters of question, an origin
check, a per-IP daily budget, a site-wide daily ceiling, an answer cache and a circuit breaker —
make that degradation rare and quiet; they do not prevent a bill that cannot happen.

Deploying it:

```bash
npx wrangler login
npx wrangler kv namespace create ASK_KV      # ids go in worker/wrangler.toml
npx wrangler secret put MISTRAL_API_KEY
npx wrangler secret put IP_SALT
npx wrangler deploy                          # from worker/
```

`wrangler deploy` claims the custom domain from `wrangler.toml`. The one WAF rate limiting rule
(`http.request.uri.path eq "/ask"`, 5 requests per 10 seconds per IP) is dashboard-only, and must
be scoped to that path: the free plan allows exactly one, and its expression can match on path but
not on hostname, so an unscoped rule would throttle the whole zone.

### Rebuilding the index

CI does this automatically: `.github/workflows/search-index.yml` rebuilds and commits the index on
any push touching `publications.html`, `projects.html`, `cv.html`, a deck, or the build script. That
commit then triggers `pages.yml`, which deploys it. You only need to do it by hand when working
offline:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu   # CPU wheel, much smaller
pip install -r tools/requirements.txt
python3 tools/build_search_index.py --dry-run    # extract and report, no model
python3 tools/build_search_index.py --out search # extract, encode, write the index
python3 tools/check_search_index.py              # client vs. reference implementation
```

The build writes `search/index.json` (postings and metadata), `search/qweights.u16.bin` (the query
table) and `search/vocab.txt` (line N is vocabulary token N). It also writes `search/corpus.json`,
the same passages without their vectors, which the answer worker reads — that one belongs to the
extraction stage, so `--dry-run` regenerates it in a second and it never needs torch.

### Adding content the index can reach

Results deep-link into real pages, so every indexed passage needs a stable fragment: `id` attributes
on `details.pub` and the thesis/supervision `dt` rows, on `a.card` in `projects.html`, and on
`ul.tl > li` in `cv.html`. Slides need nothing — `deck.js` already addresses them as `#N`.

Those ids are listed in `SLUG_MAP` in `tools/build_search_index.py`, and the extractor **fails the
build** if the HTML no longer matches, so a renamed section can't silently produce a dead link. Add
the `id` to the HTML and the slug to `SLUG_MAP` together.

`INCLUDE_CV_FACTS` is off: the CV's skills rows are `·`-separated lists, not passages, and SPLADE
produces noise from them.

## Regenerating the CV PDF

`assets/cv/cv.pdf` is generated from `assets/cv/cv-print.html` (a print-only variant of
`cv.html`, marked `noindex` and not linked from the site) using WeasyPrint, which honours real
CSS so the PDF uses the site's own tokens and webfonts:

```bash
uv tool install weasyprint          # once
weasyprint assets/cv/cv-print.html assets/cv/cv.pdf
```

Edit `cv.html` and `cv-print.html` together, then regenerate. `site/site.css` also carries an
`@media print` block, so `cv.html` prints cleanly straight from the browser.

## Deploy

Push to `master`. `.github/workflows/pages.yml` uploads and deploys. Custom domain
`www.grontved.xyz` is set by `CNAME`.
