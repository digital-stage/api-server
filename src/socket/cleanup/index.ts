import ITeckosProvider from "teckos/lib/types/ITeckosProvider";
import IStore, {TypeNames} from "../../store/IStore";
import CustomStageMemberPosition from "../../../types/model/CustomStageMemberPosition";
import CustomStageMemberVolume from "../../../types/model/CustomStageMemberVolume";
import Group from "../../../types/model/Group";
import StageMember from "../../../types/model/StageMember";
import CustomRemoteAudioTrackPosition from "../../../types/model/CustomRemoteAudioTrackPosition";
import sendToDevice from "../send/sendToDevice";
import RemoteAudioTrack from "../../../types/model/RemoteAudioTrack";
import sendToUser from "../send/sendToUser";
import ServerEvents from "../../../types/ServerEvents";
import CustomRemoteAudioTrackVolume from "../../../types/model/CustomRemoteAudioTrackVolume";
import sendToStage from "../send/sendToStage";


const cleanUpRemoteAudioTrack = async (socket: ITeckosProvider, store: IStore, id: string, stageId: string) => Promise.all([
  // Delete all customized data and inform user
  store.readMany<CustomRemoteAudioTrackPosition>(TypeNames.CustomRemoteAudioTrackPosition, {remoteAudioTrackId: id})
    .then(positions => positions.map(position => store.delete<CustomRemoteAudioTrackPosition>(TypeNames.CustomRemoteAudioTrackPosition, position.id)
      .then(() => sendToUser(socket, position.userId, ServerEvents.CustomRemoteAudioTrackPositionRemoved, position.id)))),
  store.readMany<CustomRemoteAudioTrackVolume>(TypeNames.CustomRemoteAudioTrackVolume, {remoteAudioTrackId: id})
    .then(positions => positions.map(position => store.delete<CustomRemoteAudioTrackVolume>(TypeNames.CustomRemoteAudioTrackVolume, position.id)
      .then(() => sendToUser(socket, position.userId, ServerEvents.CustomRemoteAudioTrackVolumeRemoved, position.id)))),
  // Delete actual element
  store.delete<RemoteAudioTrack>(TypeNames.RemoteAudioTrack, id)
    .then(() => sendToStage(socket, store, stageId, ServerEvents.RemoteAudioTrackRemoved, id))
]);
const cleanUpLocalAudioTrack = (store: IStore, socket: ITeckosProvider, id: string) =>
  // Remove all associated remote audio tracks
  store.readManyIds<RemoteAudioTrack>(TypeNames.RemoteAudioTrack, {localAudioTrackId: id})
    .then(remoteAudioTrackIds => remoteAudioTrackIds.map(remoteAudioTrackId => cleanUpRemoteAudioTrack(store, socket, remoteAudioTrackId)))
    .then(() => store.delete<Local)


const cleanUpStageMember = async (store: IStore, socket: ITeckosProvider, id: string) => Promise.all([
  // Delete all customized data and inform user
  store.readMany<CustomStageMemberPosition>(TypeNames.CustomStageMemberPosition, {stageMemberId: id})
    .then(positions => positions.map(position => store.delete<CustomRemoteAudioTrackPosition>(TypeNames.CustomRemoteAudioTrackPosition, position.id)
      .then(() => sendToUser(socket, position.userId, ServerEvents.CustomRemoteAudioTrackPositionRemoved, position.id)))),
  store.readMany<CustomRemoteAudioTrackVolume>(TypeNames.CustomRemoteAudioTrackVolume, {remoteAudioTrackId: id})
    .then(positions => positions.map(position => store.delete<CustomRemoteAudioTrackVolume>(TypeNames.CustomRemoteAudioTrackVolume, position.id)
      .then(() => sendToUser(socket, position.userId, ServerEvents.CustomRemoteAudioTrackVolumeRemoved, position.id))))
]);

const cleanUpRemoteAudioTrack = (
  store: IStore,
  io: ITeckosProvider,
  id: string
) =>
  Promise.all([
    store.readMany<CustomRemoteAudioTrackPosition>()
    store
      .deleteMany<CustomRemoteAudioTrackPosition>(
        TypeNames.CustomRemoteAudioTrackPosition,
        {remoteAudioTrackId: id}
      )
      .then(items => items.forEach(sendToDevice(io,)),
        store.deleteMany<CustomRemoteAudioTrackPosition>(
          TypeNames.CustomRemoteAudioTrackPosition,
          {remoteAudioTrackId: id}
        ),
  ]);
const cleanUpStageMember = (store: IStore, id: string) =>
  Promise.all([
    store.deleteMany<CustomStageMemberPosition>(
      TypeNames.CustomStageMemberPosition,
      {stageMemberId: id}
    ),
    store.deleteMany<CustomStageMemberVolume>(
      TypeNames.CustomStageMemberVolume,
      {stageMemberId: id}
    ),
  ]);
const cleanUpGroup = (
  store: IStore,
  id: string,
  cleanUpStageMembers: boolean
) => {
};
const cleanUpStage = (store: IStore, id: string): Promise<any> =>
  Promise.all([
    store
      .readMany<Group>(TypeNames.Group, {stageId: id})
      .then((groups) => groups.map((group) => cleanUpGroup(group.id, false))),
    store
      .readMany<StageMember>(TypeNames.StageMember, {stageId: id})
      .then((stageMembers) =>
        stageMembers.map((stageMember) =>
          cleanUpStageMember(stageMember.id, false)
        )
      ),
  ]);

export {
  cleanUpGroup,
  cleanUpRemoteAudioTrack,
  cleanUpStage,
  cleanUpStageMember,
};
