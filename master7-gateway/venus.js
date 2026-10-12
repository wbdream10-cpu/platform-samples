'use strict';

const crypto = require('node:crypto');

// EliteHubz v1.20.3: flatten, omit empty values, sort keys, lowercase percent escapes.
function sortedQuery(value) {
  const entries = new Map();
  function flatten(item, prefix) {
    if (item === null || item === undefined || item === '') return;
    if (Array.isArray(item)) {
      let index = 0;
      for (const child of item) {
        if (child === null || child === undefined || child === '') continue;
        flatten(child, `${prefix}[${index++}]`);
      }
    } else if (typeof item === 'object') {
      for (const key of Object.keys(item)) flatten(item[key], prefix ? `${prefix}.${key}` : key);
    } else entries.set(prefix, String(item));
  }
  flatten(value, '');
  const encode = v => encodeURIComponent(v).replace(/%[0-9A-F]{2}/g, m => m.toLowerCase());
  return [...entries.keys()].sort().map(key => `${encode(key)}=${encode(entries.get(key))}`).join('&');
}

function venusSignature(body, timestamp, secret) {
  return crypto.createHmac('sha256', secret).update(`${sortedQuery(body)}|${timestamp}`).digest('base64');
}

function fail(code, status = 502) {
  throw Object.assign(new Error(code), { status });
}

async function venusCatalogue({ env, fetchImpl = global.fetch, now = () => new Date() }) {
  const siteCode = String(env.VENUS_SITE_CODE || '').trim();
  const secret = String(env.VENUS_API_KEY || '').trim();
  if (!siteCode || !secret) fail('venus_not_configured', 503);
  let base;
  try { base = new URL(env.VENUS_BASE_URL || 'https://product.elitehubzapi.com'); }
  catch { fail('venus_invalid_configuration', 503); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) {
    fail('venus_invalid_configuration', 503);
  }
  const games = new Map();
  let expectedTotal;
  for (let page = 1; page <= 100; page++) {
    const body = { SiteCode: siteCode, PageNo: page, PageSize: 1000 };
    const timestamp = String(now().getTime());
    let response;
    try {
      response = await fetchImpl(new URL('/api/sm/services/games', base).href, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json',
          'X-Ts': timestamp, 'X-Sign': venusSignature(body, timestamp, secret) },
        body: JSON.stringify(body),
      });
    } catch { fail('venus_catalogue_unreachable'); }
    if (!response.ok) fail(`venus_upstream_http_${response.status}`);
    let data;
    try { data = await response.json(); } catch { fail('venus_invalid_response'); }
    if (data.Code !== 0) {
      const code = Number.isSafeInteger(data.Code) ? `_${data.Code}` : '';
      fail(`venus_provider_rejected${code}`);
    }
    const receivedTs = response.headers.get('x-ts') || '';
    const receivedSign = response.headers.get('x-sign') || '';
    if (!receivedTs || !receivedSign) fail('venus_response_signature_missing');
    if (!/^\d{13}$/.test(receivedTs) || Math.abs(Number(receivedTs) - now().getTime()) > 300000) fail('venus_invalid_response_timestamp');
    const expected = Buffer.from(venusSignature(data, receivedTs, secret));
    const actual = Buffer.from(receivedSign);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) fail('venus_invalid_response_signature');
    // The manual's schema uses Value.Games/Total, but its example uses Value[].
    const rows = Array.isArray(data.Value) ? data.Value : data.Value?.Games;
    const total = Array.isArray(data.Value) ? undefined : data.Value?.Total;
    if (!Array.isArray(rows) || rows.length > 1000) fail('venus_invalid_response');
    if (total !== undefined) {
      if (!Number.isSafeInteger(total) || total < 0) fail('venus_invalid_total');
      if (expectedTotal !== undefined && total !== expectedTotal) fail('venus_catalogue_changed');
      expectedTotal = total;
    }
    for (const row of rows) {
      if (!row || typeof row.Code !== 'string' || !row.Code || typeof row.ProviderCode !== 'string' || !row.ProviderCode) fail('venus_invalid_game');
      const key = `${row.ProviderCode}\0${row.Code}`;
      if (games.has(key)) fail('venus_duplicate_game');
      games.set(key, {
        gameCode: row.Code, providerCode: row.ProviderCode, providerName: String(row.ProviderName || ''),
        name: String(row.Name || ''), category: row.Category ?? null, type: row.Type ?? null,
        isLobby: row.IsLobby === true, hasDemo: row.HasDemo === true, hasFreespin: row.HasFreespin === true,
        thumbnails: (Array.isArray(row.Thumbnails) ? row.Thumbnails : []).filter(t => typeof t?.ImagePath === 'string' && /^https:\/\//i.test(t.ImagePath))
          .map(t => ({ language: String(t.Language || ''), imageUrl: t.ImagePath })),
      });
    }
    if (expectedTotal !== undefined && games.size > expectedTotal) fail('venus_invalid_total');
    if (expectedTotal === games.size || rows.length < 1000) {
      if (expectedTotal !== undefined && expectedTotal !== games.size) fail('venus_incomplete_catalogue');
      return { provider: 'venus', currency: 'MYR', wallet: 'transfer', count: games.size, pages: page, games: [...games.values()] };
    }
  }
  fail('venus_catalogue_page_limit');
}

module.exports = { sortedQuery, venusSignature, venusCatalogue };
