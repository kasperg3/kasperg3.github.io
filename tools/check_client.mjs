/* Drive search/splade.js from node so the Python reference can check it.
 *
 * Reads the built index off disk (the browser's `load()` uses fetch, which node
 * has no file:// story for, so this constructs Splade directly — which is why
 * the class is exported).
 *
 * Usage: node tools/check_client.mjs queries.json [index-dir] > out.json
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Splade } from '../search/splade.js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[3] ? resolve(process.argv[3]) : join(here, '..', 'search');

const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
const vocab = readFileSync(join(dir, 'vocab.txt'), 'utf8');
const raw = readFileSync(join(dir, 'qweights.u16.bin'));
const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
const qw = new Uint16Array(raw.byteLength / 2);
for (let i = 0; i < qw.length; i++) qw[i] = view.getUint16(i * 2, true);

const engine = new Splade(index, vocab, qw);
const queries = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const result = queries.map(q => {
  const { terms } = engine.encodeQuery(q);
  const { results } = engine.search(q, 10);
  return {
    query: q,
    tokens: terms.map(t => t.token),
    weights: terms.map(t => t.weight),
    scores: results.map(r => [r.doc.id, r.score]),
  };
});

process.stdout.write(JSON.stringify({
  vocabSize: engine.vocabSize,
  docs: engine.docs.length,
  queries: result,
}, null, 1));
