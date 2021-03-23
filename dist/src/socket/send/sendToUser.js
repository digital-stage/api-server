"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../../env");
const logger_1 = require("../../logger");
const { trace } = logger_1.default("sendTouser");
const sendToUser = (io, userId, event, payload) => {
    if (env_1.DEBUG_EVENTS) {
        if (env_1.DEBUG_PAYLOAD) {
            trace(`${userId} ${event}: ${JSON.stringify(payload)}`);
        }
        else {
            trace(`${userId}' ${event}`);
        }
    }
    io.to(userId.toString(), event, payload);
};
exports.default = sendToUser;
//# sourceMappingURL=sendToUser.js.map