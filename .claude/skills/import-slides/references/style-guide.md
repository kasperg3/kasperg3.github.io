# House style for decks under `/knowledge/`

Distilled from `knowledge/ml-and-data-at-colourbox/index.html`, the deck every new one
should sit next to without looking like a visitor. Read this whole file before writing a
slide. When in doubt, open the reference deck and copy the closest slide.

Contents: 1 Tokens · 2 Slide anatomy · 3 Deck arc · 4 Layout recipes · 5 Card semantics ·
6 Density · 7 Writing voice · 8 Translating Google Slides habits · 9 Images · 10 Gotchas

## 1. Tokens and type

Everything comes from `deck/deck.css`. Never hard-code a colour or a font name; use the
custom properties so a palette change reaches every deck.

| Token | Value | Used for |
| --- | --- | --- |
| `--canvas` | warm off-white `#f7f5f1` | slide background, with two faint radial washes |
| `--ink` / `--ink-2` | `#15181d` / `#2f3a44` | headlines / secondary headings |
| `--muted` / `--faint` | `#5c6672` / `#96a0ab` | body copy / captions, meta, kicker dots |
| `--accent` | teal `#1f6f68` | the one colour that means "look here": `.num`, `.word.accent`, kicker text, links |
| `--accent-2` | rust `#b4531f` | contrast, caveats, the "wrong way" column, orange chart marks |
| `--accent-3` | blue `#2c5f9e` | data, the second series in a chart |
| `--good` / `--bad` | green / red | tick and cross states only |
| `--dark` | `#12161b` | `.card.dark` background |
| `--serif` | Playfair Display | `h1`, `.num`, pull quotes |
| `--sans` | Inter | everything else |
| `--mono` | IBM Plex Mono | code, tokens, weights, file names |

Headlines are serif at 60px or so; the deck is text-first and unhurried. There are no
drop shadows on text, no gradients except `.grad` on a title word, no icons. Emphasis is
done with type weight, one accent colour and one dark card.

## 2. Slide anatomy

A content slide, top to bottom. Keep the order; the engine and the eye both expect it.

```html
<!-- ============ 7 · agentic search · cost ============ -->
<section class="slide tight" data-t="Tied on quality, 1,431× apart on cost">
  <div class="kicker"><span class="km"><i></i><i></i><i></i><i></i></span> Agentic search · cost</div>
  <h1 class="t sm">Tied on quality, 1,431× apart on cost</h1>
  <p class="sub">Agents don't search once. When a workflow fans out <strong>fifty queries where a
  person issued one</strong>, cost per query stops being a rounding error and becomes the architecture.</p>
  <div class="body">
    …one layout recipe from section 4…
  </div>
  <ul class="sources">
    <li><a href="https://arxiv.org/abs/2608.12875">The Embedder's Dilemma · El Assadi, Muennighoff &amp; Lee, COLM 2026</a></li>
  </ul>
  <div class="slide-foot">ML and data at Colourbox</div>
  <div class="notes">What to say out loud. First line is the point of the slide.</div>
</section>
```

- The HTML comment above each slide (`N · short name`) is how you navigate a 1,500-line file.
- `data-t` is the slide's title in the contents drawer and the browser tab. It usually equals the `h1`.
- `.kicker` is the running header: `Theme · sub-theme`, sentence case in the source, uppercased by CSS. Same theme text across a run of slides tells the audience where they are.
- `h1.t` is the headline. Add `.sm` when it would wrap to a third line.
- `p.sub` is the standfirst: one or two sentences, may `<strong>` the load-bearing phrase.
- `.body` holds exactly one layout recipe. It is a column flex box that fills the rest of the stage.
- `.sources` lists what backs the slide; `r` opens them. `.slide-foot` carries the deck's short title. `.notes` are speaker notes; `n` opens them.

Section, title and closing slides omit `.body`'s recipes, the foot and the sources:

