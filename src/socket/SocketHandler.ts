import ITeckosSocket from "teckos/lib/types/ITeckosSocket";
import {ITeckosSocketHandler} from "teckos/lib/types/ITeckosSocketHandler";
import ClientEvents from "../types/ClientEvents";
import Payloads from "../types/Payloads";
import {API_KEY} from "../env";
import logger from "../logger";

const { error, warn, trace } = logger("socket");

const SocketHandler: ITeckosSocketHandler = (socket: ITeckosSocket) => {
    socket.on(ClientEvents.ConnectAsRouter, (payload: Payloads.ConnectAsRouter) => {
        const {apiKey, router} = payload;
        if (apiKey) {
            // A router is trying to connect
            if (apiKey === API_KEY) {
                return this._routerHandler.handle(socket, router).catch((err) => {
                    error(`Router handler reported error: ${err}`);
                    socket.disconnect();
                });
            }
            error(`Router ${router.url} tried to sign in with wrong api key`);
        } else {
            error(`Router ${router.url} dit not provide any api key`);
        }
        return socket.disconnect();
    });

    socket.on(ClientEvents.ConnectWithToken, (payload: Payloads.ConnectWithToken) => {
        const {token, device} = payload;
        trace("New connection with token");
        if (token) {
            return this._userHandler.handle(socket, token, device).catch((e) => {
                socket.disconnect();
                error(e);
            });
        }
        warn("Attempt to connect with invalid token");
        return socket.disconnect();
    });
}
export default SocketHandler;
