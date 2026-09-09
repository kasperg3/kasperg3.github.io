---
name: import-slides
description: Convert a Google Slides presentation, or an exported .pptx or .pdf of one, into a hand-written HTML deck under knowledge/<slug>/ using this site's deck engine and house style, so it looks like knowledge/ml-and-data-at-colourbox. Use whenever the user mentions importing, converting, porting, migrating or adapting slides, a talk, a presentation, a Google Slides link, a Drive presentation or a .pptx into the site, adding a talk to /knowledge/, or making a deck "look like the others", even if they never say "import". Also use when asked to rebuild or restyle an existing knowledge deck to the common look and feel.
---

# Import slides into a knowledge deck

The site's decks are not exported from Slides; they are written by hand as one HTML file
each, on a fixed 1920×1080 stage, in a shared visual language. Importing a Google Slides
deck therefore means rewriting it in that language, not converting it. The source deck
supplies the argument, the numbers, the images and the speaker notes; this skill supplies
the form.

**The words get rewritten; the pictures come over.** Every figure the audience saw on a
source slide reaches the deck: photos, screenshots, plots, charts, renders, diagrams. The
extractor lifts them out of the file, and what the file does not store as an image (a
chart, a SmartArt block, a drawing made of shapes) it crops out of a render of the slide.
`check_deck.py` reads the manifest the extractor leaves behind and fails the deck if a
figure went missing, so a `.todo` placeholder where the source had a real figure is a bug,
not a draft.

Read these before writing a slide, in this order:

1. `CLAUDE.md` at the repo root: the writing rules (no em-dash, no §, no "statement, which is X").
2. `README.md`, sections "Adding a deck", "How the deck engine works", "Slide building blocks", "Layout gotchas".
3. `references/style-guide.md` in this skill: the house style distilled from the reference deck, with copy-ready recipes and a table for translating Slides habits.
4. `knowledge/_template/index.html` as the starting file, and `knowledge/ml-and-data-at-colourbox/index.html` as the model to imitate.

## 1. Get the source deck

The user may give a Google Slides URL, a deck title, or a local file.

- **URL.** The file id is the segment after `/presentation/d/` in `https://docs.google.com/presentation/d/<id>/edit`.
- **Title only.** Search Drive: `mcp__Google_Drive__search_files` with
  `mimeType = 'application/vnd.google-apps.presentation' and title contains '<words>'`. Do not put the word "slides" in the title clause. If several match, list them with modified dates and ask which.
- **Local `.pptx` or `.pdf`.** Skip to step 2.

Export the presentation as PowerPoint, which keeps speaker notes, hyperlinks and the
original images:

```
mcp__Google_Drive__download_file_content
  fileId: <id>
  exportMimeType: application/vnd.openxmlformats-officedocument.presentationml.presentation
```

The result is JSON `{content: <base64>, title, mimeType}`. For any real deck it exceeds the
tool's inline limit and is saved to a file whose path the result names. Decode it:

```bash
jq -r .content <saved-result.json> | base64 -d > "$SCRATCH/deck.pptx"
```

If the result came back inline, write the `content` string to a file and decode the same way.

**Always export the PDF as well** (`exportMimeType: application/pdf`, same decode). It is
both the parity reference and the fallback source of every figure: `extract_pptx.py`
renders it instead of asking LibreOffice to convert the `.pptx` when you pass `--pdf`, and
`extract_pdf.py` works from it alone. Open a few pages with the Read tool to see what each
slide looked like; you need that to judge what a diagram meant and which images matter.
`mcp__Google_Drive__read_file_content` gives a quick text-only skim but drops notes and
images, so use it for orientation only.

**When the .pptx export fails.** Google refuses to export presentations above roughly
10 MB ("File too large for export"), and the direct
`docs.google.com/presentation/d/<id>/export/pptx` URL is often blocked by the environment's
network policy. The PDF export usually still works, and it carries the figures:

1. Export the PDF and run `extract_pdf.py` (step 2). Embedded images come out as files;
   anything drawn as vectors gets cropped out of the page renders with `crop_figure.py`.
   That is the whole picture set, at parity, without the `.pptx`.
2. `mcp__Google_Drive__read_file_content` returns the full text of every slide. Use it for
   the words, since a PDF's text comes out in reading order rather than by shape.
3. Speaker notes are the one thing neither route recovers. Say so in the report and write
   two or three sentences of `.notes` per slide yourself.
4. Only if the PDF is refused too: say so, and ask the user to drop an export (File →
   Download in Slides) into the session. Placeholders are the last resort, not the first.