```html
<section class="slide section" data-t="Search in our systems">
  <div class="kicker"><span class="km"><i></i><i></i><i></i><i></i></span> Part two</div>
  <h1>Search in our systems</h1>
  <p class="sub">One sentence that says what the next few slides will establish.</p>
  <div class="notes">…</div>
</section>
```

The title slide splits the headline into `<span class="word">` chunks for the staggered
reveal and tints one of them with `.accent`; `.meta` carries name, role and venue. Copy it
from `knowledge/_template/index.html`.

## 3. Deck arc

The reference deck is 32 slides for roughly 40 minutes and reads like an essay:

1. **Title.** Claim in the headline, the stakes in `.sub`.
2. **Who is talking.** Photo left (`img.me-photo`), three cards right: where I come from, what I do now, what I keep arguing about. Reuse `/knowledge/ml-and-data-at-colourbox/assets/kasper.webp`. Skip it for internal audiences who know the speaker.
3. **A section slide that asks the room something**, then the answer slide. Optional, but it is how the reference deck earns attention.
4. **Section slides** every four to eight content slides. Their `.sub` states what the section will show, and the contents drawer groups slides under them.
5. **Content slides** that each make one claim. If a source slide makes two, split it. If two source slides make one, merge them.
6. **Closing slide** (`class="slide section tight"` or `closing-slide`): a `.grid-4` or `.grid-2` of takeaway cards, then a `.card.dark` with the open questions. Not a "Thank you" slide; end on the argument.

A `.sub` on a section slide and the closing grid are where the deck's thesis lives. Write
them first, then fill the slides between.

## 4. Layout recipes

Six recipes cover every slide in the reference deck. Pick one per slide.

**A. Figure and a stack of cards.** The default for a slide with a chart, screenshot or photo.
Figure gets a fixed width; the stack takes the rest.

```html
<div class="body">
  <div class="cols" style="align-items:flex-start;flex:none">
    <figure style="flex:0 0 960px;min-height:0">
      <img class="zoom" src="assets/cost-recall.svg" alt="What the chart shows, in a sentence">
      <figcaption>Figure 1 from <a href="…"><em>Paper</em></a> · Venue year. Note the log scale.</figcaption>
    </figure>
    <div class="stack grow" style="gap:16px">
      <div class="card solid"><span class="num">0.4</span><h3>points apart</h3><p>…</p></div>
      <div class="card dark"><span class="num">1,431×</span><h3>the cost of closing it</h3><p>…</p></div>
    </div>
  </div>
</div>
```

To let the image take the width instead, swap roles: `figure.grow` with
`<img class="zoom" style="flex:1;min-height:0">`, and the stack gets `flex:0 0 620px`.

**B. Bullets and a number.** For a text-led slide with one figure worth pulling out.

```html
<div class="body">
  <div class="cols">
    <div class="grow">
      <ul class="bullets">
        <li><strong>Point one.</strong> Supporting clause.</li>
        <li><strong>Point two.</strong> Supporting clause.</li>
      </ul>
    </div>
    <div class="card solid" style="flex:0 0 480px">
      <span class="num">42</span><h3>Headline number</h3><p>What it measures and where it came from.</p>
      <div class="cap">source · date</div>
    </div>
  </div>
</div>
```

Three to five bullets. Each starts with a bold lead-in of two to five words.

**C. Grid of parallel cards.** For three or four items of equal weight: capabilities,
preconditions, takeaways, the columns of a comparison.

```html
<div class="body">
  <div class="grid-4">
    <div class="card"><h3>It has to see</h3><p>…</p><div class="cap">patches, not metadata</div></div>
    <div class="card"><h3>It has to be right</h3><p>…</p><div class="cap">near miss = failure</div></div>
    …
  </div>
  <div class="card dark" style="margin-top:30px;border-color:var(--accent)">
    <h3 style="color:var(--accent)">Which leaves the interesting questions open</h3>
    <p style="font-size:22px;margin-top:10px">…</p>
  </div>
</div>
```

`.grid-2` for two wide cards, `.grid-3` for three. Cap grid text at three sentences a card.

