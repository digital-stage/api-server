import {
    CustomGroupPosition,
    CustomGroupVolume,
    Group,
    ServerDeviceEvents,
    StageMember,
    ThreeDimensionalProperties,
} from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../src/distributor/Collections'
import { sendToStage, sendToUser } from './sending'
import generateColor from '../../src/utils/generateColor'
import { deleteStageMember } from './stageMembers'

const generateGroupColor = (db: Db, stageId: ObjectId) => {
    return db
        .collection<Group<ObjectId>>(Collections.GROUPS)
        .find({ stageId })
        .toArray()
        .then((groups) => {
            let color: string
            const hasColor = (c: string): boolean => !!groups.find((group) => group.color === c)
            do {
                color = generateColor().toString()
            } while (hasColor(color))
            return color
        })
}

const readGroup = (db: Db, id: ObjectId): Promise<Group<ObjectId>> =>
    db.collection<Group<ObjectId>>(Collections.GROUPS).findOne({ _id: id })

const upsertCustomGroupPosition = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    groupId: ObjectId,
    deviceId: ObjectId,
    update: Partial<ThreeDimensionalProperties>
): Promise<void> =>
    db
        .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
        .findOneAndUpdate(
            { userId, groupId, deviceId },
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
                // emit(ServerDeviceEvents.CustomGroupPositionChanged, payload)
                return sendToUser(
                    io,
                    userId,
                    ServerDeviceEvents.CustomGroupPositionChanged,
                    payload
                )
            }
            if (result.ok) {
                return readGroup(db, groupId)
                    .then(
                        (group): Omit<CustomGroupPosition<ObjectId>, '_id'> => ({
                            x: group.x,
                            y: group.y,
                            z: group.z,
                            rX: group.rX,
                            rY: group.rY,
                            rZ: group.rZ,
                            directivity: group.directivity,
                            ...update,
                            stageId: group.stageId,
                            deviceId,
                            userId,
                            groupId,
                        })
                    )
                    .then((initial) =>
                        db
                            .collection<CustomGroupPosition<ObjectId>>(
                                Collections.CUSTOM_GROUP_POSITIONS
                            )
                            .insertOne(initial)
                            .then((result2) => {
                                if (result2.result.ok) {
                                    const payload = result2.ops[0]
                                    // emit(ServerDeviceEvents.CustomGroupPositionAdded, payload)
                                    return sendToUser(
                                        io,
                                        userId,
                                        ServerDeviceEvents.CustomGroupPositionAdded,
                                        payload
                                    )
                                }
                                throw new Error(
                                    `Could not create custom position of group ${groupId} for user ${userId} and device ${deviceId}`
                                )
                            })
                    )
            }
            throw new Error(
                `Could not customize position of group ${groupId} for user ${userId} and device ${deviceId}`
            )
        })

const readCustomGroupPosition = (db: Db, id: ObjectId): Promise<CustomGroupPosition<ObjectId>> =>
    db
        .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
        .findOne({ _id: id })

const deleteCustomGroupPosition = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<void> =>
    db
        .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomGroupPositionRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomGroupPositionRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete custom group position ${id}`)
        })

const upsertCustomGroupVolume = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    groupId: ObjectId,
    deviceId: ObjectId,
    update: { volume?: number; muted?: boolean }
): Promise<void> =>
    db
        .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
        .findOneAndUpdate(
            { userId, groupId, deviceId },
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
                // emit(ServerDeviceEvents.CustomGroupVolumeChanged, payload)
                return sendToUser(io, userId, ServerDeviceEvents.CustomGroupVolumeChanged, payload)
            }
            if (result.ok) {
                return readGroup(db, groupId)
                    .then(
                        (group): Omit<CustomGroupVolume<ObjectId>, '_id'> => ({
                            volume: group.volume,
                            muted: group.muted,
                            ...update,
                            stageId: group.stageId,
                            userId,
                            groupId,
                            deviceId,
                        })
                    )
                    .then((initial) =>
                        db
                            .collection<CustomGroupVolume<ObjectId>>(
                                Collections.CUSTOM_GROUP_VOLUMES
                            )
                            .insertOne(initial)
                            .then((result2) => {
                                if (result2.result.ok) {
                                    const payload = result2.ops[0]
                                    // emit(ServerDeviceEvents.CustomGroupVolumeAdded, payload)
                                    return sendToUser(
                                        io,
                                        userId,
                                        ServerDeviceEvents.CustomGroupVolumeAdded,
                                        payload
                                    )
                                }
                                throw new Error(
                                    `Could not create custom volume of group ${groupId} for user ${userId} and device ${deviceId}`
                                )
                            })
                    )
            }
            throw new Error(`Could not customize volume of group ${groupId} for user ${userId}`)
        })

const readCustomGroupVolume = (db: Db, id: ObjectId): Promise<CustomGroupVolume<ObjectId>> =>
    db
        .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
        .findOne({ _id: id })

const deleteCustomGroupVolume = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<void> => {
    // TODO: This might be insecure, maybe check user and device id also?
    return db
        .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
        .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.CustomGroupVolumeRemoved, id)
                return sendToUser(
                    io,
                    result.value.userId,
                    ServerDeviceEvents.CustomGroupVolumeRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete custom group volume ${id}`)
        })
}

