"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const teckos_1 = require("teckos");
const uWS = require("teckos/uws");
const mongodb_1 = require("mongodb");
const env_1 = require("./env");
const useLogger_1 = require("./useLogger");
const handleSocketConnection_1 = require("./socket/handleSocketConnection");
const Distributor_1 = require("./distributor/Distributor");
const MediasoupStageHandler_1 = require("./handler/MediasoupStageHandler");
const { error, warn, info } = useLogger_1.default("");
const port = env_1.PORT ? parseInt(env_1.PORT, 10) : 4000;
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
let mongoClient = new mongodb_1.MongoClient(env_1.MONGO_URL, {
    poolSize: 10,
    bufferMaxEntries: 0,
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const start = () => __awaiter(void 0, void 0, void 0, function* () {
    mongoClient = yield mongoClient.connect();
    const db = mongoClient.db(env_1.MONGO_DB);
    const distributor = new Distributor_1.default(io, db);
    distributor.addStageHandler(new MediasoupStageHandler_1.default(distributor));
    io.onConnection((socket) => handleSocketConnection_1.default(distributor, socket));
    return io.listen(port);
});
info("Starting ...");
start()
    .then(() => info(`Listening on port${port}`))
    .catch((e) => error(e));
//# sourceMappingURL=index.js.map