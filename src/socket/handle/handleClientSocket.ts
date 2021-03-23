import ITeckosSocket from "teckos/lib/types/ITeckosSocket";
import { ITeckosProvider } from "teckos";
import { Db } from "mongodb";
import User from "../../../types/model/User";
import Device from "../../../types/model/Device";
import ClientEvents from "../../../types/ClientEvents";
import Payloads from "../../../types/Payloads";
import sendToUser from "../send/sendToUser";
import ServerEvents from "../../../types/ServerEvents";
import logger from "../../logger";
import StageMember from "../../../types/model/StageMember";
import Stage from "../../../types/model/Stage";
import RemoteAudioTrack from "../../../types/model/RemoteAudioTrack";
import Group from "../../../types/model/Group";
import sendToStage from "../send/sendToStage";
import Schema from "../../store/Schema";

const { error } = logger("handleClientSocket");

const handleClientSocket = (
  io: ITeckosProvider,
  store: Db,
  socket: ITeckosSocket,
  user: User,
  initialDevice: Partial<Device>
) => {
  // Resolve actions that depends on others, but without permission checks - these are implemented inside the socket handlers
  // const joinStage = (userId: string, stageId: string) => {};
  // const leaveStage = (userId: string) => {};

  socket.on(ClientEvents.ChangeUser, (payload: Payloads.ChangeUser) => {
    // Optimized for performance: first emit, then update
    sendToUser(
      io,
      user._id,
      ServerEvents.UserChanged,
      payload as Payloads.UserChanged
    );
    return store
      .collection<User>(Schema.User)
      .updateOne({ _id: user._id }, { $set: payload })
      .catch((e) => error(e));
  });

  socket.on(ClientEvents.ChangeDevice, (payload: Payloads.ChangeDevice) => {
    // Security check: first try to update then emit
    return store
      .collection<Device>(Schema.Device)
      .updateOne({ _id: payload._id, userId: user._id }, { $set: payload })
      .then(() =>
        sendToUser(
          io,
          user._id,
          ServerEvents.DeviceChanged,
          payload as Payloads.DeviceChanged
        )
      )
      .catch((e) => error(e));
  });

  socket.on(ClientEvents.CreateStage, (payload: Payloads.CreateStage) => {
    // Check permissions
    return store
      .collection<User>(Schema.User)
      .findOne({ _id: user._id, canCreateStage: true })
      .then((foundUser) => {
        if (!foundUser) throw new Error("No permissions to create a new stage");
        return foundUser;
      })
      .then(() =>
        store
          .collection<Stage>(Schema.Stage)
          .insertOne({ ...payload, admins: [...payload.admins, user._id] })
          .then((result) => {
            sendToUser(
              io,
              user._id,
              ServerEvents.DeviceChanged,
              result.ops[0] as Payloads.StageAdded
            );
            return result.ops[0];
          })
          // Create default group
          .then((stage) =>
            store.collection<Group>(Schema.Group).insertOne({
              stageId: stage._id,
              name: "Default",
              color: "white",
              description: "",
              iconUrl: null,
              muted: false,
              volume: 1,
              x: 0,
              y: 0,
              z: 0,
              rX: 0,
              rY: 0,
              rZ: 0,
            })
          )
          .then((result) =>
            sendToUser(
              io,
              user._id,
              ServerEvents.GroupAdded,
              result.ops[0] as Payloads.GroupAdded
            )
          )
          .catch((e) => error(e))
      );
  });

  socket.on(ClientEvents.ChangeStage, (payload: Payloads.ChangeStage) => {
    // Check permissions
    return store
      .update<Stage>(TypeNames.Stage, payload.id, payload, {
        admins: [user.id],
      })
      .then(() =>
        sendToStage(io, store, payload.id, ServerEvents.StageChanged, payload)
      )
      .catch((e) => error(e));
  });

  socket.on(ClientEvents.RemoveStage, (payload: Payloads.RemoveStage) => {
    // Check permissions
    return store
      .delete<Stage>(TypeNames.Stage, payload, { admins: [user.id] })
      .then(() =>
        sendToStage(io, store, payload, ServerEvents.StageRemoved, payload)
      )
      .then(() =>
        store.deleteMany<Group>(TypeNames.Group, { stageId: payload })
      )
      .then((groupIds) =>
        groupIds.map((groupId) =>
          sendToStage(io, store, payload, ServerEvents.GroupRemoved, groupId)
        )
      )
      .then(() =>
        store.deleteMany<StageMember>(TypeNames.StageMember, {
          stageId: payload,
        })
      )
      .then((stageMemberIds) =>
        stageMemberIds.map((stageMemberId) =>
          sendToStage(
            io,
            store,
            payload,
            ServerEvents.StageMemberRemoved,
            stageMemberId
          )
        )
      )
      .then(() =>
        store.deleteMany<RemoteAudioTrack>(TypeNames.RemoteAudioTrack, {
          stageMemberId,
        })
      );
  });
};
export default handleClientSocket;
