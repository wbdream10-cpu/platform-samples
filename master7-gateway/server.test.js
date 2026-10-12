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

test('EVO provider error is not reported as a successful connection', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ code: 130, message: 'IP address is not in whitelist' }), { status: 200 });
  const res = await run(makeApp({ env: { EVO_API_TOKEN: 'token-value' }, fetchImpl }), '/providers/evo888h5/games');
  assert.equal(res.status, 502);
});

test('egress diagnostic returns the current service IP without credentials', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ ip: '203.0.113.9' }), { status: 200 });
  const res = await run(makeApp({ env: {}, fetchImpl }), '/diagnostics/egress-ip');
  assert.deepEqual(await res.json(), { ok: true, ip: '203.0.113.9' });
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


test('CLOTPLAY catalogue uses documented auth, pagination and excludes private fields', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ data: [{slug:'sample', name:'Sample', name_cn:'样板', is_maintenance:1, secret:'hidden', thumbnails:{en:{square:'https://example.test/a.png',portrait:'http://example.test/b.png'}}}], pagination:{current_page:2,last_page:3,per_page:100,total:201}, token:'hidden' }));
  };
  const res = await run(makeApp({env:{CLOTPLAY_OPERATOR_TOKEN:'private-token'},fetchImpl}), '/providers/clotplay/games?page=2');
  const data = await res.json();
  assert.equal(res.status,200);
  assert.ok(request.url.endsWith('/get-game-list?per_page=100&page=2'));
  assert.equal(request.options.headers.Authorization,'private-token');
  assert.equal(request.options.body,undefined);
  assert.equal(data.games[0].maintenance,true);
  assert.equal(data.games[0].thumbnails.en.portrait,null);
  assert.equal(data.pagination.total,201);
  assert.ok(!JSON.stringify(data).includes('hidden'));
  assert.ok(!JSON.stringify(data).includes('private-token'));
});
test('CLOTPLAY rejects missing configuration and bad pages without upstream calls', async () => {
  let calls=0;
  const fetchImpl=async()=>{calls++;throw new Error('unexpected');};
  assert.equal((await run(makeApp({env:{},fetchImpl}),'/providers/clotplay/games')).status,503);
  for (const page of ['0','-1','2x','9999999']) {
    assert.equal((await run(makeApp({env:{CLOTPLAY_OPERATOR_TOKEN:'token'},fetchImpl}),'/providers/clotplay/games?page='+page)).status,400);
  }
  assert.equal(calls,0);
});
test('CLOTPLAY upstream failure does not leak response credentials', async () => {
  const fetchImpl=async()=>new Response(JSON.stringify({secret:'hidden'}),{status:403});
  const res=await run(makeApp({env:{CLOTPLAY_OPERATOR_TOKEN:'token'},fetchImpl}),'/providers/clotplay/games');
  assert.equal(res.status,502);
  assert.deepEqual(await res.json(),{error:'clotplay_catalogue_failed',upstreamStatus:403});
});
