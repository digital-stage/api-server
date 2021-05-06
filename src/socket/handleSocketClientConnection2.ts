import ITeckosSocket from 'teckos/lib/types/ITeckosSocket'
import { Device, User, InitialDevice } from '@digitalstage/api-types'
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
            device = await db.collection<Device<ObjectId>>(Collections.DEVICES).findOneAndUpdate(
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
        }
        if (!device) {
            // Create device
            device = await db.collection<Device<ObjectId>>(Collections.DEVICES).insertOne({
                InitialDevice,
                ...initialDevice,
                userId: user._id,
                online: true,
                lastLoginAt: new Date(),
            })
        }
    }

    return device
}

export default handleSocketClientConnection
