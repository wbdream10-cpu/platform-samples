'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { jiliDate, jiliKey } = require('./jili');
const { makeApp } = require('./server');

async function run(handler, path) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fetch(`http://127.0.0.1:${server.address().port}${path}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('JILI signature matches the published public example', () => {
  // Public manual test vector, not a production credential.
  const result = jiliKey('Token=Test006&GameId=1&Lang=zh-CN&AgentId=abcd_RMB', 'abcd_RMB',
    'be8e08f95357d215921f91c6a533f74d3194de52', new Date('2019-01-01T12:00:00Z'));
  assert.match(result, /^[a-f0-9]{44}$/);
  assert.equal(result.slice(6, -6), '3e4c3b321eac16f20633f683be08d237');
});

test('JILI date uses fixed UTC-4 across midnight, year and daylight-saving boundaries', () => {
  assert.equal(jiliDate(new Date('2019-01-01T03:59:59Z')), '181231');
  assert.equal(jiliDate(new Date('2019-01-01T04:00:00Z')), '19011');
  assert.equal(jiliDate(new Date('2026-07-07T03:30:00Z')), '26076');
  assert.equal(jiliDate(new Date('2026-02-07T04:00:00Z')), '26027');
});

test('JILI 1:1 and 1:100 select separate credentials and only call GetGameList', async () => {
  const requests = [];
  const env = {JILI_1TO1_AGENT_ID:'test_one', JILI_1TO1_AGENT_KEY:'one-secret',
    JILI_1TO100_AGENT_ID:'test_hundred', JILI_1TO100_AGENT_KEY:'hundred-secret'};
  const fixed = new Date('2026-10-12T02:00:00Z');
  const fetchImpl = async (url, options) => {
    requests.push({url, options});
    return new Response(JSON.stringify({ErrorCode:0,Data:[{GameId:1,name:{'en-US':'Sample','zh-CN':'样本'},GameCategoryId:5,JP:true,secret:'private-data'}],Key:'private-data'}));
  };
  for (const [account,id,key,ratio] of [['1to1','test_one','one-secret','1:1'],['1to100','test_hundred','hundred-secret','1:100']]) {
    const res = await run(makeApp({env,fetchImpl,now:()=>fixed}), `/providers/jili/games?account=${account}`);
    const data = await res.json();
    assert.equal(res.status,200);assert.equal(data.ratio,ratio);assert.equal(data.currency,'MYR');
    assert.equal(data.games[0].nameZh,'样本');assert.equal(data.games[0].gameCode,'1');
    assert.equal(JSON.stringify(data).includes('private-data'),false);
    const request = requests.at(-1), params = new URLSearchParams(request.options.body);
    assert.equal(request.url,'https://wb-api-2.jiscc77s.com/api1/GetGameList');
    assert.equal(request.options.method,'POST');assert.equal(request.options.redirect,'error');
    assert.equal(request.options.headers['Content-Type'],'application/x-www-form-urlencoded');
    assert.deepEqual([...params.keys()],['AgentId','Key']);assert.equal(params.get('AgentId'),id);
    assert.equal(params.get('Key').slice(6,-6),jiliKey(`AgentId=${id}`,id,key,fixed).slice(6,-6));
    assert.equal(request.options.body.includes(key),false);
  }
  const health = await (await run(makeApp({env}),'/health')).json();
  assert.deepEqual(health.configured.jili,{'1to1':true,'1to100':true});
  assert.equal(JSON.stringify(health).includes('one-secret'),false);
});

test('JILI fails closed for missing profile, inherited property, unsafe base and invalid ID', async () => {
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not call');};
  assert.equal((await run(makeApp({env:{},fetchImpl}),'/providers/jili/games')).status,503);
  assert.equal((await run(makeApp({env:{},fetchImpl}),'/providers/jili/games?account=toString')).status,400);
  const onlyHundred={JILI_1TO100_AGENT_ID:'hundred',JILI_1TO100_AGENT_KEY:'key'};
  assert.equal((await run(makeApp({env:onlyHundred,fetchImpl}),'/providers/jili/games?account=1to1')).status,503);
  const env={JILI_1TO1_AGENT_ID:'one',JILI_1TO1_AGENT_KEY:'key',JILI_BASE_URL:'http://provider.test/api1'};
  assert.equal((await run(makeApp({env,fetchImpl}),'/providers/jili/games')).status,503);
  assert.equal((await run(makeApp({env:{...env,JILI_BASE_URL:'https://provider.test/api1',JILI_1TO1_AGENT_ID:'one&x=y'},fetchImpl}),'/providers/jili/games')).status,503);
  assert.equal(calls,0);
});

test('JILI provider errors and malformed success bodies never become successful or leak raw responses', async () => {
  const env={JILI_1TO1_AGENT_ID:'one',JILI_1TO1_AGENT_KEY:'key'};
  for(const reply of [{ErrorCode:2,Message:'private-secret',Data:[]},{Data:[]},{ErrorCode:null,Data:[]},{ErrorCode:0,Data:'private-secret'}]) {
    const fetchImpl=async()=>new Response(JSON.stringify(reply));
    const res=await run(makeApp({env,fetchImpl}),'/providers/jili/games');
    assert.equal(res.status,502);assert.equal((await res.text()).includes('private-secret'),false);
  }
});