## 2. Extract the raw material

Choose the slug first: lowercase, hyphenated, the talk's subject rather than its venue
(`face-recognition-in-a-dam`, not `demo-slides-june`).

From a `.pptx`, with the PDF alongside it when you have one:

```bash
python3 .claude/skills/import-slides/scripts/extract_pptx.py "$SCRATCH/deck.pptx" \
  --pdf "$SCRATCH/deck.pdf" \
  --out "$SCRATCH/outline.md" --assets knowledge/<slug>/assets
```

From a `.pdf` alone:

```bash
python3 .claude/skills/import-slides/scripts/extract_pdf.py "$SCRATCH/deck.pdf" \
  --out "$SCRATCH/outline.md" --assets knowledge/<slug>/assets
```

Either way you get three things.

**`outline.md`**, one section per slide in presentation order: text shapes, hyperlinks,
images and speaker notes, then a **parity checklist** listing every figure-sized visual
with the slide it came from. Read the whole outline before designing anything, and treat
the checklist as the deck's figure budget.

**`knowledge/<slug>/assets/`**, holding the images. Pictures come out cropped and rotated
as the slide had them, SVG in preference to a raster fallback, deduplicated (one file for a
logo that appeared twenty times), and re-encoded to WebP at 1800 px when they were over the
size limits. Charts, SmartArt, tables, grouped drawings and clusters of loose shapes have
no image to copy, so they are cropped out of the render instead and land as
`sNN-drawing-N.webp`. Alongside them sits `source-images.json`, the manifest.

**`knowledge/<slug>/.source-pages/page-NN.png`**, a render of every source slide (git
ignores it). This is the parity reference. Open the pages for the slides you are about to
write, and compare them against `snap_deck.sh` output at the end.

If the render step reports that it could not run, fix that before writing the deck: pass
`--pdf` with a PDF export, or install LibreOffice and poppler. Without renders, every chart
and drawing on the source slides is invisible to the importer, and the deck silently loses
figures. If a figure is still not resolved to a file, the outline says so under "Not
resolved to an image"; crop it by hand:

```bash
python3 .claude/skills/import-slides/scripts/crop_figure.py \
  knowledge/<slug>/.source-pages/page-30.png --rect 6,24,52,60 \
  --assets knowledge/<slug>/assets --name range-plot
```

`--rect` is x,y,width,height in percent of the page, read off the render. The crop is
recorded in the manifest, so it counts towards parity like any other figure.

## 3. Plan the arc before writing HTML

Google Slides decks accumulate; this format argues. Decide, and write down in a scratch
note, before touching the template:

- The deck's **thesis** in one sentence. It becomes the title slide's `.sub` and drives the closing grid.
- The **short title** for `.slide-foot` (three or four words).
- The **sections**, each with the sentence its section slide will carry.
- A **mapping**: for every source slide, which recipe from the style guide it becomes (A to F), or whether it merges with a neighbour, splits in two, or is dropped as chrome. Two talks exported as one file are two decks; say so and import the one asked for.
- A **home for every figure** in the parity checklist: which slide shows it and what it is renamed to. A figure whose slide merges into a neighbour goes on the merged slide; a figure whose slide is dropped moves to the slide that inherits its point. The few you genuinely do not want get written off in the manifest, with the reason, in step 5. Do not plan a deck whose figure budget is smaller than the checklist without knowing which lines you are spending and which you are refusing.

A source deck of 14 slides typically becomes 12 to 18 here: chrome slides go, dense ones
split, and section slides are added.

## 4. Write the deck

```bash
cp -r knowledge/_template knowledge/<slug>
```

Then rewrite `knowledge/<slug>/index.html` slide by slide following the style guide. The
things that most often go wrong when this is rushed:

- Headlines copied as topic labels instead of rewritten as claims. Every `h1` should be a sentence someone could disagree with, or a question.
- Card variants used decoratively. `.dark` is the punchline, once per slide; `.accent` is the argument; `.solid` is a fact. See the style guide, section 5.
- Speaker notes dropped. The source notes go into `.notes`, tidied. Slides without notes get two or three sentences of what to say.
- Sources missing. Every link in the source deck belongs in a `.sources` list on the slide that uses it, as a full citation.
- Figures left out. A slide that made its point with a plot needs that plot, not a paragraph describing it.
- Boxes-and-arrows diagrams pasted as images. Those, and only those, get rebuilt from cards or inline SVG so they use the palette and stay searchable; step 5 says what to do with the image they replace.
- The `<title>`, meta description, `data-t` on every slide, `active` on the first, and the `.slide-foot` short title.

