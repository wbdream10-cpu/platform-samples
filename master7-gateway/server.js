'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { verifyVpayNotification, vpaySignature } = require('./vpay');
const { jiliCatalogueBody } = require('./jili');
const { venusCatalogue } = require('./venus');
const { configuredUrl, vpayReadiness, integrationReadiness } = require('./readiness');

const { version: VERSION } = require('./package.json');
const PROVIDERS = ['cosmoplay', 'creative-gaming', 'pgsoft', 'spade-gaming'];

function browserOrigins(env) {
  const configured = env.ALLOWED_ORIGINS !== undefined
    ? env.ALLOWED_ORIGINS
    : (env.ALLOWED_ORIGIN || 'https://www.master7.vip');
  const origins = new Set();
  for (const item of String(configured).split(',')) {
    const value = item.trim();
    if (!value) continue;
    let url;
    try { url = new URL(value); }
    catch { throw new Error('Invalid browser origin configuration'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) {
      throw new Error('Browser origins must be exact HTTP(S) origins without paths or credentials');
    }
    origins.add(url.origin);
  }
  return origins;
}

function cleanBase(value, fallback) {
  return String(value || fallback).replace(/\/+$/, '');
}

function utcSeconds(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function megaSignature(method, requestDateTime, operatorId, secretKey, playerId = '') {
  return md5(`${method}${requestDateTime}${operatorId}${secretKey}${playerId}`);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function makeApp({ env = process.env, fetchImpl = global.fetch, now = () => new Date() } = {}) {
  const currency = String(env.CURRENCY || 'MYR').toUpperCase();
  const publicBase = cleanBase(env.PUBLIC_BASE_URL, '');
  const allowedOrigins = browserOrigins(env);
  const evoBase = cleanBase(env.EVO_BASE_URL, 'https://api.evo888h5.com');
  const megaBase = cleanBase(env.MEGA_BASE_URL, 'https://smakermicsvc.back138.com/api/opgateway/v1/op');
  const vpayBase = cleanBase(env.VPAY_BASE_URL, 'https://gateway.vpay.club');
  const vpayTraderId = String(env.VPAY_TRADER_ID || '').trim();
  const vpayApiToken = String(env.VPAY_API_TOKEN || '').trim();
  const vpayTimeZone = String(env.VPAY_TIME_ZONE || 'Asia/Kuala_Lumpur');
  const clotplayBase = cleanBase(env.CLOTPLAY_BASE_URL, 'https://api.coldboxservice.com/api/MOGI');
  const clotplayToken = String(env.CLOTPLAY_OPERATOR_TOKEN || '').trim();
  const jiliBase = cleanBase(env.JILI_BASE_URL, 'https://wb-api-2.jiscc77s.com/api1');
  const jiliAccounts = {
    '1to1': { id: env.JILI_1TO1_AGENT_ID, secret: env.JILI_1TO1_AGENT_KEY, ratio: '1:1' },
    '1to100': { id: env.JILI_1TO100_AGENT_ID, secret: env.JILI_1TO100_AGENT_KEY, ratio: '1:100' },
  };
  const catalogueProfiles = {
    epicwin: {
      base: cleanBase(env.EPICWIN_BASE_URL, 'https://smapi.eptech88.com/api/opgateway/v1/op'),
      accounts: {
        normal: { id: env.EPICWIN_NORMAL_OPERATOR_ID, secret: env.EPICWIN_NORMAL_SECRET_KEY, currency: 'MYR' },
        free: { id: env.EPICWIN_FREE_OPERATOR_ID, secret: env.EPICWIN_FREE_SECRET_KEY, currency: 'MYR' },
      },
    },
    '918kissh5': {
      base: cleanBase(env.KISSH5_BASE_URL, 'https://kh5api.kisssysapi.com/api/opgateway/v1/op'),
      accounts: {
        normal: { id: env.KISSH5_NORMAL_OPERATOR_ID, secret: env.KISSH5_NORMAL_SECRET_KEY, currency: 'MYR' },
        my1: { id: env.KISSH5_MY1_OPERATOR_ID, secret: env.KISSH5_MY1_SECRET_KEY, currency: 'MY1' },
        free: { id: env.KISSH5_FREE_OPERATOR_ID, secret: env.KISSH5_FREE_SECRET_KEY, currency: 'MYR' },
      },
    },
  };
  const cache = new Map();

  function headers(extra = {}) {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      ...extra,
    };
  }

  function send(res, status, body, extraHeaders) {
    res.writeHead(status, headers(extraHeaders));
    res.end(JSON.stringify(body));
  }

  function sendText(res, status, value) {
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(String(value));
  }

  function isAdmin(req) {
    const expected = String(env.GATEWAY_ADMIN_TOKEN || '');
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return expected.length >= 32 && safeEqual(expected, supplied);
  }

  // A wallet query credential may confirm an existing payment, but may not
  // create orders, read the merchant balance, withdraw or access game admins.
  function isWalletQueryPeer(req) {
    const expected = String(env.PLATFORM_QUERY_TOKEN || '');
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return expected.length >= 32 && expected.length <= 1024 && safeEqual(expected, supplied);
  }

  async function body(req) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 65536) {
        req.resume();
        throw Object.assign(new Error('request_too_large'), { status: 413 });
      }
      chunks.push(buffer);
    }
    if (!bytes) return {};
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw Object.assign(new Error('json_object_required'), { status: 400 });
    }
    return data;
  }

  async function upstream(url, options = {}) {
    if (!configuredUrl(url)) throw Object.assign(new Error('upstream_url_invalid'), { status: 503 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, { ...options, redirect: options.redirect === 'error' ? 'error' : 'manual', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw Object.assign(new Error('upstream_redirect_rejected'), { status: 502 });
      }
      // Catalogue responses can be large, but must remain bounded in memory.
      const chunks = [];
      let bytes = 0;
      if (response.body) for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 2097152) throw Object.assign(new Error('upstream_response_too_large'), { status: 502 });
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let data;
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { data = { message: raw.slice(0, 500) }; }
      return { ok: response.ok, status: response.status, data, acknowledgement: raw === 'SUCCESS' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function cached(key, action) {
    const current = cache.get(key);
    if (current && current.expires > Date.now()) return current.value;
    const value = await action();
    if (value.ok) cache.set(key, { value, expires: Date.now() + 300000 });
    return value;
  }

  async function evo(path, method = 'GET', payload) {
    const token = String(env.EVO_API_TOKEN || '').trim();
    if (!token) return { ok: false, status: 503, data: { code: 'EVO_NOT_CONFIGURED' } };
    const requestHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    return upstream(`${evoBase}${path}`, {
      method,
      headers: requestHeaders,
      body: payload ? JSON.stringify(payload) : undefined,
    });
  }

  async function mega(method, fields = {}) {
    const operatorId = String(env.MEGA_OPERATOR_ID || '').trim();
    const secretKey = String(env.MEGA_SECRET_KEY || '').trim();
    if (!operatorId || !secretKey) return { ok: false, status: 503, data: { code: 'MEGA_NOT_CONFIGURED' } };
    const requestDateTime = utcSeconds(now());
    const playerId = fields.PlayerId ? String(fields.PlayerId) : '';
    const payload = {
      OperatorId: operatorId,
      RequestDateTime: requestDateTime,
      Signature: megaSignature(method, requestDateTime, operatorId, secretKey, playerId),
      ...fields,
    };
    return upstream(`${megaBase}/${encodeURIComponent(method)}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function vpay(action, fields = {}) {
    if (!vpayTraderId || !vpayApiToken) return { ok: false, status: 503, data: { code: 'VPAY_NOT_CONFIGURED' } };
    const timestamp = Math.floor(now().getTime() / 1000);
    const payload = { action, trader_id: vpayTraderId, ...fields };
    payload.sign = vpaySignature(payload, vpayApiToken, timestamp, vpayTimeZone);
    return upstream(`${vpayBase}/app/v1/trader/rest?t=${timestamp}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  function callbackUrls() {
    const base = publicBase || 'https://SERVICE-URL';
    return {
      ...Object.fromEntries(PROVIDERS.map(name => [name, `${base}/callbacks/${name}`])),
      vpayPayment: `${base}/callbacks/vpay/payment`,
      vpayWithdrawal: `${base}/callbacks/vpay/withdrawal`,
    };
  }

  return async function handler(req, res) {
    // Generated locally: never trust a client-supplied request ID in audit output.
    res.setHeader('X-Request-Id', crypto.randomUUID());
    const origin = String(req.headers.origin || '');
    const originAllowed = allowedOrigins.has(origin);
    const cors = originAllowed ? {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    } : { 'Vary': 'Origin' };
    // Set once so validation errors, admin denials and text callbacks also
    // preserve the same exact-origin policy. CORS never replaces authorization.
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
    if (req.method === 'OPTIONS') {
      const method = String(req.headers['access-control-request-method'] || '').toUpperCase();
      const requestedHeaders = String(req.headers['access-control-request-headers'] || '')
        .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if ((origin && !originAllowed) || (method && !['GET', 'POST', 'OPTIONS'].includes(method))
          || requestedHeaders.some(value => !['authorization', 'content-type'].includes(value))) {
        return send(res, 403, { error: 'cors_request_denied' });
      }
      res.writeHead(204, headers({ ...cors, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' }));
      return res.end();
    }

    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const base = publicBase || 'https://master7-integration-gateway.onrender.com';
        return send(res, 200, {
          ok: true,
          service: 'MASTER7 API',
          version: VERSION,
          status: 'online',
          currency,
          mode: String(env.GATEWAY_MODE || 'uat'),
          health: `${base}/health`,
          readiness: `${base}/readiness`,
          endpoints: {
            megah5Games: `${base}/providers/megah5/games`,
            evo888h5Games: `${base}/providers/evo888h5/games`,
            epicwinGames: `${base}/providers/epicwin/games`,
            kissh5Games: `${base}/providers/918kissh5/games`,
            clotplayGames: `${base}/providers/clotplay/games`,
            jiliGames: `${base}/providers/jili/games?account=1to1`,
            venusGames: `${base}/providers/venus/games`,
            vpayStatus: `${base}/providers/vpay/status`,
            callbacks: `${base}/callbacks`,
          },
        }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, {
          ok: true,
          service: 'master7-integration-gateway',
          version: VERSION,
          currency,
          mode: String(env.GATEWAY_MODE || 'uat'),
          readiness: { scope: 'process_health_only', productionQa: 'not_verified', liveReady: false },
          browserAccess: { allowedOrigins: [...allowedOrigins], credentials: false },
          configured: {
            evo888h5: Boolean(env.EVO_API_TOKEN),
            venus: Boolean(env.VENUS_SITE_CODE && env.VENUS_API_KEY),
            megah5: Boolean(env.MEGA_OPERATOR_ID && env.MEGA_SECRET_KEY),
            epicwin: Object.fromEntries(Object.entries(catalogueProfiles.epicwin.accounts).map(([name, account]) => [name, Boolean(account.id && account.secret)])),
            kissh5: Object.fromEntries(Object.entries(catalogueProfiles['918kissh5'].accounts).map(([name, account]) => [name, Boolean(account.id && account.secret)])),
            clotplay: Boolean(clotplayToken),
            jili: Object.fromEntries(Object.entries(jiliAccounts).map(([name, account]) => [name, Boolean(account.id && account.secret)])),
            vpay: Boolean(vpayTraderId && vpayApiToken),
          },
          callbackUrls: callbackUrls(),
        }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/readiness') {
        return send(res, 200, { service: 'master7-integration-gateway', version: VERSION,
          checkedAt: now().toISOString(), ...integrationReadiness(env) }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/providers/evo888h5/games') {
        const result = await cached('evo-games', () => evo('/game/list'));
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, { provider: 'evo888h5', upstreamStatus: result.status, result: result.data }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/providers/megah5/games') {
        const result = await cached('mega-games', () => mega('GetGameList', { Lang: 'en-us', Currency: currency }));
        const providerOK = Number(result.data && result.data.Status) === 200;
        return send(res, result.ok && providerOK ? 200 : 502, { provider: 'megah5', upstreamStatus: result.status, result: result.data }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/providers/venus/games') {
        const result = await cached('venus-games', async () => ({ ok: true, data: await venusCatalogue({ env, fetchImpl, now }) }));
        return send(res, 200, result.data, cors);
      }

      if (req.method === 'GET' && url.pathname === '/providers/jili/games') {
        const accountName = url.searchParams.get('account') || '1to1';
        if (!Object.prototype.hasOwnProperty.call(jiliAccounts, accountName)) {
          return send(res, 400, { error: 'invalid_catalogue_account' }, cors);
        }
        const account = jiliAccounts[accountName];
        if (!account.id || !account.secret) return send(res, 503, { error: 'catalogue_not_configured' }, cors);
        const endpoint = new URL(`${jiliBase}/GetGameList`);
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
          return send(res, 503, { error: 'jili_invalid_configuration' }, cors);
        }
        const agentId = String(account.id).trim();
        if (!/^[A-Za-z0-9_]+$/.test(agentId)) return send(res, 503, { error: 'jili_invalid_configuration' }, cors);
        const result = await upstream(endpoint.toString(), {
          method: 'POST',
          redirect: 'error',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: jiliCatalogueBody(agentId, String(account.secret), now()),
        });
        if (!result.ok || result.data?.ErrorCode !== 0 || !Array.isArray(result.data?.Data)) {
          return send(res, 502, {
            error: 'provider_catalogue_failed', provider: 'jili', upstreamStatus: result.status,
            providerStatus: Number.isSafeInteger(result.data?.ErrorCode) ? result.data.ErrorCode : null,
          }, cors);
        }
        return send(res, 200, {
          provider: 'jili', account: accountName, currency: 'MYR', ratio: account.ratio,
          games: result.data.Data.map(game => ({
            gameCode: String(game?.GameId ?? ''),
            name: typeof game?.name?.['en-US'] === 'string' ? game.name['en-US'] : '',
            nameZh: typeof game?.name?.['zh-CN'] === 'string' ? game.name['zh-CN'] : '',
            category: String(game?.GameCategoryId ?? ''),
            jackpot: game?.JP === true,
          })),
        }, cors);
      }

      const catalogueMatch = url.pathname.match(/^\/providers\/(epicwin|918kissh5)\/games$/);
      if (req.method === 'GET' && catalogueMatch) {
        const provider = catalogueMatch[1];
        const profile = catalogueProfiles[provider];
        const accountName = url.searchParams.get('account') || 'normal';
        if (!Object.prototype.hasOwnProperty.call(profile.accounts, accountName)) {
          return send(res, 400, { error: 'invalid_catalogue_account' }, cors);
        }
        const account = profile.accounts[accountName];
        if (!account.id || !account.secret) return send(res, 503, { error: 'catalogue_not_configured' }, cors);
        const date = utcSeconds(now());
        const result = await upstream(`${profile.base}/GetGameList`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            OperatorId: String(account.id),
            RequestDateTime: date,
            Signature: megaSignature('GetGameList', date, String(account.id), String(account.secret)),
            Currency: account.currency,
            Lang: 'en-us',
          }),
        });
        if (!result.ok || Number(result.data?.Status) !== 200 || !Array.isArray(result.data?.Game)) {
          const status = Number(result.data?.Status);
          return send(res, 502, {
            error: 'provider_catalogue_failed',
            provider,
            upstreamStatus: result.status,
            providerStatus: Number.isSafeInteger(status) ? status : null,
          }, cors);
        }
        return send(res, 200, {
          provider,
          account: accountName,
          currency: account.currency,
          games: result.data.Game.map(game => ({
            gameCode: String(game.GameCode || ''),
            name: String(game.GameName || game.Name || ''),
            category: String(game.GameType ?? ''),
            imageUrl: typeof game.ImageUrl === 'string' && game.ImageUrl.startsWith('https://') ? game.ImageUrl : null,
          })),
        }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/providers/clotplay/games') {
        const page = url.searchParams.get('page') || '1';
        if (!/^[1-9]\d{0,5}$/.test(page)) return send(res, 400, { error: 'invalid_page' }, cors);
        if (!clotplayToken) return send(res, 503, { error: 'clotplay_not_configured' }, cors);
        const result = await upstream(`${clotplayBase}/get-game-list?per_page=100&page=${page}`, {
          headers: { Accept: 'application/json', Authorization: clotplayToken },
        });
        if (!result.ok || !Array.isArray(result.data && result.data.data)) {
          return send(res, 502, { error: 'clotplay_catalogue_failed', upstreamStatus: result.status }, cors);
        }
        // Project public catalogue fields only; never forward authentication or member data.
        const games = result.data.data.map(game => ({
          gameCode: String(game.slug || ''),
          name: String(game.name || ''),
          nameZh: String(game.name_cn || ''),
          category: String(game.category || ''),
          maintenance: Number(game.is_maintenance) === 1,
          thumbnails: Object.fromEntries(['en', 'cn', 'th'].map(lang => [
            lang, Object.fromEntries(['square', 'portrait'].map(shape => {
              const value = game.thumbnails?.[lang]?.[shape];
              return [shape, typeof value === 'string' && value.startsWith('https://') ? value : null];
            })),
          ])),
        }));
        const pagination = result.data.pagination || {};
        return send(res, 200, {
          provider: 'clotplay',
          games,
          pagination: Object.fromEntries(['current_page', 'last_page', 'per_page', 'total'].map(key => [
            key, Number.isSafeInteger(pagination[key]) && pagination[key] >= 0 ? pagination[key] : null,
          ])),
        }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/callbacks') {
        return send(res, 200, { currency, callbackUrls: callbackUrls() }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/diagnostics/egress-ip') {
        const result = await upstream('https://api64.ipify.org?format=json', { headers: { Accept: 'application/json' } });
        const ip = result.data && typeof result.data.ip === 'string' ? result.data.ip : null;
        return send(res, result.ok && ip ? 200 : 502, { ok: Boolean(result.ok && ip), ip });
      }

      if (req.method === 'GET' && url.pathname === '/providers/vpay/status') {
        return send(res, 200, {
          provider: 'vpay',
          configured: Boolean(vpayTraderId && vpayApiToken),
          mode: String(env.VPAY_MODE || 'uat'),
          readiness: vpayReadiness(env),
          gateway: vpayBase,
          callbackUrls: {
            payment: callbackUrls().vpayPayment,
            withdrawal: callbackUrls().vpayWithdrawal,
          },
        }, cors);
      }

      const vpayCallbackMatch = url.pathname.match(/^\/callbacks\/vpay\/(payment|withdrawal)$/);
      if (vpayCallbackMatch && req.method === 'GET') {
        return send(res, 200, {
          ok: true,
          provider: 'vpay',
          callback: vpayCallbackMatch[1],
          configured: Boolean(vpayTraderId && vpayApiToken),
          currency,
        });
      }
      if (vpayCallbackMatch && req.method === 'POST') {
        if (!vpayTraderId || !vpayApiToken) return send(res, 503, { error: 'vpay_not_configured' });
        const payload = await body(req);
        if (String(payload.trader_id || '') !== vpayTraderId || !verifyVpayNotification(payload, vpayApiToken)) {
          return send(res, 401, { error: 'invalid_vpay_signature' });
        }
        const forwardUrl = vpayCallbackMatch[1] === 'payment'
          ? String(env.VPAY_PAYMENT_FORWARD_URL || '')
          : String(env.VPAY_WITHDRAWAL_FORWARD_URL || '');
        if (!configuredUrl(forwardUrl) || String(env.PLATFORM_CALLBACK_TOKEN || '').length < 32) {
          return send(res, 503, { error: 'platform_wallet_callback_not_configured' });
        }
        const forward = await upstream(forwardUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json,text/plain',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.PLATFORM_CALLBACK_TOKEN}`,
          },
          body: JSON.stringify(payload),
        });
        // Only the platform wallet's explicit durable acknowledgement may stop
        // provider retries. An arbitrary HTTP 200 (e.g. a login page) is not it.
        return forward.ok && forward.acknowledgement
          ? sendText(res, 200, 'SUCCESS')
          : send(res, 502, { error: 'platform_wallet_callback_failed' });
      }

      const callbackMatch = url.pathname.match(/^\/callbacks\/(cosmoplay|creative-gaming|pgsoft|spade-gaming)(?:\/([A-Za-z0-9_-]+))?$/);
      if (callbackMatch && req.method === 'GET') {
        return send(res, 200, { ok: true, provider: callbackMatch[1], callback: 'reachable', currency });
      }
      if (callbackMatch && req.method === 'POST') {
        await body(req);
        return send(res, 503, { ok: false, provider: callbackMatch[1], code: 'CALLBACK_CONTRACT_NOT_ACTIVE' });
      }

      if (req.method === 'POST' && url.pathname === '/admin/vpay/order') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        if (String(env.VPAY_ORDERS_ENABLED || '').toLowerCase() !== 'true') {
          return send(res, 503, { error: 'vpay_orders_disabled' });
        }
        const payload = await body(req);
        const outTradeNo = String(payload.outTradeNo || '');
        const title = String(payload.title || '');
        const amount = String(payload.amount || '');
        const tradeCode = String(payload.tradeCode || '');
        const payerName = String(payload.payerName || '');
        if (!/^[A-Za-z0-9_-]{1,50}$/.test(outTradeNo) || !/^\d{1,7}(?:\.\d{1,2})?$/.test(amount)
          || Number(amount) <= 0
          || !['1', '2', '3', '4', '5', '7'].includes(tradeCode)
          || title.length < 1 || title.length > 100 || payerName.length < 1 || payerName.length > 30) {
          return send(res, 400, { error: 'invalid_vpay_order' });
        }
        if (!vpayReadiness(env).channels.payment.configurationReady) {
          return send(res, 503, { error: 'vpay_payment_configuration_incomplete' });
        }
        const result = await vpay('TRADER_ORDER', {
          title,
          out_trade_no: outTradeNo,
          amount,
          trade_code: tradeCode,
          payer_name: payerName,
          notify_url: callbackUrls().vpayPayment,
          callback_url: String(env.VPAY_RETURN_URL || env.REDIRECT_URL || 'https://www.master7.vip'),
        });
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, {
          provider: 'vpay',
          upstreamStatus: result.status,
          result: result.data,
        });
      }

      if (req.method === 'POST' && ['/admin/vpay/order-query', '/platform/vpay/order-query'].includes(url.pathname)) {
        const walletQuery = url.pathname === '/platform/vpay/order-query';
        if (walletQuery ? !isWalletQueryPeer(req) : !isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const payload = await body(req);
        const outTradeNo = String(payload.outTradeNo || '');
        if (!/^[A-Za-z0-9_-]{1,50}$/.test(outTradeNo)) return send(res, 400, { error: 'invalid_out_trade_no' });
        const tradeNo = String(payload.tradeNo || '');
        if (walletQuery && !/^[A-Za-z0-9_-]{1,128}$/.test(tradeNo)) return send(res, 400, { error: 'invalid_trade_no' });
        const result = await vpay('ORDER_GET', { out_trade_no: outTradeNo, ...(walletQuery ? { trade_no: tradeNo } : {}) });
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, {
          provider: 'vpay',
          upstreamStatus: result.status,
          result: result.data,
        });
      }

      if (req.method === 'POST' && url.pathname === '/admin/vpay/balance') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const result = await vpay('TRADER_BALANCE');
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, {
          provider: 'vpay',
          upstreamStatus: result.status,
          result: result.data,
        });
      }

      if (req.method === 'POST' && url.pathname === '/admin/vpay/withdrawal') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        if (String(env.VPAY_WITHDRAWALS_ENABLED || '').toLowerCase() !== 'true') {
          return send(res, 503, { error: 'vpay_withdrawals_disabled' });
        }
        const payload = await body(req);
        const amount = String(payload.amount || '');
        const bankName = String(payload.bankName || '');
        const accountName = String(payload.accountName || '');
        const accountNumber = String(payload.accountNumber || '');
        const refId = String(payload.refId || '');
        if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(amount) || !/^[A-Za-z0-9]{2,10}$/.test(bankName)
          || Number(amount) <= 0
          || accountName.length < 1 || accountName.length > 100 || !/^[A-Za-z0-9-]{4,40}$/.test(accountNumber)
          || !/^[A-Za-z0-9_-]{1,50}$/.test(refId)) {
          return send(res, 400, { error: 'invalid_vpay_withdrawal' });
        }
        if (!vpayReadiness(env).channels.withdrawal.configurationReady) {
          return send(res, 503, { error: 'vpay_withdrawal_configuration_incomplete' });
        }
        const result = await vpay('MONEY_OUT', {
          amount,
          bank_name: bankName,
          acc_name: accountName,
          acc_no: accountNumber,
          ...(payload.openBankName ? { open_bank_name: String(payload.openBankName) } : {}),
          ref_id: refId,
          notify_url: callbackUrls().vpayWithdrawal,
        });
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, {
          provider: 'vpay',
          upstreamStatus: result.status,
          result: result.data,
        });
      }

      if (req.method === 'POST' && url.pathname === '/admin/vpay/withdrawal-query') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const payload = await body(req);
        const outMoneyId = String(payload.outMoneyId || '');
        if (!/^[A-Za-z0-9_-]{1,50}$/.test(outMoneyId)) return send(res, 400, { error: 'invalid_out_money_id' });
        const result = await vpay('MONEY_GET', { out_money_id: outMoneyId });
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, {
          provider: 'vpay',
          upstreamStatus: result.status,
          result: result.data,
        });
      }

      if (req.method === 'POST' && url.pathname === '/admin/evo888h5/player') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const payload = await body(req);
        if (!/^[A-Za-z0-9]{4,20}$/.test(String(payload.userid || ''))) return send(res, 400, { error: 'invalid_userid' });
        const result = await evo('/user/create', 'POST', { userid: String(payload.userid) });
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, { provider: 'evo888h5', upstreamStatus: result.status, result: result.data });
      }

      if (req.method === 'POST' && url.pathname === '/admin/evo888h5/balance') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const payload = await body(req);
        if (!/^[A-Za-z0-9]{4,20}$/.test(String(payload.userid || ''))) return send(res, 400, { error: 'invalid_userid' });
        const result = await evo('/user/balance', 'POST', { userid: String(payload.userid) });
        const providerOK = result.data?.code === 0 || result.data?.code === '0';
        return send(res, result.ok && providerOK ? 200 : 502, { provider: 'evo888h5', upstreamStatus: result.status, result: result.data });
      }

      if (req.method === 'POST' && url.pathname === '/admin/megah5/session') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const payload = await body(req);
        const playerId = String(payload.playerId || '');
        const gameCode = String(payload.gameCode || '0');
        const ip = String(payload.ip || '');
        if (!/^[A-Za-z0-9._$?-]{1,50}$/.test(playerId) || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return send(res, 400, { error: 'invalid_session_input' });
        const result = await mega('GameLogin', {
          PlayerId: playerId,
          Ip: ip,
          GameCode: gameCode,
          Currency: currency,
          Lang: String(payload.lang || 'en-us'),
          RedirectUrl: String(env.REDIRECT_URL || 'https://www.master7.vip'),
          LaunchDemo: Boolean(payload.demo),
        });
        const providerOK = Number(result.data && result.data.Status) === 200;
        return send(res, result.ok && providerOK ? 200 : 502, { provider: 'megah5', upstreamStatus: result.status, result: result.data });
      }

      return send(res, 404, { error: 'not_found' }, cors);
    } catch (error) {
      const status = Number(error.status) || (['AbortError', 'TimeoutError'].includes(error.name) ? 504 : 500);
      return send(res, status, { error: status === 500 ? 'internal_error' : status === 504 ? 'upstream_timeout' : error.message });
    }
  };
}

function start(env = process.env) {
  const port = Number(env.PORT || 3000);
  const server = http.createServer(makeApp({ env }));
  server.listen(port, '0.0.0.0', () => console.log(`master7-integration-gateway ${VERSION} listening on ${port}`));
  return server;
}

if (require.main === module) start();

module.exports = { makeApp, megaSignature, start, utcSeconds };


