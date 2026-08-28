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
- Write in the same register as the site: plain, declarative, British spelling.`;

/** Number the passages in the order the client ranked them, so [n] maps to ids[n-1]. */
export function buildUser(question, passages) {
  const context = passages
    .map((p, i) => `[${i + 1}] ${p.title}${p.meta ? ` — ${p.meta}` : ''}\n${p.snippet}`)
    .join('\n\n');
  return `${context}\n\nQuestion: ${question}`;
}
