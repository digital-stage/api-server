"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ClientEvents_1 = require("../types/ClientEvents");
const env_1 = require("../env");
const logger_1 = require("../logger");
const { error, warn, trace } = logger_1.default("socket");
const SocketHandler = (socket) => {
    socket.on(ClientEvents_1.default.ConnectAsRouter, (payload) => {
        const { apiKey, router } = payload;
        if (apiKey) {
            // A router is trying to connect
            if (apiKey === env_1.API_KEY) {
                return this._routerHandler.handle(socket, router).catch((err) => {
                    error(`Router handler reported error: ${err}`);
                    socket.disconnect();
                });
            }
            error(`Router ${router.url} tried to sign in with wrong api key`);
        }
        else {
            error(`Router ${router.url} dit not provide any api key`);
        }
        return socket.disconnect();
    });
    socket.on(ClientEvents_1.default.ConnectWithToken, (payload) => {
        const { token, device } = payload;
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
};
exports.default = SocketHandler;
//# sourceMappingURL=SocketHandler.js.map