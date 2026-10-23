'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeApp } = require('./server');
const { gspayPeerCredential, gspayReadiness } = require('./readiness');

const orderToken = 'G'.repeat(48);
const queryToken = 'H'.repeat(48);
const callbackToken = 'I'.repeat(48);
const env = {
  PUBLIC_BASE_URL: 'https://gateway.example.test',
  GSPAY_MODE: 'uat',
  GSPAY_OPERATOR_AUTH_KEY: 'fixture-authentication-key',
  GSPAY_OPERATOR_SECRET_KEY: 'fixture-secret-key',
  PLATFORM_GSPAY_ORDER_TOKEN: orderToken,
  PLATFORM_GSPAY_QUERY_TOKEN: queryToken,
  PLATFORM_GSPAY_CALLBACK_TOKEN: callbackToken,
  GSPAY_MYR_ORDERS_ENABLED: 'true',
  GSPAY_MYR_QUERIES_ENABLED: 'true',
  GSPAY_MYR_CALLBACKS_ENABLED: 'true',
  GSPAY_PAYMENT_FORWARD_URL: 'https://portal.example.test/api/v1/payment-callbacks/gspay/payment',
  GSPAY_DUITNOW_FORWARD_URL: 'https://portal.example.test/api/v1/payment-callbacks/gspay/duitnow',
};

async function request(app, path, { method = 'GET', token, payload } = {}) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    return { status: response.status, text: await response.text() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('GSPAY status and peer configuration are secret-free and always not live', async () => {
  let calls = 0;
  const app = makeApp({ env: { ...env, GSPAY_BASE_URL: 'https://attacker.example.test' }, fetchImpl: async () => {
    calls++;
    throw Error('must not call upstream');
  } });
  const status = await request(app, '/providers/gspay/status');
  assert.equal(status.status, 200);
  const publicData = JSON.parse(status.text);
  assert.deepEqual({
    provider: publicData.provider,
    configured: publicData.configured,
    active: publicData.transactionRoutesActive,
    qa: publicData.productionQa,
    live: publicData.liveReady,
  }, { provider: 'gspay', configured: true, active: false, qa: 'not_verified', live: false });
  assert.equal((await request(app, '/platform/gspay/config')).status, 401);
  const config = await request(app, '/platform/gspay/config', { token: queryToken });
  assert.equal(config.status, 200);
  const privateData = JSON.parse(config.text);
  assert.equal(privateData.providerBase, 'https://api.thegspay.com');
  assert.equal(privateData.transactionRoutesActive, false);
  assert.equal(privateData.orderReady, false);
  assert.equal(privateData.queryReady, false);
  assert.equal(privateData.callbacksReady, false);
  for (const secret of [env.GSPAY_OPERATOR_AUTH_KEY, env.GSPAY_OPERATOR_SECRET_KEY,
    orderToken, queryToken, callbackToken, 'attacker.example.test']) {
    assert.equal((status.text + config.text).includes(secret), false);
  }
  assert.equal(calls, 0);
});

test('all GSPAY money routes remain closed without provider or wallet traffic', async () => {
  let calls = 0;
  const app = makeApp({ env, fetchImpl: async () => {
    calls++;
    return new Response('SUCCESS');
  } });
  const cases = [
    ['/platform/gspay/order', orderToken, { transactionId: 'order_1', amount: '10.00' }],
    ['/platform/gspay/order-query', queryToken, { transactionId: 'order_1' }],
    ['/callbacks/gspay/payment', null, { success: true, completed: true, signature: '0'.repeat(32) }],
    ['/callbacks/gspay/duitnow', null, { status: 2, signature: '0'.repeat(32) }],
  ];
  for (const [path, token, payload] of cases) {
    const response = await request(app, path, { method: 'POST', token, payload });
    assert.equal(response.status, 503, path);
    assert.equal(response.text, path.startsWith('/callbacks/')
      ? JSON.stringify({ error: 'gspay_callback_contract_not_active' })
      : JSON.stringify({ error: path.endsWith('order-query') ? 'gspay_query_contract_not_active' : 'gspay_order_contract_not_active' }));
    assert.equal(response.text.includes('SUCCESS'), false);
  }
  assert.equal(calls, 0);
});

test('GSPAY platform routes use isolated per-capability credentials', async () => {
  const app = makeApp({ env, fetchImpl: async () => { throw Error('must not call upstream'); } });
  assert.equal((await request(app, '/platform/gspay/order', { method: 'POST', token: queryToken, payload: {} })).status, 401);
  assert.equal((await request(app, '/platform/gspay/order-query', { method: 'POST', token: orderToken, payload: {} })).status, 401);

  for (const name of ['PLATFORM_GSPAY_ORDER_TOKEN', 'PLATFORM_GSPAY_QUERY_TOKEN', 'PLATFORM_GSPAY_CALLBACK_TOKEN']) {
    assert.equal(gspayPeerCredential({ ...env, [name]: env.PLATFORM_ORDER_TOKEN || orderToken }, name), name === 'PLATFORM_GSPAY_ORDER_TOKEN' ? orderToken : '');
  }
  assert.equal(gspayPeerCredential({ ...env, GATEWAY_ADMIN_TOKEN: queryToken }, 'PLATFORM_GSPAY_QUERY_TOKEN'), '');
  assert.equal(gspayPeerCredential({ ...env, PLATFORM_QUERY_TOKEN: queryToken }, 'PLATFORM_GSPAY_QUERY_TOKEN'), '');
  assert.equal(gspayPeerCredential({ ...env, GSPAY_OPERATOR_SECRET_KEY: callbackToken }, 'PLATFORM_GSPAY_CALLBACK_TOKEN'), '');
});

test('GSPAY readiness keeps unconditional contract and UAT blockers', () => {
  const result = gspayReadiness(env);
  assert.equal(result.credentialsConfigured, true);
  for (const channel of Object.values(result.channels)) {
    assert.equal(channel.enabled, true);
    assert.equal(channel.configurationReady, false);
    assert.equal(channel.liveReady, false);
    assert.ok(channel.blockers.includes('supplier_uat_not_verified'));
  }
  assert.ok(result.channels.orders.blockers.includes('provider_order_response_contract_unconfirmed'));
  assert.ok(result.channels.queries.blockers.includes('provider_query_auth_contract_unconfirmed'));
  assert.ok(result.channels.callbacks.blockers.includes('provider_callback_ack_contract_unconfirmed'));
  assert.equal(gspayReadiness({ ...env, GSPAY_MODE: env.GSPAY_OPERATOR_SECRET_KEY }).mode, 'disabled');
  assert.equal(gspayReadiness({ ...env, GATEWAY_ADMIN_TOKEN: env.GSPAY_OPERATOR_SECRET_KEY }).credentialsConfigured, false);
});

test('GSPAY callback discovery is reachable but explicitly inactive', async () => {
  const app = makeApp({ env: {}, fetchImpl: async () => { throw Error('must not call upstream'); } });
  for (const kind of ['payment', 'duitnow']) {
    const response = await request(app, `/callbacks/gspay/${kind}`);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.text), {
      ok: true, provider: 'gspay', callback: kind, active: false, productionQa: 'not_verified',
    });
  }
});
