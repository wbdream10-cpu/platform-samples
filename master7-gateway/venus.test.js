'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sortedQuery, venusSignature, venusCatalogue } = require('./venus');
const env = { VENUS_SITE_CODE: 'test-site', VENUS_API_KEY: 'test-secret' };
const now = () => new Date('2026-10-12T23:00:00Z');
function signed(data, key = env.VENUS_API_KEY) {
  const timestamp = String(now().getTime());
  return new Response(JSON.stringify(data), { headers: { 'X-Ts': timestamp, 'X-Sign': venusSignature(data, timestamp, key) } });
}
const game = id => ({ Code: `game${id}`, ProviderCode: 'TEST', Name: 'Sample', secret: 'omit-this' });

test('VENUS signature matches the independent document example', () => {
  const body = { ProviderCode: 'string', PlayerCode: 'string', GameRoundId: 'string', TransactionId: 'string',
    TransactionDate: 'string', Currency: 'string', Amount: '99.9999', GameCode: 'string', Type: 1,
    ReserveBetRoundingTolerance: 'string', IsTest: false,
    PromotionEvent: [{ Type: 0, RefNo: 'string', Name: 'string', Metadata: 'string' }, { Type: 0, RefNo: 'string', Name: 'string', Metadata: 'string' }] };
  assert.equal(venusSignature(body, '1753842603174', 'ojbefkajslndalsjkdas'), 'EZIQz1iMwCd9zG3twNdKFqqxe/VQt+D1D0jg0mnXm7k=');
  assert.equal(sortedQuery({ A: [null, '', 'a b', false, 0], Empty: [], Missing: null }), 'A%5b0%5d=a%20b&A%5b1%5d=false&A%5b2%5d=0');
});

test('VENUS fetches all enabled pages, verifies responses and projects public fields', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { SiteCode: 'test-site', PageNo: requests.length, PageSize: 1000 });
    assert.equal(options.headers['X-Sign'], venusSignature(body, String(now().getTime()), env.VENUS_API_KEY));
    assert.equal(options.redirect, 'error');
    return signed({ Code: 0, Value: { Total: 1001, Games: body.PageNo === 1 ? Array.from({ length: 1000 }, (_, i) => game(i)) : [game(1000)] } });
  };
  const result = await venusCatalogue({ env, now, fetchImpl });
  assert.equal(result.count, 1001); assert.equal(result.pages, 2);
  assert.equal(requests[0].url, 'https://product.elitehubzapi.com/api/sm/services/games');
  assert.equal(JSON.stringify(result).includes('omit-this'), false);
});

test('VENUS rejects missing credentials, insecure origin and signed/malformed failures', async () => {
  await assert.rejects(venusCatalogue({ env: {}, now }), /venus_not_configured/);
  await assert.rejects(venusCatalogue({ env: { ...env, VENUS_BASE_URL: 'http://provider.test' }, now }), /venus_invalid_configuration/);
  const failures = [
    [() => new Response('{}'), /venus_provider_rejected/],
    [() => new Response(JSON.stringify({ Code: 0, Value: [] })), /venus_response_signature_missing/],
    [() => signed({ Code: 0, Value: [] }, 'wrong'), /venus_invalid_response_signature/],
    [() => signed({ Code: 42, Value: [] }), /venus_provider_rejected/],
    [() => signed({ Code: 0, Value: { Total: 2, Games: [game(1)] } }), /venus_incomplete_catalogue/],
    [() => signed({ Code: 0, Value: [game(1), game(1)] }), /venus_duplicate_game/],
    [() => signed({ Code: 0, Value: [{ Code: 'missing-provider' }] }), /venus_invalid_game/],
  ];
  for (const [fetchImpl, error] of failures) await assert.rejects(venusCatalogue({ env, now, fetchImpl }), error);
});

test('VENUS supports the documented array example without filtering lobbies or freespins', async () => {
  const result = await venusCatalogue({ env, now, fetchImpl: async () => signed({ Code: 0, Value: [game(1)] }) });
  assert.equal(result.count, 1);
});
