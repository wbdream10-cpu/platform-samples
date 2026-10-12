# VENUS game catalogue

`GET /providers/venus/games` reads the enabled-site catalogue through EliteHubz. Configure `VENUS_SITE_CODE`, `VENUS_API_KEY` and optionally `VENUS_BASE_URL` in Render. Secrets belong only in service environment variables.

Contract: EliteHubz Merchant Integration Document v1.20.3, supplied Google Drive document `1lrEjsK5tN7cUkBtpIz0TEh9lsk5dsXqt`, sections Signature Signing and 1.1 Game list. POST `/api/sm/services/games` with SiteCode, PageNo and PageSize. No provider/category/bonus/lobby filters are added, so the response includes all games enabled for this site. This does not request the unlicensed all-provider catalogue.

Request and response signatures use HMAC-SHA256 over the flattened, sorted, percent-encoded body plus the millisecond timestamp. The documented independent signature example is a test vector. Response timestamps must be within five minutes. HTTPS, redirect refusal, timeout, page bounds, total checks, duplicate rejection and field projection fail closed. Neither a partial catalogue nor a provider error is presented as successful.

Only catalogue reads are implemented. Transfer-wallet operations, player creation, game launch and bonuses are outside this endpoint. Successful catalogue retrieval alone does not establish that the customer website or APK is connected.
