# Technical Support Demo — Vendor QA Evidence (Non-transactional)

> **Standalone public-information demo only.** This is not the production customer website. It contains scripted local FAQs, no real AI connection, customer data, accounts, registration, gambling actions, or payments.

## Verified locations and revision
- Preview URL: https://master7-support-vendor-demo.onrender.com/
- Repository: `wbdream10-cpu/platform-samples`, branch `tech-support-preview-20261009`, path `vendor-preview/index.html`
- Render service `srv-db49mscs728c73a2p3vg`, latest page deployment `dep-db4a6j3tqb8s73ek72g0`, commit `3595f177527a6150270018efdf3885ad6cefc59a`, status `live` (2026-10-09).
- QA tracking issue: https://github.com/wbdream10-cpu/-LUCKYWIN52-BOT/issues/6

## Observed test results (2026-10-09)

| Test | Result | Evidence and limits |
| --- | --- | --- |
| Public landing page | **PASS** | Fresh external read returned **HTTP 200** and displayed the demo page. |
| Unknown URL / error handling | **PASS** | `/__qa_not_found_20261009__/` returned **HTTP 404** with plain `Not Found` text. No custom branded error page. |
| Deployment | **PASS** | Render shows latest site-code deployment at commit `3595f177...` as `live`. |
| Three languages | **PASS (live browser)** | Switching zh, ms, en changed the title, privacy labels, and FAQ buttons. |
| FAQ interaction | **PASS (live browser)** | One scripted FAQ answer was clicked and verified in each language. The answers are **not** live AI. |
| Responsive layout | **PASS (local Chromium)** | A separate 156-check local Chromium suite covered 320px, 390px, 768px, and 1280px. Physical iOS/Android devices not tested. |
| FAQ button tap height | **PASS (live browser)** | Old height 38.34px was corrected; new deployed FAQ buttons measured **44px**. |
| Language-selector accessibility name | **PASS (live browser)** | Selector accessible names now match Chinese `语言`, Malay `Bahasa`, and English `Language`. |
| Privacy and contact descriptions | **PASS (live content)** | Both sections exist; real verified support details and a finalized privacy policy still need to be supplied. |
| Demo-only notice | **PASS (live browser)** | Live page states that no real AI, accounts or transactions are connected. |
| Forms / user inputs | **PASS (live DOM)** | Zero forms, input and textarea controls; one language selector. |
| External scripts / links | **PASS (live DOM)** | No external script URLs, and only internal `#support` and `#privacy` links. |
| External resource entries | **PASS (bounded observation)** | Browser performance resource list showed zero external resource loads after page load. Does not certify all possible browser/network activity. |
| HTML content restrictions | **PASS (source review)** | Meta CSP includes `connect-src 'none'`, `form-action 'none'`, and `default-src 'none'`. This is not a complete security assessment. |

## NOT VERIFIED / next acceptance checks
- Physical Android Chrome and iPhone Safari tests; screen-reader compatibility and keyboard focus sequence.
- Complete accessibility audit (including color contrast).
- Browser console error capture, detailed traffic analysis, HTTP response security headers.
- Source-to-CDN byte-for-byte identity (HTML extractors may normalize markup).
- Genuine AI integration and production customer website/admin acceptance; these are outside demo scope.

## Change control
No production system, domain, customer data or transactional workflow was changed by this QA review. The demo Render service has auto-deploy disabled, so this documentation-only GitHub commit does not change the live demo page.
