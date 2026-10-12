'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeApp, megaSignature } = require('./server');

async function run(handler, path, options = {}) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try { return await fetch(`http://127.0.0.1:${port}${path}`, options); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('health exposes readiness without secrets', async () => {
  const env = { EVO_API_TOKEN: 'private', MEGA_OPERATOR_ID: 'operator', MEGA_SECRET_KEY: 'secret', PUBLIC_BASE_URL: 'https://example.test', CURRENCY: 'MYR' };
  const res = await run(makeApp({ env }), '/health');
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.configured.evo888h5, true);
  assert.equal(data.callbackUrls.pgsoft, 'https://example.test/callbacks/pgsoft');
  assert.equal(JSON.stringify(data).includes('private'), false);
  assert.equal(JSON.stringify(data).includes('secret'), false);
});

test('MegaH5 catalog signs the documented fields', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ Status: 200, Game: [] }), { status: 200 });
  };
  const env = { MEGA_OPERATOR_ID: 'master7', MEGA_SECRET_KEY: 'secret', MEGA_BASE_URL: 'https://provider.test/api', CURRENCY: 'MYR' };
  const fixed = new Date('2026-10-12T10:00:00Z');
  const res = await run(makeApp({ env, fetchImpl, now: () => fixed }), '/providers/megah5/games');
  assert.equal(res.status, 200);
  assert.equal(request.url, 'https://provider.test/api/GetGameList');
  assert.equal(request.body.Currency, 'MYR');
  assert.equal(request.body.Signature, megaSignature('GetGameList', '2026-10-12T10:00:00Z', 'master7', 'secret'));
});

test('EVO catalog uses bearer token and hides it from response', async () => {
  let authorization;
  const fetchImpl = async (_url, options) => {
    authorization = options.headers.Authorization;
    return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
  };
  const res = await run(makeApp({ env: { EVO_API_TOKEN: 'token-value' }, fetchImpl }), '/providers/evo888h5/games');
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(authorization, 'Bearer token-value');
  assert.equal(JSON.stringify(data).includes('token-value'), false);
});

test('admin routes reject missing token', async () => {
  const res = await run(makeApp({ env: { GATEWAY_ADMIN_TOKEN: 'x'.repeat(32) } }), '/admin/evo888h5/player', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userid: 'test1' }) });
  assert.equal(res.status, 401);
});

test('callback URLs are reachable but do not accept unsigned events', async () => {
  const handler = makeApp({ env: {} });
  const check = await run(handler, '/callbacks/pgsoft');
  assert.equal(check.status, 200);
  const event = await run(handler, '/callbacks/pgsoft/Bet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(event.status, 503);
});
