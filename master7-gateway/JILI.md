# JILI read-only game catalogue

The MASTER7 JILI MYR accounts are separate profiles. The ratio is descriptive metadata; this connector performs no currency conversion or wallet operation.

| Public read route | Server environment variables |
| --- | --- |
| `/providers/jili/games?account=1to1` (default) | `JILI_1TO1_AGENT_ID`, `JILI_1TO1_AGENT_KEY` |
| `/providers/jili/games?account=1to100` | `JILI_1TO100_AGENT_ID`, `JILI_1TO100_AGENT_KEY` |

Use `JILI_BASE_URL` for the merchant-assigned HTTPS API base. Default: `https://wb-api-2.jiscc77s.com/api1`. The supplied alternatives are `https://wb-api-2.jismk2u.com/api1` and `https://wb-api-2.kijl788du.com/api1`; no automatic credential forwarding between hosts. IDs and keys must be set in the deployment environment. A profile never inherits the other profile's key.

Protocol source read 2026-10-13: https://wbgame.tadagaming.com/sss-doc/SSS_Seamless_API_Manual_TW.html sections 1.1.1–1.1.3 and 3.1.6.1. This documents the legacy `GetGameList` without a currency argument; the `/sss/GetGameList` route is for a separate currency-aware SSS contract and is not used here. Compatibility and account permissions on the assigned MYR production endpoints still require a successful live response.

The signature uses fixed UTC-4, `yyMMd`, then two MD5 operations and six random characters on either side. Requests are form-encoded POSTs containing AgentId and computed Key. Redirects are rejected. Only game IDs, names, category IDs and jackpot flags are returned; provider messages and credentials are excluded.

`/health` only indicates that both environment fields exist for a profile. It does not verify credentials, production access, launch permission or a playable frontend. There are no launch, wallet, transfer or betting routes in this connector.
