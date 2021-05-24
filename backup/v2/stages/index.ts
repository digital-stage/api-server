import {
    Group,
    ServerDeviceEvents,
    ServerDevicePayloads,
    ServerRouterEvents,
    ServerRouterPayloads,
    Stage,
} from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../../src/distributor/Collections'
import { sendToRouter, sendToStage, sendToUser } from '../sending'
import { assignRoutersToStage } from '../routers'
import { deleteGroup } from '../groups'

const createStage = (
    io: ITeckosProvider,
    db: Db,
    initialStage: Partial<Omit<Stage<ObjectId>, '_id'>>
): Promise<Stage<ObjectId>> =>
    db
        .collection<Stage<ObjectId>>(Collections.STAGES)
        .insertOne({
            name: '',
            password: null,
            description: '',
            admins: [],
            soundEditors: [],
            iconUrl: null,
            videoType: 'mediasoup',
            audioType: 'mediasoup',
            width: 25,
            length: 20,
            height: 10,
            reflection: 0.7,
            absorption: 0.7,
            preferredPosition: {
                // Frankfurt
                lat: 50.110924,
                lng: 8.682127,
            },
            ...initialStage,
            videoRouter: null,
            audioRouter: null,
            _id: undefined,
        })
        .then((result) => {
            const stage = result.ops[0] as Stage<ObjectId>
            // emit(ServerDeviceEvents.StageAdded, stage as unknown as ServerDevicePayloads.StageAdded)
            stage.admins.forEach((adminId) =>
                sendToUser(
                    io,
                    adminId,
                    ServerDeviceEvents.StageAdded,
                    stage as unknown as ServerDevicePayloads.StageAdded
                )
            )
            return assignRoutersToStage(io, db, stage).then(() => stage)
        })

const readStage = (db: Db, id: ObjectId): Promise<Stage<ObjectId>> =>
    db.collection<Stage<ObjectId>>(Collections.STAGES).findOne({ _id: id })

const readAdministratedStage = (db: Db, userId: ObjectId, id: ObjectId): Promise<Stage<ObjectId>> =>
    db.collection<Stage<ObjectId>>(Collections.STAGES).findOne({
        _id: id,
        admins: userId,
    })

const readManagedStage = (db: Db, userId: ObjectId, id: ObjectId): Promise<Stage<ObjectId>> =>
    db.collection<Stage<ObjectId>>(Collections.STAGES).findOne({
        _id: id,
        $or: [{ admins: userId }, { soundEditors: userId }],
    })

const deleteStage = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> =>
    db
        .collection<Stage<ObjectId>>(Collections.STAGES)
        .findOne({ _id: id })
        .then((stage) => {
            if (stage) {
                // Remove groups first
                return db
                    .collection<Group<ObjectId>>(Collections.GROUPS)
                    .find(
                        { stageId: id },
                        { projection: { _id: 1, videoRouter: 1, audioRouter: 1 } }
                    )
                    .toArray()
                    .then((groups) => {
                        // Delete groups
                        return Promise.all(groups.map((group) => deleteGroup(io, db, group._id)))
                    })
                    .then(() => {
                        // Inform routers
                        if (stage.videoRouter !== null || stage.audioRouter !== null) {
                            if (stage.videoRouter === stage.audioRouter) {
                                sendToRouter(
                                    io,
                                    stage.audioRouter,
                                    ServerRouterEvents.UnServeStage,
                                    {
                                        type: stage.audioType,
                                        stageId: id as any,
                                    } as ServerRouterPayloads.UnServeStage
                                )
                            } else {
                                if (stage.videoRouter) {
                                    sendToRouter(
                                        io,
                                        stage.audioRouter,
                                        ServerRouterEvents.UnServeStage,
                                        {
                                            type: stage.videoType,
                                            stageId: id as any,
                                        } as ServerRouterPayloads.UnServeStage
                                    )
                                }
                                if (stage.audioRouter) {
                                    sendToRouter(
                                        io,
                                        stage.audioRouter,
                                        ServerRouterEvents.UnServeStage,
                                        {
                                            type: stage.audioType,
                                            stageId: id as any,
                                        } as ServerRouterPayloads.UnServeStage
                                    )
                                }
                            }
                        }
                        return undefined
                    })
                    .then(() => {
                        // Emit update
                        // emit(ServerDeviceEvents.StageRemoved, id)
                        return sendToStage(io, db, id, ServerDeviceEvents.StageRemoved, id)
                    })
                    .then(() => {
                        if (
                            stage.audioRouter &&
                            stage.videoRouter &&
                            stage.audioRouter.equals(stage.videoRouter)
                        ) {
                            return sendToRouter(
                                io,
                                stage.audioRouter,
                                ServerRouterEvents.UnServeStage,
                                {
                                    kind: 'both',
                                    type: stage.videoType,
                                    stageId: stage._id.toHexString(),
                                } as ServerRouterPayloads.UnServeStage
                            )
                        }
                        if (stage.audioRouter) {
                            sendToRouter(io, stage.audioRouter, ServerRouterEvents.UnServeStage, {
                                kind: 'audio',
                                type: stage.audioType,
                                stageId: stage._id.toHexString(),
                            } as ServerRouterPayloads.UnServeStage)
                        }
                        if (stage.videoRouter) {
                            sendToRouter(io, stage.videoRouter, ServerRouterEvents.UnServeStage, {
                                kind: 'video',
                                type: stage.videoType,
                                stageId: stage._id.toHexString(),
                            } as ServerRouterPayloads.UnServeStage)
                        }

                        return undefined
                    })
                    .then(() =>
                        db.collection<Stage<ObjectId>>(Collections.STAGES).deleteOne({ _id: id })
                    )
            }
            throw new Error(`Could not find and delete stage ${id}.`)
        })

export { createStage, readAdministratedStage, readStage, readManagedStage, deleteStage }
