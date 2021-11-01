# api-server

Stage and device orchestration server for headless audio clients

## ICE configuration

To optimize latency we decided to use a single cryptographic key for all STUN/TURN servers inside an digital stage infrastructur.
So all routers providing coTURN have to use the same cryptographic key as specified inside the .env of the api-server.

Generate such a token using e.g. openssl:

```shell
openssl rand -base64 32
```

Then propagate this secret inside the .env of all your routers and api-servers:

```shell
TURN_SECRET=2UElWzCA71SlbpHYlXUxBe+fcmFEI45ACn1jV6aFPu0=
```
