"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const teckos_1 = require("teckos");
const uWS = require("teckos/uws");
const env_1 = require("./env");
const logger_1 = require("./logger");
const SocketHandler_1 = require("./socket/SocketHandler");
const { warn, error, info } = logger_1.default("api-server");
const uws = uWS.App();
const io = new teckos_1.UWSProvider(uws, {
    redisUrl: env_1.REDIS_URL,
});
io.onConnection(SocketHandler_1.default);
const start = () => io.listen(env_1.PORT ? parseInt(env_1.PORT, 10) : 3000)
    .then();
//# sourceMappingURL=index.js.map