const createGroup = async (
    io: ITeckosProvider,
    db: Db,
    initial: Omit<Group<ObjectId>, '_id' | 'color'> & Partial<{ color: string }>
): Promise<Group<ObjectId>> => {
    let { color } = initial
    if (!color) {
        color = await generateGroupColor(db, initial.stageId)
    }
    return db
        .collection<Group<ObjectId>>(Collections.GROUPS)
        .insertOne({
            ...initial,
            color,
        })
        .then((result) => result.ops[0] as Group<ObjectId>)
        .then((group) => {
            // emit(ServerDeviceEvents.GroupAdded, group)
            return sendToStage(io, db, group.stageId, ServerDeviceEvents.GroupAdded, group).then(
                () => group
            )
        })
}

const updateGroup = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<Group<ObjectId>, '_id' | 'stageId'>>
): Promise<void> =>
    db
        .collection<Group<ObjectId>>(Collections.GROUPS)
        .findOneAndUpdate({ _id: id }, { $set: update }, { projection: { stageId: 1 } })
        .then((result) => {
            if (result.value) {
                const payload = {
                    ...update,
                    _id: id,
                }
                // emit(ServerDeviceEvents.GroupChanged, payload)
                return sendToStage(
                    io,
                    db,
                    result.value.stageId,
                    ServerDeviceEvents.GroupChanged,
                    payload
                )
            }
            return null
        })

const deleteGroup = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> =>
    db
        .collection<Group<ObjectId>>(Collections.GROUPS)
        .findOneAndDelete(
            { _id: id },
            {
                projection: {
                    _id: 1,
                    stageId: 1,
                },
            }
        )
        .then((result) => {
            if (result.value) {
                // Delete all associated custom groups and stage members
                // emit(ServerDeviceEvents.GroupRemoved, id)
                return Promise.all([
                    db
                        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                        .find(
                            { groupId: result.value._id },
                            {
                                projection: {
                                    _id: 1,
                                    online: 1,
                                    userId: 1,
                                },
                            }
                        )
                        .toArray()
                        .then((stageMembers) =>
                            stageMembers.map(async (stageMember) =>
                                deleteStageMember(io, db, stageMember._id)
                            )
                        ),
                    db
                        .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
                        .find({ groupId: result.value._id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((customGroupVolumes) =>
                            customGroupVolumes.map((customGroupVolume) =>
                                deleteCustomGroupVolume(io, db, customGroupVolume._id)
                            )
                        ),
                    db
                        .collection<CustomGroupPosition<ObjectId>>(
                            Collections.CUSTOM_GROUP_POSITIONS
                        )
                        .find({ groupId: result.value._id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((customGroupPositions) =>
                            customGroupPositions.map((customGroupPosition) =>
                                deleteCustomGroupPosition(io, db, customGroupPosition._id)
                            )
                        ),
                    sendToStage(io, db, result.value.stageId, ServerDeviceEvents.GroupRemoved, id),
                ])
            }
            throw new Error(`Could not find or delete group ${id}`)
        })

export {
    createGroup,
    updateGroup,
    readGroup,
    deleteGroup,
    upsertCustomGroupPosition,
    upsertCustomGroupVolume,
    readCustomGroupPosition,
    readCustomGroupVolume,
    deleteCustomGroupVolume,
    deleteCustomGroupPosition,
}
