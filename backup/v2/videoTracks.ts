import { ServerDeviceEvents, VideoTrack } from '@digitalstage/api-types'
import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider } from 'teckos'
import Collections from '../../src/distributor/Collections'
import { sendToJoinedStageMembers } from './sending'

const createVideoTrack = (
    io: ITeckosProvider,
    db: Db,
    initialTrack: Omit<VideoTrack<ObjectId>, '_id'>
): Promise<VideoTrack<ObjectId>> =>
    db
        .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
        .insertOne(initialTrack as any)
        .then((result) => result.ops[0])
        .then((producer) => {
            // emit(ServerDeviceEvents.VideoTrackAdded, producer)
            return sendToJoinedStageMembers(
                io,
                db,
                initialTrack.stageId,
                ServerDeviceEvents.VideoTrackAdded,
                producer
            ).then(() => producer)
        })

const readVideoTrack = (db: Db, id: ObjectId): Promise<VideoTrack<ObjectId>> => {
    return db.collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS).findOne({
        _id: id,
    })
}

const readVideoTrackIdsByDevice = (db: Db, deviceId: ObjectId): Promise<ObjectId[]> => {
    return db
        .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
        .find({ deviceId }, { projection: { _id: 1 } })
        .toArray()
        .then((tracks) => tracks.map((track) => track._id))
}

const updateVideoTrack = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<VideoTrack<ObjectId>, '_id'>>
): Promise<void> => {
    const { localVideoTrackId, userId, ...secureUpdate } = update
    return db
        .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
        .findOneAndUpdate(
            {
                _id: id,
            },
            {
                $set: secureUpdate,
            },
            { projection: { stageId: 1 } }
        )
        .then((result) => {
            if (result.value) {
                const payload = {
                    ...secureUpdate,
                    _id: id,
                }
                // emit(ServerDeviceEvents.VideoTrackChanged, payload)
                return sendToJoinedStageMembers(
                    io,
                    db,
                    result.value.stageId,
                    ServerDeviceEvents.VideoTrackChanged,
                    payload
                )
            }
            throw new Error(`Could not find and update remote video track ${id}`)
        })
}

const deleteVideoTrack = (io: ITeckosProvider, db: Db, id: ObjectId): Promise<void> => {
    return db
        .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
        .findOneAndDelete(
            {
                _id: id,
            },
            { projection: { stageId: 1 } }
        )
        .then((result) => {
            if (result.value) {
                // emit(ServerDeviceEvents.VideoTrackRemoved, id)
                return sendToJoinedStageMembers(
                    io,
                    db,
                    result.value.stageId,
                    ServerDeviceEvents.VideoTrackRemoved,
                    id
                )
            }
            throw new Error(`Could not find and delete video track ${id}`)
        })
}

export {
    createVideoTrack,
    updateVideoTrack,
    readVideoTrack,
    readVideoTrackIdsByDevice,
    deleteVideoTrack,
}
