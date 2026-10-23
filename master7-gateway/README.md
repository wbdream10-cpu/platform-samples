# MASTER7 integration gateway

Private server-side gateway for Malaysia/MYR provider integration.

Implemented:

- EVO888H5 game-list proxy, user creation and balance lookup.
- MegaH5 signed UAT game-list and game-session requests.
- Stable callback URL reservations for Cosmoplay, Creative Gaming, PGSOFT and Spade Gaming.
- Health reporting without exposing credentials.

Provider secrets are supplied only through Render environment variables. Callback POST requests remain closed until each provider's signed callback contract is implemented; the reachability endpoint does not claim transaction readiness.

## Version 1.7.0: payment validation and truthful readiness

- `/health` remains process liveness (HTTP 200 is not provider QA).
- `/readiness` and `/providers/vpay/status` now distinguish configured credentials,
  transaction switches, secure wallet forwarding, and unverified production QA.
  These checks perform no upstream transaction. `liveReady` stays false because
  this service has no verified end-to-end acceptance record.
- Zero, negative and fractional-cent payment/withdrawal amounts are rejected.
  Orders also require a valid callback base, HTTPS wallet forwarding URL, and a
  platform callback bearer token of at least 32 characters.
- VPay and EVO888H5 require an explicit success code (`0` or `"0"`); null, empty
  strings, arrays, missing fields and provider rejection codes are failures.
- VPay callback forwarding acknowledges a signed notification only after the
  wallet returns HTTP 2xx with the exact plain-text body `SUCCESS`. Empty 204,
  HTML, JSON, declined acknowledgements, redirects and failures stay retryable.
  The wallet must durably and idempotently settle or recognize the notification
  before returning `SUCCESS`; the Gateway does not implement the wallet ledger.
- Requests are limited to 64 KiB in UTF-8 bytes and must be JSON objects.
  Responses from shared provider transport are limited to 2 MiB. Redirects are
  rejected and credential-bearing outbound requests require HTTPS.
- Every response has a server-generated `X-Request-Id`. Timeout messages are
  stable and do not echo upstream URLs or error text.

This release does not enable production payment switches, create players, grant
bonuses, change the Render plan, or complete supplier QA. Existing Render settings
still need `/health` configured as the HTTP health check and a non-sleeping plan
for continuous operation; changing this README does not apply those settings.

`npm test` verifies transport failures, signed callback forwarding and retry,
payment validation, credentials, origin boundaries, and all prior provider tests
with local fixtures. It does not send real payment or withdrawal requests.

## Version 1.6.0: three website origins

Set `ALLOWED_ORIGINS` to a comma-separated exact-origin list in Render:

```text
https://www.master7.vip,https://www.master7.best,https://admin.master7.best
```

The plural setting takes precedence over the legacy `ALLOWED_ORIGIN`. Omitting
both retains the previous `https://www.master7.vip` default. An explicit empty
list disables browser CORS access. Wildcards, URL paths and embedded credentials
are rejected. Configuration changes require a new deployment.

Approved browser origins receive matching CORS headers on successful responses
and errors. Preflight accepts only GET, POST, OPTIONS and Authorization/Content-Type.
This does not enable member login, expose admin tokens, complete DNS setup,
configure Cloudflare crawler access, activate games, or make payments live.
Server callbacks continue to require their existing signature validation.

`/health` reports the release version and effective browser origins without
secrets. Render currently has no HTTP health-check path configured; `/health`
is the recommended path when that setting can be updated through the dashboard.

# Wallet query scope

`POST /platform/vpay/order-query` accepts the dedicated `PLATFORM_QUERY_TOKEN`
and a JSON body containing `outTradeNo` and `tradeNo`. It can only issue
`ORDER_GET` for the configured merchant. This token does not authorize admin
routes, order creation, withdrawals, merchant balances or game operations.
Keep it server-side and separate from the callback-forwarding token. The route
is unavailable to an unset or short token; this source addition does not
configure a token, enable transactions or constitute supplier acceptance.


## Wallet checkout scope (not deployed)

`GET /platform/vpay/config` requires the query credential and returns the
configured merchant ID, environment, enabled method codes and exact callback
URLs. No provider credentials, merchant balance or secrets are included.

`POST /platform/vpay/order` requires a separate `PLATFORM_ORDER_TOKEN` (32–1024
bytes) and the existing order fields plus `notifyUrl` and `callbackUrl`. It can
only create orders. Set `VPAY_ENABLED_TRADE_CODES` to the confirmed active method
codes as a JSON array of strings, and explicitly set the HTTPS `VPAY_RETURN_URL`.
The peer route checks both URLs against server-selected values and refuses
unconfirmed methods. Existing callback routing/readiness and
`VPAY_ORDERS_ENABLED` must also be configured. `VPAY_MODE` must match the wallet's
explicit environment. This label does not prove supplier sandbox access.

Query and order credentials are separate from each other, the callback token and
the full admin token. Neither peer scope grants withdrawals, merchant balances
or game-admin access. Creation retry claims and wallet ledger idempotency live in
the platform; clients must not call the provider directly or reissue uncertain
orders. The existing admin route remains compatible. These source changes do
not configure runtime secrets, activate payment switches, deploy services or
complete production acceptance.
