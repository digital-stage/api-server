import {
    AudioTrack,
    CustomStageDevicePosition,
    CustomStageDeviceVolume,
    CustomStageMemberPosition,
    CustomStageMemberVolume,
    ServerDeviceEvents,
    StageDevice,
    ThreeDimensionalProperties,
    VideoTrack,
} from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../src/distributor/Collections'
import { sendToJoinedStageMembers, sendToUser } from './sending'
import { deleteVideoTrack } from './videoTracks'
import { deleteAudioTrack } from './audioTracks'

const readStageDevice = (db: Db, id: ObjectId): Promise<StageDevice<ObjectId>> =>
    db.collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES).findOne({ _id: id })

const upsertCustomStageDevicePosition = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    stageDeviceId: ObjectId,
    deviceId: ObjectId,
    update: Partial<ThreeDimensionalProperties>
): Promise<void> =>
    db
        .collection<CustomStageMemberPosition<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
        .findOneAndUpdate(
            { userId, stageDeviceId, deviceId },
            {
                $set: update,
            },
            { upsert: false, projection: { _id: 1 } }
        )
        .then((result) => {
            if (result.value) {
                // Return updated document
                const payload = {
                    ...update,
                    _id: result.value._id,
                }
                // emit(ServerDeviceEvents.CustomStageMemberPositionChanged, payload)
                return sendToUser(
                    io,
                    userId,
                    ServerDeviceEvents.CustomStageMemberPositionChanged,
                    payload
                )
            }
            if (result.ok) {
                return readStageDevice(db, stageDeviceId)
                    .then(
                        (stageDevice): Omit<CustomStageDevicePosition<ObjectId>, '_id'> => ({
                            x: stageDevice.x,
                            y: stageDevice.y,
                            z: stageDevice.z,
                            rX: stageDevice.rX,
                            rY: stageDevice.rY,
                            rZ: stageDevice.rZ,
                            directivity: stageDevice.directivity,
                            ...update,
                            userId,
                            stageId: stageDevice.stageId,
                            stageDeviceId,
                            deviceId,
                        })
                    )
                    .then((payload) =>
                        db
                            .collection<CustomStageDevicePosition<ObjectId>>(
                                Collections.CUSTOM_STAGE_DEVICE_POSITIONS
                            )
                            .insertOne(payload)
                            .then((response) => {
                                if (response.result.ok) {
                                    const payload2 = response.ops[0]
                                    /* emit(
                                        ServerDeviceEvents.CustomStageDevicePositionAdded,
                                        payload2
                                    ) */
                                    return sendToUser(
                                        io,
                                        userId,
                                        ServerDeviceEvents.CustomStageDevicePositionAdded,
                                        payload2
                                    )
                                }
                                throw new Error(
                                    `Could not create custom position of stage device ${stageDeviceId} for user ${userId} and device ${deviceId}`
                                )
                            })
                    )
            }
            throw new Error(
                `Could not customize position of stage device ${stageDeviceId} for user ${userId} and device ${deviceId}`
            )
        })

const readCustomStageDevicePosition = (
    db: Db,
    id: ObjectId
): Promise<CustomStageMemberPosition<ObjectId>> =>
    db
        .collection<CustomStageMemberPosition<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
        .findOne({ _id: id })

const deleteCustomStageDevicePosition = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId
): Promise<void> =>
    db
        .collection<CustomStageDevicePosition<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_POSITIONS)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomStageDevicePositionRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomStageDevicePositionRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete custom stage member position ${id}`)
        })

const upsertCustomStageDeviceVolume = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    stageDeviceId: ObjectId,
    deviceId: ObjectId,
    update: { volume?: number; muted?: boolean }
): Promise<void> =>
    db
        .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
        .findOneAndUpdate(
            { userId, stageDeviceId, deviceId },
            {
                $set: update,
            },
            { upsert: false, projection: { _id: 1 } }
        )
        .then((result) => {
            if (result.value) {
                // Return updated document
                const payload = {
                    ...update,
                    _id: result.value._id,
                }
                // emit(ServerDeviceEvents.CustomStageDeviceVolumeChanged, payload)
                return sendToUser(
                    io,
                    userId,
                    ServerDeviceEvents.CustomStageDeviceVolumeChanged,
                    payload
                )
            }
            if (result.ok) {
                return readStageDevice(db, stageDeviceId)
                    .then(
                        (stageDevice): Omit<CustomStageDeviceVolume<ObjectId>, '_id'> => ({
                            volume: stageDevice.volume,
                            muted: stageDevice.muted,
                            ...update,
                            userId,
                            stageId: stageDevice.stageId,
                            stageDeviceId,
                            deviceId,
                        })
                    )
                    .then((initial) =>
                        db
                            .collection<CustomStageDeviceVolume<ObjectId>>(
                                Collections.CUSTOM_STAGE_DEVICE_VOLUMES
                            )
                            .insertOne(initial)
                            .then((response) => {
                                if (response.result.ok) {
                                    const payload = response.ops[0]
                                    // emit(ServerDeviceEvents.CustomStageDeviceVolumeAdded, response)
                                    return sendToUser(
                                        io,
                                        userId,
                                        ServerDeviceEvents.CustomStageDeviceVolumeAdded,
                                        payload
                                    )
                                }
                                throw new Error(
                                    `Could not create custom volume of stage device ${stageDeviceId} for user ${userId} and ${deviceId}`
                                )
                            })
                    )
            }
            throw new Error(
                `Could not customize volume of stage device ${stageDeviceId} for user ${userId} and ${deviceId}`
            )
        })

const readCustomStageDeviceVolume = (
    db: Db,
    id: ObjectId
): Promise<CustomStageDeviceVolume<ObjectId>> =>
    db
        .collection<CustomStageDeviceVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
        .findOne({ _id: id })

const deleteCustomStageDeviceVolume = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<void> =>
    db
        .collection<CustomStageDeviceVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomStageDeviceVolumeRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomStageDeviceVolumeRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete custom stage device volume ${id}`)
        })

