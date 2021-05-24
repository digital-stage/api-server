import {
    AudioTrack,
    CustomAudioTrackPosition,
    CustomAudioTrackVolume,
    DefaultThreeDimensionalProperties,
    DefaultVolumeProperties,
    ServerDeviceEvents,
    ServerDevicePayloads,
    ThreeDimensionalProperties,
} from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../src/distributor/Collections'
import { sendToJoinedStageMembers, sendToUser } from './sending'

const readAudioTrack = (db: Db, id: ObjectId): Promise<AudioTrack<ObjectId>> => {
    return db.collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS).findOne({
        _id: id,
    })
}
const upsertCustomAudioTrackPosition = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    audioTrackId: ObjectId,
    deviceId: ObjectId,
    update: Partial<ThreeDimensionalProperties>
): Promise<void> =>
    db
        .collection<CustomAudioTrackPosition<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_POSITIONS)
        .findOneAndUpdate(
            { userId, audioTrackId, deviceId },
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
                // emit(ServerDeviceEvents.CustomAudioTrackPositionChanged, payload)
                return sendToUser(
                    io,
                    userId,
                    ServerDeviceEvents.CustomAudioTrackPositionChanged,
                    payload
                )
            }
            if (result.ok) {
                return readAudioTrack(db, audioTrackId)
                    .then(
                        (remoteAudioTrack): Omit<CustomAudioTrackPosition<ObjectId>, '_id'> => ({
                            x: remoteAudioTrack.x,
                            y: remoteAudioTrack.y,
                            z: remoteAudioTrack.z,
                            rX: remoteAudioTrack.rX,
                            rY: remoteAudioTrack.rY,
                            rZ: remoteAudioTrack.rZ,
                            directivity: remoteAudioTrack.directivity,
                            ...update,
                            stageId: remoteAudioTrack.stageId,
                            deviceId,
                            userId,
                            audioTrackId,
                        })
                    )
                    .then((initial) =>
                        db
                            .collection<CustomAudioTrackPosition<ObjectId>>(
                                Collections.CUSTOM_AUDIO_TRACK_POSITIONS
                            )
                            .insertOne(initial)
                            .then((response) => {
                                if (response.result.ok) {
                                    const payload = response.ops[0]
                                    /* emit(
                    ServerDeviceEvents.CustomAudioTrackPositionAdded,
                    payload
                  ) */
                                    return sendToUser(
                                        io,
                                        userId,
                                        ServerDeviceEvents.CustomAudioTrackPositionAdded,
                                        payload
                                    )
                                }
                                throw new Error(
                                    `Could not create custom position of remote audio track ${audioTrackId} for user ${userId} and device ${deviceId}`
                                )
                            })
                    )
            }
            throw new Error(
                `Could not customize position of remote audio track ${audioTrackId} for user ${userId} and device ${deviceId}`
            )
        })

const readCustomAudioTrackPosition = (
    db: Db,
    id: ObjectId
): Promise<CustomAudioTrackPosition<ObjectId>> =>
    db
        .collection<CustomAudioTrackPosition<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_POSITIONS)
        .findOne({ _id: id })

const deleteCustomAudioTrackPosition = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<void> =>
    db
        .collection<CustomAudioTrackPosition<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_POSITIONS)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomAudioTrackPositionRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomAudioTrackPositionRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete remote audio track position ${id}`)
        })

const upsertCustomAudioTrackVolume = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    audioTrackId: ObjectId,
    deviceId: ObjectId,
    update: { volume?: number; muted?: boolean }
): Promise<void> =>
    db
        .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
        .findOneAndUpdate(
            { userId, audioTrackId, deviceId },
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
                    _id: result.value._id as any,
                } as ServerDevicePayloads.CustomAudioTrackVolumeChanged
                // emit(ServerDeviceEvents.CustomAudioTrackVolumeChanged, payload)
                return sendToUser(
                    io,
                    userId,
                    ServerDeviceEvents.CustomAudioTrackVolumeChanged,
                    payload
                )
            }
            if (result.ok) {
                return readAudioTrack(db, audioTrackId)
                    .then(
                        (remoteAudioTrack): Omit<CustomAudioTrackVolume<ObjectId>, '_id'> => ({
                            volume: remoteAudioTrack.volume,
                            muted: remoteAudioTrack.muted,
                            ...update,
                            userId,
                            stageId: remoteAudioTrack.stageId,
                            audioTrackId,
                            deviceId,
                        })
                    )
                    .then((initial) =>
                        db
                            .collection<CustomAudioTrackVolume<ObjectId>>(
                                Collections.CUSTOM_AUDIO_TRACK_VOLUMES
                            )
                            .insertOne(initial)
                            .then((response) => {
                                if (response.result.ok) {
                                    const payload = response.ops[0]
                                    /* emit(
                    ServerDeviceEvents.CustomAudioTrackVolumeAdded,
                    payload
                  ) */
                                    return sendToUser(
                                        io,
                                        userId,
                                        ServerDeviceEvents.CustomAudioTrackVolumeAdded,
                                        payload
                                    )
                                }
                                throw new Error(
                                    `Could not create custom volume of remote audio track ${audioTrackId} for user ${userId} and device ${deviceId}`
                                )
                            })
                    )
            }
            throw new Error(
                `Could not customize volume of remote audio track ${audioTrackId} for user ${userId} and device ${deviceId}`
            )
        })

const readCustomAudioTrackVolume = (
    db: Db,
    id: ObjectId
): Promise<CustomAudioTrackVolume<ObjectId>> =>
    db
        .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
        .findOne({ _id: id })

const deleteCustomAudioTrackVolume = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<void> =>
    db
        .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomAudioTrackVolumeRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomAudioTrackVolumeRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete custom remote audio track volume ${id}`)
        })

