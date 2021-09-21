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
import { ClientDeviceEvents, Payloads } from '@digitalstage/api-types'
import { UWSSocket } from 'teckos'
import { API_KEY } from '../env'
import { useLogger } from '../useLogger'
import { handleSocketClientConnection } from './handleSocketClientConnection'
import { Distributor } from '../distributor/Distributor'
import { useAuth } from '../auth/useAuth'
import { handleSocketRouterConnection } from './handleSocketRouterConnection'

const { error, warn, debug, trace } = useLogger('socket')

const getIP = (socket: ITeckosSocket): string => {
    const uwsSocket = socket as UWSSocket
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return Buffer.from(uwsSocket.ws.getRemoteAddressAsText()).toString()
}

const handleSocketConnection = (distributor: Distributor, socket: ITeckosSocket): void => {
    const { getUserByToken } = useAuth(distributor)

    socket.setMaxListeners(70)

    socket.on(ClientDeviceEvents.ConnectAsRouter, (payload: Payloads.ConnectAsRouter) => {
        const { apiKey, router } = payload
        const url = router.url && typeof router.url === 'string' ? router.url : ''
        if (apiKey) {
            // A router is trying to connect
            if (apiKey === API_KEY) {
                return handleSocketRouterConnection(distributor, socket, {
                    ...router,
                    _id: undefined,
                })
            }
            trace(
                `Router ${url} with IP ${getIP(
                    socket
                )} tried to sign in with wrong api key ${apiKey}, should be ${API_KEY}`
            )
        } else {
            error(`Router ${url} dit not provide any api key`)
        }
        return socket.disconnect()
    })

    socket.on(ClientDeviceEvents.ConnectWithToken, (payload: Payloads.ConnectWithToken) => {
        const { token, device } = payload
        if (token) {
            debug('New connection with token')
            const soundCardId =
                device.soundCardId && typeof device.soundCardId === 'string'
                    ? new ObjectId(device.soundCardId)
                    : null
            return getUserByToken(token)
                .then((user) =>
                    handleSocketClientConnection(distributor, socket, user, {
                        ...device,
                        soundCardId,
                        userId: user._id,
                    })
                )
                .catch((e) => {
                    warn(`Attempt to connect with invalid token from IP ${getIP(socket)}`)
                    socket.disconnect()
                    error(e)
                })
        }
        warn(`Attempt to connect without token from IP ${getIP(socket)}`)
        return socket.disconnect()
    })
}
export { handleSocketConnection }
