import { ITeckosProvider } from 'teckos'
import { Db, ObjectId } from 'mongodb'
import {
    DefaultThreeDimensionalProperties,
    DefaultVolumeProperties,
    Device,
    Group,
    ServerDeviceEvents,
    StageMember,
} from '@digitalstage/api-types'
import { readUser, updateUser } from './users'
import Collections from '../../src/distributor/Collections'
import {
    createStageMember,
    deleteStageMember,
    updateStageMember,
    upsertCustomStageMemberVolume,
} from './stageMembers'
import { sendToUser } from './sending'
import { getWholeStage } from './utils'
import { readStage } from './stages'
import useLogger from '../../src/useLogger'

const { trace } = useLogger('distributor:membership')
/**
 * Checks for stage credentials.
 * Creates a stage member if user is new to stage.
 * Updates the existing stage member to be online.
 * Updates also all stage devices to be online.
 * Creates a muted custom stage member track for him/herself if new to stage.
 *
 * @param userId
 * @param stageId
 * @param groupId
 * @param password
 */
const joinStage = async (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    stageId: ObjectId,
    groupId: ObjectId,
    password?: string
): Promise<void> => {
    const startTime = Date.now()

    const user = await readUser(db, userId)
    const stage = await readStage(db, stageId)

    if (stage.password && stage.password !== password) {
        throw new Error('Invalid password')
    }

    const isAdmin: boolean = stage.admins.find((admin) => admin.equals(userId)) !== undefined
    const previousObjectId = user.stageMemberId

    let stageMember = await db
        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
        .findOne({
            userId: user._id,
            stageId: stage._id,
        })

    const wasUserAlreadyInStage = stageMember !== null
    if (!wasUserAlreadyInStage) {
        stageMember = await createStageMember(io, db, {
            userId: user._id,
            stageId: stage._id,
            groupId,
            active: true,
            isDirector: false,
            ...DefaultVolumeProperties,
            ...DefaultThreeDimensionalProperties,
        })
    } else if (!stageMember.groupId.equals(groupId) || !stageMember.active) {
        // Update stage member
        stageMember.active = true
        stageMember.groupId = groupId
        await updateStageMember(io, db, stageMember._id, {
            groupId,
            active: true,
        })
    }
    // Also create a custom stage member for the same user and mute it per default for all devices
    await db
        .collection<Device<ObjectId>>(Collections.DEVICES)
        .find({ userId }, { projection: { _id: 1 } })
        .toArray()
        .then((devices) =>
            devices.map((device) =>
                upsertCustomStageMemberVolume(io, db, userId, stageMember._id, device._id, {
                    muted: true,
                })
            )
        )

    // Update user
    if (!previousObjectId || !previousObjectId.equals(stageMember._id)) {
        user.stageId = stage._id
        user.stageMemberId = stageMember._id
        await updateUser(io, db, user._id, {
            stageId: stage._id,
            stageMemberId: stageMember._id,
            groupId: stageMember.groupId,
        })
        // emit(ServerDeviceEvents.StageLeft, user._id)
        sendToUser(io, user._id, ServerDeviceEvents.StageLeft)
    }

    // Send whole stage
    await getWholeStage(db, user._id, stage._id, isAdmin || wasUserAlreadyInStage).then(
        (wholeStage) => {
            /* emit(ServerDeviceEvents.StageJoined, {
          ...wholeStage,
          stageId: stage._id,
          groupId,
          user: user._id,
      }) */
            return sendToUser(io, user._id, ServerDeviceEvents.StageJoined, {
                ...wholeStage,
                stageId: stage._id,
                groupId,
                stageMemberId: stageMember,
            })
        }
    )

    if (!previousObjectId || !previousObjectId.equals(stageMember._id)) {
        if (previousObjectId) {
            await updateStageMember(io, db, previousObjectId, { active: false })
        }
    }
    trace(`joinStage: ${Date.now() - startTime}ms`)
}

/**
 * Sets the stage member inactive and de-assigns the user from the stage
 * @param io
 * @param db
 * @param userId
 */
const leaveStage = async (io: ITeckosProvider, db: Db, userId: ObjectId): Promise<any> => {
    const startTime = Date.now()
    const user = await readUser(db, userId)

    if (user.stageId) {
        const previousObjectId = user.stageMemberId

        // Leave the user <-> stage member connection
        user.stageId = undefined
        user.groupId = undefined
        user.stageMemberId = undefined
        await updateUser(io, db, user._id, {
            stageId: undefined,
            groupId: undefined,
            stageMemberId: undefined,
        })
        // emit(ServerDeviceEvents.StageLeft, user._id)
        sendToUser(io, user._id, ServerDeviceEvents.StageLeft)

        // Set old stage member offline (async!)
        await updateStageMember(io, db, previousObjectId, { active: false })
    }
    trace(`leaveStage: ${Date.now() - startTime}ms`)
}

/**
 * Removes all user related data from the stage and de-assign the user from stage
 * @param io
 * @param db
 * @param userId
 * @param stageId
 */
const leaveStageForGood = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    stageId: ObjectId
): Promise<any> =>
    readUser(db, userId).then(async (user) => {
        if (user) {
            await leaveStage(io, db, userId)
        }
        // Delete stage member
        return db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .findOne(
                {
                    userId,
                    stageId,
                },
                {
                    projection: { _id: 1 },
                }
            )
            .then((stageMember) => {
                if (stageMember) {
                    return deleteStageMember(io, db, stageMember._id)
                        .then(() =>
                            db
                                .collection<Group<ObjectId>>(Collections.GROUPS)
                                .find(
                                    {
                                        stageId,
                                    },
                                    {
                                        projection: { _id: 1 },
                                    }
                                )
                                .toArray()
                        )
                        .then((groups) =>
                            groups.map((group) =>
                                sendToUser(io, userId, ServerDeviceEvents.GroupRemoved, group._id)
                            )
                        )
                        .then(() =>
                            sendToUser(io, userId, ServerDeviceEvents.StageRemoved, stageId)
                        )
                }
                throw new Error(`User ${userId} was not inside ${stageId}`)
            })
    })
export { joinStage, leaveStage, leaveStageForGood }
