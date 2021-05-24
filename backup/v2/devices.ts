import {
    AudioTrack,
    CustomAudioTrackPosition,
    CustomAudioTrackVolume,
    CustomGroupPosition,
    CustomGroupVolume,
    CustomStageMemberPosition,
    CustomStageMemberVolume,
    DefaultThreeDimensionalProperties,
    DefaultVolumeProperties,
    Device,
    ServerDeviceEvents,
    SoundCard,
    StageDevice,
    StageMember,
    User,
    VideoTrack,
} from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../src/distributor/Collections'
import { createStageDevice, deleteStageDevice, updateStageDevice } from './stageDevices'
import useLogger from '../../src/useLogger'
import { sendToUser } from './sending'
import { deleteAudioTrack } from './audioTracks'
import { deleteVideoTrack } from './videoTracks'
import { readUser } from './users'
import { updateStageMember } from './stageMembers'
import { updateSoundCard } from './soundCards'

const { error, trace } = useLogger('distributor:routers')

const renewOnlineStatus = (io: ITeckosProvider, db: Db, userId: ObjectId): Promise<void> => {
    // Has the user online devices?
    return db
        .collection<User<ObjectId>>(Collections.USERS)
        .findOne({ _id: userId }, { projection: { stageMemberId: 1 } })
        .then((user) => {
            if (user.stageMemberId) {
                // User is inside stage
                return db
                    .collection<Device<ObjectId>>(Collections.DEVICES)
                    .countDocuments({
                        userId,
                        online: true,
                    })
                    .then((numDevicesOnline) => {
                        if (numDevicesOnline > 0) {
                            // User is online
                            return updateStageMember(io, db, user.stageMemberId, {
                                active: true,
                            })
                        }
                        // User has no more online devices
                        return updateStageMember(io, db, user.stageMemberId, {
                            active: false,
                        })
                    })
            }
            return null
        })
}

const createDevice = (
    io: ITeckosProvider,
    db: Db,
    apiServer: string,
    init: Omit<Device<ObjectId>, '_id'>
): Promise<Device<ObjectId>> =>
    db
        .collection<Device<ObjectId>>(Collections.DEVICES)
        .insertOne({
            uuid: null,
            type: 'unknown',
            requestSession: false,
            canAudio: false,
            canVideo: false,
            receiveAudio: false,
            receiveVideo: false,
            sendAudio: false,
            sendVideo: false,
            ovRawMode: false,
            ovRenderISM: false,
            ovP2p: true,
            ovReceiverType: 'ortf',
            ovRenderReverb: true,
            ovReverbGain: 0.4,
            canOv: false,
            volume: 1,
            egoGain: 1,
            soundCardId: null,
            ...init,
            _id: undefined,
            online: true,
            userId: init.userId,
            lastLoginAt: new Date(),
            createdAt: new Date(),
            apiServer,
        } as any)
        .then((result) => result.ops[0])
        .then(async (device) => {
            const stageMembers = await db
                .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                .find({ userId: device.userId })
                .toArray()
            await Promise.all(
                stageMembers.map((stageMember) =>
                    createStageDevice(io, db, {
                        userId: device.userId,
                        deviceId: device._id,
                        stageId: stageMember.stageId,
                        groupId: stageMember.groupId,
                        stageMemberId: stageMember._id,
                        active: device.online,
                        type: device.type,
                        name: device.type,
                        sendLocal: true,
                        ...DefaultThreeDimensionalProperties,
                        ...DefaultVolumeProperties,
                    })
                )
            )
            return device
        })
        .then((device) => {
            if (device.requestSession) {
                trace('Generating UUID session for new device')
                db.collection<Device<ObjectId>>(Collections.DEVICES)
                    .updateOne(
                        { _id: device._id },
                        {
                            $set: {
                                uuid: device._id.toHexString(),
                            },
                        }
                    )
                    .catch((e) => error(e))
                return {
                    ...device,
                    uuid: device._id.toHexString(),
                }
            }
            trace('no generation')
            return device
        })
        .then((device) => {
            // emit(ServerDeviceEvents.DeviceAdded, device)
            sendToUser(io, init.userId, ServerDeviceEvents.DeviceAdded, device)
            return renewOnlineStatus(io, db, init.userId).then(() => device)
        })

const readDevicesByUser = (db: Db, userId: ObjectId): Promise<Device<ObjectId>[]> =>
    db.collection<Device<ObjectId>>(Collections.DEVICES).find({ userId }).toArray()

