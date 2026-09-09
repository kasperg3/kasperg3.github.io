/* ============================================================================
   index.js — the answer endpoint behind the "Ask this site" band.

   Retrieval already happened in the browser: search/splade.js scored all 78
   passages locally and the page has already quoted the best one back. This
   worker does only the part a static site cannot — it holds the Mistral key
   and generates a grounded answer from passages the reader has already seen.

   The client sends document *ids*, never passage text, so this can only ever
   generate from grontved.xyz's own corpus. That stops the expensive abuse
   (paste a document, get it summarised). It does not stop someone ignoring the
   passages and asking for a haiku — the answer to that is not architecture but
   arithmetic: 200 characters in, 220 tokens out, roughly one request per second
   worldwide. A worse toy than any public playground, so nobody will want it.

   Nothing here can produce a bill. Workers Free has no overage billing and the
   account carries no payment method, so every limit below fails to an error,
   never a charge — and every error the client sees means it simply leaves the
   retrieved passage on screen. Degrading is the design, not the exception.

   Layers, in the order a request meets them:
     L1  shape      — size, method, and a q short enough to be worthless
     L2  origin     — stops a third-party browser UI; stops zero scripts
     L3  visitor    — Cache API, salted hash: a daily budget and a brief hold
     L4  answer     — Cache API, keyed on the normalised question
     L5  breaker    — site-wide, and only for an upstream that is really down:
                      one KV write per incident, never per request
   ============================================================================ */

import { SYSTEM, buildUser } from './prompt.js';
import BUNDLED from '../corpus.json';

const MODEL = 'mistral-small-latest';
// The ?v= is a cache key, not a path. Cloudflare caches this by URL, so a
// corpus whose shape changes — a new field the prompt depends on — is not
// picked up until the old entry expires. Bump this when that happens.
const CORPUS_URL = 'https://www.grontved.xyz/search/corpus.json?v=2';
const ORIGIN = 'https://www.grontved.xyz';

const MAX_BODY = 4096;   // bytes, rejected before parsing
const MAX_Q = 200;       // characters — the cap that makes this worthless as an LLM
const MAX_IDS = 4;
const MAX_TOKENS = 220;
const IP_DAILY = 40;     // asks per IP per day
const GLOBAL_DAILY = 800; // asks site-wide per day, across every IP and colo
// Two pauses, because 429 and 402 are not the same incident, and they are not
// even the same *scope*. A rate limit is one visitor going too fast, so only
// that visitor waits, and briefly. Credit exhaustion and 5xx are the site's
// problem and really do last, so there everyone backs off for a quarter hour.
const RATE_SECS = 30;    // per visitor, in the Cache API — KV's TTL floor is 60
const BREAKER_SECS = 900; // site-wide, in KV

const CORS = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  // Retry-After is the header a 503 is supposed to carry, and a cross-origin
  // reader cannot see it unless we say so.
  'access-control-expose-headers': 'retry-after',
  vary: 'Origin',
};

/**
 * Every failure in here is temporary, and the page can say *how* temporary if
 * it is told. retry is that, in seconds: in the header because that is what
 * Retry-After is for, and in the body because the body needs no CORS ritual to
 * be readable and the page has to parse it anyway.
 */
const fail = (status, msg, retry) =>
  new Response(JSON.stringify(retry ? { error: msg, retryAfter: retry } : { error: msg }), {
    status,
    headers: {
      ...CORS,
      'content-type': 'application/json',
      ...(retry ? { 'retry-after': String(retry) } : {}),
    },
  });

/** The budget counters are keyed on a UTC date, so that is when they reset. */
const untilUTCMidnight = () => {
  const d = new Date();
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) / 1000;
  return Math.max(1, Math.ceil(midnight - Date.now() / 1000));
};

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* -------------------------------------------------------------------------
   The corpus, fetched from the site itself rather than baked in.

   Bundling it would mean `wrangler deploy` from CI to keep it in sync, which
   would mean a Cloudflare token with deploy scope sitting in GitHub Actions.
   One runtime fetch is a much better trade than a credential that can delete
   this worker. Network wait costs no CPU, and cf.cacheTtl makes it a colo hit.

   The memo holds the *promise*, so concurrent cold requests share one fetch —
   and is cleared on failure, because memoising a rejection would poison the
   isolate for its whole lifetime. corpus.json lives on www, not on this
   hostname, so this can never fetch itself.
   ------------------------------------------------------------------------- */
let corpusP = null;

function corpus() {
  // Five minutes, not an hour: the corpus changes when the site does, and an
  // hour of edge cache means an hour of answering from the previous corpus.
  // The isolate memo below is what actually keeps this cheap.
  corpusP ??= fetch(CORPUS_URL, { cf: { cacheTtl: 300, cacheEverything: true } })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`corpus ${r.status}`))))
    .catch(err => { corpusP = null; throw err; });
  return corpusP;
}

