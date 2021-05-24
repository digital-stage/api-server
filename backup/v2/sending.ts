import { Db, ObjectId } from 'mongodb'
import { Stage, StageMember, User } from '@digitalstage/api-types'
import { ITeckosProvider, ITeckosSocket } from 'teckos'
import { DEBUG_EVENTS, DEBUG_PAYLOAD } from '../../src/env'
import Collections from '../../src/distributor/Collections'
import useLogger from '../../src/useLogger'

const { trace } = useLogger('distributor:sending')

const sendToUser = (io: ITeckosProvider, userId: ObjectId, event: string, payload?: any): void => {
    const groupId = userId.toHexString()
    if (DEBUG_EVENTS) {
        if (DEBUG_PAYLOAD) {
            trace(`SEND TO USER '${groupId}' ${event}: ${JSON.stringify(payload)}`)
        } else {
            trace(`SEND TO USER '${groupId}' ${event}`)
        }
    }
    io.to(userId.toHexString(), event, payload)
}

const sendToRouter = (
    io: ITeckosProvider,
    routerId: ObjectId,
    event: string,
    payload?: any
): void => {
    const groupId = routerId.toHexString()
    if (DEBUG_EVENTS) {
        if (DEBUG_PAYLOAD) {
            trace(`SEND TO ROUTER '${groupId}' ${event}: ${JSON.stringify(payload)}`)
        } else {
            trace(`SEND TO ROUTER '${groupId}' ${event}`)
        }
    }
    io.to(groupId, event, payload)
}

const sendToAll = (io: ITeckosProvider, event: string, payload?: any): void => {
    if (DEBUG_EVENTS) {
        if (DEBUG_PAYLOAD) {
            trace(`SEND TO ALL ${event}: ${JSON.stringify(payload)}`)
        } else {
            trace(`SEND TO ALL ${event}`)
        }
    }
    io.toAll(event, payload)
}
const sendToStage = async (
    io: ITeckosProvider,
    db: Db,
    stageId: ObjectId,
    event: string,
    payload?: any
): Promise<void> => {
    const adminIds: ObjectId[] = await db
        .collection<Stage<ObjectId>>(Collections.STAGES)
        .findOne({ _id: stageId }, { projection: { admins: 1 } })
        .then((stage) => (stage ? stage.admins : []))
    const stageMemberIds: ObjectId[] = await db
        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
        .find({ stageId }, { projection: { userId: 1 } })
        .toArray()
        .then((stageMembers) => stageMembers.map((stageMember) => stageMember.userId))
    const userIds: {
        [id: string]: ObjectId
    } = {}
    adminIds.forEach((adminId) => {
        userIds[adminId.toHexString()] = adminId
    })
    stageMemberIds.forEach((stageMemberId) => {
        userIds[stageMemberId.toHexString()] = stageMemberId
    })
    Object.values(userIds).forEach((userId) => sendToUser(io, userId, event, payload))
}

const sendToStageManagers = (
    io: ITeckosProvider,
    db: Db,
    stageId: ObjectId,
    event: string,
    payload?: any
): Promise<void> =>
    db
        .collection<Stage<ObjectId>>(Collections.STAGES)
        .findOne({ _id: stageId }, { projection: { admins: 1 } })
        .then((foundStage) =>
            foundStage.admins.forEach((admin) => sendToUser(io, admin, event, payload))
        )

const sendToJoinedStageMembers = (
    io: ITeckosProvider,
    db: Db,
    stageId: ObjectId,
    event: string,
    payload?: any
): Promise<void> =>
    db
        .collection<User<ObjectId>>(Collections.USERS)
        .find({ stageId }, { projection: { _id: 1 } })
        .toArray()
        .then((users: { _id: ObjectId }[]) =>
            users.forEach((user) => sendToUser(io, user._id, event, payload))
        )

const sendToDevice = (socket: ITeckosSocket, event: string, payload?: any): void => {
    if (DEBUG_EVENTS) {
        if (DEBUG_PAYLOAD) {
            trace(`SEND TO DEVICE '${socket.id}' ${event}: ${JSON.stringify(payload)}`)
        } else {
            trace(`SEND TO DEVICE '${socket.id}' ${event}`)
        }
    }
    socket.emit(event, payload)
}

export {
    sendToAll,
    sendToDevice,
    sendToRouter,
    sendToStage,
    sendToJoinedStageMembers,
    sendToStageManagers,
    sendToUser,
}
