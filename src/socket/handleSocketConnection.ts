import ITeckosSocket from 'teckos/lib/types/ITeckosSocket'
import { ObjectId } from 'mongodb'
import { ClientDeviceEvents, Payloads } from '@digitalstage/api-types'
import { UWSSocket } from 'teckos'
import { API_KEY } from '../env'
import useLogger from '../useLogger'
import handleSocketClientConnection from './handleSocketClientConnection'
import Distributor from '../distributor/Distributor'
import useAuth from '../auth/useAuth'
import handleSocketRouterConnection from './handleSocketRouterConnection'

const { error, warn, trace } = useLogger('socket')

const handleSocketConnection = (distributor: Distributor, socket: ITeckosSocket): void => {
    const { getUserByToken } = useAuth(distributor)

    socket.on(ClientDeviceEvents.ConnectAsRouter, (payload: Payloads.ConnectAsRouter) => {
        const { apiKey, router } = payload
        if (apiKey) {
            // A router is trying to connect
            if (apiKey === API_KEY) {
                return handleSocketRouterConnection(distributor, socket, {
                    ...router,
                    _id: undefined,
                })
            }
            const uwsSocket = socket as UWSSocket
            error(
                `Router ${
                    router.url
                } with IP ${uwsSocket.ws.getRemoteAddressAsText()} tried to sign in with wrong api key ${apiKey}, should be ${API_KEY}`
            )
        } else {
            error(`Router ${router.url} dit not provide any api key`)
        }
        return socket.disconnect()
    })

    socket.on(ClientDeviceEvents.ConnectWithToken, (payload: Payloads.ConnectWithToken) => {
        const { token, device } = payload
        trace('New connection with token')
        if (token) {
            return getUserByToken(token)
                .then((user) =>
                    handleSocketClientConnection(distributor, socket, user, {
                        ...device,
                        availableSoundCardIds: device.availableSoundCardIds
                            ? device.availableSoundCardIds.map((id) => new ObjectId(id))
                            : [],
                        soundCardId: device.soundCardId ? new ObjectId(device.soundCardId) : null,
                        userId: user._id,
                    })
                )
                .catch((e) => {
                    socket.disconnect()
                    error(e)
                })
        }
        warn('Attempt to connect with invalid token')
        return socket.disconnect()
    })
}
export default handleSocketConnection
