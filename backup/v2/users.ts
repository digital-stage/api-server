import { Device, ServerDeviceEvents, Stage, StageMember, User } from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../src/distributor/Collections'
import { sendToJoinedStageMembers, sendToUser } from './sending'
import { deleteStage } from './stages'
import { deleteDevice } from './devices'
import { deleteStageMember } from './stageMembers'

const createUser = (
    io: ITeckosProvider,
    db: Db,
    initial: Omit<User<ObjectId>, '_id' | 'stageId' | 'stageMemberId' | 'groupId'>
): Promise<User<ObjectId>> => {
    return db
        .collection<User<ObjectId>>(Collections.USERS)
        .insertOne({
            ...initial,
            _id: undefined,
            groupId: null,
            stageId: null,
            stageMemberId: null,
        })
        .then((result) => result.ops[0])
    /* .then((user) => {
      //emit(ServerDeviceEvents.UserAdded, user)
      return user
    }) */
}

const readUser = (db: Db, id: ObjectId): Promise<User<ObjectId> | null> =>
    db.collection<User<ObjectId>>(Collections.USERS).findOne({ _id: id })

const readUserByUid = (db: Db, uid: string): Promise<User<ObjectId> | null> =>
    db.collection<User<ObjectId>>(Collections.USERS).findOne({ uid })

const updateUser = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<User<ObjectId>, '_id'>>
): Promise<void> => {
    // Broadcast before validation (safe, since only user is affected here)
    const { canCreateStage, ...secureUpdate } = update
    const payload = {
        ...secureUpdate,
        _id: id,
    }
    sendToUser(io, id, ServerDeviceEvents.UserChanged, payload)
    return db
        .collection<User<ObjectId>>(Collections.USERS)
        .findOneAndUpdate({ _id: id }, { $set: secureUpdate })
        .then((result) => {
            if (result.value && result.ok) {
                // emit(ServerDeviceEvents.UserChanged, payload)
                if (result.value.stageId) {
                    return sendToJoinedStageMembers(
                        io,
                        db,
                        result.value.stageId,
                        ServerDeviceEvents.RemoteUserChanged,
                        payload
                    )
                }
                return undefined
            }
            throw new Error(`Could not find and update user ${id}`)
        })
}

const updateUserWithPermissions = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<User<ObjectId>, '_id'>>
): Promise<void> => {
    // Broadcast before validation (safe, since only user is affected here)
    const payload = {
        ...update,
        _id: id,
    }
    sendToUser(io, id, ServerDeviceEvents.UserChanged, payload)
    return db
        .collection<User<ObjectId>>(Collections.USERS)
        .findOneAndUpdate({ _id: id }, { $set: update })
        .then((result) => {
            if (result.value && result.ok) {
                // emit(ServerDeviceEvents.UserChanged, payload)
                if (result.value.stageId) {
                    return sendToJoinedStageMembers(
                        io,
                        db,
                        result.value.stageId,
                        ServerDeviceEvents.RemoteUserChanged,
                        payload
                    )
                }
            }
            throw new Error(
                `Could not find and update user with permission ${id}: ${result.lastErrorObject}`
            )
        })
}

const deleteUser = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> =>
    db
        .collection<User<ObjectId>>(Collections.USERS)
        .deleteOne({ _id: id })
        .then((result) => {
            if (result.deletedCount > 0) {
                return // emit(ServerDeviceEvents.UserRemoved, id)
            }
            throw new Error(`Could not find and delete user ${id}`)
        })
        .then(() =>
            Promise.all([
                db
                    .collection<Stage<ObjectId>>(Collections.STAGES)
                    .find({ admins: [id] }, { projection: { _id: 1 } })
                    .toArray()
                    .then((stages) => stages.map((s) => deleteStage(io, db, s._id))),
                // Removes all associated devices and its associated local tracks, remote tracks, sound cards, presets
                db
                    .collection<Device<ObjectId>>(Collections.DEVICES)
                    .find({ userId: id }, { projection: { _id: 1 } })
                    .toArray()
                    .then((devices) => devices.map((device) => deleteDevice(io, db, device._id))),
                // Removes all associated stage members and remote tracks
                db
                    .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                    .find({ userId: id }, { projection: { _id: 1 } })
                    .toArray()
                    .then((stageMembers) =>
                        stageMembers.map((stageMember) =>
                            deleteStageMember(io, db, stageMember._id)
                        )
                    ),
            ])
        )

export { createUser, readUser, readUserByUid, updateUser, updateUserWithPermissions, deleteUser }
