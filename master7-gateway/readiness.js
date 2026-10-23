'use strict';

// These are configuration gates, not a provider availability or QA attestation.
// Public callback bases are origins; return/forward/provider URLs keep paths and
// query strings. Never apply the origin-only rule to a signed provider request.
function normalizeHttpsUrl(value, { originOnly = false } = {}) {
  if (typeof value !== 'string' || !value || value !== value.trim()
      || /[\u0000-\u0020\u007f-\u009f]/u.test(value) || value.includes('\\')
      || value.includes('#') || !/^https:\/\//i.test(value)
      || /^https:\/\/[^/?#]*@/i.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return '';
    if (originOnly && (url.pathname !== '/' || value.includes('?') || url.port
        || !/^https:\/\/[^/?#]+\/?$/i.test(value))) return '';
    return originOnly ? url.origin : url.href;
  } catch { return ''; }
}

function configuredUrl(value) {
  return Boolean(normalizeHttpsUrl(value));
}

// The callback, query and order credentials share the same byte limits and may
// never alias another peer credential or the full administrator credential.
function peerCredential(env, name) {
  const peers = ['PLATFORM_CALLBACK_TOKEN', 'PLATFORM_QUERY_TOKEN', 'PLATFORM_ORDER_TOKEN'];
  if (!peers.includes(name)) return '';
  const expected = String(env[name] || '');
  const bytes = Buffer.byteLength(expected, 'utf8');
  if (bytes < 32 || bytes > 1024 || ['GATEWAY_ADMIN_TOKEN', ...peers]
    .some(key => key !== name && String(env[key] || '') === expected)) return '';
  return expected;
}

function vpayReadiness(env = {}) {
  const credentialsConfigured = /^\d{1,10}$/.test(String(env.VPAY_TRADER_ID || '').trim())
    && Boolean(String(env.VPAY_API_TOKEN || '').trim());
  const callbackTokenConfigured = Boolean(peerCredential(env, 'PLATFORM_CALLBACK_TOKEN'));
  const baseConfigured = Boolean(normalizeHttpsUrl(env.PUBLIC_BASE_URL, { originOnly: true }));
  const channels = {};
  for (const [kind, flag, target] of [
    ['payment', 'VPAY_ORDERS_ENABLED', 'VPAY_PAYMENT_FORWARD_URL'],
    ['withdrawal', 'VPAY_WITHDRAWALS_ENABLED', 'VPAY_WITHDRAWAL_FORWARD_URL'],
  ]) {
    const enabled = String(env[flag] || '').toLowerCase() === 'true';
    const forwardConfigured = configuredUrl(env[target]);
    const blockers = [];
    if (!credentialsConfigured) blockers.push('provider_credentials_missing');
    if (!baseConfigured) blockers.push('public_callback_base_missing_or_invalid');
    if (!callbackTokenConfigured) blockers.push('platform_callback_token_missing_or_short');
    if (!forwardConfigured) blockers.push('platform_callback_url_missing_or_invalid');
    if (!enabled) blockers.push('transaction_switch_off');
    channels[kind] = {
      enabled, callbackForwardingConfigured: forwardConfigured && callbackTokenConfigured,
      configurationReady: blockers.length === 0, blockers,
      // No persisted supplier acceptance or end-to-end wallet test exists here.
      productionQa: 'not_verified', liveReady: false,
    };
  }
  return { mode: String(env.VPAY_MODE || 'uat'), credentialsConfigured, channels };
}

function integrationReadiness(env = {}) {
  return {
    scope: 'configuration_only',
    productionQa: 'not_verified',
    liveReady: false,
    gameCallbacks: Object.fromEntries(['cosmoplay', 'creative-gaming', 'pgsoft', 'spade-gaming']
      .map(provider => [provider, { reachableRoute: true, businessReady: false, reason: 'callback_contract_not_active' }])),
    vpay: vpayReadiness(env),
  };
}

module.exports = { configuredUrl, normalizeHttpsUrl, peerCredential, vpayReadiness, integrationReadiness };
