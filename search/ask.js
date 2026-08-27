/* ============================================================================
   ask.js — the optional generated answer.

   SPLADE retrieval is the feature; this is a layer on top of it. The page has
   already found and quoted the best passage before anything here runs, and if
   this fails, is switched off, or is never deployed, the reader still has the
   passage and its link. That ordering is deliberate: the evidence comes first
   and the summary is a convenience, which is what makes a wrong answer
   survivable.

   Generation is opt-in behind a button rather than firing as you type.
   Retrieval is free and instant; a language model is neither, and calling one
   on every keystroke would empty a free tier in an afternoon.

   To switch it on, deploy worker/ and put its URL in RELAY below.
   With RELAY empty the button never renders and nothing is fetched.
   ============================================================================ */

/** The deployed ask-relay Worker. Empty string = feature off. */
export const RELAY = '';

export const relayEnabled = () => RELAY !== '';

/**
 * Ask the relay to write up passages the browser already retrieved.
 *
 * @param {string} question
 * @param {Array<{doc:{title:string,snippet:string}}>} hits  ranked SPLADE hits
 * @param {{signal?:AbortSignal}} [opts]
 * @returns {Promise<string>} the answer text
 * @throws {Error} with a message written for a reader, not a log
 */
export async function askRelay(question, hits, opts = {}) {
  if (!relayEnabled()) throw new Error('No relay configured.');

  const response = await fetch(RELAY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      question,
      passages: hits.slice(0, 4).map(h => ({
        title: h.doc.title,
        text: h.doc.snippet,
      })),
    }),
  });

  let data = {};
  try { data = await response.json(); } catch { /* fall through to status */ }

  if (!response.ok) {
    throw new Error(data.error || `The model is unavailable (${response.status}).`);
  }
  if (!data.answer) throw new Error('The model returned nothing.');
  return data.answer;
}
