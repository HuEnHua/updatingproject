import assert from 'node:assert/strict';
import save from './netlify/functions/save.mjs';

// Isolate the proxy from any real research backend.
process.env.GOOGLE_SHEET_WEBHOOK = '';
const health = await save(new Request('https://study.test/.netlify/functions/save'));
assert.equal((await health.json()).schema, 2);

const body = {
  schema: 2, stage: 'final', subjectId: 'TEST',
  records: [{ photoId: 'p005', prior: 0, report1: 40, report2: 65, priorMs: 1000 }],
  payment: { stage: 0, report: 0, won: false, prizeHKD: 0 },
};
const request = payload => new Request('https://study.test/.netlify/functions/save', {
  method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload),
});
const accepted = await save(request(body));
assert.equal(accepted.status, 200);
assert.equal((await accepted.json()).schema, 2);
assert.equal((await save(request({ ...body, schema: 1 }))).status, 400);

process.env.GOOGLE_SHEET_WEBHOOK = 'https://backend.test/save';
let forwarded;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://backend.test/save');
  forwarded = JSON.parse(options.body);
  return Response.json({ status: 'success', schema: 2 });
};
const proxied = await save(request(body));
assert.equal(proxied.status, 200);
assert.deepEqual(forwarded, body, 'Priors, zero values, timings, and stage-0 payment are forwarded unchanged');
assert.equal((await proxied.json()).schema, 2);
console.log('SAVE CHECKS PASS: schema 2 is accepted, old payloads are rejected, and priors are preserved.');
