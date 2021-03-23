"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToClient = void 0;
const sendToDevice = (socket, event, payload) => {
    return socket.emit(event, payload);
};
exports.sendToClient = sendToDevice;
exports.default = sendToDevice;
//# sourceMappingURL=sendToDevice.js.map