# MASTER7 callback handoff — not ready for QA

Checked 2026-10-13 07:42–07:43 MYT.

| Provider | Callback URL | Business readiness | Test player |
|---|---|---|---|
| Cosmoplay 游戏 | https://master7-integration-gateway.onrender.com/callbacks/cosmoplay | POST 503；业务未启用 | 尚未创建 |
| Creative Gaming 游戏 | https://master7-integration-gateway.onrender.com/callbacks/creative-gaming | POST 503；业务未启用 | 尚未创建 |
| PGSOFT 游戏 | https://master7-integration-gateway.onrender.com/callbacks/pgsoft | POST 503；业务未启用 | 尚未创建 |
| Spade Gaming 游戏 | https://master7-integration-gateway.onrender.com/callbacks/spade-gaming | POST 503；业务未启用 | 尚未创建 |
| VPay 充值 | https://master7-integration-gateway.onrender.com/callbacks/vpay/payment | GET可达；configured=false | 不适用（支付回调） |
| VPay 提款 | https://master7-integration-gateway.onrender.com/callbacks/vpay/withdrawal | GET可达；configured=false | 不适用（支付回调） |

VPay deposits and withdrawals both use the latest supplied merchant configuration (trader_id 3647). The provider server IP 20.6.12.104 is not a callback endpoint. Gateway: https://gateway.vpay.club ; cashier: https://payment.vpay.club .

The live VPay status is configured=false and mode=uat. There is no verified payment notification handling or automatic wallet crediting. No game test player has been created, no QA has passed, and this handoff has not been sent to any provider.

MASTER7 frontend catalogue code v94 is published (source a60a1600af89b9889cb52d6faaf9b4e0909ed8e0). JILI contains 291 games plus 2 excluded lobbies; 918KISSH5 contains 91 games. Browser/phone QA and game launch are still incomplete.