const readDeviceByUserAndUUID = (
    db: Db,
    userId: ObjectId,
    uuid: string
): Promise<Device<ObjectId> | null> =>
    db.collection<Device<ObjectId>>(Collections.DEVICES).findOne({ userId, uuid })

const readDevicesByApiServer = (db: Db, apiServer: string): Promise<Device<ObjectId>[]> => {
    return db.collection<Device<ObjectId>>(Collections.DEVICES).find({ apiServer }).toArray()
}

const updateDevice = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    id: ObjectId,
    update: Partial<Omit<Device<ObjectId>, '_id'>>
): Promise<void> => {
    // Broadcast before validation (safe, since only user is affected here)
    const payload = {
        ...update,
        userId,
        _id: id,
    }
    sendToUser(io, userId, ServerDeviceEvents.DeviceChanged, payload)
    return db
        .collection<Device<ObjectId>>(Collections.DEVICES)
        .findOneAndUpdate(
            { _id: id },
            {
                $set: update,
            }
        )
        .then(async (result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.DeviceChanged, payload)
                if (update.online !== undefined) {
                    // Set all sound cards offline
                    if (!update.online) {
                        await db
                            .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
                            .find({ deviceId: id })
                            .toArray()
                            .then((soundCards) =>
                                soundCards.map((soundCard) =>
                                    updateSoundCard(io, db, soundCard._id, {
                                        online: false,
                                    })
                                )
                            )
                    }
                    // Also update stage device
                    const stageId = await readUser(db, result.value.userId).then(
                        (user) => user.stageId
                    )
                    if (stageId) {
                        await db
                            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                            .findOne(
                                { stageId, deviceId: result.value._id },
                                { projection: { _id: 1 } }
                            )
                            .then((stageDevice) => {
                                if (stageDevice)
                                    updateStageDevice(io, db, stageDevice._id, {
                                        active: update.online,
                                    })
                                return null
                            })
                    }
                }
            }
            return undefined
        })
}

const deleteDevice = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> =>
    db
        .collection<Device<ObjectId>>(Collections.DEVICES)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.DeviceRemoved, id)
                sendToUser(io, result.value.userId, ServerDeviceEvents.DeviceRemoved, id)
                return Promise.all([
                    db
                        .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                        .find({ deviceId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((stageDevices) =>
                            stageDevices.map((stageDevice) =>
                                deleteStageDevice(io, db, stageDevice._id)
                            )
                        ),
                    db
                        .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
                        .find(
                            {
                                deviceId: id,
                            },
                            { projection: { _id: 1, userId: 1 } }
                        )
                        .toArray()
                        .then((audioTracks) =>
                            audioTracks.map((audioTrack) =>
                                deleteAudioTrack(io, db, audioTrack._id)
                            )
                        ),
                    db
                        .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
                        .find(
                            {
                                deviceId: id,
                            },
                            { projection: { _id: 1, userId: 1 } }
                        )
                        .toArray()
                        .then((videoTracks) =>
                            videoTracks.map((videoTrack) =>
                                deleteVideoTrack(io, db, videoTrack._id)
                            )
                        ),
                    db
                        .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
                        .deleteMany({ deviceId: id }),
                    db
                        .collection<CustomGroupPosition<ObjectId>>(
                            Collections.CUSTOM_GROUP_POSITIONS
                        )
                        .deleteMany({ deviceId: id }),
                    db
                        .collection<CustomStageMemberPosition<ObjectId>>(
                            Collections.CUSTOM_STAGE_MEMBER_POSITIONS
                        )
                        .deleteMany({ deviceId: id }),
                    db
                        .collection<CustomStageMemberVolume<ObjectId>>(
                            Collections.CUSTOM_STAGE_MEMBER_VOLUMES
                        )
                        .deleteMany({ deviceId: id }),
                    db
                        .collection<CustomAudioTrackVolume<ObjectId>>(
                            Collections.CUSTOM_AUDIO_TRACK_VOLUMES
                        )
                        .deleteMany({ deviceId: id }),
                    db
                        .collection<CustomAudioTrackPosition<ObjectId>>(
                            Collections.CUSTOM_AUDIO_TRACK_POSITIONS
                        )
                        .deleteMany({ deviceId: id }),
                    db
                        .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
                        .deleteMany({ deviceId: id }),
                ]).then(() => renewOnlineStatus(io, db, result.value.userId))
            }
            throw new Error(`Could not find and delete device ${id}`)
        })

export {
    createDevice,
    updateDevice,
    readDeviceByUserAndUUID,
    readDevicesByApiServer,
    readDevicesByUser,
    deleteDevice,
    renewOnlineStatus,
}
