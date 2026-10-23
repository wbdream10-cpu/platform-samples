'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeApp } = require('./server');
const peer = 'synthetic-read-only-wallet-query-credential';
const env = { PLATFORM_QUERY_TOKEN: peer, GATEWAY_ADMIN_TOKEN: 'synthetic-admin-token-with-at-least-32-bytes', VPAY_TRADER_ID: '123456', VPAY_API_TOKEN: 'synthetic-test-only-provider-key' };
async function request(app, path, token, payload={outTradeNo:'order_1',tradeNo:'provider_1'},method='POST'){
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify(payload)}:{})});
  return {status:response.status,body:await response.json()};
 }finally{await new Promise(resolve=>server.close(resolve));}
}
test('wallet query credential confirms only existing orders with both stable references',async()=>{
 let upstream;
 const app=makeApp({env,fetchImpl:async(url,options)=>{upstream={url,payload:JSON.parse(options.body)};return Response.json({code:0,data:{out_trade_no:'order_1',trade_no:'provider_1',amount:'1.00',state:'3'}});}});
 const result=await request(app,'/platform/vpay/order-query',peer);assert.equal(result.status,200);assert.equal(result.body.provider,'vpay');
 assert(upstream.url.startsWith('https://gateway.vpay.club/app/v1/trader/rest?t='));assert.equal(upstream.payload.action,'ORDER_GET');assert.equal(upstream.payload.out_trade_no,'order_1');assert.equal(upstream.payload.trade_no,'provider_1');
 assert(!JSON.stringify(result.body).includes(peer));assert(!JSON.stringify(result.body).includes(env.VPAY_API_TOKEN));
});
test('query-only credentials cannot create, withdraw, inspect merchant balance or use admin APIs',async()=>{
 let calls=0;const app=makeApp({env,fetchImpl:async()=>{calls++;throw Error('Must not call supplier');}});
 for(const path of ['/platform/vpay/order','/admin/vpay/order','/admin/vpay/withdrawal','/admin/vpay/balance','/admin/vpay/order-query','/admin/vpay/withdrawal-query','/admin/mega/balance']){
  const result=await request(app,path,peer);assert([401,404].includes(result.status),path+': '+result.status);
 }
 assert.equal(calls,0);
});

