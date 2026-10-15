/* ============================================================================
   prompt.js — what the model is told, kept separate so it reads on its own.

   This file is served publicly along with the rest of the repo, which is the
   point: the grounding contract is the interesting part of a RAG answer, and
   hiding it would only hide it from the people acting in good faith.

   The passages come from the site's own corpus and nowhere else. The model is
   given no ability to introduce a fact, and no URL to cite — citations are
   bare [n] markers that the client resolves against the same ordered id list
   it sent, so a hallucinated link is not representable.
   ============================================================================ */

export const SYSTEM = `You answer questions about Kasper Rømer Grøntved's website \
using ONLY the numbered passages provided.

Rules:
- Ground every claim in the passages. Never add facts from your own knowledge.
- Cite with bare bracketed numbers, like [1] or [2][3]. Never write a URL.
- If the passages do not answer the question, say so plainly in one sentence \
and name what they do cover. Do not guess, and do not apologise at length.
- Two to four sentences. No preamble, no restating the question, no sign-off.
- Plain prose only: no Markdown, no bold or italics, no headings, no bullet lists. \
The page shows your text verbatim, so formatting marks would appear as symbols.
- Each passage opens with where it comes from: the kind of source, the document, \
its date, and where in it the passage sits (section, slide or page). Use that to say which document a fact \
comes from when it helps (for example "the SAREnv paper" or "the late interaction \
primer"), and still cite with the bracketed number.
- Write in the same register as the site: plain, declarative, British spelling.`;

/**
 * A passage is headed by its provenance, one fact per line, so the model can tell a
 * paper's "Introduction" from a post's and say where a fact comes from. Entries from
 * a corpus built before the provenance fields existed fall back to title and meta.
 */
function header(p) {
  if (!p.source) return `${p.title}${p.meta ? ` (${p.meta})` : ''}`;
  const lines = [`Source: ${p.source}`, `Document: ${p.doc || p.title}`];
  if (p.date) lines.push(`Date: ${p.date}`);
  if (p.section) lines.push(`Where: ${p.section}`);
  if (p.page) lines.push(`Page: ${p.page}`);
  return lines.join('\n');
}

/** Number the passages in the order the client ranked them, so [n] maps to ids[n-1]. */
export function buildUser(question, passages) {
  const context = passages
    .map((p, i) => `[${i + 1}]\n${header(p)}\nText: ${p.text || p.snippet}`)
    .join('\n\n');
  return `${context}\n\nQuestion: ${question}`;
}