**D. Two-column argument.** Left the situation, right the consequence. Two `.stack.grow`
columns inside `.cols`, each holding two or three cards. Make the right column's last card
`.dark` so the eye lands on it.

**E. Pull quote or query.** A `.card.solid` whose first child is a `.cap` label and whose body is
one italic serif line, then cards that answer it:

```html
<div class="card solid">
  <div class="cap" style="margin:0 0 10px">the query</div>
  <p style="font:600 italic 27px/1.35 var(--serif);color:var(--ink)">"painting with a guy stuck in a mussel"</p>
</div>
```

**F. Code or formula.** `pre.code` with `.k` (keyword), `.s` (string), `.c` (comment) spans, at
most twelve lines. For maths, write it in HTML with `<sup>`, `<sub>` and the serif font; a
screenshot of a formula is not acceptable. Place the explanation in cards beside it.

Diagrams: the reference deck builds pipelines out of `.card`s in a `.cols` row with arrow
glyphs, or hand-written inline SVG using `fill="var(--accent)"`. Redraw a Google Slides
flow chart this way rather than pasting a screenshot of it, so the text stays searchable
and the palette stays consistent. Existing SVG figures live in `knowledge/_shared/figures/`;
reuse them when the topic overlaps.

## 5. Card semantics

The four card variants mean different things. Mixing them at random is the fastest way to
make a deck look off-brand.

| Class | Look | Meaning |
| --- | --- | --- |
| `.card` | translucent, hairline border | a neutral item in a set (grid items, pipeline stages) |
| `.card.solid` | white | a fact, a definition, a measured thing; the workhorse |
| `.card.dark` | near-black, white text | the punchline: the number that matters, "this is our problem", the open question. At most one per slide |
| `.card.accent` | teal-tinted | the speaker's position, the thing being argued |
| `.card` with `style="border-color:var(--accent-2)"` and an `h3` in `--accent-2` | rust outline | a caveat, a failure mode, the wrong way |

Inside a card: `.num` (big serif figure, optional) → `h3` (three to six words) → `p` (one to
three sentences) → `.cap` (provenance or a two-word tag, optional). Never more than that.

## 6. Density

The slide class sets how much fits.

- plain `.slide`: two or three cards, a figure, a short standfirst.
- `.tight`: smaller card padding and type. Use when a slide has a figure plus three cards, a long standfirst, or a two-column argument with six cards. Most content slides in the reference deck are `.tight`.
- `.roomy`: larger type. Use for a slide with very little on it (a question and two cards) so it does not float in empty canvas.
- `.dense`: for tables and card grids of six or more. Rare.

If a slide needs `.dense` and still overflows, it is two slides.

## 7. Writing voice

The house rules in `CLAUDE.md` apply to every string a reader can see, speaker notes and
alt text included: no em-dashes, no §, no "statement, which is X" asides.

- **Headlines are claims or questions, not topics.** "Filename search is hard to beat" rather than "Filename search". "Surely we can just increase the dimensions?" rather than "Dimensionality". Sentence case, no full stop, under 60 characters or add `.sm`.
- **The standfirst says why the slide exists.** One or two sentences a reader could take away if the slide vanished.
- **Bullets carry a bold lead-in.** Two to five words, then the clause. Never a bullet that is a single noun.
- **Numbers get a `.num`.** One number per card. Write the unit or the comparison in `h3` ("points apart", "the cost of closing it"), the provenance in `p` or `.cap`.
- **Sources are full citations.** `Title · Authors, Venue Year`, as a link when there is one. One `li` per source, listed on the slide that uses it.
- **Notes are stage directions to the speaker.** Imperative, first line is the point, blank line between paragraphs. Keep the source deck's speaker notes if they exist and tidy them; write two or three sentences if they do not.
- **Alt text describes what the image shows**, in one sentence, for someone who cannot see it. Not "chart" or "screenshot".
- Prefer the concrete noun the speaker would say out loud: "a stock contributor types eight keywords", not "metadata is sparse".

## 8. Translating Google Slides habits

What a Google Slides export contains and what it becomes here.

