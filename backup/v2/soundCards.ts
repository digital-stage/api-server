import { Db, ObjectId } from 'mongodb'
import { Device, ServerDeviceEvents, SoundCard } from '@digitalstage/api-types'
import { ITeckosProvider } from 'teckos'
import Collections from '../../src/distributor/Collections'
import { sendToUser } from './sending'
import { updateDevice } from './devices'

const upsertSoundCard = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    deviceId: ObjectId,
    uuid: string,
    update: Partial<Omit<SoundCard<ObjectId>, '_id' | 'userId' | 'deviceId' | 'uuid'>>
): Promise<ObjectId> => {
    return db
        .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
        .findOneAndUpdate(
            {
                userId,
                deviceId,
                uuid,
            },
            {
                $set: update,
            },
            { upsert: false, projection: { _id: 1 } }
        )
        .then((result) => {
            if (result.value) {
                // Return updated document
                sendToUser(io, userId, ServerDeviceEvents.SoundCardChanged, {
                    ...update,
                    _id: result.value._id,
                })
                return result.value._id
            }
            if (result.ok) {
                return db
                    .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
                    .insertOne({
                        sampleRate: 48000,
                        sampleRates: [48000],
                        label: uuid,
                        isDefault: false,
                        online: false,
                        drivers: [],
                        driver: null,
                        inputChannels: {},
                        outputChannels: {},
                        periodSize: 96,
                        numPeriods: 2,
                        softwareLatency: null,
                        ...update,
                        userId,
                        deviceId,
                        uuid,
                    })
                    .then((insertResult) => insertResult.ops[0] as SoundCard<ObjectId>)
                    .then((soundCard) => {
                        sendToUser(io, userId, ServerDeviceEvents.SoundCardAdded, soundCard)
                        return soundCard._id
                    })
            }
            throw new Error('Could not create sound card')
        })
}

const updateSoundCard = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<SoundCard<ObjectId>, '_id' | 'userId' | 'deviceId'>>
): Promise<ObjectId> => {
    return db
        .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
        .findOneAndUpdate(
            {
                _id: id,
            },
            {
                $set: update,
            },
            { upsert: false, projection: { _id: 1, userId: 1 } }
        )
        .then((result) => {
            if (result.value) {
                // Return updated document
                sendToUser(io, result.value.userId, ServerDeviceEvents.SoundCardChanged, {
                    ...update,
                    _id: result.value._id,
                })
                return result.value._id
            }
            throw new Error(`Could not find or update sound card ${id}`)
        })
}

const deleteSoundCard = (
    io: ITeckosProvider,
    db: Db,
    userId: ObjectId,
    id: ObjectId
): Promise<any> =>
    db
        .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
        .findOneAndDelete(
            {
                _id: id,
                userId,
            },
            { projection: { userId: 1, name: 1 } }
        )
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.SoundCardRemoved, id)
                sendToUser(io, result.value.userId, ServerDeviceEvents.SoundCardRemoved, id)
                return Promise.all([
                    db
                        .collection<Device<ObjectId>>(Collections.DEVICES)
                        .find(
                            { $or: [{ availableObjectIds: id }, { soundCardId: id }] },
                            {
                                projection: {
                                    availableObjectIds: 1,
                                    soundCardId: 1,
                                    _id: 1,
                                },
                            }
                        )
                        .toArray()
                        .then((devices) =>
                            devices.map((device) =>
                                updateDevice(io, db, device.userId, device._id, {
                                    soundCardId:
                                        device.soundCardId === id ? null : device.soundCardId,
                                })
                            )
                        ),
                ])
            }
            throw new Error(`Could not find and delete the sound card ${id}`)
        })

export { updateSoundCard, upsertSoundCard, deleteSoundCard }
