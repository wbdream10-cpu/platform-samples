'use strict';

// These are configuration gates, not a provider availability or QA attestation.
function configuredUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function vpayReadiness(env = {}) {
  const credentialsConfigured = /^\d{1,10}$/.test(String(env.VPAY_TRADER_ID || '').trim())
    && Boolean(String(env.VPAY_API_TOKEN || '').trim());
  const callbackTokenConfigured = String(env.PLATFORM_CALLBACK_TOKEN || '').length >= 32;
  const baseConfigured = configuredUrl(env.PUBLIC_BASE_URL);
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

module.exports = { configuredUrl, vpayReadiness, integrationReadiness };
