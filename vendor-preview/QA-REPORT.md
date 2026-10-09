# MASTER7 Vendor Demo — QA Evidence (Non-transactional)

> This document is for an isolated public informational/technical-support demonstration. **Not the production MASTER7 website. No live AI, accounts, registration, gambling, or payments.**

## Links
- Public demo: https://master7-support-vendor-demo.onrender.com/
- GitHub branch: `tech-support-preview-20261009`
- Demo source: `vendor-preview/index.html`
- Tracking: https://github.com/wbdream10-cpu/-LUCKYWIN52-BOT/issues/6

## Checks (2026-10-09)

| Check | Status | Evidence / caveat |
|---|---|---|
| Public HTTP response | PASS | 2026-10-09, fresh external GET of https://master7-support-vendor-demo.onrender.com/ returned HTTP 200 and `text/html; charset=utf-8`. |
| Render deployment | PASS | Deploy `dep-db49msks728c73a2p6pg` for service `srv-db49mscs728c73a2p3vg` reported `live` at Git commit `4d76cb5a46f8b57b2ba0c98b13113e9ab8462fa3`. |
| Three-language content exists | PASS (source inspection) | GitHub `vendor-preview/index.html` includes Chinese (zh), Bahasa Melayu (ms), and English (en) dictionaries. |
| Mobile CSS | PASS (local test); LIVE NOT VERIFIED | Local Chromium test previously covered widths 320/390/768/1280 with no reported horizontal overflow. Live Android/iOS browser test not completed. |
| FAQ buttons | PASS (local test); LIVE NOT VERIFIED | Local Chromium test previously exercised first scripted FAQ answer in each language. Live click-through failed to produce a result due to remote browser timeout and subsequent concurrency cap. |
| Privacy/contact display | PASS (source inspection) | Page includes privacy and contact information sections and no account form. |
| No outbound data from preview | PASS (source inspection and local test) | The HTML uses a CSP `connect-src 'none'`, `form-action 'none'`, and local FAQ responses. Local test recorded no external network calls; this is not a formal security audit. |
| Live AI model integration | NOT IMPLEMENTED | This is a scripted local FAQ, not a model-connected chatbot. |
| Production website / customer accounts | OUT OF SCOPE | This demo is separate from www.master7.vip and contains no signup, login, gambling or payment functionality. |

## Outstanding acceptance work
- Live-browser Chinese / Malay / English selector and FAQ-click tests on deployed URL.
- Actual Android Chrome, iPhone Safari and desktop viewport review, not only local Chromium.
- Accessibility audit: keyboard tab order, contrast, screen reader labeling, focus visibility.
- Vendor confirmation that privacy and contact text is appropriate before any real launch.

## Important interpretation
A `live` Render deployment or HTTP 200 response verifies site availability, not application features. Earlier HTTP 404 was not reproduced during the latest external fetch. The remote interaction tool timed out and then reported its concurrency limit, so it produced no trustworthy pass/fail evidence for live clicks.

## Change control
The demo lives on a separate public GitHub branch and a separate Render static site, with `autoDeploy` off. **No updates to `www.master7.vip`, customer records, admin systems or payment flows.**
