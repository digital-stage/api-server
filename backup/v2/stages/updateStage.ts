import { ITeckosProvider } from 'teckos'
import { Db, ObjectId } from 'mongodb'
import { ServerDeviceEvents, Stage } from '@digitalstage/api-types'
import { Collections } from '../../../src/distributor/Distributor'
import { assignRoutersToStage } from '../routers'
import { sendToStage } from '../sending'
import { readStage } from './index'
import useLogger from '../../../src/useLogger'

const { error } = useLogger('distributor:stages')

const updateStage = (
    io: ITeckosProvider,
    db: Db,
    id: ObjectId,
    update: Partial<Omit<Stage<ObjectId>, '_id'>>
): Promise<void> =>
    db
        .collection<Stage<ObjectId>>(Collections.STAGES)
        .updateOne({ _id: id }, { $set: update })
        .then((response) => {
            if (response.matchedCount > 0) {
                const payload = {
                    ...update,
                    _id: id,
                }
                // emit(ServerDeviceEvents.StageChanged, payload)
                if (
                    (update.audioRouter !== undefined && update.audioRouter === null) ||
                    (update.videoRouter !== undefined && update.videoRouter == null)
                ) {
                    // Async
                    readStage(db, id)
                        .then((stage) => assignRoutersToStage(io, db, stage))
                        .catch((e) => error(e))
                }
                return sendToStage(io, db, id, ServerDeviceEvents.StageChanged, payload)
            }
            throw new Error(`Could not find and update stage ${id}.`)
        })
export default updateStage
