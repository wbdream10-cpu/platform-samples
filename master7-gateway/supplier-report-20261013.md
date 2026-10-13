
# Game integration report


Site URL: https://www.master7.best/ 
Brand / currency: MASTER7 / MYR

Status: catalogue publication completed for two production providers; production integration and QA are not complete. No test player credentials have been issued. This report is not a go-live approval.

| Frontend display | Count | Evidence |
| --- | --- | --- |

| Sponsored Free Credit - top section | 87 | 918KISSH5 dedicated Free Credit catalogue |

| Regular games - following section | 295 | 291 JILI + 4 remaining 918KISSH5 |

| Unique displayed games | 382 | Sponsored IDs excluded from regular section |


## Catalogue checks


| Provider / environment | Latest evidence | Publication |
| --- | --- | --- |

| JILI / Production | 293 entries: 291 games + 2 lobbies. 1:1 and 1:100 previously matched. | 291 games displayed; lobbies excluded. |

| 918KISSH5 / Production | Normal / MY1: 91 games. Free Credit: 87-game subset. | 87 sponsored + 4 regular. |

| MegaH5 / UAT only | 166 unique game codes returned successfully. | Not counted as production games. |


## Verification limits


The www site and all three catalogue sections returned HTTP 200 at approximately 08:50 MYT on 13 Oct 2026. Displayed data is a published snapshot: JILI 08:22 MYT; 918KISSH5 08:30 MYT. Live refresh is not verified.

Game launch, player registration/login, wallet transfers, settlement and bonus issuance have not passed end-to-end QA. A Free Credit catalogue label does not prove that a bonus has been granted. Mobile visual QA remains pending.


# Blocked integrations


Please review these failures with your technical team. Failed or unverified results are not treated as successful integration.

| Provider | Recorded result | Requested supplier follow-up |
| --- | --- | --- |

| EVO888H5 | 07:42 MYT: code 130, IP address not in whitelist. | Confirm the submitted outbound IP is enabled for the production operator. |

| CLOTPLAY | 07:42 MYT: upstream HTTP 403; gateway HTTP 502. | Check production access, operator permissions and IP restrictions. |

| EPICWIN | Normal: upstream 403 at 07:42. Free: gateway 502 at 08:30. | Check both Normal and Free operator profiles. Provide working catalogue access. |

| VENUS GAMING | 07:42 MYT: venus_response_signature_missing; HTTP 502. | Confirm the response-signature header and signing contract. Verification remains enforced. |

| Cosmoplay | 07:43 MYT: callback POST 503; contract not active. | Provide / confirm callback schema and signatures; test player pending. |

| Creative Gaming | 07:43 MYT: callback POST 503; contract not active. | Provide / confirm callback schema and signatures; test player pending. |

| PGSOFT | 07:43 MYT: callback POST 503; contract not active. | Provide / confirm callback schema and signatures; test player pending. |

| Spade Gaming | 07:43 MYT: callback POST 503; contract not active. | Provide / confirm callback schema and signatures; test player pending. |


## Reserved game callback URLs - not QA-ready


Base: https://master7-integration-gateway.onrender.com

| Provider | Path |
| --- | --- |

| Cosmoplay | /callbacks/cosmoplay |

| Creative Gaming | /callbacks/creative-gaming |

| PGSOFT | /callbacks/pgsoft |

| Spade Gaming | /callbacks/spade-gaming |


# Pending provider onboarding


The following records do not yet have verified, working game catalogues. Credentials were received where noted; credential receipt is not a successful connection.

| Provider / group | Remaining requirement |
| --- | --- |

| MEGA888 | Confirm catalogue API specification and verify a successful response. |

| PEGASUS | Confirm executable catalogue method, authentication and response contract. |

| BT GAMING | Confirm catalogue method and signature rules; perform catalogue check. |

| MEGAWINS | Three API keys not downloaded; secure key onboarding still pending. |

| AWC: NO LIMIT CITY / SEXY BACCARAT / SV388 | Documentation returned 404 / no access. Provide accessible API documentation. |

| Lion King | Historical document found; API contract and catalogue unverified. |

| MICRO GAMING | Official SingleWallet documentation read failed; confirm usable API contract. |

| LFC888 | Catalogue method and signature rules pending. |

| SPRIBE (JDB) | Catalogue and encryption/signature protocol pending. |

| SABA SPORTS | Confirm HTTPS endpoint and sports catalogue protocol. |

| CRAZY GAMING | Transfer-wallet catalogue protocol pending. |

| PLAYTECH | Certificate, Bonus API, reports, required games and supplier QA incomplete. |

| IBEX | API base URL and documentation pending. |

| FACHAI | Catalogue method and signature protocol pending. |

| MARIO | API base URL and documentation pending; back-office URL received. |

| T1 GAMING | BO > Account > Access Information has not been read. |

| GW99 | API base URL and documentation pending; back-office URL received. |

| EVO888 | Separate from EVO888H5. Confirm key format and catalogue protocol. |

| HUAWEI | Website/app links received; no verified catalogue API or signature rules. |


# QA handoff requirements



## Information for the supplier


| Required item | Current value / status |
| --- | --- |

| Site URL | https://www.master7.best/ |

| Test player username | Not created - integration is not ready for player QA. |

| Test player password | Not issued. Share through a secure channel after creation. |

| QA / launch date | Not scheduled; proceed only after supplier QA approval. |


## PLAYTECH mandatory scope


| Bonus type | Code | Status |
| --- | --- | --- |

| Free Spins | 36966 | Integration and reports pending |

| Golden Chips | 36967 | Integration and reports pending |

| Cash Bonus | 36965 | Integration and reports pending |

API certificate is not installed. All 20 supplier-specified Free Spins titles still require inclusion/configuration and verification. Player-level bonus reports and supplier QA are not complete.


## VPay - payment configuration only


Deposit and withdrawal provider: VPay. Configuration presence was confirmed at 07:51 MYT; the gateway remains marked UAT. Callback GET checks returned 200; unsigned empty POST requests returned 401. These checks do not prove a successful payment or settlement.

| Callback | URL |
| --- | --- |

| Payment | https://master7-integration-gateway.onrender.com/callbacks/vpay/payment |

| Withdrawal | https://master7-integration-gateway.onrender.com/callbacks/vpay/withdrawal |

Deposit opens the VPay cashier. Platform automatic crediting, withdrawal initiation and payment business QA remain unverified.


## Next coordination


Supplier: resolve access / whitelist / signature issues and provide missing API contracts. MASTER7: complete adapters, test-player creation, wallet and bonus reports; then submit QA credentials securely. Test against the supplier-approved test environment before any production financial operations.
