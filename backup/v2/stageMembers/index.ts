import {
    CustomStageMemberPosition,
    CustomStageMemberVolume,
    DefaultThreeDimensionalProperties,
    DefaultVolumeProperties,
    Device,
    ServerDeviceEvents,
    StageDevice,
    StageMember,
    ThreeDimensionalProperties,
    User,
} from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../../src/distributor/Collections'
import { sendToJoinedStageMembers, sendToUser } from '../sending'
import { createStageDevice, deleteStageDevice, updateStageDevice } from '../stageDevices'
import { leaveStage } from '../membership'

const readStageMember = (db: Db, id: ObjectId): Promise<StageMember<ObjectId>> =>
    db.collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS).findOne({ _id: id })

const upsertCustomStageMemberPosition = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    stageMemberId: ObjectId,
    deviceId: ObjectId,
    update: Partial<ThreeDimensionalProperties>
): Promise<void> =>
    db
        .collection<CustomStageMemberPosition<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
        .findOneAndUpdate(
            { userId, stageMemberId, deviceId },
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
            // Custom entry not available yet, we have to create it

            return readStageMember(db, stageMemberId)
                .then(
                    (stageMember): Omit<CustomStageMemberPosition<ObjectId>, '_id'> => ({
                        x: stageMember.x,
                        y: stageMember.y,
                        z: stageMember.z,
                        rX: stageMember.rX,
                        rY: stageMember.rY,
                        rZ: stageMember.rZ,
                        directivity: stageMember.directivity,
                        ...update,
                        stageId: stageMember.stageId,
                        userId,
                        stageMemberId,
                        deviceId,
                    })
                )
                .then((payload) =>
                    db
                        .collection<CustomStageMemberPosition<ObjectId>>(
                            Collections.CUSTOM_STAGE_MEMBER_POSITIONS
                        )
                        .insertOne(payload)
                        .then((response) => {
                            if (response.result.ok) {
                                const payload2 = response.ops[0]
                                // emit(ServerDeviceEvents.CustomStageMemberPositionAdded, payload2)
                                return sendToUser(
                                    io,
                                    userId,
                                    ServerDeviceEvents.CustomStageMemberPositionAdded,
                                    payload2
                                )
                            }
                            throw new Error(
                                `Could not create custom position of stage member ${stageMemberId} for user ${userId} and device ${deviceId}`
                            )
                        })
                )
        })

const readCustomStageMemberPosition = (
    db: Db,
    id: ObjectId
): Promise<CustomStageMemberPosition<ObjectId>> =>
    db
        .collection<CustomStageMemberPosition<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
        .findOne({ _id: id })

const deleteCustomStageMemberPosition = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId
): Promise<void> =>
    db
        .collection<CustomStageMemberPosition<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomStageMemberPositionRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomStageMemberPositionRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete custom stage member position ${id}`)
        })

const upsertCustomStageMemberVolume = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    stageMemberId: ObjectId,
    deviceId: ObjectId,
    update: { volume?: number; muted?: boolean }
): Promise<void> =>
    db
        .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
        .findOneAndUpdate(
            { userId, stageMemberId, deviceId },
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
                // emit(ServerDeviceEvents.CustomStageMemberVolumeChanged, payload)
                return sendToUser(
                    io,
                    userId,
                    ServerDeviceEvents.CustomStageMemberVolumeChanged,
                    payload
                )
            }
            if (result.ok) {
                return readStageMember(db, stageMemberId)
                    .then(
                        (stageMember): Omit<CustomStageMemberVolume<ObjectId>, '_id'> => ({
                            volume: stageMember.volume,
                            muted: stageMember.muted,
                            ...update,
                            userId,
                            stageId: stageMember.stageId,
                            stageMemberId,
                            deviceId,
                        })
                    )
                    .then((initial) =>
                        db
                            .collection<CustomStageMemberVolume<ObjectId>>(
                                Collections.CUSTOM_STAGE_MEMBER_VOLUMES
                            )
                            .insertOne(initial)
                            .then((response) => {
                                if (response.result.ok) {
                                    const payload = response.ops[0]
                                    // emit(ServerDeviceEvents.CustomStageMemberVolumeAdded, response)
                                    return sendToUser(
                                        io,
                                        userId,
                                        ServerDeviceEvents.CustomStageMemberVolumeAdded,
                                        payload
                                    )
                                }
                                throw new Error(
                                    `Could not create custom volume of stage member ${stageMemberId} for user ${userId} and ${deviceId}`
                                )
                            })
                    )
            }
            throw new Error(
                `Could not customize volume of stage member ${stageMemberId} for user ${userId} and ${deviceId}`
            )
        })

const readCustomStageMemberVolume = (
    db: Db,
    id: ObjectId
): Promise<CustomStageMemberVolume<ObjectId>> =>
    db
        .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
        .findOne({ _id: id })

const deleteCustomStageMemberVolume = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<void> =>
    db
        .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomStageMemberVolumeRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomStageMemberVolumeRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete custom stage member volume ${id}`)
        })

