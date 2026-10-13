'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeApp } = require('./server');
const { signWithDateTime } = require('./vpay');

const env = {
  GATEWAY_ADMIN_TOKEN: 'admin-fixture-'.repeat(4),
  VPAY_TRADER_ID: '123456', VPAY_API_TOKEN: 'fixture-only-token',
  VPAY_ORDERS_ENABLED: 'true', VPAY_WITHDRAWALS_ENABLED: 'true',
  PUBLIC_BASE_URL: 'https://gateway.example.test',
  VPAY_PAYMENT_FORWARD_URL: 'https://wallet.example.test/deposit',
  VPAY_WITHDRAWAL_FORWARD_URL: 'https://wallet.example.test/withdrawal',
  PLATFORM_CALLBACK_TOKEN: 'wallet-fixture-'.repeat(4),
  EVO_API_TOKEN: 'fixture-evo',
};
async function request(app, path, payload, extra = {}) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      ...(payload !== undefined ? { method: 'POST', body: typeof payload === 'string' ? payload : JSON.stringify(payload) } : {}),
      headers: { Authorization: `Bearer ${env.GATEWAY_ADMIN_TOKEN}`, 'Content-Type': 'application/json', ...extra },
    });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
function notification() {
  const payload = { trader_id: env.VPAY_TRADER_ID, out_trade_no: 'fixture-1', trade_no: 'upstream-1',
    amount: '1.00', state: '3', notify_time: '2026-10-13 12:00:00' };
  payload.sign = signWithDateTime(payload, env.VPAY_API_TOKEN, payload.notify_time);
  return payload;
}

test('health and configured payment switches never attest production QA', async () => {
  let calls = 0;
  const app = makeApp({ env, fetchImpl: async () => { calls++; throw Error('unexpected network'); } });
  const live = JSON.parse((await request(app, '/health')).text);
  assert.equal(live.ok, true);
  assert.equal(live.readiness.liveReady, false);
  const data = JSON.parse((await request(app, '/readiness')).text);
  assert.equal(data.scope, 'configuration_only');
  assert.equal(data.vpay.channels.payment.configurationReady, true);
  assert.equal(data.vpay.channels.payment.liveReady, false);
  assert.equal(data.productionQa, 'not_verified');
  assert.ok(Object.values(data.gameCallbacks).every(x => x.businessReady === false));
  for (const secret of [env.GATEWAY_ADMIN_TOKEN, env.VPAY_API_TOKEN, env.PLATFORM_CALLBACK_TOKEN, env.VPAY_PAYMENT_FORWARD_URL]) {
    assert.ok(!JSON.stringify(data).includes(secret));
  }
  assert.equal(calls, 0);
});

test('readiness names missing routing and switch gates separately', async () => {
  const data = JSON.parse((await request(makeApp({env:{VPAY_TRADER_ID:'123456',VPAY_API_TOKEN:'fixture'}}), '/readiness')).text);
  const ch = data.vpay.channels.payment;
  assert.equal(data.vpay.credentialsConfigured, true);
  assert.equal(ch.configurationReady, false);
  assert.ok(ch.blockers.includes('transaction_switch_off'));
  assert.ok(ch.blockers.includes('platform_callback_url_missing_or_invalid'));
  assert.ok(ch.blockers.includes('platform_callback_token_missing_or_short'));
});

