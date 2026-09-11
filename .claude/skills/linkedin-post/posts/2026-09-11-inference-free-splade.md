---
date: 2026-09-11
status: posted
about: blog/inference-free-splade
link: https://www.grontved.xyz/blog/inference-free-splade/
---

Semantic search does not need a server.

The box on my site knows that "finding someone lost in the woods" is a search and rescue question. No model in the browser, no GPU anywhere, €0 a month.

All the model work happens once, at index time, on a free CI runner. The reader downloads 288 KB, 930× smaller than the encoder that produced it, and scoring the whole index takes 0.7 ms.

Inference-free SPLADE. I wrote it up with the vectors read out loud, and the one query it fails. 🔥

https://www.grontved.xyz/blog/inference-free-splade/

---

**Why this one.** A flat claim, a fragment run of costs, one paragraph of mechanism with the
numbers, then the thing itself and the link. The limit is folded into the last line rather
than given a paragraph of its own. First two beats land at about 190 characters, so the claim
and the "€0 a month" line both sit above the "see more" fold.

**Not chosen.** Two alternatives, both in voice: one opening on interpretability ("Dense
embeddings ask you to trust them. A sparse one shows its working.") and one opening on the
failure ("My site's search cannot find 'cardiac arrest'"). The architectural claim, the one
that sounds impossible, won over the cleverer angles.
