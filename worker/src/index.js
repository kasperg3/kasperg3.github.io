/* ============================================================================
   ask-relay — a Cloudflare Worker that sits between grontved.xyz and Mistral.

   The site retrieves; this only writes up. SPLADE has already run in the
   browser and picked the best passages, so the page sends those along with the
   question and the Worker never touches the index. That keeps the site's claim
   true — retrieval really is inference-free — and keeps this stateless.

   It exists for one reason: a static site has nowhere to hide an API key.
   Everything before the call to Mistral is there to make the endpoint boring
   to attack — wrong origin, wrong method, too many requests, too much text,
   all refused before anything expensive happens.

   Deploy:  npx wrangler secret put MISTRAL_API_KEY
            npx wrangler deploy
   ============================================================================ */

const ALLOWED_ORIGINS = new Set([
  'https://www.grontved.xyz',
  'https://grontved.xyz',
]);

const MODEL        = 'mistral-small-latest';
const MAX_PASSAGES = 4;
const MAX_CHARS    = 1200;   // per passage
const MAX_QUESTION = 300;
const MAX_TOKENS   = 300;    // ~three sentences, and a hard cost ceiling

const SYSTEM = `You answer questions about Kasper Rømer Grøntved's website.
Use ONLY the numbered passages given to you. Cite them inline as [1], [2].
If they do not answer the question, say so in one sentence and stop — never
guess, and never use knowledge from outside the passages. Three sentences
maximum. Plain prose: no headings, no bullet points, no preamble.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    // A local preview origin is allowed only when one is configured, so it
    // cannot be left switched on in production by accident.
    const allowed = ALLOWED_ORIGINS.has(origin)
      || (env.DEV_ORIGIN && origin === env.DEV_ORIGIN);

    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST')    return reply({ error: 'POST only.' }, 405, cors);
    if (!allowed)                     return reply({ error: 'Origin not allowed.' }, 403, cors);

    // The rate limit is the control that actually does something: CORS stops
    // other sites, but anyone can set an Origin header from curl.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.ASK_LIMIT.limit({ key: ip });
    if (!success) {
      return reply({ error: 'Too many questions. Try again in a minute.' }, 429, cors);
    }

    let body;
    try { body = await request.json(); }
    catch { return reply({ error: 'Expected JSON.' }, 400, cors); }

    const question = String(body.question ?? '').trim().slice(0, MAX_QUESTION);
    const passages = Array.isArray(body.passages) ? body.passages.slice(0, MAX_PASSAGES) : [];
    if (!question || !passages.length) {
      return reply({ error: 'Send a question and at least one passage.' }, 400, cors);
    }

    const context = passages.map((p, i) =>
      `[${i + 1}] ${String(p.title ?? '').slice(0, 200)}\n` +
      `${String(p.text ?? '').slice(0, MAX_CHARS)}`
    ).join('\n\n');

    let upstream;
    try {
      upstream = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `Question: ${question}\n\nPassages:\n${context}` },
          ],
        }),
      });
    } catch (err) {
      console.log('mistral unreachable', String(err));
      return reply({ error: 'The model is unreachable right now.' }, 502, cors);
    }

    if (!upstream.ok) {
      // Log the status, return a generic message: upstream error bodies can
      // echo the request back, key included.
      console.log('mistral error', upstream.status);
      const msg = upstream.status === 429
        ? 'The model is busy. The passages below still stand.'
        : 'The model is unavailable right now.';
      return reply({ error: msg }, 502, cors);
    }

    const data = await upstream.json();
    const answer = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!answer) return reply({ error: 'The model returned nothing.' }, 502, cors);

    return reply({ answer, model: MODEL }, 200, cors);
  },
};

function reply(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
  });
}