/** A day-scoped counter in the Cache API: no write quota, racy, and that is fine. */
async function overBudget(cache, key, limit, ctx) {
  const req = new Request(`https://ask.internal/${key}`);
  const hit = await cache.match(req);
  const n = hit ? Number(await hit.text()) || 0 : 0;
  if (n >= limit) return true;
  ctx.waitUntil(cache.put(req, new Response(String(n + 1), {
    headers: { 'cache-control': 'public, max-age=86400' },
  })));
  return false;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return fail(405, 'POST only');
    if (req.headers.get('Origin') !== ORIGIN) return fail(403, 'bad origin');

    /* ---- L1: shape. Check the declared length before reading anything. ---- */
    if (Number(req.headers.get('content-length')) > MAX_BODY) return fail(413, 'body too large');
    const raw = await req.text();
    if (raw.length > MAX_BODY) return fail(413, 'body too large');

    let body;
    try { body = JSON.parse(raw); } catch { return fail(400, 'bad json'); }

    const q = String(body?.q ?? '').trim();
    if (q.length < 3 || q.length > MAX_Q) return fail(400, `q must be 3..${MAX_Q} chars`);

    const ids = [...new Set(body?.ids ?? [])]
      .filter(i => typeof i === 'string' && i.length <= 48)
      .slice(0, MAX_IDS);
    if (!ids.length) return fail(400, 'no ids');

    const cache = caches.default;

    /* ---- L5: is the breaker open? One KV read; reads are effectively free. ---- */
    const state = await env.ASK_KV.get('ask:state', 'json').catch(() => null);
    if (state?.pausedUntil > Date.now() / 1000) {
      return fail(503, 'paused', Math.max(1, Math.ceil(state.pausedUntil - Date.now() / 1000)));
    }

    /* ---- L4: has this exact question been answered already? ---- */
    const sorted = [...ids].sort();
    const norm = q.toLowerCase().replace(/\s+/g, ' ');
    const answerKey = new Request(
      `https://ask.internal/a/${await sha256(`${MODEL}\0${norm}\0${sorted.join(',')}`)}`);
    const cached = await cache.match(answerKey);
    if (cached) {
      const h = new Headers(cached.headers);
      Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
      h.set('x-ask', 'cached');
      return new Response(cached.body, { headers: h });
    }

    /* ---- L3: per-visitor, keyed on a salted hash so no IP is ever stored ---- */
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const day = new Date().toISOString().slice(0, 10);
    const who = await sha256(`${env.IP_SALT ?? 'ask'}\0${ip}`);

    // The hold from this visitor's own last rate limit. In the Cache API rather
    // than KV for two reasons: KV's expirationTtl floor is 60s and a 30s hold is
    // the point, and per-colo is the right shape anyway — a visitor keeps
    // arriving at the same one. Someone else's pacing never lands here.
    const holdKey = new Request(`https://ask.internal/hold/${who}`);
    const held = await cache.match(holdKey);
    if (held) {
      const left = Math.ceil((Number(await held.text()) || 0) - Date.now() / 1000);
      if (left > 0) return fail(503, 'rate limited', left);
    }

    if (await overBudget(cache, `ip/${who}/${day}`, IP_DAILY, ctx)) {
      return fail(429, 'ip daily limit', untilUTCMidnight());
    }

    /* ---- resolve the ids against the corpus, bundled snapshot as the fallback ---- */
    let docs;
    try { docs = await corpus(); } catch { docs = BUNDLED; }
    const passages = ids.filter(id => Object.hasOwn(docs, id)).map(id => docs[id]);
    if (!passages.length) return fail(400, 'unknown ids');

    /* ---- the site-wide ceiling, checked last: nothing above here spends a
           model call, and this is the layer that bounds a distributed caller
           whom the per-IP budget cannot see. ---- */
    if (await overBudget(cache, `all/${day}`, GLOBAL_DAILY, ctx)) {
      return fail(429, 'site daily limit', untilUTCMidnight());
    }

    /* ---- generate ---- */
    let upstream;
    try {
      upstream = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.MISTRAL_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          temperature: 0.2,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: buildUser(q, passages) },
          ],
        }),
      });
    } catch {
      return fail(503, 'upstream unreachable');
    }

    // Trip the breaker on a real upstream problem: one KV write per incident,
    // never per request, and never awaited — an exhausted write quota must cost
    // us the accounting, not the feature.
    if (!upstream.ok || !(upstream.headers.get('content-type') || '').includes('text/event-stream')) {
      // Mistral says *which* 429 this is in the body, and a status alone cannot
      // tell "slow down" from "out of credit" — the difference between waiting
      // a minute and rotating the key. The body is already lost to the reader
      // at this point, so read it for the log; capped and flattened because a
      // stack of upstream HTML is not worth a tail line.
      let detail = '';
      try { detail = (await upstream.text()).replace(/\s+/g, ' ').trim().slice(0, 300); } catch {}
      console.warn(`mistral ${upstream.status} ${upstream.headers.get('content-type')} ${detail}`);

      // 402 and 5xx mean the upstream is gone for everyone, so the site waits.
      // A 429 means this visitor was too quick, so only this visitor waits —
      // one impatient reader must not be able to mute the band for the rest.
      // Any other 4xx is our own bug, and pausing anything would only hide it.
      const breaker = upstream.status === 402 || upstream.status >= 500 ? BREAKER_SECS : 0;
      const hold = upstream.status === 429 ? RATE_SECS : 0;
      if (breaker) {
        ctx.waitUntil(env.ASK_KV
          .put('ask:state', JSON.stringify({ pausedUntil: Date.now() / 1000 + breaker }),
               { expirationTtl: breaker })
          .catch(() => {}));
      }
      if (hold) {
        ctx.waitUntil(cache
          .put(holdKey, new Response(String(Date.now() / 1000 + hold), {
            headers: { 'cache-control': `public, max-age=${hold}` },
          }))
          .catch(() => {}));
      }
      return fail(503, 'upstream error', breaker || hold || undefined);
    }

    /* ---- pass the SSE through untouched ----
       No TransformStream: the browser parses SSE anyway, and clone() lets
       Cloudflare drain the cache copy with zero JavaScript per chunk. That is
       the difference between ~2ms of CPU and ~0.1ms against a 10ms budget. */
    const headers = {
      ...CORS,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'x-ask': 'live',
    };
    const res = new Response(upstream.body, { headers });
    ctx.waitUntil(cache.put(answerKey, res.clone()).catch(() => {}));
    return res;
  },
};