| In the source | In the deck |
| --- | --- |
| Section number chrome (`00 /`, `01 /`), overview markers (`◳ overview`), footers, slide numbers | Drop. The engine numbers slides and the kicker carries the running header |
| An uppercase label plus a subtitle at the top | Label becomes the kicker, subtitle becomes the `h1`, rewritten as a claim |
| A numbered feature list (01 … 04, each with a heading and a line) | Recipe C, `.grid-4` or two rows of `.grid-2`. The numbers go, or become `.cap` |
| A flow chart of boxes and arrows | Redraw: `.cols` of `.card`s with `→` between, or inline SVG. Never a screenshot of text |
| A bullet list of more than five | Split across slides or promote the strongest three to cards |
| A formula slide | Recipe F; HTML maths, explanation in cards |
| A screenshot or photo with a caption | Recipe A, `img.zoom`, `figcaption` with provenance |
| "Demo time" with a URL | A `.section` slide; the URL as a link in `.sub`; the demo plan in `.notes` |
| Material icon names leaking into text (`trending_up`, `verified_user`, `place`) | Drop them; they were icons |
| Emoji and ✓ ✕ ? markers in a diagram | Use `--good` / `--bad` coloured text or drop |
| A "Thank you" or "Questions?" slide | Replace with a closing grid of takeaways |
| Two talks exported as one file | Two decks. Say so in the report and ask which to import if unclear |
| Speaker notes | `.notes`, tidied |
| Hyperlinks | `.sources` on the slide that uses them |

The source deck's order is a suggestion. Reorder when the argument reads better; the
report at the end says what moved.

## 9. Images

- Everything lives in `knowledge/<slug>/assets/`. Rename from `s10-image4.png` to what it shows: `tagger-example.webp`, `pipeline.svg`.
- Re-encode anything over 300 KB or wider than 1800 px before committing (README, Images):
  ```bash
  python3 -c "
  from PIL import Image
  im = Image.open('in.png'); w = 1800
  im.resize((w, round(im.height*w/im.width)), Image.LANCZOS).save('assets/out.webp', quality=82, method=6)"
  ```
  Screenshots of UI stay PNG if they contain small text and are under the limit.
- Every `img` has an `alt`. `class="zoom"` on anything the audience would want to see larger.
- A tiny image (under 1 KB) in the export is a spacer or a bullet glyph. Drop it.
- Do not embed the speaker photo again; link the existing one.
- **A figure you cannot get yet** gets a placeholder in the figure's slot, so the layout is final
  and the checker counts what is missing:
  ```html
  <figure style="flex:0 0 620px;min-height:0">
    <div class="fig-todo"><span class="todo">Range plot from the defence deck (source slide 30)</span></div>
    <figcaption>What the figure will show, with provenance.</figcaption>
  </figure>
  ```
  with, in the deck's `<style>`: `.fig-todo{flex:1;min-height:360px;display:flex;align-items:center;
  justify-content:center;text-align:center;border:2px dashed var(--hair);border-radius:18px;padding:32px;
  color:var(--faint);font:400 20px/1.5 var(--sans)}`.

## 10. Gotchas the engine cannot catch

From the README, each of which has cost a debugging round:

- **Never put `flex:0 0 NNNpx` on a child of a column container** (`.stack`, `.body`, or anything `flex-direction:column`). In a column, flex-basis sets height, and the slide overflows. Width goes on children of `.cols`.
- **`figure img` needs `min-height:0`** when a `figcaption` shares the box, or the image overflows.
- **A `.cols` row followed by a sibling inside `.body` needs `flex:none`** on the row, or the cards paint over what follows.
- **Per-deck styles lose to `.card p`.** A class like `.formula` on a paragraph inside a card is
  overridden by `deck.css`'s `.card p` rule (higher specificity). Write `.card p.formula` in the
  deck's `<style>`.
- The stage is 1920×1080 and never scrolls. Anything outside it is invisible. Screenshot every slide with `scripts/snap_deck.sh` and look.
