import ITeckosSocket from "teckos/lib/types/ITeckosSocket";
import {ObjectId} from "mongodb";
import User from "../types/model/User";
import Device from "../types/model/Device";
import ClientDeviceEvents from "../types/ClientDeviceEvents";
import useLogger from "../useLogger";
import Distributor from "../distributor/Distributor";
import ServerDeviceEvents from "../types/ServerDeviceEvents";
import ClientDevicePayloads from "../types/ClientDevicePayloads";
import ChatMessage from "../types/model/ChatMessage";

const {error, trace} = useLogger("socket:client");

const handleSocketClientConnection = async (
  distributor: Distributor,
  socket: ITeckosSocket,
  user: User<ObjectId>,
  initialDevice: Partial<Device<ObjectId>>
): Promise<Device<ObjectId>> => {
  let device: Device<ObjectId>;
  if (initialDevice.uuid) {
    device = await distributor.readDeviceByUserAndUUID(
      user._id,
      initialDevice.uuid
    );
    if (device) {
      // Update status
      trace(`Found existing device with uuid ${initialDevice.uuid}`);
      await distributor.updateDevice(user._id, device._id, {
        online: true,
        lastLoginAt: new Date(),
      });
    }
  }
  if (!device) {
    device = await distributor.createDevice({
      ...initialDevice,
      userId: user._id,
    });
  }

  socket.on("disconnect", () => {
    if (device.uuid) {
      trace(`Set device ${device._id} offline`);
      return distributor.updateDevice(user._id, device._id, {online: false});
    }
    trace(`Removing device ${device._id}`);
    return distributor.deleteDevice(device._id);
  });

  Distributor.sendToDevice(socket, ServerDeviceEvents.LocalDeviceReady, device);

  // USER
  socket.on(
    ClientDeviceEvents.ChangeUser,
    (payload: ClientDevicePayloads.ChangeUser) => {
      trace(`${user.name}: ${ClientDeviceEvents.ChangeUser}(${payload})`);
      return distributor
        .updateUser(new ObjectId(user._id), payload)
        .catch((e) => error(e));
    }
  );
  socket.on(ClientDeviceEvents.RemoveUser, () => {
    trace(`${user.name}: ${ClientDeviceEvents.RemoveUser}`);
    return distributor.deleteUser(user._id).catch((e) => error(e));
  });
  // DEVICE
  socket.on(
    ClientDeviceEvents.ChangeDevice,
    (payload: ClientDevicePayloads.ChangeDevice) => {
      trace(`${user.name}: ${ClientDeviceEvents.ChangeDevice}(${payload})`);
      const {_id, ...data} = payload;
      const id = new ObjectId(_id);
      return distributor
        .updateDevice(new ObjectId(user._id), id, {
          ...data,
          availableSoundCardIds: payload.availableSoundCardIds,
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.SendChatMessage,
    (payload: ClientDevicePayloads.SendChatMessage) => {
      trace(`${user.name}: ${ClientDeviceEvents.SendChatMessage}(${payload})`);
      return distributor
        .readUser(user._id)
        .then((currentUser) => {
          if (currentUser && currentUser.stageId && currentUser.stageMemberId) {
            const chatMessage: ChatMessage<any> = {
              userId: currentUser._id,
              stageMemberId: currentUser.stageMemberId,
              message: payload,
              time: Date.now(),
            };
            return distributor.sendToStage(
              currentUser.stageId,
              ServerDeviceEvents.ChatMessageSend,
              chatMessage
            );
          }
          throw new Error(
            `User ${user.name} is outside any stages and cannot send chat messages`
          );
        })
        .catch((e) => error(e));
    }
  );
  // STAGE
  socket.on(
    ClientDeviceEvents.CreateStage,
    (payload: ClientDevicePayloads.CreateStage) => {
      trace(`${user.name}: ${ClientDeviceEvents.CreateStage}(${payload})`);
      return distributor
        .readUser(user._id)
        .then((currentUser) => {
          if (currentUser.canCreateStage) {
            return distributor.createStage({
              ...payload,
              admins: payload.admins ? [...payload.admins, user._id] : [user._id],
              soundEditors: payload.soundEditors ? [...payload.soundEditors, user._id] : [user._id]
            });
          }
          throw new Error(
            `User ${user.name} has no privileges to create a stage`
          );
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.ChangeStage,
    (payload: ClientDevicePayloads.ChangeStage) => {
      trace(`${user.name}: ${ClientDeviceEvents.ChangeStage}(${payload})`);
      const {_id, ...data} = payload;
      const id = new ObjectId(_id);
      return distributor
        .readAdministratedStage(user._id, id)
        .then((stage) => {
          if (stage) {
            return distributor.updateStage(id, data);
          }
          throw new Error(
            `User ${user.name} has no privileges to update the stage ${id}`
          );
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveStage,
    (payload: ClientDevicePayloads.RemoveStage) => {
      trace(`${user.name}: ${ClientDeviceEvents.RemoveStage}(${payload})`);
      const id = new ObjectId(payload);
      return distributor
        .readAdministratedStage(user._id, id)
        .then((stage) => {
          if (stage) {
            return distributor.deleteStage(id);
          }
          throw new Error(
            `User ${user.name} has no privileges to remove the stage ${id}`
          );
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.CreateGroup,
    (payload: ClientDevicePayloads.CreateGroup) => {
      trace(`${user.name}: ${ClientDeviceEvents.CreateGroup}(${payload})`);
      const stageId = new ObjectId(payload.stageId);
      distributor
        .readAdministratedStage(user._id, stageId)
        .then((stage) => {
          if (stage) {
            return distributor.createGroup({
              name: payload.name,
              description: "",
              x: 0,
              y: 0,
              z: 0,
              rX: 0,
              rY: 0,
              rZ: 0,
              iconUrl: null,
              volume: 1,
              muted: false,
              ...payload,
              stageId,
            });
          }
          throw new Error(
            `User ${user.name} has no privileges to add group for stage ${stageId}`
          );
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.ChangeGroup,
    (payload: ClientDevicePayloads.ChangeGroup) => {
      trace(`${user.name}: ${ClientDeviceEvents.ChangeGroup}(${payload})`);
      const {_id, ...data} = payload;
      const id = new ObjectId(_id);
      return distributor
        .readGroup(id)
        .then((group) => {
          if (group) {
            return distributor
              .readAdministratedStage(user._id, group.stageId)
              .then((stage) => {
                if (stage) {
                  return distributor.updateGroup(id, data);
                }
                throw new Error(
                  `User ${user.name} has no privileges to change group ${group.name}`
                );
              });
          }
          throw new Error(`Unknown group ${id}`);
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveGroup,
    (payload: ClientDevicePayloads.RemoveGroup) => {
      trace(`${user.name}: ${ClientDeviceEvents.RemoveGroup}(${payload})`);
      // REMOVE GROUP
      const id = new ObjectId(payload);
      return distributor
        .readGroup(id)
        .then((group) => {
          if (group) {
            return distributor
              .readAdministratedStage(user._id, group.stageId)
              .then((stage) => {
                if (stage) return distributor.deleteGroup(id);
                throw new Error(
                  `User ${user.name} has no privileges to remove group ${id}`
                );
              });
          }
          throw new Error(`Could not find and delete group ${id}`);
        })
        .catch((e) => error(e));
    }
  );

  socket.on(
    ClientDeviceEvents.SetCustomGroupPosition,
    (payload: ClientDevicePayloads.SetCustomGroupPosition) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.SetCustomGroupPosition}(${payload})`
      );
      const groupId = new ObjectId(payload.groupId);
      const deviceId = new ObjectId(payload.deviceId);
      return distributor
        .upsertCustomGroupPosition(user._id, groupId, deviceId, payload)
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.SetCustomGroupVolume,
    (payload: ClientDevicePayloads.SetCustomGroupVolume) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.SetCustomGroupVolume}(${payload})`
      );
      const groupId = new ObjectId(payload.groupId);
      const deviceId = new ObjectId(payload.deviceId);
      return distributor
        .upsertCustomGroupVolume(user._id, groupId, deviceId, payload)
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveCustomGroupPosition,
    (payload: ClientDevicePayloads.RemoveCustomGroupPosition) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveCustomGroupPosition}(${payload})`
      );
      const id = new ObjectId(payload);
      return distributor
        .readCustomGroupPosition(id)
        .then((customPosition) => {
          if (customPosition) {
            if (customPosition.userId.equals(user._id)) {
              return distributor.deleteCustomGroupPosition(id);
            }
            throw new Error(
              `User ${user.name} has no privileges to remove custom group position ${id}`
            );
          }
          throw new Error(`Unknown custom group position ${id}`);
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveCustomGroupVolume,
    (payload: ClientDevicePayloads.RemoveCustomGroupVolume) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveCustomGroupVolume}(${payload})`
      );
      const id = new ObjectId(payload);
      return distributor
        .readCustomGroupVolume(id)
        .then((customVolume) => {
          if (customVolume) {
            if (customVolume.userId.equals(user._id)) {
              return distributor.deleteCustomGroupVolume(id);
            }
            throw new Error(
              `User ${user.name} has no privileges to remove custom group volume ${id}`
            );
          }
          throw new Error(`Unknown custom group volume ${id}`);
        })
        .catch((e) => error(e));
    }
  );

  socket.on(
    ClientDeviceEvents.ChangeStageMember,
    (payload: ClientDevicePayloads.ChangeStageMember) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.ChangeStageMember}(${payload})`
      );
      const {_id, ...data} = payload;
      const id = new ObjectId(_id);
      return distributor
        .readStageMember(id)
        .then((stageMember) => {
          if (stageMember) {
            return distributor
              .readManagedStage(user._id, stageMember.stageId)
              .then((stage) => {
                if (stage) {
                  return distributor.updateStageMember(id, data);
                }
                throw new Error(
                  `User ${user.name} has no privileges to change stage member ${id}`
                );
              });
          }
          throw new Error(`Unknown stage member ${id}`);
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveStageMember,
    (payload: ClientDevicePayloads.RemoveStageMember) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveStageMember}(${payload})`
      );
      const id = new ObjectId(payload);
      return distributor
        .readStageMember(id)
        .then((stageMember) => {
          if (stageMember) {
            return distributor
              .readManagedStage(user._id, stageMember.stageId)
              .then((stage) => {
                if (stage) {
                  return distributor.deleteStageMember(id);
                }
                throw new Error(
                  `User ${user.name} has no privileges to remove stage member ${id}`
                );
              });
          }
          throw new Error(`Unknown stage member ${id}`);
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.SetCustomStageMemberPosition,
    (payload: ClientDevicePayloads.SetCustomStageMemberPosition) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.SetCustomStageMemberPosition}(${payload})`
      );
      const stageMemberId = new ObjectId(payload.stageMemberId);
      const deviceId = new ObjectId(payload.deviceId);
      return distributor
        .upsertCustomStageMemberPosition(
          user._id,
          stageMemberId,
          deviceId,
          payload
        )
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.SetCustomStageMemberVolume,
    (payload: ClientDevicePayloads.SetCustomStageMemberVolume) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.SetCustomStageMemberVolume}(${payload})`
      );
      const stageMemberId = new ObjectId(payload.stageMemberId);
      const deviceId = new ObjectId(payload.deviceId);
      return distributor
        .upsertCustomStageMemberVolume(
          user._id,
          stageMemberId,
          deviceId,
          payload
        )
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveCustomStageMemberPosition,
    (payload: ClientDevicePayloads.RemoveCustomStageMemberPosition) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveCustomStageMemberPosition}(${payload})`
      );
      const id = new ObjectId(payload);
      return distributor
        .readCustomStageMemberPosition(id)
        .then((customPosition) => {
          if (customPosition) {
            if (customPosition.userId.equals(user._id)) {
              return distributor.deleteCustomStageMemberPosition(id);
            }
            throw new Error(
              `User ${user.name} has no privileges to remove custom stage member position ${id}`
            );
          }
          throw new Error(`Unknown custom stage member position ${id}`);
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveCustomStageMemberVolume,
    (payload: ClientDevicePayloads.RemoveCustomStageMemberVolume) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveCustomStageMemberVolume}(${payload})`
      );
      const id = new ObjectId(payload);
      return distributor
        .readCustomStageMemberVolume(id)
        .then((customVolume) => {
          if (customVolume) {
            if (customVolume.userId.equals(user._id)) {
              return distributor.deleteCustomStageMemberVolume(id);
            }
            throw new Error(
              `User ${user.name} has no privileges to remove custom stage member volume ${id}`
            );
          }
          throw new Error(`Unknown custom stage member volume ${id}`);
        })
        .catch((e) => error(e));
    }
  );

  socket.on(
    ClientDeviceEvents.CreateLocalAudioTrack,
    (payload: ClientDevicePayloads.CreateLocalAudioTrack) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.CreateLocalAudioTrack}(${payload})`
      );
      return distributor
        .createLocalAudioTrack({
          type: "",
          ...payload,
          userId: user._id,
          deviceId: device._id,
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.ChangeLocalAudioTrack,
    (payload: ClientDevicePayloads.ChangeLocalAudioTrack) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.ChangeLocalAudioTrack}(${payload})`
      );
      const {_id, ...data} = payload;
      const id = new ObjectId(_id);
      return distributor
        .updateLocalAudioTrack(user._id, id, data)
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveLocalAudioTrack,
    (payload: ClientDevicePayloads.RemoveLocalAudioTrack) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveLocalAudioTrack}(${payload})`
      );
      const id = new ObjectId(payload);
      return distributor
        .deleteLocalAudioTrack(user._id, id)
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.CreateLocalVideoTrack,
    (payload: ClientDevicePayloads.CreateLocalVideoTrack) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.CreateLocalVideoTrack}(${payload})`
      );
      return distributor
        .createLocalVideoTrack({
          type: "",
          ...payload,
          userId: user._id,
          deviceId: device._id,
        })
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.ChangeLocalVideoTrack,
    (payload: ClientDevicePayloads.ChangeLocalVideoTrack) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.ChangeLocalVideoTrack}(${payload})`
      );
      const {_id, ...data} = payload;
      const id = new ObjectId(_id);
      return distributor
        .updateLocalVideoTrack(user._id, id, data)
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveLocalVideoTrack,
    (payload: ClientDevicePayloads.RemoveLocalVideoTrack) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveLocalVideoTrack}(${payload})`
      );
      const id = new ObjectId(payload);
      return distributor
        .deleteLocalVideoTrack(user._id, id)
        .catch((e) => error(e));
    }
  );

  socket.on(
    ClientDeviceEvents.ChangeRemoteAudioTrack,
    (payload: ClientDevicePayloads.ChangeRemoteAudioTrack) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.ChangeRemoteAudioTrack}(${payload})`
      );
      const {_id, ...data} = payload;
      const id = new ObjectId(_id);
      return distributor
        .readRemoteAudioTrack(id)
        .then((remoteAudioTrack) => {
          if (remoteAudioTrack) {
            return distributor
              .readManagedStage(user._id, remoteAudioTrack.stageId)
              .then((stage) => {
                if (stage) {
                  return distributor.updateRemoteAudioTrack(id, data);
                }
                throw new Error(
                  `User ${user.name} has no privileges to change remote audio track ${id}`
                );
              });
          }
          throw new Error(`Unknown remote audio track ${id}`);
        })
        .catch((e) => error(e));
    }
  );

  socket.on(
    ClientDeviceEvents.SetCustomRemoteAudioTrackPosition,
    (payload: ClientDevicePayloads.SetCustomRemoteAudioTrackPosition) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.SetCustomRemoteAudioTrackPosition}(${payload})`
      );
      const remoteAudioTrackId = new ObjectId(payload.remoteAudioTrackId);
      const deviceId = new ObjectId(payload.deviceId);
      return distributor
        .upsertCustomRemoteAudioTrackPosition(
          user._id,
          remoteAudioTrackId,
          deviceId,
          payload
        )
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.SetCustomRemoteAudioTrackVolume,
    (payload: ClientDevicePayloads.SetCustomRemoteAudioTrackVolume) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.SetCustomRemoteAudioTrackVolume}(${payload})`
      );
      const remoteAudioTrackId = new ObjectId(payload.remoteAudioTrackId);
      const deviceId = new ObjectId(payload.deviceId);
      return distributor
        .upsertCustomRemoteAudioTrackVolume(
          user._id,
          remoteAudioTrackId,
          deviceId,
          payload
        )
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveCustomRemoteAudioTrackPosition,
    (payload: ClientDevicePayloads.RemoveCustomRemoteAudioTrackPosition) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveCustomRemoteAudioTrackPosition}(${payload})`
      );
      const customRemoteAudioTrackPositionId = new ObjectId(payload);
      return distributor
        .deleteCustomRemoteAudioTrackPosition(customRemoteAudioTrackPositionId)
        .catch((e) => error(e));
    }
  );
  socket.on(
    ClientDeviceEvents.RemoveCustomRemoteAudioTrackVolume,
    (payload: ClientDevicePayloads.RemoveCustomRemoteAudioTrackVolume) => {
      trace(
        `${user.name}: ${ClientDeviceEvents.RemoveCustomRemoteAudioTrackVolume}(${payload})`
      );
      const customRemoteAudioTrackVolumeId = new ObjectId(payload);
      return distributor
        .deleteCustomRemoteAudioTrackVolume(customRemoteAudioTrackVolumeId)
        .catch((e) => error(e));
    }
  );

  // STAGE ASSIGNMENT HANDLING
  socket.on(
    ClientDeviceEvents.JoinStage,
    (payload: ClientDevicePayloads.JoinStage, fn: (error?: string) => void) => {
      trace(`${user.name}: ${ClientDeviceEvents.JoinStage}`);
      const stageId = new ObjectId(payload.stageId);
      const groupId = new ObjectId(payload.groupId);
      return distributor
        .joinStage(user._id, stageId, groupId, payload.password)
        .then(() =>
          trace(`${user.name} joined stage ${stageId} and group ${groupId}`)
        )
        .then(() => fn())
        .catch((e) => {
          error(e);
          return fn(e.message);
        });
    }
  );
  socket.on(ClientDeviceEvents.LeaveStage, () => {
    trace(`${user.name}: ${ClientDeviceEvents.LeaveStage}`);
    distributor
      .leaveStage(user._id)
      .then(() => trace(`${user.name} left stage`))
      .catch((e) => error(e));
  });

  socket.on(
    ClientDeviceEvents.LeaveStageForGood,
    (payload: ClientDevicePayloads.LeaveStageForGood) => {
      trace(`${user.name}: ${ClientDeviceEvents.LeaveStageForGood}`);
      // LEAVE STAGE FOR GOOD
      const stageId = new ObjectId(payload);
      return distributor
        .leaveStageForGood(user._id, stageId)
        .then(() => trace(`${user.name} left stage ${stageId} for good`))
        .catch((e) => error(e));
    }
  );

  await distributor.sendStageDataToDevice(socket, user);
  Distributor.sendToDevice(socket, ServerDeviceEvents.UserReady, user);
  socket.join(user._id.toString());
  Distributor.sendToDevice(socket, ServerDeviceEvents.Ready);
  trace(
    `Registered socket handler for user ${user.name} and device ${device._id} at socket ${socket.id}`
  );
  return device;
};
export default handleSocketClientConnection;
