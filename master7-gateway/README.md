# MASTER7 integration gateway

Private server-side gateway for Malaysia/MYR provider integration.

Implemented:

- EVO888H5 game-list proxy, user creation and balance lookup.
- MegaH5 signed UAT game-list and game-session requests.
- Stable callback URL reservations for Cosmoplay, Creative Gaming, PGSOFT and Spade Gaming.
- Health reporting without exposing credentials.

Provider secrets are supplied only through Render environment variables. Callback POST requests remain closed until each provider's signed callback contract is implemented; the reachability endpoint does not claim transaction readiness.

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

