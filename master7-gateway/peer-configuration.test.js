'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeApp } = require('./server');
const { normalizeHttpsUrl, peerCredential, vpayReadiness } = require('./readiness');
const { signWithDateTime } = require('./vpay');

const queryToken = 'q'.repeat(48);
const orderToken = 'o'.repeat(48);
const callbackToken = 'c'.repeat(48);
const adminToken = 'a'.repeat(48);

async function request(app, path, { method = 'GET', token, body } = {}) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, text: await response.text() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('public callback bases normalize only standalone HTTPS origins', () => {
  for (const value of [
    'https://Gateway.Example.Test',
    'https://gateway.example.test/',
    'HTTPS://gateway.example.test:443/',
  ]) assert.equal(normalizeHttpsUrl(value, { originOnly: true }), 'https://gateway.example.test');

  for (const value of [
    'http://gateway.example.test',
    'https://gateway.example.test:8443',
    'https://gateway.example.test/callback-prefix',
    'https://gateway.example.test?x=1',
    'https://gateway.example.test?',
    'https://gateway.example.test#fragment',
    'https://gateway.example.test#',
    'https://user:password@gateway.example.test',
    'https://gateway.example.test\\callbacks',
    ' https://gateway.example.test',
    'https://gateway.example.test\n',
  ]) assert.equal(normalizeHttpsUrl(value, { originOnly: true }), '', value);
});

test('return, forward and provider URLs retain canonical HTTPS paths and queries', () => {
  assert.equal(
    normalizeHttpsUrl('https://Portal.Example.Test:443/payment-return?source=wallet'),
    'https://portal.example.test/payment-return?source=wallet',
  );
  assert.equal(
    normalizeHttpsUrl('https://gateway.vpay.club/app/v1/trader/rest?t=123456'),
    'https://gateway.vpay.club/app/v1/trader/rest?t=123456',
  );
  for (const value of [
    'http://portal.example.test/return',
    'https://user:password@portal.example.test/return',
    'https://portal.example.test/return#fragment',
    'https://portal.example.test/return#',
    'https://portal.example.test/return\\next',
    'https://portal.example.test/return\t',
  ]) assert.equal(normalizeHttpsUrl(value), '', value);
});

test('all peer credentials share byte limits and reject every privileged alias', () => {
  const base = {
    GATEWAY_ADMIN_TOKEN: adminToken,
    PLATFORM_QUERY_TOKEN: queryToken,
    PLATFORM_ORDER_TOKEN: orderToken,
    PLATFORM_CALLBACK_TOKEN: callbackToken,
  };
  assert.equal(peerCredential({ ...base, PLATFORM_QUERY_TOKEN: 'x'.repeat(31) }, 'PLATFORM_QUERY_TOKEN'), '');
  assert.equal(peerCredential({ ...base, PLATFORM_QUERY_TOKEN: 'x'.repeat(32) }, 'PLATFORM_QUERY_TOKEN'), 'x'.repeat(32));
  assert.equal(peerCredential({ ...base, PLATFORM_QUERY_TOKEN: 'x'.repeat(1024) }, 'PLATFORM_QUERY_TOKEN'), 'x'.repeat(1024));
  assert.equal(peerCredential({ ...base, PLATFORM_QUERY_TOKEN: 'x'.repeat(1025) }, 'PLATFORM_QUERY_TOKEN'), '');
  assert.equal(peerCredential({ ...base, PLATFORM_QUERY_TOKEN: 'é'.repeat(16) }, 'PLATFORM_QUERY_TOKEN'), 'é'.repeat(16));
  assert.equal(peerCredential({ ...base, PLATFORM_QUERY_TOKEN: 'é'.repeat(512) }, 'PLATFORM_QUERY_TOKEN'), 'é'.repeat(512));
  assert.equal(peerCredential({ ...base, PLATFORM_QUERY_TOKEN: 'é'.repeat(513) }, 'PLATFORM_QUERY_TOKEN'), '');

  const peers = ['PLATFORM_QUERY_TOKEN', 'PLATFORM_ORDER_TOKEN', 'PLATFORM_CALLBACK_TOKEN'];
  for (const name of peers) {
    for (const other of ['GATEWAY_ADMIN_TOKEN', ...peers]) {
      if (other === name) continue;
      assert.equal(peerCredential({ ...base, [name]: base[other] }, name), '', `${name} aliases ${other}`);
    }
  }
  assert.equal(peerCredential(base, 'GATEWAY_ADMIN_TOKEN'), '');
});