const orderToken='synthetic-order-only-wallet-credential-32-bytes';
const readyEnv={...env,PLATFORM_ORDER_TOKEN:orderToken,VPAY_ORDERS_ENABLED:'true',VPAY_ENABLED_TRADE_CODES:'["2"]',VPAY_MODE:'uat',PUBLIC_BASE_URL:'https://master7-integration-gateway.onrender.com',PLATFORM_CALLBACK_TOKEN:'synthetic-callback-token-at-least-32-bytes',VPAY_PAYMENT_FORWARD_URL:'https://portal.example.test/api/v1/payment-callbacks/vpay/payment',VPAY_RETURN_URL:'https://portal.example.test/payment-return'};
const draft={outTradeNo:'order_1',title:'MASTER7 deposit',amount:'1.00',tradeCode:'2',payerName:'SYNTHETIC MEMBER',notifyUrl:readyEnv.PUBLIC_BASE_URL+'/callbacks/vpay/payment',callbackUrl:readyEnv.VPAY_RETURN_URL};
test('authenticated wallet configuration pins the merchant, environment, activated methods and callback URLs without exposing credentials',async()=>{
 const app=makeApp({env:readyEnv,fetchImpl:async()=>{throw Error('No supplier request for configuration');}});
 for(const token of [undefined,orderToken,env.GATEWAY_ADMIN_TOKEN])assert.equal((await request(app,'/platform/vpay/config',token,{},'GET')).status,401);
 const result=await request(app,'/platform/vpay/config',peer,{},'GET');assert.equal(result.status,200);
 assert.deepEqual(result.body,{provider:'vpay',traderId:'123456',mode:'uat',configured:true,paymentReady:true,tradeCodes:['2'],notifyUrl:draft.notifyUrl,returnUrl:draft.callbackUrl});
 for(const secret of [peer,orderToken,env.VPAY_API_TOKEN,readyEnv.PLATFORM_CALLBACK_TOKEN])assert(!JSON.stringify(result.body).includes(secret));
});
test('order-only credential creates through server-selected methods and callback URLs and cannot query, withdraw or inspect balances',async()=>{
 let upstream,calls=0;const app=makeApp({env:readyEnv,fetchImpl:async(url,options)=>{calls++;upstream=JSON.parse(options.body);return Response.json({code:0,data:{trade_no:'provider_1'}});}});
 const result=await request(app,'/platform/vpay/order',orderToken,draft);assert.equal(result.status,200);assert.equal(calls,1);
 assert.equal(upstream.action,'TRADER_ORDER');assert.equal(upstream.trader_id,'123456');assert.equal(upstream.notify_url,draft.notifyUrl);assert.equal(upstream.callback_url,draft.callbackUrl);assert.equal(upstream.trade_code,'2');
 for(const path of ['/platform/vpay/order-query','/admin/vpay/order','/admin/vpay/withdrawal','/admin/vpay/balance'])assert.equal((await request(app,path,orderToken)).status,401);
 assert.equal(calls,1);
});
test('wallet creation rejects unconfirmed channels, callback changes, missing config and wrong scopes before sending',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('Must not call supplier');};const app=makeApp({env:readyEnv,fetchImpl});
 for(const token of [undefined,peer,env.GATEWAY_ADMIN_TOKEN])assert.equal((await request(app,'/platform/vpay/order',token,draft)).status,401);
 for(const change of [{tradeCode:'1'},{notifyUrl:'https://attacker.example.test/hook'},{callbackUrl:'https://attacker.example.test/return'}])assert.equal((await request(app,'/platform/vpay/order',orderToken,{...draft,...change})).status,503);
 for(const change of [{VPAY_ORDERS_ENABLED:'false'},{VPAY_ENABLED_TRADE_CODES:'[]'},{VPAY_ENABLED_TRADE_CODES:'[2]'},{VPAY_RETURN_URL:''},{VPAY_PAYMENT_FORWARD_URL:''},{PLATFORM_CALLBACK_TOKEN:''}]){
  const unready=makeApp({env:{...readyEnv,...change},fetchImpl});assert.equal((await request(unready,'/platform/vpay/order',orderToken,draft)).status,503);
 }
 assert.equal(calls,0);
});
test('missing, short, wrong or admin credentials do not grant the wallet peer scope',async()=>{
 let calls=0;const app=makeApp({env,fetchImpl:async()=>{calls++;throw Error('Must not call supplier');}});
 for(const token of [undefined,'incorrect',env.GATEWAY_ADMIN_TOKEN])assert.equal((await request(app,'/platform/vpay/order-query',token)).status,401);
 const unset=makeApp({env:{...env,PLATFORM_QUERY_TOKEN:''}});assert.equal((await request(unset,'/platform/vpay/order-query',peer)).status,401);
 const short=makeApp({env:{...env,PLATFORM_QUERY_TOKEN:'short'}});assert.equal((await request(short,'/platform/vpay/order-query','short')).status,401);assert.equal(calls,0);
});
test('invalid or missing bound order IDs are rejected before any supplier call',async()=>{
 let calls=0;const app=makeApp({env,fetchImpl:async()=>{calls++;throw Error('Must not call supplier');}});
 for(const payload of [{outTradeNo:'order_1'},{outTradeNo:'../order',tradeNo:'provider_1'},{outTradeNo:'order_1',tradeNo:'x'.repeat(129)}])assert.equal((await request(app,'/platform/vpay/order-query',peer,payload)).status,400);
 assert.equal(calls,0);
});
test('aliasing peer credentials to another privilege scope fails closed',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('Must not call supplier');};
 for(const change of [{PLATFORM_QUERY_TOKEN:env.GATEWAY_ADMIN_TOKEN},{PLATFORM_QUERY_TOKEN:orderToken},{PLATFORM_ORDER_TOKEN:readyEnv.PLATFORM_CALLBACK_TOKEN},{PLATFORM_ORDER_TOKEN:env.GATEWAY_ADMIN_TOKEN}]){
  const aliased={...readyEnv,...change},app=makeApp({env:aliased,fetchImpl});
  const name=Object.keys(change)[0],path=name==='PLATFORM_QUERY_TOKEN'?'/platform/vpay/order-query':'/platform/vpay/order';
  assert.equal((await request(app,path,aliased[name],draft)).status,401);
 }
 assert.equal(calls,0);
});
