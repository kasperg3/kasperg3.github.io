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

**When the export fails.** Google refuses to export presentations above roughly 10 MB
("File too large for export"), and the direct `docs.google.com/presentation/d/<id>/export/pptx`
URL is often blocked by the environment's network policy. In that case:

1. `mcp__Google_Drive__read_file_content` still returns the full text of every slide (no notes,
   no images). It is enough to write the deck from.
2. Figures come from what is already in the repo (`assets/img/`, other decks' `assets/`,
   `knowledge/_shared/figures/`), from inline SVG you draw, or from a placeholder (style guide,
   section 9). Do not paste screenshots you cannot get.
3. Say in the report that the export was refused, and ask the user to add the missing figures or
   drop a `.pptx` export (File → Download in Slides) into the session for a second pass.

Also export a PDF (`exportMimeType: application/pdf`, same decode) and open it with the
Read tool, a few pages at a time. The PDF shows what each slide looked like, which the text
export cannot; you need it to judge what a diagram meant and which images matter.
`mcp__Google_Drive__read_file_content` gives a quick text-only skim but drops notes, so use
it for orientation only.

## 2. Extract the raw material

```bash
python3 .claude/skills/import-slides/scripts/extract_pptx.py "$SCRATCH/deck.pptx" \
  --out "$SCRATCH/outline.md" --assets knowledge/<slug>/assets
```

`outline.md` has one section per slide in presentation order: text shapes, hyperlinks,
images (copied into the assets directory as `sNN-imageN.ext`, with size and pixel
dimensions) and speaker notes. Images over 300 KB or 1800 px are listed at the end for
re-encoding. Read the whole outline before designing anything.

Choose the slug now: lowercase, hyphenated, the talk's subject rather than its venue
(`face-recognition-in-a-dam`, not `demo-slides-june`).

## 3. Plan the arc before writing HTML

Google Slides decks accumulate; this format argues. Decide, and write down in a scratch
note, before touching the template:

- The deck's **thesis** in one sentence. It becomes the title slide's `.sub` and drives the closing grid.
- The **short title** for `.slide-foot` (three or four words).
- The **sections**, each with the sentence its section slide will carry.
- A **mapping**: for every source slide, which recipe from the style guide it becomes (A to F), or whether it merges with a neighbour, splits in two, or is dropped as chrome. Two talks exported as one file are two decks; say so and import the one asked for.
- Which **images** survive, what each will be renamed to, and which diagrams are redrawn as cards or SVG instead of pasted.

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
- Diagrams pasted as images. Rebuild them from cards or inline SVG so they use the palette and stay searchable.
- The `<title>`, meta description, `data-t` on every slide, `active` on the first, and the `.slide-foot` short title.

Mark anything you could not resolve from the source with `<span class="todo">…</span>` and
put `<div class="draft-flag">Draft</div>` on the title slide if the deck is not ready to
present. Do not invent numbers, names or citations the source did not contain. A DOI or URL
that is not in the source, in `publications.html`, or verifiable right now stays out: cite the
paper as plain text in `.sources` rather than guess a link.

## 5. Images

Rename the extracted files to what they show, re-encode the large ones (style guide,
section 9), write real `alt` text, delete what you did not use. The assets directory
should contain only files the deck references.

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

`check_deck.py` fails on broken engine rules, missing images, the flex-basis gotcha and
the writing rules, and warns about registration. It is not a substitute for looking.
`snap_deck.sh` writes one PNG per slide at stage size; open every one with the Read tool
and check for text past the stage edge, cards painting over a neighbour, a squashed image,
an empty half. Fix, re-run both, repeat until clean.

The existing decks predate the em-dash rule, so running the checker on them fails; that is
expected and not yours to fix unless asked.

## 8. Report

Finish with a short mapping table, source slide → new slide and recipe, plus what was
merged, split or dropped and why; the list of `.todo` markers; and the three registration
edits. Do not open a pull request unless asked. Commit only when asked.
