import { ObjectId } from 'mongodb'

interface TurnServer {
    _id: ObjectId
    routerId: ObjectId
    url: string
}
export type { TurnServer }
