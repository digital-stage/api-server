import { ITeckosSocket } from 'teckos'
import { ObjectId } from 'mongodb'
import Router from '../types/model/Router'
import Distributor from '../distributor/Distributor'
import ClientRouterEvents from '../types/ClientRouterEvents'
import useLogger from '../useLogger'
import ServerRouterEvents from '../types/ServerRouterEvents'
import ClientRouterPayloads from '../types/ClientRouterPayloads'

const { error, trace } = useLogger('socket:router')

const handleSocketRouterConnection = async (
    distributor: Distributor,
    socket: ITeckosSocket,
    initialRouter: Omit<Router<ObjectId>, '_id'>
): Promise<Router<ObjectId>> => {
    const router: Router<ObjectId> = await distributor.createRouter(initialRouter)
    socket.join(router._id.toHexString())

    socket.on('disconnect', () => {
        trace(`Router ${router._id} disconnected`)
        return distributor.deleteRouter(router._id).catch((e) => error(e))
    })

    socket.on(ClientRouterEvents.StageServed, (payload: ClientRouterPayloads.StageServed) => {
        trace(`${router._id}: ${ClientRouterEvents.StageServed}(${JSON.stringify(payload)})`)
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
        trace(`${router._id}: ${ClientRouterEvents.StageServed}(${JSON.stringify(payload)})`)
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
        trace(`${router._id}: ${ClientRouterEvents.StageUnServed}(${JSON.stringify(payload)})`)
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
        trace(`${router._id}: ${ClientRouterEvents.ChangeRouter}(${JSON.stringify(payload)})`)
        // Expect supported types not changing during a websocket session, so no implementation necessary here
        const { _id, ...update } = payload
        return distributor
            .updateRouter(router._id, {
                ...update,
            })
            .catch((err) => error(err))
    })

    socket.on(ClientRouterEvents.Ready, () => {
        trace(`${router._id}: ${ClientRouterEvents.Ready}`)
        distributor.assignRoutersToStages().catch((err) => error(err))
    })

    socket.emit(ServerRouterEvents.Ready, router)
    trace(`Registered socket handler for router ${router._id} at socket ${socket.id}`)

    return router
}

export default handleSocketRouterConnection
