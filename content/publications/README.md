Full text of the publications, used only at build time.

`tools/build_search_index.py` splits each file on its numbered headings and
indexes the sections, so a search can reach the body of a paper rather than
only its abstract. The search UI never downloads these files — the browser gets
`search/index.json` — but the repo is uploaded to Pages as-is, so they are
reachable at `/content/publications/`, and `search/corpus.json` carries the same
passages for the answer worker. Everything here is public.

Only versions that may be redistributed are kept here — the MDPI article is
CC-BY, the SDU portal copies are self-archived accepted manuscripts, the
volcanic-plume text is the author preprint, and two are chapters of the PhD
thesis. The IEEE and Springer *published* versions are deliberately absent:
adding them would republish a publisher's typesetting in a public repository.
Those two papers are still indexed from their abstracts, as before.
