'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeApp } = require('./server');
const peer = 'synthetic-read-only-wallet-query-credential';
const env = { PLATFORM_QUERY_TOKEN: peer, GATEWAY_ADMIN_TOKEN: 'synthetic-admin-token-with-at-least-32-bytes', VPAY_TRADER_ID: '123456', VPAY_API_TOKEN: 'synthetic-test-only-provider-key' };
async function request(app, path, token, payload={outTradeNo:'order_1',tradeNo:'provider_1'}){
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(payload)});
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
 for(const path of ['/admin/vpay/order','/admin/vpay/withdrawal','/admin/vpay/balance','/admin/vpay/order-query','/admin/vpay/withdrawal-query','/admin/mega/balance']){
  const result=await request(app,path,peer);assert([401,404].includes(result.status),path+': '+result.status);
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