test('all response classes carry a generated request ID', async () => {
  const app = makeApp({env:{}});
  const ids = [];
  for (const path of ['/health', '/readiness', '/unknown', '/admin/vpay/balance']) {
    const res = await request(app, path, path.startsWith('/admin') ? {} : undefined, {'X-Request-Id':'untrusted'});
    const id = res.headers.get('x-request-id');
    assert.match(id, /^[a-f0-9-]{36}$/);
    ids.push(id);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('JSON scalars and arrays are rejected without provider calls', async () => {
  let calls=0;
  const app=makeApp({env,fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  for(const value of ['null','[]','1','"text"','true','{invalid']) {
    assert.equal((await request(app,'/admin/vpay/order',value)).status,400);
  }
  assert.equal(calls,0);
});

test('request size limit counts UTF-8 bytes and still returns HTTP 413', async () => {
  const app=makeApp({env,fetchImpl:async()=>{throw Error('unexpected');}});
  assert.equal((await request(app,'/admin/vpay/order',{title:'中'.repeat(22000)})).status,413);
});

const order={outTradeNo:'fixture-1',title:'Deposit',amount:'1.00',tradeCode:'1',payerName:'Fixture'};
const withdrawal={refId:'fixture-1',amount:'1.00',bankName:'TEST',accountName:'Fixture',accountNumber:'12345678'};
test('zero, negative and fractional-cent payment amounts never reach the provider', async () => {
  let calls=0;
  const app=makeApp({env,fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  for(const amount of ['0','0.00','0000000.00','-1','0.001','1e2','NaN']) {
    assert.equal((await request(app,'/admin/vpay/order',{...order,amount})).status,400);
    assert.equal((await request(app,'/admin/vpay/withdrawal',{...withdrawal,amount})).status,400);
  }
  assert.equal(calls,0);
});

test('enabled payment switches cannot create orders without wallet routing', async () => {
  let calls=0;
  const app=makeApp({env:{...env,PLATFORM_CALLBACK_TOKEN:''},fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  assert.equal((await request(app,'/admin/vpay/order',order)).status,503);
  assert.equal((await request(app,'/admin/vpay/withdrawal',withdrawal)).status,503);
  assert.equal(calls,0);
});

test('VPay accepts explicit success codes only across every admin operation', async () => {
  const cases=[['/admin/vpay/order',order],['/admin/vpay/withdrawal',withdrawal],
    ['/admin/vpay/order-query',{outTradeNo:'fixture-1'}],['/admin/vpay/withdrawal-query',{outMoneyId:'fixture-1'}],['/admin/vpay/balance',{}]];
  for(const code of [undefined,null,'',false,[],130,0,'0']) {
    const app=makeApp({env,fetchImpl:async()=>new Response(JSON.stringify({code,data:{}}))});
    for(const [path,payload] of cases) assert.equal((await request(app,path,payload)).status,code===0||code==='0'?200:502);
  }
});

test('EVO user, balance and catalogue reject upstream business errors and null codes', async () => {
  for(const code of [null,'',false,130,0]) {
    const app=makeApp({env,fetchImpl:async()=>new Response(JSON.stringify({code,data:[]}))});
    for(const path of ['/admin/evo888h5/player','/admin/evo888h5/balance','/providers/evo888h5/games']) {
      assert.equal((await request(app,path,path.startsWith('/admin')?{userid:'fixture1'}:undefined)).status,code===0?200:502);
    }
  }
});

test('provider redirects and oversized responses are not followed or accepted', async () => {
  let options;
  let calls=0;
  const redirect=makeApp({env,fetchImpl:async(_url,opts)=>{options=opts;calls++;return new Response(null,{status:302,headers:{Location:'https://other.example.test'}});}});
  assert.equal((await request(redirect,'/admin/vpay/balance',{})).status,502);
  assert.equal(options.redirect,'manual');
  assert.equal(calls,1);
  const oversized=makeApp({env,fetchImpl:async()=>new Response('x'.repeat(2097153))});
  const response=await request(oversized,'/admin/vpay/balance',{});
  assert.equal(response.status,502);
  assert.equal(JSON.parse(response.text).error,'upstream_response_too_large');
});

test('invalid transport URL blocks outbound credentials', async () => {
  let calls=0;
  for(const base of ['http://example.test','https://user:password@example.test','file:///tmp/config']) {
    const app=makeApp({env:{...env,VPAY_BASE_URL:base},fetchImpl:async()=>{calls++;throw Error('unexpected');}});
    assert.equal((await request(app,'/admin/vpay/balance',{})).status,503);
  }
  assert.equal(calls,0);
});

test('timeouts return a stable code without error-message credential leakage', async () => {
  for(const name of ['AbortError','TimeoutError']) {
    const app=makeApp({env,fetchImpl:async()=>{throw Object.assign(Error('secret fixture URL'),{name});}});
    const res=await request(app,'/admin/vpay/balance',{});
    assert.equal(res.status,504);
    assert.deepEqual(JSON.parse(res.text),{error:'upstream_timeout'});
  }
});

test('signed callbacks require secure wallet target and callback token', async () => {
  let calls=0;
  for(const changes of [{PLATFORM_CALLBACK_TOKEN:''},{VPAY_PAYMENT_FORWARD_URL:'http://wallet.example.test'},
    {VPAY_PAYMENT_FORWARD_URL:'https://user:password@wallet.example.test'}]) {
    const app=makeApp({env:{...env,...changes},fetchImpl:async()=>{calls++;throw Error('unexpected');}});
    assert.equal((await request(app,'/callbacks/vpay/payment',notification())).status,503);
  }
  assert.equal(calls,0);
});

test('callback acknowledges only exact successful durable wallet acknowledgement', async () => {
  for(const [body,status,expected] of [['SUCCESS',200,200],['SUCCESS',500,502],['',204,502],
    ['{"ok":false}',200,502],['<html>Login</html>',200,502],['SUCCESS\n',200,502]]) {
    let forwarded;
    const app=makeApp({env,fetchImpl:async(url,options)=>{forwarded={url,options};return new Response(status===204?null:body,{status});}});
    for(const kind of ['payment','withdrawal']) {
      const res=await request(app,'/callbacks/vpay/'+kind,notification());
      assert.equal(res.status,expected);
      assert.equal(res.text==='SUCCESS',expected===200);
      assert.equal(forwarded.options.headers.Authorization,`Bearer ${env.PLATFORM_CALLBACK_TOKEN}`);
      assert.equal(forwarded.url,kind==='payment'?env.VPAY_PAYMENT_FORWARD_URL:env.VPAY_WITHDRAWAL_FORWARD_URL);
    }
  }
});

test('failed acknowledgement stays retryable and only later durable acknowledgement succeeds', async () => {
  let attempts=0;
  const app=makeApp({env,fetchImpl:async()=>new Response(++attempts===1?'BUSY':'SUCCESS')});
  const payload=notification();
  assert.equal((await request(app,'/callbacks/vpay/payment',payload)).status,502);
  assert.equal((await request(app,'/callbacks/vpay/payment',payload)).text,'SUCCESS');
  assert.equal(attempts,2);
});
