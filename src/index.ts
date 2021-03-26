import {UWSProvider} from "teckos";
import * as uWS from "teckos/uws";
import {MongoClient} from "mongodb";
import {MONGO_DB, MONGO_URL, PORT, REDIS_URL} from "./env";
import useLogger from "./useLogger";
import handleSocketConnection from "./socket/handleSocketConnection";
import Distributor from "./distributor/Distributor";
import MediasoupStageHandler from "./handler/MediasoupStageHandler";

const {error, warn, info} = useLogger("");

const port = PORT ? parseInt(PORT, 10) : 4000;

if (REDIS_URL) {
  info("Using redis at " + REDIS_URL);
} else {
  warn("Not synchronizing via redis - running in standalone mode");
}

const uws = uWS.App();
const io = new UWSProvider(uws, {
  redisUrl: REDIS_URL,
});

let mongoClient = new MongoClient(MONGO_URL, {
  poolSize: 10,
  bufferMaxEntries: 0,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const start = async () => {
  mongoClient = await mongoClient.connect();
  const db = mongoClient.db(MONGO_DB);
  const distributor = new Distributor(io, db);
  distributor.addStageHandler(new MediasoupStageHandler(distributor));
  io.onConnection((socket) => handleSocketConnection(distributor, socket));
  return io.listen(port);
}

info("Starting ...");
start()
  .then(() => info(`Listening on port ${port}`))
  .catch((e) => error(e));
