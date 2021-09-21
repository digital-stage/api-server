/*
 * Copyright (c) 2021 Tobias Hegemann
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

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
