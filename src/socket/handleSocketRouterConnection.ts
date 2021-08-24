import { ITeckosSocket } from 'teckos'
import { ObjectId } from 'mongodb'
import {
    Router,
    ServerRouterEvents,
    ClientRouterEvents,
    ClientRouterPayloads,
} from '@digitalstage/api-types'
import { Distributor } from '../distributor/Distributor'
import { useLogger } from '../useLogger'

const { error, debug } = useLogger('socket:router')

const handleSocketRouterConnection = async (
    distributor: Distributor,
    socket: ITeckosSocket,
    initialRouter: Omit<Router<ObjectId>, '_id'>
): Promise<Router<ObjectId>> => {
    const router: Router<ObjectId> = await distributor.createRouter(initialRouter)
    socket.join(router._id.toHexString())

    socket.on('disconnect', () => {
        debug(`Router ${router._id.toHexString()} disconnected`)
        return distributor.deleteRouter(router._id).catch((e) => error(e))
    })

    socket.on(ClientRouterEvents.StageServed, (payload: ClientRouterPayloads.StageServed) => {
        debug(
            `${router._id.toHexString()}: ${ClientRouterEvents.StageServed}(${JSON.stringify(
                payload
            )})`
        )
        const { _id, ...update } = payload.update
        return distributor
            .updateStage(new ObjectId(_id), {
                ...update,
                videoRouter: update.videoRouter
                    ? ObjectId.createFromHexString(update.videoRouter)
                    : undefined,
                audioRouter: update.audioRouter
                    ? ObjectId.createFromHexString(update.audioRouter)
                    : undefined,
            })
            .catch((err) => error(err))
    })

    socket.on(ClientRouterEvents.ChangeStage, (payload: ClientRouterPayloads.ChangeStage) => {
        debug(
            `${router._id.toHexString()}: ${ClientRouterEvents.StageServed}(${JSON.stringify(
                payload
            )})`
        )
        const { _id, ...update } = payload
        return distributor
            .updateStage(new ObjectId(_id), {
                ...update,
                videoRouter: update.videoRouter
                    ? ObjectId.createFromHexString(update.videoRouter)
                    : undefined,
                audioRouter: update.audioRouter
                    ? ObjectId.createFromHexString(update.audioRouter)
                    : undefined,
            })
            .catch((err) => error(err))
    })

    socket.on(ClientRouterEvents.StageUnServed, (payload: ClientRouterPayloads.StageUnServed) => {
        debug(
            `${router._id.toHexString()}: ${ClientRouterEvents.StageUnServed}(${JSON.stringify(
                payload
            )})`
        )
        const { _id, ...update } = payload.update

        // Stage may be deleted already, since we are telling routers to unserve when deleting stages, so...
        return distributor
            .readStage(new ObjectId(_id))
            .then((stage) => {
                if (stage) return distributor.updateStage(stage._id, update)
                return undefined
            })
            .catch((err) => error(err))
    })

    socket.on(ClientRouterEvents.ChangeRouter, (payload: ClientRouterPayloads.ChangeRouter) => {
        debug(
            `${router._id.toHexString()}: ${ClientRouterEvents.ChangeRouter}(${JSON.stringify(
                payload
            )})`
        )
        // Expect supported types not changing during a websocket session, so no implementation necessary here
        const { _id, ...update } = payload
        return distributor
            .updateRouter(router._id, {
                ...update,
            })
            .catch((err) => error(err))
    })

    socket.on(ClientRouterEvents.Ready, () => {
        debug(`${router._id.toHexString()}: ${ClientRouterEvents.Ready}`)
        distributor.assignRoutersToStages().catch((err) => error(err))
    })

    socket.emit(ServerRouterEvents.Ready, router)
    debug(`Registered socket handler for router ${router._id.toHexString()} at socket ${socket.id}`)

    return router
}

export { handleSocketRouterConnection }
