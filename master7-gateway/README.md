# MASTER7 integration gateway

Private server-side gateway for Malaysia/MYR provider integration.

Implemented:

- EVO888H5 game-list proxy, user creation and balance lookup.
- MegaH5 signed UAT game-list and game-session requests.
- Stable callback URL reservations for Cosmoplay, Creative Gaming, PGSOFT and Spade Gaming.
- Health reporting without exposing credentials.

Provider secrets are supplied only through Render environment variables. Callback POST requests remain closed until each provider's signed callback contract is implemented; the reachability endpoint does not claim transaction readiness.