const createStageDevice = async (
    io: ITeckosProvider,
    db: Db,
    initial: Omit<StageDevice<ObjectId>, '_id' | 'order'>
): Promise<StageDevice<ObjectId>> => {
    // obtain an order ID (necessary for ov based technologies)
    const order = await db
        .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
        .find({ stageId: initial.stageId })
        .toArray()
        .then((stageDevices) => {
            if (stageDevices.length > 0) {
                for (let i = 0; i < 30; i += 1) {
                    if (!stageDevices.find((current) => current.order === i)) {
                        return i
                    }
                }
                return -1
            }
            return 0
        })
    if (order === -1) throw new Error('No more members possible, max of 30 reached')
    return db
        .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
        .insertOne({
            ...initial,
            order,
        })
        .then((result) => result.ops[0] as StageDevice<ObjectId>)
        .then(async (stageDevice): Promise<StageDevice<ObjectId>> => {
            // emit(ServerDeviceEvents.StageDeviceAdded, stageDevice)
            await sendToJoinedStageMembers(
                io,
                db,
                stageDevice.stageId,
                ServerDeviceEvents.StageDeviceAdded,
                stageDevice
            )
            return stageDevice
        })
}

const readStageDeviceByStage = (
    db: Db,
    deviceId: ObjectId,
    stageId: ObjectId
): Promise<StageDevice<ObjectId>> =>
    db.collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES).findOne({ deviceId, stageId })

const updateStageDevice = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<
        Omit<StageDevice<ObjectId>, '_id' | 'stageId' | 'userId' | 'stageMemberId' | 'order'>
    >
): Promise<void> =>
    db
        .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
        .findOneAndUpdate(
            { _id: id },
            { $set: update },
            { projection: { stageId: 1, deviceId: 1 } }
        )
        .then(async (result) => {
            if (result.value) {
                const payload = {
                    ...update,
                    _id: id,
                }
                // emit(ServerDeviceEvents.StageDeviceChanged, payload)
                if (update.active !== undefined) {
                    if (!update.active) {
                        // Remove all related audio and video tracks
                        await Promise.all([
                            db
                                .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
                                .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                                .toArray()
                                .then((videoTracks) =>
                                    videoTracks.map((videoTrack) =>
                                        deleteVideoTrack(io, db, videoTrack._id)
                                    )
                                ),
                            db
                                .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
                                .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                                .toArray()
                                .then((audioTracks) =>
                                    audioTracks.map((audioTrack) =>
                                        deleteAudioTrack(io, db, audioTrack._id)
                                    )
                                ),
                        ])
                    }
                }
                return sendToJoinedStageMembers(
                    io,
                    db,
                    result.value.stageId,
                    ServerDeviceEvents.StageDeviceChanged,
                    payload
                )
            }
            throw new Error(`Could not find or update stage device ${id}`)
        })

const deleteStageDevice = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> =>
    db
        .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
        .findOneAndDelete({ _id: id })
        .then((result) => {
            if (result.value) {
                // Delete all custom stage device and remote audio/video tracks
                // emit(ServerDeviceEvents.StageDeviceRemoved, id)
                return Promise.all([
                    db
                        .collection<CustomStageDeviceVolume<ObjectId>>(
                            Collections.CUSTOM_STAGE_DEVICE_VOLUMES
                        )
                        .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((items) =>
                            Promise.all(
                                items.map((item) => deleteCustomStageDeviceVolume(io, db, item._id))
                            )
                        ),
                    db
                        .collection<CustomStageDevicePosition<ObjectId>>(
                            Collections.CUSTOM_STAGE_DEVICE_POSITIONS
                        )
                        .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((items) =>
                            Promise.all(
                                items.map((item) =>
                                    deleteCustomStageDevicePosition(io, db, item._id)
                                )
                            )
                        ),
                    db
                        .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
                        .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((videoTracks) =>
                            videoTracks.map((videoTrack) =>
                                deleteVideoTrack(io, db, videoTrack._id)
                            )
                        ),
                    db
                        .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
                        .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((audioTracks) =>
                            audioTracks.map((audioTrack) =>
                                deleteAudioTrack(io, db, audioTrack._id)
                            )
                        ),
                    sendToJoinedStageMembers(
                        io,
                        db,
                        result.value.stageId,
                        ServerDeviceEvents.StageDeviceRemoved,
                        id
                    ),
                ])
            }
            throw new Error(`Could not find or delete stage device ${id}`)
        })
export {
    createStageDevice,
    updateStageDevice,
    readStageDevice,
    readStageDeviceByStage,
    deleteStageDevice,
    upsertCustomStageDeviceVolume,
    upsertCustomStageDevicePosition,
    readCustomStageDevicePosition,
    readCustomStageDeviceVolume,
    deleteCustomStageDevicePosition,
    deleteCustomStageDeviceVolume,
}