test('configuration returns canonical peer URLs and invalid origins stay unready', async () => {
  const base = {
    GATEWAY_ADMIN_TOKEN: adminToken,
    PLATFORM_QUERY_TOKEN: queryToken,
    PLATFORM_ORDER_TOKEN: orderToken,
    PLATFORM_CALLBACK_TOKEN: callbackToken,
    VPAY_TRADER_ID: '123456',
    VPAY_API_TOKEN: 'fixture-provider-key',
    VPAY_MODE: 'uat',
    VPAY_ORDERS_ENABLED: 'true',
    VPAY_ENABLED_TRADE_CODES: '["2"]',
    PUBLIC_BASE_URL: 'HTTPS://Gateway.Example.Test:443/',
    VPAY_PAYMENT_FORWARD_URL: 'https://Portal.Example.Test/api/v1/payment-callbacks/vpay/payment?source=gateway',
    VPAY_RETURN_URL: 'https://Portal.Example.Test:443/payment-return?source=wallet',
  };
  const app = makeApp({ env: base, fetchImpl: async () => { throw Error('configuration must not call upstream'); } });
  const response = await request(app, '/platform/vpay/config', { token: queryToken });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.text), {
    provider: 'vpay', traderId: '123456', mode: 'uat', configured: true, paymentReady: true,
    tradeCodes: ['2'], notifyUrl: 'https://gateway.example.test/callbacks/vpay/payment',
    returnUrl: 'https://portal.example.test/payment-return?source=wallet',
  });

  for (const value of ['https://gateway.example.test/prefix', 'https://gateway.example.test?x=1',
    'https://gateway.example.test#fragment', 'https://user@gateway.example.test']) {
    const unready = makeApp({ env: { ...base, PUBLIC_BASE_URL: value }, fetchImpl: async () => { throw Error('must not call upstream'); } });
    const result = JSON.parse((await request(unready, '/platform/vpay/config', { token: queryToken })).text);
    assert.equal(result.paymentReady, false, value);
    assert.equal(vpayReadiness({ ...base, PUBLIC_BASE_URL: value }).channels.payment.configurationReady, false, value);
  }
});

test('invalid callback credentials fail closed while disabled creation still permits an existing signed callback', async () => {
  const base = {
    GATEWAY_ADMIN_TOKEN: adminToken,
    PLATFORM_QUERY_TOKEN: queryToken,
    PLATFORM_ORDER_TOKEN: orderToken,
    PLATFORM_CALLBACK_TOKEN: callbackToken,
    VPAY_TRADER_ID: '123456',
    VPAY_API_TOKEN: 'fixture-provider-key',
    VPAY_ORDERS_ENABLED: 'false',
    PUBLIC_BASE_URL: 'https://gateway.example.test',
    VPAY_PAYMENT_FORWARD_URL: 'https://portal.example.test/api/v1/payment-callbacks/vpay/payment?source=gateway',
  };
  const payload = {
    trader_id: base.VPAY_TRADER_ID,
    out_trade_no: 'existing_order_1',
    trade_no: 'provider_order_1',
    amount: '1.00', state: '3', notify_time: '2026-10-23 12:00:00',
  };
  payload.sign = signWithDateTime(payload, base.VPAY_API_TOKEN, payload.notify_time);

  for (const change of [
    { PLATFORM_CALLBACK_TOKEN: 'x'.repeat(31) },
    { PLATFORM_CALLBACK_TOKEN: 'x'.repeat(1025) },
    { PLATFORM_CALLBACK_TOKEN: adminToken },
    { PLATFORM_CALLBACK_TOKEN: queryToken },
    { PLATFORM_CALLBACK_TOKEN: orderToken },
  ]) {
    let calls = 0;
    const app = makeApp({ env: { ...base, ...change }, fetchImpl: async () => { calls++; return new Response('SUCCESS'); } });
    assert.equal((await request(app, '/callbacks/vpay/payment', { method: 'POST', body: payload })).status, 503);
    assert.equal(calls, 0);
  }

  let forwarded;
  const app = makeApp({ env: base, fetchImpl: async (url, options) => {
    forwarded = { url, options };
    return new Response('SUCCESS');
  } });
  const success = await request(app, '/callbacks/vpay/payment', { method: 'POST', body: payload });
  assert.equal(success.status, 200);
  assert.equal(success.text, 'SUCCESS');
  assert.equal(forwarded.url, base.VPAY_PAYMENT_FORWARD_URL);
  assert.equal(forwarded.options.headers.Authorization, `Bearer ${callbackToken}`);
});