const createStageMember = async (
    io: ITeckosProvider,
    db: Db,
    initial: Omit<StageMember<ObjectId>, '_id'>
): Promise<StageMember<ObjectId>> => {
    return db
        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
        .insertOne(initial)
        .then((result) => result.ops[0] as StageMember<ObjectId>)
        .then((stageMember) => {
            // emit(ServerDeviceEvents.StageMemberAdded, stageMember)
            // Create stage devices for all devices of user
            return Promise.all([
                db
                    .collection<Device<ObjectId>>(Collections.DEVICES)
                    .find({ userId: initial.userId })
                    .toArray()
                    .then((devices) =>
                        devices.map((device) =>
                            createStageDevice(io, db, {
                                userId: device.userId,
                                deviceId: device._id,
                                stageId: initial.stageId,
                                groupId: initial.groupId,
                                stageMemberId: stageMember._id,
                                active: device.online,
                                name: device.type,
                                type: device.type,
                                sendLocal: true,
                                ...DefaultThreeDimensionalProperties,
                                ...DefaultVolumeProperties,
                            })
                        )
                    ),
                sendToJoinedStageMembers(
                    io,
                    db,
                    stageMember.stageId,
                    ServerDeviceEvents.StageMemberAdded,
                    stageMember
                ),
            ]).then(() => stageMember)
        })
}
const updateStageMember = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<StageMember<ObjectId>, '_id' | 'stageId' | 'userId'>>
): Promise<void> =>
    db
        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
        .findOneAndUpdate({ _id: id }, { $set: update }, { projection: { stageId: 1 } })
        .then(async (result) => {
            if (result.value) {
                const payload = {
                    ...update,
                    _id: id,
                }
                if (update.active !== undefined) {
                    // Also update all related stage devices
                    await db
                        .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                        .find({ stageMemberId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((stageDevices) =>
                            stageDevices.map((stageDevice) =>
                                updateStageDevice(io, db, stageDevice._id, {
                                    active: update.active,
                                })
                            )
                        )
                }
                // emit(ServerDeviceEvents.StageMemberChanged, payload)
                return sendToJoinedStageMembers(
                    io,
                    db,
                    result.value.stageId,
                    ServerDeviceEvents.StageMemberChanged,
                    payload
                )
            }
            throw new Error(`Could not find or update stage member ${id}`)
        })

const deleteStageMember = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> =>
    db
        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
        .findOneAndDelete({ _id: id })
        .then((result) => {
            if (result.value) {
                // Delete all custom stage members and stage member tracks
                // emit(ServerDeviceEvents.StageMemberRemoved, id)
                // Throw out user, if currently inside the stage
                return db
                    .collection<User<ObjectId>>(Collections.USERS)
                    .findOne({ _id: result.value.userId })
                    .then((user) => {
                        if (user.stageId === id) {
                            return leaveStage(io, db, result.value.userId)
                        }
                        return null
                    })
                    .then(() =>
                        Promise.all([
                            db
                                .collection<CustomStageMemberVolume<ObjectId>>(
                                    Collections.CUSTOM_STAGE_MEMBER_VOLUMES
                                )
                                .find({ stageMemberId: id }, { projection: { _id: 1 } })
                                .toArray()
                                .then((items) =>
                                    Promise.all(
                                        items.map((item) =>
                                            deleteCustomStageMemberVolume(io, db, item._id)
                                        )
                                    )
                                ),
                            db
                                .collection<CustomStageMemberPosition<ObjectId>>(
                                    Collections.CUSTOM_STAGE_MEMBER_POSITIONS
                                )
                                .find({ stageMemberId: id }, { projection: { _id: 1 } })
                                .toArray()
                                .then((items) =>
                                    Promise.all(
                                        items.map((item) =>
                                            deleteCustomStageMemberPosition(io, db, item._id)
                                        )
                                    )
                                ),
                            db
                                .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                                .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                                .toArray()
                                .then((stageDevices) =>
                                    stageDevices.map((stageDevice) =>
                                        deleteStageDevice(io, db, stageDevice._id)
                                    )
                                ),
                            sendToJoinedStageMembers(
                                io,
                                db,
                                result.value.stageId,
                                ServerDeviceEvents.StageMemberRemoved,
                                id
                            ),
                        ])
                    )
            }
            throw new Error(`Could not find or delete stage member ${id}`)
        })
export {
    createStageMember,
    readStageMember,
    updateStageMember,
    deleteStageMember,
    upsertCustomStageMemberPosition,
    upsertCustomStageMemberVolume,
    readCustomStageMemberPosition,
    readCustomStageMemberVolume,
    deleteCustomStageMemberPosition,
    deleteCustomStageMemberVolume,
}
