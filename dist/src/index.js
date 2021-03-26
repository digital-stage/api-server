"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const teckos_1 = require("teckos");
const uWS = require("teckos/uws");
const mongodb_1 = require("mongodb");
const env_1 = require("./env");
const useLogger_1 = require("./useLogger");
const handleSocketConnection_1 = require("./socket/handleSocketConnection");
const Distributor_1 = require("./distributor/Distributor");
const MediasoupStageHandler_1 = require("./handler/MediasoupStageHandler");
const { error, warn, info } = useLogger_1.default("start");
const port = env_1.PORT ? parseInt(env_1.PORT, 10) : 3000;
if (env_1.REDIS_URL) {
    info("Using redis at " + env_1.REDIS_URL);
}
else {
    warn("Not synchronizing via redis - running in standalone mode");
}
const uws = uWS.App();
const io = new teckos_1.UWSProvider(uws, {
    redisUrl: env_1.REDIS_URL,
});
const store = new mongodb_1.MongoClient(env_1.MONGO_URL, {
    poolSize: 10,
    bufferMaxEntries: 0,
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const db = store.db(env_1.MONGO_DB);
const distributor = new Distributor_1.default(io, db);
distributor.addStageHandler(new MediasoupStageHandler_1.default(distributor));
io.onConnection((socket) => handleSocketConnection_1.default(distributor, socket));
const start = () => store.connect().then(() => io.listen(port));
info("Starting ...");
start()
    .then(() => info(`Listening on port${port}`))
    .catch((e) => error(e));
//# sourceMappingURL=index.js.map