const createAudioTrack = (
    io: ITeckosProvider,
    db: Db,
    initial: Omit<AudioTrack<ObjectId>, '_id'>
): Promise<AudioTrack<ObjectId>> =>
    db
        .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
        .insertOne({
            ...DefaultVolumeProperties,
            ...DefaultThreeDimensionalProperties,
            ...initial,
            localAudioTrackId: initial.localAudioTrackId,
            userId: initial.userId,
            deviceId: initial.deviceId,
            stageId: initial.stageId,
            stageMemberId: initial.stageMemberId,
            stageDeviceId: initial.stageDeviceId,
            type: initial.type,
            _id: undefined,
        })
        .then((result) => result.ops[0])
        .then((remoteAudioTrack) => {
            // emit(ServerDeviceEvents.AudioTrackAdded, remoteAudioTrack)
            return sendToJoinedStageMembers(
                io,
                db,
                initial.stageId,
                ServerDeviceEvents.AudioTrackAdded,
                remoteAudioTrack // as DevicePayloads.AudioTrackAdded
            ).then(() => remoteAudioTrack)
        })

const readAudioTrackIdsByDevice = (db: Db, deviceId: ObjectId): Promise<ObjectId[]> => {
    return db
        .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
        .find({ deviceId }, { projection: { _id: 1 } })
        .toArray()
        .then((tracks) => tracks.map((track) => track._id))
}

const updateAudioTrack = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<AudioTrack<ObjectId>, '_id'>>
): Promise<void> => {
    const { _id, localAudioTrackId, userId, ...secureUpdate } = update as any
    return db
        .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
        .findOneAndUpdate(
            {
                _id: id,
            },
            {
                $set: secureUpdate,
            },
            { projection: { stageId: 1 } }
        )
        .then(async (result) => {
            if (result.value) {
                const payload = {
                    ...secureUpdate,
                    _id: id,
                }
                // emit(ServerDeviceEvents.AudioTrackChanged, payload)
                await sendToJoinedStageMembers(
                    io,
                    db,
                    result.value.stageId,
                    ServerDeviceEvents.AudioTrackChanged,
                    payload
                )
            }
            throw new Error(`Could not find and update remote audio track ${id}`)
        })
}

const deleteAudioTrack = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> => {
    return db
        .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
        .findOneAndDelete(
            {
                _id: id,
            },
            { projection: { stageId: 1 } }
        )
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.AudioTrackRemoved, id)
                return Promise.all([
                    sendToJoinedStageMembers(
                        io,
                        db,
                        result.value.stageId,
                        ServerDeviceEvents.AudioTrackRemoved,
                        id
                    ),
                    db
                        .collection<CustomAudioTrackPosition<ObjectId>>(
                            Collections.CUSTOM_AUDIO_TRACK_POSITIONS
                        )
                        .find({ audioTrackId: id }, { projection: { _id: true } })
                        .toArray()
                        .then((customizedItems) =>
                            customizedItems.map((customizedItem) =>
                                deleteCustomAudioTrackPosition(io, db, customizedItem._id)
                            )
                        ),
                    db
                        .collection<CustomAudioTrackVolume<ObjectId>>(
                            Collections.CUSTOM_AUDIO_TRACK_VOLUMES
                        )
                        .find({ audioTrackId: id }, { projection: { _id: true } })
                        .toArray()
                        .then((customizedItems) =>
                            customizedItems.map((customizedItem) =>
                                deleteCustomAudioTrackVolume(io, db, customizedItem._id)
                            )
                        ),
                ])
            }
            throw new Error(`Could not find and delete audio track ${id}`)
        })
}

export {
    createAudioTrack,
    updateAudioTrack,
    readAudioTrack,
    deleteAudioTrack,
    readCustomAudioTrackPosition,
    readAudioTrackIdsByDevice,
    upsertCustomAudioTrackPosition,
    upsertCustomAudioTrackVolume,
    readCustomAudioTrackVolume,
    deleteCustomAudioTrackPosition,
    deleteCustomAudioTrackVolume,
}
