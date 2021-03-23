import { UWSProvider } from "teckos";
import * as uWS from "teckos/uws";
import { PORT, REDIS_URL } from "./env";
import logger from "./logger";
import SocketHandler from "./socket/SocketHandler";

const { warn, error, info } = logger("api-server");

const uws = uWS.App();
const io = new UWSProvider(uws, {
  redisUrl: REDIS_URL,
});

io.onConnection(SocketHandler);

const start = () => io.listen(PORT ? parseInt(PORT, 10) : 3000).then();
