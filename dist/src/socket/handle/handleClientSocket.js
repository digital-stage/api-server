"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ClientEvents_1 = require("../../../types/ClientEvents");
const IStore_1 = require("../../store/IStore");
const sendToUser_1 = require("../send/sendToUser");
const ServerEvents_1 = require("../../../types/ServerEvents");
const logger_1 = require("../../logger");
const sendToStage_1 = require("../send/sendToStage");
const { error } = logger_1.default("handleClientSocket");
const handleClientSocket = (io, store, socket, user, initialDevice) => {
    // Resolve actions that depends on others, but without permission checks - these are implemented inside the socket handlers
    socket.on(ClientEvents_1.default.ChangeUser, (payload) => {
        // Optimized for performance: first emit, then update
        sendToUser_1.default(io, user.id, ServerEvents_1.default.UserChanged, payload);
        return store.update(IStore_1.TypeNames.User, user.id, payload)
            .catch(e => error(e));
    });
    socket.on(ClientEvents_1.default.ChangeDevice, (payload) => {
        // Security check: first try to update then emit
        return store.update(IStore_1.TypeNames.Device, payload.id, payload, { userId: user.id })
            .then(() => sendToUser_1.default(io, user.id, ServerEvents_1.default.DeviceChanged, payload))
            .catch(e => error(e));
    });
    socket.on(ClientEvents_1.default.CreateStage, (payload) => {
        // Check permissions
        return store.read(IStore_1.TypeNames.User, user.id, { canCreateStage: true })
            .then(() => store.create(IStore_1.TypeNames.Stage, Object.assign(Object.assign({}, payload), { admins: [...payload.admins, user.id] })))
            .then(stage => {
            sendToUser_1.default(io, user.id, ServerEvents_1.default.DeviceChanged, stage);
            return stage;
        })
            // Create default group
            .then(stage => store.create(IStore_1.TypeNames.Group, { stageId: stage.id }))
            .then(group => sendToUser_1.default(io, user.id, ServerEvents_1.default.GroupAdded, group))
            .catch(e => error(e));
    });
    socket.on(ClientEvents_1.default.ChangeStage, (payload) => {
        // Check permissions
        return store.update(IStore_1.TypeNames.Stage, payload.id, payload, { admins: [user.id] })
            .then(() => sendToStage_1.default(io, store, payload.id, ServerEvents_1.default.StageChanged, payload))
            .catch(e => error(e));
    });
    socket.on(ClientEvents_1.default.RemoveStage, (payload) => {
        // Check permissions
        return store.delete(IStore_1.TypeNames.Stage, payload, { admins: [user.id] })
            .then(() => sendToStage_1.default(io, store, payload, ServerEvents_1.default.StageRemoved, payload))
            .then(() => store.deleteMany(IStore_1.TypeNames.Group, { stageId: payload }))
            .then(groupIds => groupIds.map(groupId => sendToStage_1.default(io, store, payload, ServerEvents_1.default.GroupRemoved, groupId)))
            .then(() => store.deleteMany(IStore_1.TypeNames.StageMember, { stageId: payload }))
            .then(stageMemberIds => stageMemberIds.map(stageMemberId => sendToStage_1.default(io, store, payload, ServerEvents_1.default.StageMemberRemoved, stageMemberId)))
            .then(() => store.deleteMany(IStore_1.TypeNames.RemoteAudioTrack, { stageMemberId }));
    });
};
exports.default = handleClientSocket;
//# sourceMappingURL=handleClientSocket.js.map