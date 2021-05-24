import {
    Router,
    ServerDeviceEvents,
    ServerRouterEvents,
    ServerRouterPayloads,
    Stage,
} from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import getDistance from '../../src/utils/getDistance'
import Collections from '../../src/distributor/Collections'
import useLogger from '../../src/useLogger'
import { sendToAll, sendToRouter } from './sending'
import { updateStage } from './stages'

const { trace, warn } = useLogger('distributor:routers')

const readNearestRouter = (
    db: Db,
    type: string,
    preferredPosition?: { lat: number; lng: number }
): Promise<Router<ObjectId>> =>
    db
        .collection<Router<ObjectId>>(Collections.ROUTERS)
        .find({ [`types.${type}`]: { $gt: 0 } })
        .toArray()
        .then((routers) => {
            trace(`Found ${routers.length} available routers for type ${type}`)
            if (routers.length > 1) {
                let router = routers[0]
                if (preferredPosition) {
                    let nearest = Number.MAX_VALUE
                    if (router.position) {
                        nearest = getDistance(preferredPosition, router.position)
                    } else {
                        warn(`Router ${router._id} has no position`)
                    }
                    routers.forEach((r) => {
                        if (r.position) {
                            const n = getDistance(preferredPosition, r.position)
                            if (n < nearest) {
                                nearest = n
                                router = r
                            }
                        } else {
                            warn(`Router ${router._id} has no position`)
                        }
                    })
                }
                trace(`Found nearest router ${router._id}`)
                return router
            }
            if (routers.length === 1) {
                return routers[0]
            }
            throw new Error('No router available')
        })

const assignRoutersToStage = async (
    io: ITeckosProvider,
    db: Db,
    stage: Stage<ObjectId>
): Promise<void> => {
    if (stage.videoRouter === null || stage.audioRouter === null) {
        if (stage.videoType === stage.audioType) {
            trace(
                `Seeking for same router for stage ${stage.name}, since type ${stage.videoType} is same for both`
            )
            return readNearestRouter(db, stage.videoType, stage.preferredPosition).then((router) =>
                sendToRouter(io, router._id, ServerRouterEvents.ServeStage, {
                    kind: 'both',
                    type: stage.videoType,
                    stage: stage as any,
                } as ServerRouterPayloads.ServeStage)
            )
        }
        if (stage.videoRouter === null) {
            await readNearestRouter(db, stage.videoType, stage.preferredPosition).then((router) =>
                sendToRouter(io, router._id, ServerRouterEvents.ServeStage, {
                    kind: 'video',
                    type: stage.videoType,
                    stage: stage as any,
                } as ServerRouterPayloads.ServeStage)
            )
        }
        if (stage.audioRouter === null) {
            await readNearestRouter(db, stage.audioType, stage.preferredPosition).then((router) =>
                sendToRouter(io, router._id, ServerRouterEvents.ServeStage, {
                    kind: 'audio',
                    type: stage.audioType,
                    stage: stage as any,
                } as ServerRouterPayloads.ServeStage)
            )
        }
        return Promise.resolve()
    }
    throw new Error('Stage is already fully served')
}

const createRouter = (
    io: ITeckosProvider,
    db: Db,
    apiServer: string,
    initial: Partial<Router<ObjectId>>
): Promise<Router<ObjectId>> => {
    trace(`createRouter(): Creating router with initial data: ${initial}`)
    const { _id, ...initialWithoutId } = initial
    return db
        .collection<Router<ObjectId>>(Collections.ROUTERS)
        .insertOne({
            countryCode: 'GLOBAL',
            city: 'Unknown city',
            types: {},
            position: {
                lat: 0,
                lng: 0,
            },
            ...initialWithoutId,
            apiServer,
            _id: undefined,
        })
        .then((result) => {
            if (result.ops.length > 0) {
                return result.ops[0]
            }
            throw new Error('Could not create Router')
        })
        .then((router) => {
            // emit(ServerDeviceEvents.RouterAdded, router)
            sendToAll(io, ServerDeviceEvents.RouterAdded, router)
            return router
        })
}

const assignRoutersToStages = (io: ITeckosProvider, db: Db): Promise<any> =>
    db
        .collection<Stage<ObjectId>>(Collections.STAGES)
        .find({
            $or: [{ audioRouter: null }, { videoRouter: null }],
        })
        .toArray()
        .then((stagesWithoutRouter) =>
            Promise.all(
                stagesWithoutRouter.map((stageWithoutRouter) =>
                    assignRoutersToStage(io, db, stageWithoutRouter)
                )
            )
        )

const readRouter = (db: Db, id: ObjectId): Promise<Router<ObjectId> | null> =>
    db.collection<Router<ObjectId>>(Collections.ROUTERS).findOne({
        _id: id,
    })

const readRoutersByServer = (db: Db, serverAddress: string): Promise<Router<ObjectId>[]> =>
    db
        .collection<Router<ObjectId>>(Collections.ROUTERS)
        .find({
            apiServer: serverAddress,
        })
        .toArray()

const updateRouter = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<Router<ObjectId>, '_id'>>
): Promise<any> =>
    db
        .collection<Router<ObjectId>>(Collections.ROUTERS)
        .updateOne({ _id: id }, { $set: update })
        .then((result) => {
            if (result.matchedCount > 0) {
                /* emit(ServerDeviceEvents.RouterChanged, {
                    ...update,
                    _id: id,
                }) */
                sendToAll(io, ServerDeviceEvents.RouterChanged, {
                    ...update,
                    _id: id,
                })
            }
            throw new Error(`Could not find and update router ${id}`)
        })

const deleteRouter = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<any> =>
    db
        .collection<Router<ObjectId>>(Collections.ROUTERS)
        .deleteOne({ _id: id })
        .then((result) => {
            if (result.deletedCount > 0) {
                // emit(ServerDeviceEvents.RouterRemoved, id)
                sendToAll(io, ServerDeviceEvents.RouterRemoved, id)
                return db
                    .collection<Stage<ObjectId>>(Collections.STAGES)
                    .find(
                        {
                            $or: [{ audioRouter: id }, { videoRouter: id }],
                        },
                        { projection: { _id: 1, audioRouter: 1, videoRouter: 1 } }
                    )
                    .toArray()
                    .then((stages) =>
                        Promise.all(
                            stages.map((stage) => {
                                trace(`Found ${stages.length}`)
                                if (
                                    stage.audioRouter &&
                                    stage.videoRouter &&
                                    stage.audioRouter.equals(id) &&
                                    stage.videoRouter.equals(id)
                                ) {
                                    trace(
                                        `Deallocate video and audio router ${id} from stage ${stage._id}`
                                    )
                                    return updateStage(io, db, stage._id, {
                                        audioRouter: null,
                                        videoRouter: null,
                                    })
                                }
                                if (stage.audioRouter && stage.audioRouter.equals(id)) {
                                    trace(`Deallocate audio router ${id} from stage ${stage._id}`)
                                    return updateStage(io, db, stage._id, {
                                        audioRouter: null,
                                    })
                                }
                                if (stage.videoRouter && stage.videoRouter.equals(id)) {
                                    trace(`Deallocate video router ${id} from stage ${stage._id}`)
                                    return updateStage(io, db, stage._id, {
                                        videoRouter: null,
                                    })
                                }
                                return undefined
                            })
                        )
                    )
            }
            throw new Error(`Could not find and delete router ${id}`)
        })

export {
    createRouter,
    updateRouter,
    readNearestRouter,
    readRouter,
    readRoutersByServer,
    assignRoutersToStage,
    assignRoutersToStages,
    deleteRouter,
}