Mark anything you could not resolve from the source with `<span class="todo">…</span>` and
put `<div class="draft-flag">Draft</div>` on the title slide if the deck is not ready to
present. A placeholder is for a figure that does not exist yet, never for one the source
deck had. Do not invent numbers, names or citations the source did not contain. A DOI or URL
that is not in the source, in `publications.html`, or verifiable right now stays out: cite the
paper as plain text in `.sources` rather than guess a link.

## 5. Images: parity, then polish

The deck is at parity when every figure in the outline's parity checklist is either on a
slide or written off in the manifest. Work through it:

1. **Place them.** Rename each file to what it shows (`s10-image4.png` → `tagger-example.webp`),
   write real `alt` text, and put it on the slide that inherited its point. Recipe A is the
   default frame; the style guide, section 9, has the rest.
2. **Write off the ones you do not want**, in `assets/source-images.json`, with a reason
   that would satisfy the speaker:
   ```json
   "dropped": [
     {"file": "s04-image7.png", "reason": "venue logo, chrome the engine does not need"},
     {"file": "s12-drawing-3.webp", "reason": "redrawn as inline SVG on slide 9, same stages and labels"}
   ]
   ```
   Chrome, duplicates of a figure already on another slide, and a boxes-and-arrows diagram
   you rebuilt in HTML are all fair reasons. "Did not fit the layout" is not: find it a
   slide or split the slide. `check_deck.py` fails on a missing reason, and small logos and
   spacers are written off for you (`auto_drop` in the manifest).
3. **Redraw only what redrawing improves.** A flow chart of labelled boxes becomes `.cols`
   of `.card`s or inline SVG, and the source image gets written off as above. A plot, a
   chart with real data, a screenshot, a photo, a render or a map is never "redrawn": it is
   evidence, and a hand-drawn imitation of it invents data. Use the image.
4. **Check the sizes.** The extractor re-encodes anything over 300 KB or 1800 px, but a
   crop you took by hand at high dpi may still be over; the outline lists what is left.

The assets directory ends up holding the files the deck references plus
`source-images.json`. Delete the rest once the manifest accounts for them.

## 6. Register the deck

Three places, all required for the deck to be findable:

1. `knowledge/index.html`: a card in Featured or Archive. Archive card shape:
   ```html
   <a class="card" href="/knowledge/<slug>/">
     <span class="tag">Internal talk · 20 min</span>
     <h3>Deck title</h3>
     <p>Two or three sentences on what the deck establishes.</p>
     <div class="foot"><span class="pill">N slides</span><span class="pill">Topic</span></div>
   </a>
   ```
2. `sitemap.xml`: `<url><loc>https://www.grontved.xyz/knowledge/<slug>/</loc><priority>0.7</priority></url>`.
3. `tools/build_search_index.py`: add `("<slug>", "Deck title")` to `DECKS`, so the site search indexes the slides. CI rebuilds the index on push; do not commit `search/index.json` by hand.

## 7. Verify, then look

```bash
python3 .claude/skills/import-slides/scripts/check_deck.py knowledge/<slug>/index.html
.claude/skills/import-slides/scripts/snap_deck.sh <slug>
```

`check_deck.py` fails on broken engine rules, images that do not resolve, source figures
that never arrived, the flex-basis gotcha and the writing rules, and warns about
registration. It is not a substitute for looking. `snap_deck.sh` writes one PNG per slide
at stage size; open every one with the Read tool and check for text past the stage edge,
cards painting over a neighbour, a squashed image, an empty half. Fix, re-run both, repeat
until clean.

Then put the two sets of renders side by side: `knowledge/<slug>/.source-pages/page-NN.png`
against the snapshot of the slide that replaced it. The words should have changed and the
figures should not. A figure that is cropped tighter, stretched, or shrunk to a thumbnail
of what the audience saw is not at parity either.

The existing decks predate the em-dash rule, so running the checker on them fails; that is
expected and not yours to fix unless asked.

## 8. Report

Finish with a short mapping table, source slide → new slide and recipe, plus what was
merged, split or dropped and why; the figure ledger (how many of the parity checklist's
figures are placed, and every one written off with its reason); the list of `.todo`
markers; and the three registration edits. If any figure came over as a crop of a render
rather than as an image the file contained, say which, so the user can supply a better
original. Do not open a pull request unless asked. Commit only when asked.
