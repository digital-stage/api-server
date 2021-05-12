import ITeckosSocket from 'teckos/lib/types/ITeckosSocket'
import { Device, User } from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { Collections } from '../distributor/Distributor'

const handleSocketClientConnection = async (
    db: Db,
    socket: ITeckosSocket,
    user: User<ObjectId>,
    initialDevice?: Partial<Device<ObjectId>>
): Promise<Device<ObjectId> | undefined> => {
    let device: Device<ObjectId>
    if (initialDevice) {
        if (initialDevice.uuid) {
            device = await db
                .collection<Device<ObjectId>>(Collections.DEVICES)
                .findOneAndUpdate(
                    { uuid: initialDevice.uuid, userId: user._id },
                    {
                        $set: {
                            ...initialDevice,
                            userId: user._id,
                            _id: undefined,
                            online: true,
                            lastLoginAt: new Date(),
                        },
                    }
                )
                .then((result) => result.value)
        }
        if (!device) {
            // Create device
            device = await db
                .collection<Device<ObjectId>>(Collections.DEVICES)
                .insertOne({
                    uuid: null,
                    type: 'mediasoup',
                    requestSession: false,
                    canAudio: false,
                    canVideo: false,
                    receiveAudio: false,
                    receiveVideo: false,
                    sendAudio: false,
                    sendVideo: false,
                    ovRawMode: false,
                    ovRenderISM: false,
                    ovP2p: true,
                    ovReceiverType: 'ortf',
                    ovRenderReverb: true,
                    ovReverbGain: 0.4,
                    canOv: false,
                    volume: 1,
                    egoGain: 1,
                    soundCardId: null,
                    ...initialDevice,
                    _id: undefined,
                    userId: user._id,
                    online: true,
                    lastLoginAt: new Date(),
                    createdAt: new Date(),
                    apiServer: '', // TODO
                })
                .then((result) => result.ops[0])
        }
    }

    return device
}

export default handleSocketClientConnection
