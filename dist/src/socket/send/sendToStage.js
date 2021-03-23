"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const IStore_1 = require("../../store/IStore");
const sendToUser_1 = require("./sendToUser");
const sendToStage = (io, store, stageId, event, payload) => {
    return store
        .readManyByValues(IStore_1.TypeNames.StageMember, { "stageId": stageId })
        .then(stageMembers => stageMembers.forEach(stageMember => sendToUser_1.default(io, stageMember.userId, event, payload)));
};
exports.default = sendToStage;
//# sourceMappingURL=sendToStage.js.map