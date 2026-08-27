# ask-relay

A Cloudflare Worker that sits between the site and Mistral, so `/` can write up
a search result in prose instead of only quoting the passage that contains the
answer.

It exists because a static site has nowhere to hide an API key. Anything in the
page's JavaScript is public, and a scraped free-tier key gets drained by
someone else's chatbot within days. This is the smallest piece that has to run
somewhere you control.

**The site retrieves; this only writes up.** SPLADE has already run in the
browser and chosen the passages, so the Worker never sees the index and never
does a lookup. The page sends the question and the passages it found; the model
summarises them and cites them. That keeps the site's claim honest — the
retrieval really is inference-free — and keeps this stateless.

## Deploy

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put MISTRAL_API_KEY     # from console.mistral.ai
npx wrangler deploy
```

Deploy prints the hostname. Put it in `RELAY` at the top of `search/ask.js` and
push — with `RELAY` empty the button never renders and nothing is fetched, so
the site is safe to ship before this exists.

Check which models the account can actually reach before changing `MODEL` in
`src/index.js`; the catalogue moves:

```bash
curl -s https://api.mistral.ai/v1/models \
  -H "Authorization: Bearer $MISTRAL_API_KEY" \
  | python3 -c 'import sys,json;[print(m["id"]) for m in json.load(sys.stdin)["data"]]'
```

## Smoke test

The `Origin` header has to be one of the allowed ones, or you correctly get a 403:

```bash
curl -s https://ask-relay.<subdomain>.workers.dev \
  -H 'content-type: application/json' \
  -H 'Origin: https://www.grontved.xyz' \
  -d '{"question":"How do drones divide up a search area?",
       "passages":[{"title":"TrajAllocPy","text":"Decentralized trajectory task allocation."}]}'
```

`npx wrangler tail` in another terminal shows the upstream status, which is
logged rather than returned — a bad key shows up there as a 401.

## What protects it, and what does not

**CORS does not.** The origin check stops other *websites* using the endpoint.
It stops `curl` not at all — anyone can set an `Origin` header, as the smoke
test does. Treat the URL as public from the moment it ships.

What actually bounds the damage:

| Control | Where | Note |
|---|---|---|
| 8 requests/min per IP | `wrangler.toml` | Counted **per Cloudflare location**, not globally |
| 4 passages, 1200 chars each | `src/index.js` | Caps the prompt someone can inject |
| 300-char question | `src/index.js` | |
| `max_tokens: 300` | `src/index.js` | Hard ceiling on cost per call |
| Opt-in button | `search/ask.js` | No call happens until a reader asks for one |

Watch the Mistral console for the first week.

## Limits

| | Free allowance | |
|---|---|---|
| Worker requests | 100,000/day | Not the constraint |
| Worker CPU | 10 ms/request | Waiting on `fetch()` doesn't count, and a proxy is mostly waiting |
| Mistral free tier | ~1 req/sec | **This one.** Treat a 429 as normal and show the passage instead |

## Turning it off

```bash
npx wrangler delete          # the endpoint stops existing
```

Or revoke the key in the Mistral console — the Worker then 502s and the page
falls back on its own. Either way the site degrades to what it does today:
retrieval, a quoted passage, a link to the source. Setting `RELAY` back to `''`
removes the button entirely.
