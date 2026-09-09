# CLAUDE.md

Plain static HTML site, no build step. `README.md` describes the layout, the search
index build and the Cloudflare Worker; read it before touching `search/` or `worker/`.

Decks under `knowledge/` share one visual language. To add one from Google Slides, a `.pptx`
or a `.pdf`, use the `import-slides` skill (`.claude/skills/import-slides/`); for any new or
edited deck, run its `scripts/check_deck.py` and look at `scripts/snap_deck.sh` output before
committing.

## Writing rules for blog posts and page copy

These apply to everything a reader sees: headings, prose, figure captions, table cells,
SVG text and alt text.

- **No em-dashes (—).** Use a comma, a colon, a full stop, or a new sentence instead.
  The only place one may appear is the `<title>` separator, `Page — Kasper Rømer Grøntved`,
  because every page on the site already uses it.
- **No "statement, which is X" appositives.** Do not tack a comment onto a sentence with a
  trailing relative clause ("The asymmetry, which is the whole trick", "..., which is the
  price", "..., which is exactly right"). Make the comment its own sentence, or rewrite
  with "so", "and that", or a colon. A plain restrictive relative clause ("the Worker,
  which holds the API key") is fine; the rule targets the editorial aside.
- **No § symbol.** Write out "Section 5", both for internal cross-references and when
  citing a section of a paper ("SAREnv, Section 4").
