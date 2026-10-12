'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const VERSION = '1.0.0';
const PROVIDERS = ['cosmoplay', 'creative-gaming', 'pgsoft', 'spade-gaming'];

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
  const allowedOrigin = cleanBase(env.ALLOWED_ORIGIN, 'https://www.master7.vip');
  const evoBase = cleanBase(env.EVO_BASE_URL, 'https://api.evo888h5.com');
  const megaBase = cleanBase(env.MEGA_BASE_URL, 'https://smakermicsvc.back138.com/api/opgateway/v1/op');
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

  function isAdmin(req) {
    const expected = String(env.GATEWAY_ADMIN_TOKEN || '');
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return expected.length >= 32 && safeEqual(expected, supplied);
  }

  async function body(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 65536) throw Object.assign(new Error('request_too_large'), { status: 413 });
    }
    if (!raw) return {};
    try { return JSON.parse(raw); }
    catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
  }

  async function upstream(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const raw = await response.text();
      let data;
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { data = { message: raw.slice(0, 500) }; }
      return { ok: response.ok, status: response.status, data };
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

  function callbackUrls() {
    const base = publicBase || 'https://SERVICE-URL';
    return Object.fromEntries(PROVIDERS.map(name => [name, `${base}/callbacks/${name}`]));
  }

  return async function handler(req, res) {
    const origin = String(req.headers.origin || '');
    const cors = origin === allowedOrigin ? {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    } : {};
    if (req.method === 'OPTIONS') {
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
          status: 'online',
          currency,
          mode: String(env.GATEWAY_MODE || 'uat'),
          health: `${base}/health`,
          endpoints: {
            megah5Games: `${base}/providers/megah5/games`,
            evo888h5Games: `${base}/providers/evo888h5/games`,
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
          configured: {
            evo888h5: Boolean(env.EVO_API_TOKEN),
            megah5: Boolean(env.MEGA_OPERATOR_ID && env.MEGA_SECRET_KEY),
          },
          callbackUrls: callbackUrls(),
        }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/providers/evo888h5/games') {
        const result = await cached('evo-games', () => evo('/game/list'));
        const providerOK = Number(result.data && result.data.code) === 0;
        return send(res, result.ok && providerOK ? 200 : 502, { provider: 'evo888h5', upstreamStatus: result.status, result: result.data }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/providers/megah5/games') {
        const result = await cached('mega-games', () => mega('GetGameList', { Lang: 'en-us', Currency: currency }));
        const providerOK = Number(result.data && result.data.Status) === 200;
        return send(res, result.ok && providerOK ? 200 : 502, { provider: 'megah5', upstreamStatus: result.status, result: result.data }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/callbacks') {
        return send(res, 200, { currency, callbackUrls: callbackUrls() }, cors);
      }

      if (req.method === 'GET' && url.pathname === '/diagnostics/egress-ip') {
        const result = await upstream('https://api64.ipify.org?format=json', { headers: { Accept: 'application/json' } });
        const ip = result.data && typeof result.data.ip === 'string' ? result.data.ip : null;
        return send(res, result.ok && ip ? 200 : 502, { ok: Boolean(result.ok && ip), ip });
      }

      const callbackMatch = url.pathname.match(/^\/callbacks\/(cosmoplay|creative-gaming|pgsoft|spade-gaming)(?:\/([A-Za-z0-9_-]+))?$/);
      if (callbackMatch && req.method === 'GET') {
        return send(res, 200, { ok: true, provider: callbackMatch[1], callback: 'reachable', currency });
      }
      if (callbackMatch && req.method === 'POST') {
        await body(req);
        return send(res, 503, { ok: false, provider: callbackMatch[1], code: 'CALLBACK_CONTRACT_NOT_ACTIVE' });
      }

      if (req.method === 'POST' && url.pathname === '/admin/evo888h5/player') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const payload = await body(req);
        if (!/^[A-Za-z0-9]{4,20}$/.test(String(payload.userid || ''))) return send(res, 400, { error: 'invalid_userid' });
        const result = await evo('/user/create', 'POST', { userid: String(payload.userid) });
        return send(res, result.ok ? 200 : 502, { provider: 'evo888h5', upstreamStatus: result.status, result: result.data });
      }

      if (req.method === 'POST' && url.pathname === '/admin/evo888h5/balance') {
        if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
        const payload = await body(req);
        if (!/^[A-Za-z0-9]{4,20}$/.test(String(payload.userid || ''))) return send(res, 400, { error: 'invalid_userid' });
        const result = await evo('/user/balance', 'POST', { userid: String(payload.userid) });
        return send(res, result.ok ? 200 : 502, { provider: 'evo888h5', upstreamStatus: result.status, result: result.data });
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
      const status = Number(error.status) || (error.name === 'AbortError' ? 504 : 500);
      return send(res, status, { error: status === 500 ? 'internal_error' : error.message });
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
