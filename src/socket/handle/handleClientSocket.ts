import ITeckosSocket from "teckos/lib/types/ITeckosSocket";
import User from "../../../types/model/User";
import Device from "../../../types/model/Device";
import ClientEvents from "../../../types/ClientEvents";
import Payloads from "../../../types/Payloads";
import IStore, {TypeNames} from "../../store/IStore";
import sendToUser from "../send/sendToUser";
import {ITeckosProvider} from "teckos";
import ServerEvents from "../../../types/ServerEvents";
import logger from "../../logger";
import StageMember from "../../../types/model/StageMember";
import Stage from "../../../types/model/Stage";
import RemoteAudioTrack from "../../../types/model/RemoteAudioTrack";
import Group from "../../../types/model/Group";
import sendToStage from "../send/sendToStage";

const {error} = logger("handleClientSocket");

const handleClientSocket = (io: ITeckosProvider, store: IStore, socket: ITeckosSocket, user: User, initialDevice: Partial<Device>) => {
    // Resolve actions that depends on others, but without permission checks - these are implemented inside the socket handlers

    socket.on(ClientEvents.ChangeUser, (payload: Payloads.ChangeUser) => {
        // Optimized for performance: first emit, then update
        sendToUser(io, user.id, ServerEvents.UserChanged, payload as Payloads.UserChanged);
        return store.update<User>(TypeNames.User, user.id, payload)
            .catch(e => error(e));
    });

    socket.on(ClientEvents.ChangeDevice, (payload: Payloads.ChangeDevice) => {
        // Security check: first try to update then emit
        return store.update(TypeNames.Device, payload.id, payload, {userId: user.id})
            .then(() => sendToUser(io, user.id, ServerEvents.DeviceChanged, payload as Payloads.DeviceChanged))
            .catch(e => error(e));
    });

    socket.on(ClientEvents.CreateStage, (payload: Payloads.CreateStage) => {
        // Check permissions
        return store.read<User>(TypeNames.User, user.id, {canCreateStage: true})
            .then(() => store.create<Stage>(TypeNames.Stage, {...payload, admins: [...payload.admins, user.id]}))
            .then(stage => {
                sendToUser(io, user.id, ServerEvents.DeviceChanged, stage as Payloads.StageAdded);
                return stage;
            })
            // Create default group
            .then(stage => store.create<Group>(TypeNames.Group, {stageId: stage.id}))
            .then(group => sendToUser(io, user.id, ServerEvents.GroupAdded, group))
            .catch(e => error(e));
    });

    socket.on(ClientEvents.ChangeStage, (payload: Payloads.ChangeStage) => {
        // Check permissions
        return store.update<Stage>(TypeNames.Stage, payload.id, payload, {admins: [user.id]})
            .then(() => sendToStage(io, store, payload.id, ServerEvents.StageChanged, payload))
            .catch(e => error(e));
    });

    socket.on(ClientEvents.RemoveStage, (payload: Payloads.RemoveStage) => {
        // Check permissions
        return store.delete<Stage>(TypeNames.Stage, payload, {admins: [user.id]})
            .then(() => sendToStage(io, store, payload, ServerEvents.StageRemoved, payload))
            .then(() => store.deleteMany<Group>(TypeNames.Group, {stageId: payload}))
            .then(groupIds => groupIds.map(groupId => sendToStage(io, store, payload, ServerEvents.GroupRemoved, groupId)))
            .then(() => store.deleteMany<StageMember>(TypeNames.StageMember, {stageId: payload}))
            .then(stageMemberIds => stageMemberIds.map(stageMemberId => sendToStage(io, store, payload, ServerEvents.StageMemberRemoved, stageMemberId)))
            .then(() => store.deleteMany<RemoteAudioTrack>(TypeNames.RemoteAudioTrack, {stageMemberId}))
    });

}
export default handleClientSocket;