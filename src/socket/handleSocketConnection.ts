import ITeckosSocket from 'teckos/lib/types/ITeckosSocket'
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
