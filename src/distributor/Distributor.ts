import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider, ITeckosSocket } from 'teckos'
import * as EventEmitter from 'events'
import { DEBUG_EVENTS, DEBUG_PAYLOAD } from '../env'
import useLogger from '../useLogger'
import generateColor from '../utils/generateColor'
import Router from '../types/model/Router'
import RemoteAudioTrack from '../types/model/RemoteAudioTrack'
import RemoteVideoTrack from '../types/model/RemoteVideoTrack'
import Stage from '../types/model/Stage'
import StageMember from '../types/model/StageMember'
import SoundCard from '../types/model/SoundCard'
import Device from '../types/model/Device'
import Group from '../types/model/Group'
import CustomGroupVolume from '../types/model/CustomGroupVolume'
import CustomGroupPosition from '../types/model/CustomGroupPosition'
import CustomStageMemberVolume from '../types/model/CustomStageMemberVolume'
import CustomStageMemberPosition from '../types/model/CustomStageMemberPosition'
import CustomRemoteAudioTrackVolume from '../types/model/CustomRemoteAudioTrackVolume'
import CustomRemoteAudioTrackPosition from '../types/model/CustomRemoteAudioTrackPosition'
import User from '../types/model/User'
import ServerDeviceEvents from '../types/ServerDeviceEvents'
import LocalAudioTrack from '../types/model/LocalAudioTrack'
import LocalVideoTrack from '../types/model/LocalVideoTrack'
import StagePackage from '../types/model/StagePackage'
import ThreeDimensionalProperties, {
    DefaultThreeDimensionalProperties,
} from '../types/model/ThreeDimensionalProperties'
import InitialStagePackage from '../types/model/InitialStagePackage'
import { DefaultVolumeProperties } from '../types/model/VolumeProperties'
import getDistance from '../utils/getDistance'
import ServerRouterEvents from '../types/ServerRouterEvents'
import ServerDevicePayloads from '../types/ServerDevicePayloads'
import ServerRouterPayloads from '../types/ServerRouterPayloads'

const { error, trace, warn } = useLogger('distributor')

export enum Collections {
    ROUTERS = 'r',
    USERS = 'u',
    DEVICES = 'd',
    SOUND_CARDS = 'sc',
    STAGES = 's',
    GROUPS = 'g',
    LOCAL_AUDIO_TRACKS = 'la',
    LOCAL_VIDEO_TRACKS = 'lv',
    CUSTOM_GROUP_POSITIONS = 'c_g_p',
    CUSTOM_GROUP_VOLUMES = 'c_g_v',
    STAGE_MEMBERS = 'sm',
    CUSTOM_STAGE_MEMBER_POSITIONS = 'c_sm_p',
    CUSTOM_STAGE_MEMBER_VOLUMES = 'c_sm_v',
    REMOTE_VIDEO_TRACKS = 'v',
    REMOTE_AUDIO_TRACKS = 'a',
    CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS = 'c_r_ap_p',
    CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES = 'c_r_ap_v',
}

class Distributor extends EventEmitter.EventEmitter {
    private readonly _db: Db

    private readonly _io: ITeckosProvider

    private readonly _apiServer: string

    constructor(socket: ITeckosProvider, database: Db, apiServer: string) {
        super()
        this._io = socket
        this._db = database
        this._apiServer = apiServer
        this.prepareStore()
        this.cleanUp(this._apiServer)
    }

    public db = (): Db => this._db

    public prepareStore = (): Promise<any> =>
        Promise.all([
            this._db.collection<Router>(Collections.ROUTERS).createIndex({ server: 1 }),
            this._db
                .collection<RemoteAudioTrack>(Collections.REMOTE_AUDIO_TRACKS)
                .createIndex({ localAudioTrackId: 1 }),
            this._db
                .collection<RemoteVideoTrack>(Collections.REMOTE_VIDEO_TRACKS)
                .createIndex({ localAudioTrackId: 1 }),
            this._db.collection<Stage>(Collections.STAGES).createIndex({ admins: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ userId: 1 }),
            this._db.collection<SoundCard>(Collections.SOUND_CARDS).createIndex({ userId: 1 }),
            this._db.collection<Device>(Collections.DEVICES).createIndex({ userId: 1 }),
            this._db.collection<Device>(Collections.DEVICES).createIndex({ server: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ stageId: 1 }),
            this._db
                .collection<RemoteAudioTrack>(Collections.REMOTE_AUDIO_TRACKS)
                .createIndex({ stageMemberId: 1 }),
            this._db
                .collection<RemoteVideoTrack>(Collections.REMOTE_VIDEO_TRACKS)
                .createIndex({ stageMemberId: 1 }),
            this._db.collection<Group>(Collections.GROUPS).createIndex({ stageId: 1 }),
            this._db.collection<Stage>(Collections.STAGES).createIndex({ ovServer: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ stageId: 1 }),
            this._db
                .collection<CustomGroupVolume>(Collections.CUSTOM_GROUP_VOLUMES)
                .createIndex({ userId: 1, groupId: 1 }),
            this._db
                .collection<CustomGroupPosition>(Collections.CUSTOM_GROUP_POSITIONS)
                .createIndex({ userId: 1, groupId: 1 }),
            this._db
                .collection<CustomStageMemberVolume>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
                .createIndex({ userId: 1, stageMemberId: 1 }),
            this._db
                .collection<CustomStageMemberPosition>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
                .createIndex({ userId: 1, stageMemberId: 1 }),
            this._db
                .collection<RemoteVideoTrack>(Collections.REMOTE_VIDEO_TRACKS)
                .createIndex({ stageId: 1 }),
            this._db
                .collection<RemoteAudioTrack>(Collections.REMOTE_AUDIO_TRACKS)
                .createIndex({ stageId: 1 }),
            this._db
                .collection<CustomRemoteAudioTrackVolume>(
                    Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
                )
                .createIndex({ userId: 1, ObjectId: 1 }),
            this._db
                .collection<CustomRemoteAudioTrackPosition>(
                    Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
                )
                .createIndex({ userId: 1, ObjectId: 1 }),
            this._db.collection<Group>(Collections.GROUPS).createIndex({ stageId: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ groupId: 1 }),
            this._db
                .collection<CustomGroupVolume>(Collections.CUSTOM_GROUP_VOLUMES)
                .createIndex({ groupId: 1 }),
            this._db
                .collection<CustomGroupPosition>(Collections.CUSTOM_GROUP_POSITIONS)
                .createIndex({ groupId: 1 }),
            this._db
                .collection<Device>(Collections.DEVICES)
                .createIndex({ userId: 1, soundCardNames: 1 }),
            this._db
                .collection<CustomStageMemberVolume>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
                .createIndex({ stageMemberId: 1 }),
            this._db
                .collection<CustomStageMemberPosition>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
                .createIndex({ stageMemberId: 1 }),
            this._db
                .collection<RemoteVideoTrack>(Collections.REMOTE_VIDEO_TRACKS)
                .createIndex({ stageMemberId: 1 }),
            this._db
                .collection<RemoteAudioTrack>(Collections.REMOTE_AUDIO_TRACKS)
                .createIndex({ stageMemberId: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ userId: 1 }),
            this._db.collection<Group>(Collections.GROUPS).createIndex({ stageId: 1 }),
            this._db.collection<SoundCard>(Collections.SOUND_CARDS).createIndex({ userId: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ stageId: 1 }),
            this._db.collection<User>(Collections.USERS).createIndex({ stageId: 1 }),
            this._db.collection<Group>(Collections.GROUPS).createIndex({ stageId: 1 }),
        ])

    public cleanUp = (serverAddress: string): Promise<any> => {
        return Promise.all([
            this.readDevicesByApiServer(serverAddress).then((devices) =>
                devices.map((device) =>
                    this.deleteDevice(device._id).then(() =>
                        trace(`cleanUp(${serverAddress}): Removed device ${device._id}`)
                    )
                )
            ),
            this.readRoutersByServer(serverAddress).then((routers) =>
                routers.map((router) =>
                    this.deleteRouter(router._id).then(() =>
                        trace(`cleanUp(${serverAddress}): Removed router ${router._id}`)
                    )
                )
            ),
        ])
    }

    createRouter = (initial: Partial<Router<ObjectId>>): Promise<Router<ObjectId>> => {
        trace(`createRouter(): Creating router with initial data: ${initial}`)
        const { _id, ...initialWithoutId } = initial
        return this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .insertOne({
                countryCode: 'GLOBAL',
                city: 'Unknown city',
                types: {},
                position: {
                    lat: 0,
                    lng: 0,
                },
                apiServer: this._apiServer,
                ...initialWithoutId,
                _id: undefined,
            })
            .then((result) => {
                if (result.ops.length > 0) {
                    return result.ops[0]
                }
                throw new Error('Could not create Router')
            })
            .then((router) => {
                this.emit(ServerDeviceEvents.RouterAdded, router)
                this.sendToAll(ServerDeviceEvents.RouterAdded, router)
                return router
            })
    }

    assignRoutersToStages = (): Promise<any> =>
        this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .find({
                $or: [{ audioRouter: null }, { videoRouter: null }],
            })
            .toArray()
            .then((stagesWithoutRouter) =>
                Promise.all(
                    stagesWithoutRouter.map((stageWithoutRouter) =>
                        this.assignRoutersToStage(stageWithoutRouter)
                    )
                )
            )

    readRouter = (id: ObjectId): Promise<Router<ObjectId> | null> =>
        this._db.collection<Router<ObjectId>>(Collections.ROUTERS).findOne({
            _id: id,
        })

    readRouters = (): Promise<Router<ObjectId>[]> =>
        this._db.collection<Router<ObjectId>>(Collections.ROUTERS).find().toArray()

    readNearestRouter = (
        type: string,
        preferredPosition?: { lat: number; lng: number }
    ): Promise<Router<ObjectId>> =>
        this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .find({ [`types.${type}`]: { $gt: 0 } })
            .toArray()
            .then((routers) => {
                trace(`Found ${routers.length} available routers for type ${type}`)
                if (routers.length > 1) {
                    let router = routers[0]
                    if (preferredPosition) {
                        let nearest = Number.MAX_VALUE
                        if (router.position) {
                            nearest = getDistance(preferredPosition, router.position)
                        } else {
                            warn(`Router ${router._id} has no position`)
                        }
                        routers.forEach((r) => {
                            if (r.position) {
                                const n = getDistance(preferredPosition, r.position)
                                if (n < nearest) {
                                    nearest = n
                                    router = r
                                }
                            } else {
                                warn(`Router ${router._id} has no position`)
                            }
                        })
                    }
                    return router
                }
                if (routers.length === 1) {
                    return routers[0]
                }
                throw new Error('No router available')
            })

    readRoutersByServer = (serverAddress: string): Promise<Router<ObjectId>[]> =>
        this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .find({
                apiServer: serverAddress,
            })
            .toArray()

    updateRouter = (id: ObjectId, update: Partial<Omit<Router<ObjectId>, '_id'>>): Promise<any> =>
        this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .updateOne({ _id: id }, { $set: update })
            .then((result) => {
                if (result.matchedCount > 0) {
                    this.emit(ServerDeviceEvents.RouterChanged, {
                        ...update,
                        _id: id,
                    })
                    this.sendToAll(ServerDeviceEvents.RouterChanged, {
                        ...update,
                        _id: id,
                    })
                }
                throw new Error(`Could not find and update router ${id}`)
            })

    deleteRouter = (id: ObjectId): Promise<any> =>
        this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .deleteOne({ _id: id })
            .then((result) => {
                if (result.deletedCount > 0) {
                    this.emit(ServerDeviceEvents.RouterRemoved, id)
                    this.sendToAll(ServerDeviceEvents.RouterRemoved, id)
                    return this._db
                        .collection<Stage<ObjectId>>(Collections.STAGES)
                        .find(
                            {
                                $or: [{ audioRouter: id }, { videoRouter: id }],
                            },
                            { projection: { _id: 1, audioRouter: 1, videoRouter: 1 } }
                        )
                        .toArray()
                        .then((stages) =>
                            Promise.all(
                                stages.map((stage) => {
                                    trace(`Found ${stages.length}`)
                                    if (
                                        stage.audioRouter.equals(id) &&
                                        stage.videoRouter.equals(id)
                                    ) {
                                        trace(
                                            `Deallocate video and audio router ${id} from stage ${stage._id}`
                                        )
                                        return this.updateStage(stage._id, {
                                            audioRouter: null,
                                            videoRouter: null,
                                        })
                                    }
                                    if (stage.audioRouter.equals(id)) {
                                        trace(
                                            `Deallocate audio router ${id} from stage ${stage._id}`
                                        )
                                        return this.updateStage(stage._id, {
                                            audioRouter: null,
                                        })
                                    }
                                    trace(`Deallocate video router ${id} from stage ${stage._id}`)
                                    return this.updateStage(stage._id, {
                                        videoRouter: null,
                                    })
                                })
                            )
                        )
                }
                throw new Error(`Could not find and delete router ${id}`)
            })

    getStore = () => this._db

    renewOnlineStatus = (userId: ObjectId): Promise<void> => {
        // Has the user online devices?
        return this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .findOne({ _id: userId }, { projection: { stageMemberId: 1 } })
            .then((user) => {
                if (user.stageMemberId) {
                    // Use is inside stage
                    return this._db
                        .collection<Device<ObjectId>>(Collections.DEVICES)
                        .countDocuments({
                            userId,
                            online: true,
                        })
                        .then((numDevicesOnline) => {
                            if (numDevicesOnline > 0) {
                                // User is online
                                return this.updateStageMember(user.stageMemberId, {
                                    online: true,
                                })
                            }
                            // User has no more online devices
                            return this.updateStageMember(user.stageMemberId, {
                                online: false,
                            })
                        })
                }
                return null
            })
    }

    createLocalAudioTrack = (
        initial: Omit<LocalAudioTrack<ObjectId>, '_id'>
    ): Promise<LocalAudioTrack<ObjectId>> =>
        this._db
            .collection<LocalAudioTrack<ObjectId>>(Collections.LOCAL_AUDIO_TRACKS)
            .insertOne({ ...initial, _id: undefined })
            .then((result) => result.ops[0])
            .then((localAudioTrack: LocalAudioTrack<ObjectId>) => {
                this.emit(ServerDeviceEvents.LocalAudioTrackAdded, localAudioTrack)
                this.sendToUser(
                    initial.userId,
                    ServerDeviceEvents.LocalAudioTrackAdded,
                    localAudioTrack
                )
                // Publish local audio track?
                return this.readUser(initial.userId)
                    .then((user) => {
                        if (user) {
                            if (user.stageMemberId) {
                                return this.createRemoteAudioTrack({
                                    ...DefaultThreeDimensionalProperties,
                                    ...DefaultVolumeProperties,
                                    ...localAudioTrack,
                                    _id: undefined,
                                    localAudioTrackId: localAudioTrack._id,
                                    stageMemberId: user.stageMemberId,
                                    userId: user._id,
                                    stageId: user.stageId,
                                    online: true,
                                })
                            }
                            throw new Error('User is not inside a stage')
                        }
                        throw new Error(`Could not find the user ${initial.userId}`)
                    })
                    .then(() => localAudioTrack)
            })

    readLocalAudioTrackIdsByDevice = (deviceId: ObjectId): Promise<ObjectId[]> => {
        return this._db
            .collection<LocalAudioTrack<ObjectId>>(Collections.LOCAL_AUDIO_TRACKS)
            .find({ deviceId }, { projection: { _id: 1 } })
            .toArray()
            .then((tracks) => tracks.map((track) => track._id))
    }

    updateLocalAudioTrack = (
        userId: ObjectId,
        id: ObjectId,
        update: Partial<Omit<LocalAudioTrack<ObjectId>, '_id' | 'userId' | 'deviceId'>>
    ): Promise<void> => {
        // Broadcast before validation (safe, since only user is affected here)
        const payload = {
            ...update,
            _id: id,
        }
        this.sendToUser(userId, ServerDeviceEvents.LocalAudioTrackChanged, payload)
        return this._db
            .collection<LocalAudioTrack<ObjectId>>(Collections.LOCAL_AUDIO_TRACKS)
            .updateOne(
                {
                    _id: id,
                    userId,
                },
                {
                    $set: update,
                }
            )
            .then((result) => {
                if (result.modifiedCount > 0) {
                    this.emit(ServerDeviceEvents.LocalAudioTrackChanged, payload)
                    // Also update remote audio producer
                    return this._db
                        .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
                        .findOneAndUpdate(
                            { localAudioTrackId: id },
                            { $set: update },
                            { projection: { _id: 1, stageId: 1 } }
                        )
                        .then((result2) => {
                            if (result2 && result2.ok) {
                                return this.sendToJoinedStageMembers(
                                    result2.value.stageId,
                                    ServerDeviceEvents.RemoteAudioTrackChanged,
                                    {
                                        ...update,
                                        _id: result2.value._id,
                                    }
                                )
                            }
                            throw new Error(`Could not find and update the local audio track ${id}`)
                        })
                }
                throw new Error(`Could not find and update local audio track ${id}`)
            })
    }

    deleteLocalAudioTrack = (userId: ObjectId, id: ObjectId): Promise<any> => {
        // Broadcast before validation (safe, since only user is affected here)
        this.sendToUser(userId, ServerDeviceEvents.LocalAudioTrackRemoved, id)
        return this._db
            .collection<LocalAudioTrack<ObjectId>>(Collections.LOCAL_AUDIO_TRACKS)
            .deleteOne({
                userId,
                _id: id,
            })
            .then((result) => {
                if (result.deletedCount > 0) {
                    this.emit(ServerDeviceEvents.LocalAudioTrackRemoved, id)
                    // Also delete all published producers
                    return this._db
                        .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
                        .findOne(
                            {
                                localAudioTrackId: id,
                            },
                            { projection: { _id: 1 } }
                        )
                        .then((remoteAudioTrack) => {
                            if (remoteAudioTrack)
                                return this.deleteRemoteAudioTrack(remoteAudioTrack._id)
                            throw new Error(
                                `Could not find and delete remote audio track ${remoteAudioTrack._id}`
                            )
                        })
                }
                throw new Error(`Could not find and delete local audio track ${id}`)
            })
    }

    createLocalVideoTrack = (
        initial: Omit<LocalVideoTrack<ObjectId>, '_id'>
    ): Promise<LocalVideoTrack<ObjectId>> =>
        this._db
            .collection<LocalVideoTrack<ObjectId>>(Collections.LOCAL_VIDEO_TRACKS)
            .insertOne({ ...initial, _id: undefined })
            .then((result) => result.ops[0])
            .then((localVideoTrack: LocalVideoTrack<ObjectId>) => {
                this.emit(ServerDeviceEvents.LocalVideoTrackAdded, localVideoTrack)
                this.sendToUser(
                    initial.userId,
                    ServerDeviceEvents.LocalVideoTrackAdded,
                    localVideoTrack
                )
                // Publish local video track?
                return this.readUser(initial.userId)
                    .then((user) => {
                        if (user) {
                            if (user.stageMemberId) {
                                return this.createRemoteVideoTrack({
                                    ...DefaultThreeDimensionalProperties,
                                    ...DefaultVolumeProperties,
                                    ...localVideoTrack,
                                    _id: undefined,
                                    localVideoTrackId: localVideoTrack._id,
                                    stageMemberId: user.stageMemberId,
                                    userId: user._id,
                                    stageId: user.stageId,
                                    online: true,
                                })
                            }
                            throw new Error('User is not inside a stage')
                        } else {
                            throw new Error(`Could not find the user ${initial.userId}`)
                        }
                    })
                    .then(() => localVideoTrack)
            })

    readLocalVideoTrackIdsByDevice = (deviceId: ObjectId): Promise<ObjectId[]> => {
        return this._db
            .collection<LocalVideoTrack<ObjectId>>(Collections.LOCAL_VIDEO_TRACKS)
            .find({ deviceId }, { projection: { _id: 1 } })
            .toArray()
            .then((tracks) => tracks.map((track) => track._id))
    }

    updateLocalVideoTrack = (
        userId: ObjectId,
        id: ObjectId,
        update: Partial<Omit<LocalVideoTrack<ObjectId>, '_id'>>
    ): Promise<void> => {
        // Broadcast before validation (safe, since only user is affected here)
        const payload = {
            ...update,
            _id: id,
        }
        this.sendToUser(userId, ServerDeviceEvents.LocalVideoTrackChanged, payload)
        return this._db
            .collection<LocalVideoTrack<ObjectId>>(Collections.LOCAL_VIDEO_TRACKS)
            .updateOne(
                {
                    _id: id,
                    userId,
                },
                {
                    $set: update,
                }
            )
            .then((result) => {
                if (result.modifiedCount > 0) {
                    this.emit(ServerDeviceEvents.LocalVideoTrackChanged, payload)
                    // Also update remote video producer
                    return this._db
                        .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
                        .findOneAndUpdate(
                            { ObjectId: id },
                            { $set: update },
                            { projection: { _id: 1, stageId: 1 } }
                        )
                        .then((result2) => {
                            if (result2) {
                                return this.sendToJoinedStageMembers(
                                    result2.value.stageId,
                                    ServerDeviceEvents.RemoteVideoTrackChanged,
                                    {
                                        ...update,
                                        _id: result2.value._id,
                                    }
                                )
                            }
                            throw new Error(
                                `Could not find and update remote video track ${result2.value._id}`
                            )
                        })
                }
                throw new Error(`Could not find and update local video track ${id}`)
            })
    }

    deleteLocalVideoTrack = (userId: ObjectId, id: ObjectId): Promise<any> => {
        // Broadcast before validation (safe, since only user is affected here)
        this.sendToUser(userId, ServerDeviceEvents.LocalVideoTrackRemoved, id)
        return this._db
            .collection<LocalVideoTrack<ObjectId>>(Collections.LOCAL_VIDEO_TRACKS)
            .deleteOne({
                userId,
                _id: id,
            })
            .then((result) => {
                if (result.deletedCount > 0) {
                    this.emit(ServerDeviceEvents.LocalVideoTrackRemoved, id)
                    // Also delete all published producers
                    return this._db
                        .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
                        .findOne(
                            {
                                localVideoTrackId: id,
                            },
                            { projection: { _id: 1 } }
                        )
                        .then((remoteVideoTrack) => {
                            if (remoteVideoTrack) {
                                return this.deleteRemoteVideoTrack(remoteVideoTrack._id)
                            }
                            throw new Error(
                                `Could not find and delete remote video track ${remoteVideoTrack._id}`
                            )
                        })
                }
                throw new Error(`Could not find and delete local video track ${id}`)
            })
    }

    createRemoteAudioTrack(
        initial: Omit<RemoteAudioTrack<ObjectId>, '_id'>
    ): Promise<RemoteAudioTrack<ObjectId>> {
        return this._db
            .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
            .insertOne({
                ...DefaultVolumeProperties,
                ...DefaultThreeDimensionalProperties,
                ...initial,
                localAudioTrackId: initial.localAudioTrackId,
                stageMemberId: initial.stageMemberId,
                stageId: initial.stageId,
                userId: initial.userId,
                online: initial.online,
                type: initial.type,
                _id: undefined,
            })
            .then((result) => result.ops[0])
            .then((remoteAudioTrack) => {
                this.emit(ServerDeviceEvents.RemoteAudioTrackAdded, remoteAudioTrack)
                return this.sendToJoinedStageMembers(
                    initial.stageId,
                    ServerDeviceEvents.RemoteAudioTrackAdded,
                    remoteAudioTrack // as DevicePayloads.RemoteAudioTrackAdded
                ).then(() => remoteAudioTrack)
            })
    }

    readRemoteAudioTrack(id: ObjectId): Promise<RemoteAudioTrack<ObjectId>> {
        return this._db
            .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
            .findOne({
                _id: id,
            })
    }

    updateRemoteAudioTrack(
        id: ObjectId,
        update: Partial<Omit<RemoteAudioTrack<ObjectId>, '_id'>>
    ): Promise<void> {
        const { _id, localAudioTrackId, userId, ...secureUpdate } = update as any
        return this._db
            .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
            .findOneAndUpdate(
                {
                    _id: id,
                },
                {
                    $set: secureUpdate,
                },
                { projection: { stageId: 1 } }
            )
            .then(async (result) => {
                if (result.value) {
                    const payload = {
                        ...secureUpdate,
                        _id: id,
                    }
                    this.emit(ServerDeviceEvents.RemoteAudioTrackChanged, payload)
                    await this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.RemoteAudioTrackChanged,
                        payload
                    )
                }
                throw new Error(`Could not find and update remote audio track ${id}`)
            })
    }

    deleteRemoteAudioTrack(id: ObjectId): Promise<any> {
        return this._db
            .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
            .findOneAndDelete(
                {
                    _id: id,
                },
                { projection: { stageId: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.RemoteAudioTrackRemoved, id)
                    return Promise.all([
                        this.sendToJoinedStageMembers(
                            result.value.stageId,
                            ServerDeviceEvents.RemoteAudioTrackRemoved,
                            id
                        ),
                        this._db
                            .collection<CustomRemoteAudioTrackPosition<ObjectId>>(
                                Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
                            )
                            .find({ remoteAudioTrackId: id }, { projection: { _id: true } })
                            .toArray()
                            .then((customizedItems) =>
                                customizedItems.map((customizedItem) =>
                                    this.deleteCustomRemoteAudioTrackPosition(customizedItem._id)
                                )
                            ),
                        this._db
                            .collection<CustomRemoteAudioTrackVolume<ObjectId>>(
                                Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
                            )
                            .find({ remoteAudioTrackId: id }, { projection: { _id: true } })
                            .toArray()
                            .then((customizedItems) =>
                                customizedItems.map((customizedItem) =>
                                    this.deleteCustomRemoteAudioTrackVolume(customizedItem._id)
                                )
                            ),
                    ])
                }
                throw new Error(`Could not find and delete remote audio track ${id}`)
            })
    }

    private createRemoteVideoTrack(
        initialTrack: Omit<RemoteVideoTrack<ObjectId>, '_id'>
    ): Promise<RemoteVideoTrack<ObjectId>> {
        return this._db
            .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
            .insertOne({
                ...initialTrack,
                localVideoTrackId: initialTrack.localVideoTrackId,
                stageId: initialTrack.stageId,
                stageMemberId: initialTrack.stageMemberId,
                userId: initialTrack.userId,
                type: initialTrack.type,
                online: initialTrack.online,
            } as any)
            .then((result) => result.ops[0])
            .then((producer) => {
                this.emit(ServerDeviceEvents.RemoteVideoTrackAdded, producer)
                return this.sendToJoinedStageMembers(
                    initialTrack.stageId,
                    ServerDeviceEvents.RemoteVideoTrackAdded,
                    producer
                ).then(() => producer)
            })
    }

    readRemoteVideoTrack(id: ObjectId): Promise<RemoteVideoTrack<ObjectId>> {
        return this._db
            .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
            .findOne({
                _id: id,
            })
    }

    updateRemoteVideoTrack(
        id: ObjectId,
        update: Partial<Omit<RemoteVideoTrack<ObjectId>, '_id'>>
    ): Promise<void> {
        const { localVideoTrackId, userId, ...secureUpdate } = update
        return this._db
            .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
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
                    this.emit(ServerDeviceEvents.RemoteVideoTrackChanged, payload)
                    return this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.RemoteVideoTrackChanged,
                        payload
                    )
                }
                throw new Error(`Could not find and update remote video track ${id}`)
            })
    }

    deleteRemoteVideoTrack(id: ObjectId): Promise<void> {
        return this._db
            .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
            .findOneAndDelete(
                {
                    _id: id,
                },
                { projection: { stageId: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.RemoteVideoTrackRemoved, id)
                    return this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.RemoteVideoTrackRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete remote video track ${id}`)
            })
    }

    createUser(
        initial: Omit<User<ObjectId>, '_id' | 'stageId' | 'stageMemberId' | 'groupId'>
    ): Promise<User<ObjectId>> {
        return this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .insertOne({
                ...initial,
                _id: undefined,
                groupId: null,
                stageId: null,
                stageMemberId: null,
            })
            .then((result) => result.ops[0])
            .then((user) => {
                this.emit(ServerDeviceEvents.UserAdded, user)
                return user
            })
    }

    readUser = (id: ObjectId): Promise<User<ObjectId> | null> =>
        this._db.collection<User<ObjectId>>(Collections.USERS).findOne({ _id: id })

    readUserByUid = (uid: string): Promise<User<ObjectId> | null> =>
        this._db.collection<User<ObjectId>>(Collections.USERS).findOne({ uid })

    updateUser = (id: ObjectId, update: Partial<Omit<User<ObjectId>, '_id'>>): Promise<void> => {
        // Broadcast before validation (safe, since only user is affected here)
        const { canCreateStage, ...secureUpdate } = update
        const payload = {
            ...secureUpdate,
            _id: id,
        }
        this.sendToUser(id, ServerDeviceEvents.UserChanged, payload)
        return this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .findOneAndUpdate({ _id: id }, { $set: secureUpdate })
            .then((result) => {
                if (result.value && result.ok) {
                    this.emit(ServerDeviceEvents.UserChanged, payload)
                    if (result.value.stageId) {
                        return this.sendToJoinedStageMembers(
                            result.value.stageId,
                            ServerDeviceEvents.RemoteUserChanged
                        )
                    }
                    return undefined
                }
                throw new Error(`Could not find and update user ${id}`)
            })
    }

    updateUserWithPermissions(
        id: ObjectId,
        update: Partial<Omit<User<ObjectId>, '_id'>>
    ): Promise<void> {
        // Broadcast before validation (safe, since only user is affected here)
        const payload = {
            ...update,
            _id: id,
        }
        this.sendToUser(id, ServerDeviceEvents.UserChanged, payload)
        return this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .findOneAndUpdate({ _id: id }, { $set: update })
            .then((result) => {
                if (result.value && result.ok) {
                    this.emit(ServerDeviceEvents.UserChanged, payload)
                    if (result.value.stageId) {
                        return this.sendToJoinedStageMembers(
                            result.value.stageId,
                            ServerDeviceEvents.RemoteUserChanged
                        )
                    }
                }
                throw new Error(
                    `Could not find and update user with permission ${id}: ${result.lastErrorObject}`
                )
            })
    }

    deleteUser = (id: ObjectId): Promise<any> =>
        this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .deleteOne({ _id: id })
            .then((result) => {
                if (result.deletedCount > 0) {
                    return this.emit(ServerDeviceEvents.UserRemoved, id)
                }
                throw new Error(`Could not find and delete user ${id}`)
            })
            .then(() =>
                Promise.all([
                    this._db
                        .collection<Stage<ObjectId>>(Collections.STAGES)
                        .find({ admins: [id] }, { projection: { _id: 1 } })
                        .toArray()
                        .then((stages) => stages.map((s) => this.deleteStage(s._id))),
                    // Removes all associated devices and its associated local tracks, remote tracks, sound cards, presets
                    this._db
                        .collection<Device<ObjectId>>(Collections.DEVICES)
                        .find({ userId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((devices) => devices.map((device) => this.deleteDevice(device._id))),
                    // Removes all associated stage members and remote tracks
                    this._db
                        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                        .find({ userId: id }, { projection: { _id: 1 } })
                        .toArray()
                        .then((stageMembers) =>
                            stageMembers.map((stageMember) =>
                                this.deleteStageMember(stageMember._id)
                            )
                        ),
                ])
            )

    createDevice = (init: Omit<Device<ObjectId>, '_id'>): Promise<Device<ObjectId>> =>
        this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .insertOne({
                uuid: null,
                type: 'unknown',
                availableSoundCardIds: [],
                soundCardId: null,
                requestSession: false,
                canAudio: false,
                canVideo: false,
                receiveAudio: false,
                receiveVideo: false,
                sendAudio: false,
                sendVideo: false,
                ...init,
                online: true,
                userId: init.userId,
                lastLoginAt: new Date(),
                createdAt: new Date(),
                _id: undefined,
                apiServer: this._apiServer,
            })
            .then((result) => result.ops[0])
            .then((device) => {
                if (device.requestSession) {
                    trace('Generating UUID session for new device')
                    this._db
                        .collection<Device<ObjectId>>(Collections.DEVICES)
                        .updateOne(
                            { _id: device._id },
                            {
                                $set: {
                                    uuid: device._id.toHexString(),
                                },
                            }
                        )
                        .catch((e) => error(e))
                    return {
                        ...device,
                        uuid: device._id.toHexString(),
                    }
                }
                trace('no generation')
                return device
            })
            .then((device) => {
                this.emit(ServerDeviceEvents.DeviceAdded, device)
                this.sendToUser(init.userId, ServerDeviceEvents.DeviceAdded, device)
                return this.renewOnlineStatus(init.userId).then(() => device)
            })

    readDevicesByUser = (userId: ObjectId): Promise<Device<ObjectId>[]> =>
        this._db.collection<Device<ObjectId>>(Collections.DEVICES).find({ userId }).toArray()

    readDeviceByUserAndUUID = (userId: ObjectId, uuid: string): Promise<Device<ObjectId> | null> =>
        this._db.collection<Device<ObjectId>>(Collections.DEVICES).findOne({ userId, uuid })

    private readDevicesByApiServer(apiServer: string): Promise<Device<ObjectId>[]> {
        return this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .find({ apiServer })
            .toArray()
    }

    updateDevice(
        userId: ObjectId,
        id: ObjectId,
        update: Partial<Omit<Device<ObjectId>, '_id'>>
    ): Promise<void> {
        // Broadcast before validation (safe, since only user is affected here)
        const payload = {
            ...update,
            userId,
            _id: id,
        }
        this.sendToUser(userId, ServerDeviceEvents.DeviceChanged, payload)
        return this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .updateOne(
                { _id: id },
                {
                    $set: update,
                }
            )
            .then((result) => {
                if (result.modifiedCount > 0) {
                    this.emit(ServerDeviceEvents.DeviceChanged, payload)
                    return this.renewOnlineStatus(userId)
                }
                return null
            })
    }

    deleteDevice = (id: ObjectId): Promise<any> =>
        this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.DeviceRemoved, id)
                    this.sendToUser(result.value.userId, ServerDeviceEvents.DeviceRemoved, id)
                    // Delete associated local tracks and sound cards
                    return Promise.all([
                        this._db
                            .collection<LocalAudioTrack<ObjectId>>(Collections.LOCAL_AUDIO_TRACKS)
                            .find(
                                {
                                    deviceId: id,
                                },
                                { projection: { _id: 1, userId: 1 } }
                            )
                            .toArray()
                            .then((localAudioTracks) =>
                                localAudioTracks.map((localAudioTrack) =>
                                    this.deleteLocalAudioTrack(
                                        localAudioTrack.userId,
                                        localAudioTrack._id
                                    )
                                )
                            ),
                        this._db
                            .collection<LocalVideoTrack<ObjectId>>(Collections.LOCAL_VIDEO_TRACKS)
                            .find(
                                {
                                    deviceId: id,
                                },
                                { projection: { _id: 1, userId: 1 } }
                            )
                            .toArray()
                            .then((localVideoTracks) =>
                                localVideoTracks.map((localVideoTrack) =>
                                    this.deleteLocalVideoTrack(
                                        localVideoTrack.userId,
                                        localVideoTrack._id
                                    )
                                )
                            ),
                        this._db
                            .collection<CustomGroupVolume<ObjectId>>(
                                Collections.CUSTOM_GROUP_VOLUMES
                            )
                            .deleteMany({ deviceId: id }),
                        this._db
                            .collection<CustomGroupPosition<ObjectId>>(
                                Collections.CUSTOM_GROUP_POSITIONS
                            )
                            .deleteMany({ deviceId: id }),
                        this._db
                            .collection<CustomStageMemberPosition<ObjectId>>(
                                Collections.CUSTOM_STAGE_MEMBER_POSITIONS
                            )
                            .deleteMany({ deviceId: id }),
                        this._db
                            .collection<CustomStageMemberVolume<ObjectId>>(
                                Collections.CUSTOM_STAGE_MEMBER_VOLUMES
                            )
                            .deleteMany({ deviceId: id }),
                        this._db
                            .collection<CustomRemoteAudioTrackVolume<ObjectId>>(
                                Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
                            )
                            .deleteMany({ deviceId: id }),
                        this._db
                            .collection<CustomRemoteAudioTrackPosition<ObjectId>>(
                                Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
                            )
                            .deleteMany({ deviceId: id }),
                        this.renewOnlineStatus(result.value.userId),
                    ])
                }
                throw new Error(`Could not find and delete device ${id}`)
            })

    createStage = (initialStage: Partial<Omit<Stage<ObjectId>, '_id'>>): Promise<Stage<ObjectId>> =>
        this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .insertOne({
                name: '',
                password: null,
                description: '',
                admins: [],
                soundEditors: [],
                iconUrl: null,
                videoType: 'mediasoup',
                audioType: 'mediasoup',
                width: 25,
                length: 20,
                height: 10,
                reflection: 0.7,
                absorption: 0.7,
                preferredPosition: {
                    // Frankfurt
                    lat: 50.110924,
                    lng: 8.682127,
                },
                ...initialStage,
                videoRouter: null,
                audioRouter: null,
                _id: undefined,
            })
            .then((result) => {
                const stage = result.ops[0] as Stage<ObjectId>
                this.emit(
                    ServerDeviceEvents.StageAdded,
                    (stage as unknown) as ServerDevicePayloads.StageAdded
                )
                stage.admins.forEach((adminId) =>
                    this.sendToUser(
                        adminId,
                        ServerDeviceEvents.StageAdded,
                        (stage as unknown) as ServerDevicePayloads.StageAdded
                    )
                )
                return this.assignRoutersToStage(stage).then(() => stage)
            })

    joinStage = async (
        userId: ObjectId,
        stageId: ObjectId,
        groupId: ObjectId,
        password?: string
    ): Promise<void> => {
        const startTime = Date.now()

        const user = await this.readUser(userId)
        const stage = await this.readStage(stageId)

        if (stage.password && stage.password !== password) {
            throw new Error('Invalid password')
        }

        const isAdmin: boolean = stage.admins.find((admin) => admin.equals(userId)) !== undefined
        const previousObjectId = user.stageMemberId

        let stageMember = await this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .findOne({
                userId: user._id,
                stageId: stage._id,
            })

        const wasUserAlreadyInStage = stageMember !== null
        if (!wasUserAlreadyInStage) {
            stageMember = await this.createStageMember({
                userId: user._id,
                stageId: stage._id,
                groupId,
                online: true,
                isDirector: false,
                ...DefaultVolumeProperties,
                ...DefaultThreeDimensionalProperties,
            })
        } else if (!stageMember.groupId.equals(groupId) || !stageMember.online) {
            // Update stage member
            stageMember.online = true
            stageMember.groupId = groupId
            await this.updateStageMember(stageMember._id, {
                groupId,
                online: true,
            })
        }
        // Also create a custom stage member for the same user and mute it per default for all devices
        await this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .find({ userId }, { projection: { _id: 1 } })
            .toArray()
            .then((devices) =>
                devices.map((device) =>
                    this.upsertCustomStageMemberVolume(userId, stageMember._id, device._id, {
                        muted: true,
                    })
                )
            )

        // Update user
        if (!previousObjectId || !previousObjectId.equals(stageMember._id)) {
            user.stageId = stage._id
            user.stageMemberId = stageMember._id
            await this.updateUser(user._id, {
                stageId: stage._id,
                stageMemberId: stageMember._id,
                groupId: stageMember.groupId,
            })
            this.emit(ServerDeviceEvents.StageLeft, user._id)
            this.sendToUser(user._id, ServerDeviceEvents.StageLeft)
        }

        // Send whole stage
        await this.getWholeStage(user._id, stage._id, isAdmin || wasUserAlreadyInStage).then(
            (wholeStage) => {
                this.emit(ServerDeviceEvents.StageJoined, {
                    ...wholeStage,
                    stageId: stage._id,
                    groupId,
                    user: user._id,
                })
                return this.sendToUser(user._id, ServerDeviceEvents.StageJoined, {
                    ...wholeStage,
                    stageId: stage._id,
                    groupId,
                    stageMemberId: stageMember,
                })
            }
        )

        if (!previousObjectId || !previousObjectId.equals(stageMember._id)) {
            if (previousObjectId) {
                // Set old stage member offline (async!)
                await this.updateStageMember(previousObjectId, { online: false })
                // Set old stage member tracks offline (async!)
                // Remove stage member related audio and video
                await this._db
                    .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
                    .find({
                        stageMemberId: previousObjectId,
                    })
                    .toArray()
                    .then((producers) =>
                        producers.map((producer) => this.deleteRemoteAudioTrack(producer._id))
                    )
                await this._db
                    .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
                    .find({
                        stageMemberId: previousObjectId,
                    })
                    .toArray()
                    .then((producers) =>
                        producers.map((producer) => this.deleteRemoteVideoTrack(producer._id))
                    )
            }

            // Create stage related audio and video producers
            await this._db
                .collection<LocalVideoTrack<ObjectId>>(Collections.LOCAL_VIDEO_TRACKS)
                .find({ userId }, { projection: { _id: 1 } })
                .toArray()
                .then((localVideoTracks) =>
                    localVideoTracks.map((localVideoTrack) =>
                        this.createRemoteVideoTrack({
                            ...localVideoTrack,
                            stageMemberId: user.stageMemberId,
                            localVideoTrackId: localVideoTrack._id,
                            userId: user._id,
                            stageId: user.stageId,
                            online: true,
                        })
                    )
                )

            await this._db
                .collection<LocalAudioTrack<ObjectId>>(Collections.LOCAL_AUDIO_TRACKS)
                .find({ userId }, { projection: { _id: 1 } })
                .toArray()
                .then((localAudioTracks) =>
                    localAudioTracks.map((localAudioTrack) =>
                        this.createRemoteAudioTrack({
                            ...DefaultVolumeProperties,
                            ...DefaultThreeDimensionalProperties,
                            ...localAudioTrack,
                            stageMemberId: user.stageMemberId,
                            localAudioTrackId: localAudioTrack._id,
                            userId: user._id,
                            stageId: user.stageId,
                            online: true,
                        })
                    )
                )
        }

        trace(`joinStage: ${Date.now() - startTime}ms`)
    }

    leaveStage = async (userId: ObjectId): Promise<any> => {
        const startTime = Date.now()
        const user = await this.readUser(userId)

        if (user.stageId) {
            const previousObjectId = user.stageMemberId

            // Leave the user <-> stage member connection
            user.stageId = undefined
            user.groupId = undefined
            user.stageMemberId = undefined
            await this.updateUser(user._id, {
                stageId: undefined,
                groupId: undefined,
                stageMemberId: undefined,
            })
            this.emit(ServerDeviceEvents.StageLeft, user._id)
            this.sendToUser(user._id, ServerDeviceEvents.StageLeft)

            // Set old stage member offline (async!)
            await this.updateStageMember(previousObjectId, { online: false })

            // Remove old stage member related video and audio
            await Promise.all([
                this._db
                    .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
                    .find({
                        stageMemberId: previousObjectId,
                    })
                    .toArray()
                    .then((producers) =>
                        producers.map((producer) => this.deleteRemoteAudioTrack(producer._id))
                    ),
                this._db
                    .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
                    .find({
                        stageMemberId: previousObjectId,
                    })
                    .toArray()
                    .then((producers) =>
                        producers.map((producer) => this.deleteRemoteVideoTrack(producer._id))
                    ),
            ])
        }
        trace(`leaveStage: ${Date.now() - startTime}ms`)
    }

    leaveStageForGood = (userId: ObjectId, stageId: ObjectId): Promise<any> =>
        this.readUser(userId).then(async (user) => {
            if (user) {
                await this.leaveStage(userId)
            }
            // Delete stage member
            return this._db
                .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                .findOne(
                    {
                        userId,
                        stageId,
                    },
                    {
                        projection: { _id: 1 },
                    }
                )
                .then((stageMember) => {
                    if (stageMember) {
                        return this.deleteStageMember(stageMember._id)
                            .then(() =>
                                this._db
                                    .collection<Group<ObjectId>>(Collections.GROUPS)
                                    .find(
                                        {
                                            stageId,
                                        },
                                        {
                                            projection: { _id: 1 },
                                        }
                                    )
                                    .toArray()
                            )
                            .then((groups) =>
                                groups.map((group) =>
                                    this.sendToUser(
                                        userId,
                                        ServerDeviceEvents.GroupRemoved,
                                        group._id
                                    )
                                )
                            )
                            .then(() =>
                                this.sendToUser(userId, ServerDeviceEvents.StageRemoved, stageId)
                            )
                    }
                    throw new Error(`User ${userId} was not inside ${stageId}`)
                })
        })

    readStage = (id: ObjectId): Promise<Stage<ObjectId>> =>
        this._db.collection<Stage<ObjectId>>(Collections.STAGES).findOne({ _id: id })

    readAdministratedStage = (userId: ObjectId, id: ObjectId): Promise<Stage<ObjectId>> =>
        this._db.collection<Stage<ObjectId>>(Collections.STAGES).findOne({
            _id: id,
            admins: userId,
        })

    readManagedStage = (userId: ObjectId, id: ObjectId): Promise<Stage<ObjectId>> =>
        this._db.collection<Stage<ObjectId>>(Collections.STAGES).findOne({
            _id: id,
            $or: [{ admins: userId }, { soundEditors: userId }],
        })

    private getWholeStage = async (
        userId: ObjectId,
        stageId: ObjectId,
        skipStageAndGroups: boolean = false
    ): Promise<StagePackage<ObjectId>> => {
        const stage = await this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .findOne({ _id: stageId })
        const groups = await this._db
            .collection<Group<ObjectId>>(Collections.GROUPS)
            .find({ stageId })
            .toArray()
        const stageMembers = await this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .find({ stageId })
            .toArray()
        const stageMemberObjectIds = stageMembers.map((stageMember) => stageMember.userId)
        const remoteUsers = await this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .find({ _id: { $in: stageMemberObjectIds } })
            .toArray()
        const customGroupVolumes = await this._db
            .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
            .find({
                userId,
                groupId: { $in: groups.map((group) => group._id) },
            })
            .toArray()
        const customGroupPositions = await this._db
            .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
            .find({
                userId,
                groupId: { $in: groups.map((group) => group._id) },
            })
            .toArray()

        const customStageMemberVolumes: CustomStageMemberVolume<ObjectId>[] = await this._db
            .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
            .find({
                userId,
                stageMemberId: {
                    $in: stageMembers.map((stageMember) => stageMember._id),
                },
            })
            .toArray()
        const customStageMemberPositions: CustomStageMemberPosition<ObjectId>[] = await this._db
            .collection<CustomStageMemberPosition<ObjectId>>(
                Collections.CUSTOM_STAGE_MEMBER_POSITIONS
            )
            .find({
                userId,
                stageMemberId: {
                    $in: stageMembers.map((stageMember) => stageMember._id),
                },
            })
            .toArray()
        const remoteVideoTracks: RemoteVideoTrack<ObjectId>[] = await this._db
            .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
            .find({
                stageId,
            })
            .toArray()
        const remoteAudioTracks: RemoteAudioTrack<ObjectId>[] = await this._db
            .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
            .find({
                stageId,
            })
            .toArray()
        const customRemoteAudioTrackVolumes: CustomRemoteAudioTrackVolume<ObjectId>[] = await this._db
            .collection<CustomRemoteAudioTrackVolume<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
            )
            .find({
                userId,
                ObjectId: {
                    $in: remoteAudioTracks.map((remoteAudioTrack) => remoteAudioTrack._id),
                },
            })
            .toArray()
        const customRemoteAudioTrackPositions: CustomRemoteAudioTrackPosition<ObjectId>[] = await this._db
            .collection<CustomRemoteAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
            )
            .find({
                userId,
                ObjectId: {
                    $in: remoteAudioTracks.map((remoteAudioTrack) => remoteAudioTrack._id),
                },
            })
            .toArray()

        if (skipStageAndGroups) {
            return {
                remoteUsers,
                stageMembers,
                customGroupVolumes,
                customGroupPositions,
                customStageMemberVolumes,
                customStageMemberPositions,
                remoteVideoTracks,
                remoteAudioTracks,
                customRemoteAudioTrackVolumes,
                customRemoteAudioTrackPositions,
            }
        }
        return {
            remoteUsers,
            stage,
            groups,
            stageMembers,
            customGroupVolumes,
            customGroupPositions,
            customStageMemberVolumes,
            customStageMemberPositions,
            remoteVideoTracks,
            remoteAudioTracks,
            customRemoteAudioTrackVolumes,
            customRemoteAudioTrackPositions,
        }
    }

    updateStage = (id: ObjectId, update: Partial<Omit<Stage<ObjectId>, '_id'>>): Promise<void> =>
        this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .updateOne({ _id: id }, { $set: update })
            .then((response) => {
                if (response.modifiedCount > 0) {
                    const payload = {
                        ...update,
                        _id: id,
                    }
                    this.emit(ServerDeviceEvents.StageChanged, payload)
                    if (
                        (update.audioRouter !== undefined && update.audioRouter === null) ||
                        (update.videoRouter !== undefined && update.videoRouter == null)
                    ) {
                        // Async
                        this.readStage(id)
                            .then((stage) => this.assignRoutersToStage(stage))
                            .catch((e) => error(e))
                    }
                    return this.sendToStage(id, ServerDeviceEvents.StageChanged, payload)
                }
                throw new Error(`Could not find and update stage ${id}.`)
            })

    deleteStage = (id: ObjectId): Promise<any> =>
        this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .findOne({ _id: id })
            .then((stage) => {
                if (stage) {
                    // Remove groups first
                    return this._db
                        .collection<Group<ObjectId>>(Collections.GROUPS)
                        .find(
                            { stageId: id },
                            { projection: { _id: 1, videoRouter: 1, audioRouter: 1 } }
                        )
                        .toArray()
                        .then((groups) => {
                            // Delete groups
                            return Promise.all(groups.map((group) => this.deleteGroup(group._id)))
                        })
                        .then(() => {
                            // Inform routers
                            if (stage.videoRouter !== null || stage.audioRouter !== null) {
                                if (stage.videoRouter === stage.audioRouter) {
                                    this.sendToRouter(
                                        stage.audioRouter,
                                        ServerRouterEvents.UnServeStage,
                                        {
                                            type: stage.audioType,
                                            stageId: id as any,
                                        } as ServerRouterPayloads.UnServeStage
                                    )
                                } else {
                                    if (stage.videoRouter) {
                                        this.sendToRouter(
                                            stage.audioRouter,
                                            ServerRouterEvents.UnServeStage,
                                            {
                                                type: stage.videoType,
                                                stageId: id as any,
                                            } as ServerRouterPayloads.UnServeStage
                                        )
                                    }
                                    if (stage.audioRouter) {
                                        this.sendToRouter(
                                            stage.audioRouter,
                                            ServerRouterEvents.UnServeStage,
                                            {
                                                type: stage.audioType,
                                                stageId: id as any,
                                            } as ServerRouterPayloads.UnServeStage
                                        )
                                    }
                                }
                            }
                            return undefined
                        })
                        .then(() => {
                            // Emit update
                            this.emit(ServerDeviceEvents.StageRemoved, id)
                            return this.sendToStage(id, ServerDeviceEvents.StageRemoved, id)
                        })
                        .then(() =>
                            this._db
                                .collection<Stage<ObjectId>>(Collections.STAGES)
                                .deleteOne({ _id: id })
                        )
                }
                throw new Error(`Could not find and delete stage ${id}.`)
            })

    createGroup = async (
        initial: Omit<Group<ObjectId>, '_id' | 'color'> & Partial<{ color: string }>
    ): Promise<Group<ObjectId>> => {
        let { color } = initial
        if (!color) {
            color = await this.generateGroupColor(initial.stageId)
        }
        return this._db
            .collection<Group<ObjectId>>(Collections.GROUPS)
            .insertOne({
                ...initial,
                color,
            })
            .then((result) => result.ops[0] as Group<ObjectId>)
            .then((group) => {
                this.emit(ServerDeviceEvents.GroupAdded, group)
                return this.sendToStage(group.stageId, ServerDeviceEvents.GroupAdded, group).then(
                    () => group
                )
            })
    }

    upsertSoundCard(
        userId: ObjectId,
        uuid: string,
        update: Partial<Omit<SoundCard<ObjectId>, '_id' | 'uuid' | 'userId'>>
    ): Promise<SoundCard<ObjectId>> {
        return this._db
            .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
            .findOneAndUpdate(
                {
                    userId,
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
                    this.sendToUser(userId, ServerDeviceEvents.SoundCardChanged, {
                        ...update,
                        _id: result.value._id,
                    })
                    return result.value
                }
                if (result.ok) {
                    return this._db
                        .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
                        .insertOne({
                            userId,
                            sampleRate: 48000,
                            sampleRates: [48000],
                            uuid,
                            label: uuid,
                            isDefault: false,
                            drivers: [],
                            driver: null,
                            numInputChannels: 0,
                            numOutputChannels: 0,
                            inputChannels: [],
                            outputChannels: [],
                            periodSize: 96,
                            numPeriods: 2,
                            softwareLatency: null,
                            ...update,
                        })
                        .then((insertResult) => insertResult.ops[0] as SoundCard<ObjectId>)
                        .then((soundCard) => {
                            this.sendToUser(userId, ServerDeviceEvents.SoundCardAdded, soundCard)
                            return soundCard
                        })
                }
                throw new Error('Could not create sound card')
            })
    }

    private createStageMember = async (
        initial: Omit<StageMember<ObjectId>, '_id'>
    ): Promise<StageMember<ObjectId>> =>
        this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .insertOne(initial)
            .then((result) => result.ops[0] as StageMember<ObjectId>)
            .then((stageMember) => {
                this.emit(ServerDeviceEvents.StageMemberAdded, stageMember)
                return this.sendToJoinedStageMembers(
                    stageMember.stageId,
                    ServerDeviceEvents.StageMemberAdded,
                    stageMember
                ).then(() => stageMember)
            })

    deleteGroup = (id: ObjectId): Promise<any> =>
        this._db
            .collection<Group<ObjectId>>(Collections.GROUPS)
            .findOneAndDelete(
                { _id: id },
                {
                    projection: {
                        _id: 1,
                        stageId: 1,
                    },
                }
            )
            .then((result) => {
                if (result.value) {
                    // Delete all associated custom groups and stage members
                    this.emit(ServerDeviceEvents.GroupRemoved, id)
                    return Promise.all([
                        this._db
                            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                            .find(
                                { groupId: result.value._id },
                                {
                                    projection: {
                                        _id: 1,
                                        online: 1,
                                        userId: 1,
                                    },
                                }
                            )
                            .toArray()
                            .then((stageMembers) =>
                                stageMembers.map(async (stageMember) => {
                                    // Throw out user first
                                    if (stageMember.online) {
                                        await this.leaveStage(stageMember.userId)
                                    }
                                    return this.deleteStageMember(stageMember._id)
                                })
                            ),
                        this._db
                            .collection<CustomGroupVolume<ObjectId>>(
                                Collections.CUSTOM_GROUP_VOLUMES
                            )
                            .find({ groupId: result.value._id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((customGroupVolumes) =>
                                customGroupVolumes.map((customGroupVolume) =>
                                    this.deleteCustomGroupVolume(customGroupVolume._id)
                                )
                            ),
                        this._db
                            .collection<CustomGroupPosition<ObjectId>>(
                                Collections.CUSTOM_GROUP_POSITIONS
                            )
                            .find({ groupId: result.value._id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((customGroupPositions) =>
                                customGroupPositions.map((customGroupPosition) =>
                                    this.deleteCustomGroupPosition(customGroupPosition._id)
                                )
                            ),
                        this.sendToStage(result.value.stageId, ServerDeviceEvents.GroupRemoved, id),
                    ])
                }
                throw new Error(`Could not find or delete group ${id}`)
            })

    deleteSoundCard = (userId: ObjectId, id: ObjectId): Promise<any> =>
        this._db
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
                    this.emit(ServerDeviceEvents.SoundCardRemoved, id)
                    this.sendToUser(result.value.userId, ServerDeviceEvents.SoundCardRemoved, id)
                    return Promise.all([
                        this._db
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
                                devices.map((device) => {
                                    const availableObjectIds = device.availableObjectIds.filter(
                                        (i) => i !== id
                                    )
                                    return this.updateDevice(device.userId, device._id, {
                                        availableObjectIds,
                                        soundCardId:
                                            device.soundCardId === id ? null : device.ObjectId,
                                    })
                                })
                            ),
                    ])
                }
                throw new Error(`Could not find and delete the sound card ${id}`)
            })

    deleteStageMember = (id: ObjectId): Promise<any> =>
        this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .findOneAndDelete({ _id: id })
            .then((result) => {
                if (result.value) {
                    // Delete all custom stage members and stage member tracks
                    this.emit(ServerDeviceEvents.StageMemberRemoved, id)
                    return Promise.all([
                        this._db
                            .collection<CustomStageMemberVolume<ObjectId>>(
                                Collections.CUSTOM_STAGE_MEMBER_VOLUMES
                            )
                            .find({ stageMemberId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((items) =>
                                Promise.all(
                                    items.map((item) =>
                                        this.deleteCustomStageMemberVolume(item._id)
                                    )
                                )
                            ),
                        this._db
                            .collection<CustomStageMemberPosition<ObjectId>>(
                                Collections.CUSTOM_STAGE_MEMBER_POSITIONS
                            )
                            .find({ stageMemberId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((items) =>
                                Promise.all(
                                    items.map((item) =>
                                        this.deleteCustomStageMemberPosition(item._id)
                                    )
                                )
                            ),
                        this._db
                            .collection<RemoteVideoTrack<ObjectId>>(Collections.REMOTE_VIDEO_TRACKS)
                            .find({ stageMemberId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((producers) =>
                                producers.map((producer) =>
                                    this.deleteRemoteVideoTrack(producer._id)
                                )
                            ),
                        this._db
                            .collection<RemoteAudioTrack<ObjectId>>(Collections.REMOTE_AUDIO_TRACKS)
                            .find({ stageMemberId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((remoteAudioTracks) =>
                                remoteAudioTracks.map((remoteAudioTrack) =>
                                    this.deleteRemoteAudioTrack(remoteAudioTrack._id)
                                )
                            ),
                        this.sendToJoinedStageMembers(
                            result.value.stageId,
                            ServerDeviceEvents.StageMemberRemoved,
                            id
                        ),
                    ])
                }
                throw new Error(`Could not find or delete stage member ${id}`)
            })

    readGroup = (id: ObjectId): Promise<Group<ObjectId>> =>
        this._db.collection<Group<ObjectId>>(Collections.GROUPS).findOne({ _id: id })

    readSoundCard = (id: ObjectId): Promise<SoundCard<ObjectId>> =>
        this._db.collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS).findOne({ _id: id })

    readStageMember = (id: ObjectId): Promise<StageMember<ObjectId>> =>
        this._db.collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS).findOne({ _id: id })

    updateGroup = (
        id: ObjectId,
        update: Partial<Omit<Group<ObjectId>, '_id' | 'stageId'>>
    ): Promise<void> =>
        this._db
            .collection<Group<ObjectId>>(Collections.GROUPS)
            .findOneAndUpdate({ _id: id }, { $set: update }, { projection: { stageId: 1 } })
            .then((result) => {
                if (result.value) {
                    const payload = {
                        ...update,
                        _id: id,
                    }
                    this.emit(ServerDeviceEvents.GroupChanged, payload)
                    return this.sendToStage(
                        result.value.stageId,
                        ServerDeviceEvents.GroupChanged,
                        payload
                    )
                }
                return null
            })

    updateStageMember = (
        id: ObjectId,
        update: Partial<Omit<StageMember<ObjectId>, '_id' | 'stageId' | 'userId'>>
    ): Promise<void> =>
        this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .findOneAndUpdate({ _id: id }, { $set: update }, { projection: { stageId: 1 } })
            .then((result) => {
                if (result.value) {
                    const payload = {
                        ...update,
                        _id: id,
                    }
                    this.emit(ServerDeviceEvents.StageMemberChanged, payload)
                    return this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.StageMemberChanged,
                        payload
                    )
                }
                throw new Error(`Could not find or update stage member ${id}`)
            })

    /* CUSTOMIZED STATES FOR EACH STAGE MEMBER */
    upsertCustomGroupPosition = (
        userId: ObjectId,
        groupId: ObjectId,
        deviceId: ObjectId,
        update: Partial<ThreeDimensionalProperties>
    ): Promise<void> =>
        this._db
            .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
            .findOneAndUpdate(
                { userId, groupId, deviceId },
                {
                    $set: update,
                },
                { upsert: true, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id,
                    }
                    this.emit(ServerDeviceEvents.CustomGroupPositionChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomGroupPositionChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readGroup(groupId)
                        .then(
                            (group): Omit<CustomGroupPosition<ObjectId>, '_id'> => ({
                                x: group.x,
                                y: group.y,
                                z: group.z,
                                rX: group.rX,
                                rY: group.rY,
                                rZ: group.rZ,
                                ...update,
                                deviceId,
                                userId,
                                groupId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomGroupPosition<ObjectId>>(
                                    Collections.CUSTOM_GROUP_POSITIONS
                                )
                                .insertOne(initial)
                                .then((result2) => {
                                    if (result2.result.ok) {
                                        const payload = result2.ops[0]
                                        this.emit(
                                            ServerDeviceEvents.CustomGroupPositionAdded,
                                            payload
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomGroupPositionAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom position of group ${groupId} for user ${userId} and device ${deviceId}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize position of group ${groupId} for user ${userId} and device ${deviceId}`
                )
            })

    readCustomGroupPosition = (id: ObjectId): Promise<CustomGroupPosition<ObjectId>> =>
        this._db
            .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
            .findOne({ _id: id })

    deleteCustomGroupPosition = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomGroupPositionRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomGroupPositionRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete custom group position ${id}`)
            })

    upsertCustomGroupVolume = (
        userId: ObjectId,
        groupId: ObjectId,
        deviceId: ObjectId,
        update: { volume?: number; muted?: boolean }
    ): Promise<void> =>
        this._db
            .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
            .findOneAndUpdate(
                { userId, groupId, deviceId },
                {
                    $set: update,
                },
                { upsert: true, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id,
                    }
                    this.emit(ServerDeviceEvents.CustomGroupVolumeChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomGroupVolumeChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readGroup(groupId)
                        .then(
                            (group): Omit<CustomGroupVolume<ObjectId>, '_id'> => ({
                                volume: group.volume,
                                muted: group.muted,
                                ...update,
                                userId,
                                groupId,
                                deviceId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomGroupVolume<ObjectId>>(
                                    Collections.CUSTOM_GROUP_VOLUMES
                                )
                                .insertOne(initial)
                                .then((result2) => {
                                    if (result2.result.ok) {
                                        const payload = result2.ops[0]
                                        this.emit(
                                            ServerDeviceEvents.CustomGroupVolumeAdded,
                                            payload
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomGroupVolumeAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom volume of group ${groupId} for user ${userId} and device ${deviceId}`
                                    )
                                })
                        )
                }
                throw new Error(`Could not customize volume of group ${groupId} for user ${userId}`)
            })

    readCustomGroupVolume = (id: ObjectId): Promise<CustomGroupVolume<ObjectId>> =>
        this._db
            .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
            .findOne({ _id: id })

    deleteCustomGroupVolume = (id: ObjectId): Promise<void> => {
        // TODO: This might be insecure, maybe check user and device id also?
        return this._db
            .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomGroupVolumeRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomGroupVolumeRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete custom group volume ${id}`)
            })
    }

    upsertCustomStageMemberPosition = (
        userId: ObjectId,
        stageMemberId: ObjectId,
        deviceId: ObjectId,
        update: Partial<ThreeDimensionalProperties>
    ): Promise<void> =>
        this._db
            .collection<CustomStageMemberPosition<ObjectId>>(
                Collections.CUSTOM_STAGE_MEMBER_POSITIONS
            )
            .findOneAndUpdate(
                { userId, stageMemberId, deviceId },
                {
                    $set: update,
                },
                { upsert: true, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id,
                    }
                    this.emit(ServerDeviceEvents.CustomStageMemberPositionChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomStageMemberPositionChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readStageMember(stageMemberId)
                        .then(
                            (stageMember): Omit<CustomStageMemberPosition<ObjectId>, '_id'> => ({
                                x: stageMember.x,
                                y: stageMember.y,
                                z: stageMember.z,
                                rX: stageMember.rX,
                                rY: stageMember.rY,
                                rZ: stageMember.rZ,
                                ...update,
                                userId,
                                stageMemberId,
                                deviceId,
                            })
                        )
                        .then((payload) =>
                            this._db
                                .collection<CustomStageMemberPosition<ObjectId>>(
                                    Collections.CUSTOM_STAGE_MEMBER_POSITIONS
                                )
                                .insertOne(payload)
                                .then((response) => {
                                    if (response.result.ok) {
                                        const payload2 = response.ops[0]
                                        this.emit(
                                            ServerDeviceEvents.CustomStageMemberPositionAdded,
                                            payload2
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomStageMemberPositionAdded,
                                            payload2
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom position of stage member ${stageMemberId} for user ${userId} and device ${deviceId}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize position of stage member ${stageMemberId} for user ${userId} and device ${deviceId}`
                )
            })

    readCustomStageMemberPosition = (id: ObjectId): Promise<CustomStageMemberPosition<ObjectId>> =>
        this._db
            .collection<CustomStageMemberPosition<ObjectId>>(
                Collections.CUSTOM_STAGE_MEMBER_POSITIONS
            )
            .findOne({ _id: id })

    deleteCustomStageMemberPosition = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomStageMemberPosition<ObjectId>>(
                Collections.CUSTOM_STAGE_MEMBER_POSITIONS
            )
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomStageMemberPositionRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomStageMemberPositionRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete custom stage member position ${id}`)
            })

    upsertCustomStageMemberVolume = (
        userId: ObjectId,
        stageMemberId: ObjectId,
        deviceId: ObjectId,
        update: { volume?: number; muted?: boolean }
    ): Promise<void> =>
        this._db
            .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
            .findOneAndUpdate(
                { userId, stageMemberId },
                {
                    $set: update,
                },
                { upsert: true, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id,
                    }
                    this.emit(ServerDeviceEvents.CustomStageMemberVolumeChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomStageMemberVolumeChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readStageMember(stageMemberId)
                        .then(
                            (stageMember): Omit<CustomStageMemberVolume<ObjectId>, '_id'> => ({
                                volume: stageMember.volume,
                                muted: stageMember.muted,
                                ...update,
                                userId,
                                stageMemberId,
                                deviceId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomStageMemberVolume<ObjectId>>(
                                    Collections.CUSTOM_STAGE_MEMBER_VOLUMES
                                )
                                .insertOne(initial)
                                .then((response) => {
                                    if (response.result.ok) {
                                        const payload = response.ops[0]
                                        this.emit(
                                            ServerDeviceEvents.CustomStageMemberVolumeAdded,
                                            response
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomStageMemberVolumeAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom volume of stage member ${stageMemberId} for user ${userId} and ${deviceId}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize volume of stage member ${stageMemberId} for user ${userId} and ${deviceId}`
                )
            })

    readCustomStageMemberVolume = (id: ObjectId): Promise<CustomStageMemberVolume<ObjectId>> =>
        this._db
            .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
            .findOne({ _id: id })

    deleteCustomStageMemberVolume = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomStageMemberVolumeRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomStageMemberVolumeRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete custom stage member volume ${id}`)
            })

    upsertCustomRemoteAudioTrackPosition = (
        userId: ObjectId,
        remoteAudioTrackId: ObjectId,
        deviceId: ObjectId,
        update: Partial<ThreeDimensionalProperties>
    ): Promise<void> =>
        this._db
            .collection<CustomRemoteAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
            )
            .findOneAndUpdate(
                { userId, remoteAudioTrackId, deviceId },
                {
                    $set: update,
                },
                { upsert: true, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id,
                    }
                    this.emit(ServerDeviceEvents.CustomRemoteAudioTrackPositionChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomRemoteAudioTrackPositionChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readRemoteAudioTrack(remoteAudioTrackId)
                        .then(
                            (
                                audioProducer
                            ): Omit<CustomRemoteAudioTrackPosition<ObjectId>, '_id'> => ({
                                x: audioProducer.x,
                                y: audioProducer.y,
                                z: audioProducer.z,
                                rX: audioProducer.rX,
                                rY: audioProducer.rY,
                                rZ: audioProducer.rZ,
                                ...update,
                                deviceId,
                                userId,
                                remoteAudioTrackId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomRemoteAudioTrackPosition<ObjectId>>(
                                    Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
                                )
                                .insertOne(initial)
                                .then((response) => {
                                    if (response.result.ok) {
                                        const payload = response.ops[0]
                                        this.emit(
                                            ServerDeviceEvents.CustomRemoteAudioTrackPositionAdded,
                                            payload
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomRemoteAudioTrackPositionAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom position of remote audio track ${remoteAudioTrackId} for user ${userId} and device ${deviceId}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize position of remote audio track ${remoteAudioTrackId} for user ${userId} and device ${deviceId}`
                )
            })

    readCustomRemoteAudioTrackPosition = (
        id: ObjectId
    ): Promise<CustomRemoteAudioTrackPosition<ObjectId>> =>
        this._db
            .collection<CustomRemoteAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
            )
            .findOne({ _id: id })

    deleteCustomRemoteAudioTrackPosition = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomRemoteAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_POSITIONS
            )
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomStageMemberPositionRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomStageMemberPositionRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete remote audio track position ${id}`)
            })

    upsertCustomRemoteAudioTrackVolume = (
        userId: ObjectId,
        remoteAudioTrackId: ObjectId,
        deviceId: ObjectId,
        update: { volume?: number; muted?: boolean }
    ): Promise<void> =>
        this._db
            .collection<CustomRemoteAudioTrackVolume<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
            )
            .findOneAndUpdate(
                { userId, remoteAudioTrackId, deviceId },
                {
                    $set: update,
                },
                { upsert: true, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id as any,
                    } as ServerDevicePayloads.CustomRemoteAudioTrackVolumeChanged
                    this.emit(ServerDeviceEvents.CustomRemoteAudioTrackVolumeChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomRemoteAudioTrackVolumeChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readRemoteAudioTrack(remoteAudioTrackId)
                        .then(
                            (
                                audioProducer
                            ): Omit<CustomRemoteAudioTrackVolume<ObjectId>, '_id'> => ({
                                volume: audioProducer.volume,
                                muted: audioProducer.muted,
                                ...update,
                                userId,
                                remoteAudioTrackId,
                                deviceId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomRemoteAudioTrackVolume<ObjectId>>(
                                    Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
                                )
                                .insertOne(initial)
                                .then((response) => {
                                    if (response.result.ok) {
                                        const payload = response.ops[0]
                                        this.emit(
                                            ServerDeviceEvents.CustomRemoteAudioTrackVolumeAdded,
                                            payload
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomRemoteAudioTrackVolumeAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom volume of remote audio track ${remoteAudioTrackId} for user ${userId} and device ${deviceId}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize volume of remote audio track ${remoteAudioTrackId} for user ${userId} and device ${deviceId}`
                )
            })

    readCustomRemoteAudioTrackVolume = (
        id: ObjectId
    ): Promise<CustomRemoteAudioTrackVolume<ObjectId>> =>
        this._db
            .collection<CustomRemoteAudioTrackVolume<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
            )
            .findOne({ _id: id })

    deleteCustomRemoteAudioTrackVolume = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomRemoteAudioTrackVolume<ObjectId>>(
                Collections.CUSTOM_REMOTE_AUDIO_TRACK_VOLUMES
            )
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomRemoteAudioTrackVolumeRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomRemoteAudioTrackVolumeRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete custom remote audio track volume ${id}`)
            })

    /* SENDING METHODS */
    public sendStageDataToDevice = async (
        socket: ITeckosSocket,
        user: User<ObjectId>
    ): Promise<any> => {
        if (user.stageMemberId) {
            // Switch current stage member online
            await this._db
                .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                .updateOne({ stageMemberId: user.stageMemberId }, { $set: { online: true } })
        }
        const stageMembers = await this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .find({ userId: user._id })
            .toArray()
        // Get all managed stages and stages, where the user was or is in
        const stages = await this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .find({
                $or: [
                    {
                        _id: {
                            $in: stageMembers.map((groupMember) => groupMember.stageId),
                        },
                    },
                    { admins: user._id },
                ],
            })
            .toArray()
        await stages.map((stage) =>
            Distributor.sendToDevice(socket, ServerDeviceEvents.StageAdded, stage)
        )
        const groups = await this._db
            .collection<Group<ObjectId>>(Collections.GROUPS)
            .find({ stageId: { $in: stages.map((foundStage) => foundStage._id) } })
            .toArray()
        await Promise.all(
            groups.map((group) =>
                Distributor.sendToDevice(socket, ServerDeviceEvents.GroupAdded, group)
            )
        )

        if (user.stageMemberId) {
            const stageMember = stageMembers.find((groupMember) =>
                groupMember._id.equals(user.stageMemberId)
            )
            if (stageMember) {
                const wholeStage = await this.getWholeStage(user._id, user.stageId, true)
                const initialStage: InitialStagePackage<ObjectId> = {
                    ...wholeStage,
                    stageId: user.stageId,
                    groupId: stageMember.groupId,
                }
                Distributor.sendToDevice(socket, ServerDeviceEvents.StageJoined, initialStage)
            } else {
                error('Group member or stage should exists, but could not be found')
            }
        }
    }

    public sendDeviceConfigurationToDevice = async (
        socket: ITeckosSocket,
        user: User<ObjectId>
    ): Promise<any> => {
        // Send all sound cards
        await this._db
            .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
            .find({ userId: user._id })
            .toArray()
            .then((foundSoundCard) =>
                foundSoundCard.map((soundCard) =>
                    Distributor.sendToDevice(socket, ServerDeviceEvents.SoundCardAdded, soundCard)
                )
            )
    }

    assignRoutersToStage = async (stage: Stage<ObjectId>): Promise<void> => {
        if (stage.videoRouter === null || stage.audioRouter === null) {
            if (stage.videoType === stage.audioType) {
                trace(
                    `Seeking for same router for stage ${stage.name}, since type ${stage.videoType} is same for both`
                )
                return this.readNearestRouter(stage.videoType, stage.preferredPosition).then(
                    (router) =>
                        this.sendToRouter(router._id, ServerRouterEvents.ServeStage, {
                            kind: 'both',
                            type: stage.videoType,
                            stage: stage as any,
                        } as ServerRouterPayloads.ServeStage)
                )
            }
            if (stage.videoRouter === null) {
                await this.readNearestRouter(stage.videoType, stage.preferredPosition).then(
                    (router) =>
                        this.sendToRouter(router._id, ServerRouterEvents.ServeStage, {
                            kind: 'video',
                            type: stage.videoType,
                            stage: stage as any,
                        } as ServerRouterPayloads.ServeStage)
                )
            }
            if (stage.audioRouter === null) {
                await this.readNearestRouter(stage.audioType, stage.preferredPosition).then(
                    (router) =>
                        this.sendToRouter(router._id, ServerRouterEvents.ServeStage, {
                            kind: 'audio',
                            type: stage.audioType,
                            stage: stage as any,
                        } as ServerRouterPayloads.ServeStage)
                )
            }
            return Promise.resolve()
        }
        throw new Error('Stage is already fully served')
    }

    sendToStage = async (stageId: ObjectId, event: string, payload?: any): Promise<void> => {
        const adminIds: ObjectId[] = await this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .findOne({ _id: stageId }, { projection: { admins: 1 } })
            .then((stage) => (stage ? stage.admins : []))
        const stageMemberIds: ObjectId[] = await this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .find({ stageId }, { projection: { userId: 1 } })
            .toArray()
            .then((stageMembers) => stageMembers.map((stageMember) => stageMember.userId))
        const userIds: {
            [id: string]: ObjectId
        } = {}
        adminIds.forEach((adminId) => {
            userIds[adminId.toHexString()] = adminId
        })
        stageMemberIds.forEach((stageMemberId) => {
            userIds[stageMemberId.toHexString()] = stageMemberId
        })
        Object.values(userIds).forEach((userId) => this.sendToUser(userId, event, payload))
    }

    sendToStageManagers = (stageId: ObjectId, event: string, payload?: any): Promise<void> =>
        this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .findOne({ _id: stageId }, { projection: { admins: 1 } })
            .then((foundStage) =>
                foundStage.admins.forEach((admin) => this.sendToUser(admin, event, payload))
            )

    sendToJoinedStageMembers = (stageId: ObjectId, event: string, payload?: any): Promise<void> =>
        this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .find({ stageId }, { projection: { _id: 1 } })
            .toArray()
            .then((users: { _id: ObjectId }[]) =>
                users.forEach((user) => this.sendToUser(user._id, event, payload))
            )

    static sendToDevice = (socket: ITeckosSocket, event: string, payload?: any): void => {
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                trace(`SEND TO DEVICE '${socket.id}' ${event}: ${JSON.stringify(payload)}`)
            } else {
                trace(`SEND TO DEVICE '${socket.id}' ${event}`)
            }
        }
        socket.emit(event, payload)
    }

    sendToUser = (userId: ObjectId, event: string, payload?: any): void => {
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                trace(`SEND TO USER '${userId}' ${event}: ${JSON.stringify(payload)}`)
            } else {
                trace(`SEND TO USER '${userId}' ${event}`)
            }
        }
        this._io.to(userId.toString(), event, payload)
    }

    sendToRouter = (routerId: ObjectId, event: string, payload?: any): void => {
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                trace(`SEND TO ROUTER '${routerId}' ${event}: ${JSON.stringify(payload)}`)
            } else {
                trace(`SEND TO ROUTER '${routerId}' ${event}`)
            }
        }
        this._io.to(routerId.toString(), event, payload)
    }

    sendToAll = (event: string, payload?: any): void => {
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                trace(`SEND TO ALL ${event}: ${JSON.stringify(payload)}`)
            } else {
                trace(`SEND TO ALL ${event}`)
            }
        }
        this._io.toAll(event, payload)
    }

    private generateGroupColor = (stageId: ObjectId) => {
        return this._db
            .collection<Group<ObjectId>>(Collections.GROUPS)
            .find({ stageId })
            .toArray()
            .then((groups) => {
                let color: string
                const hasColor = (c: string): boolean => !!groups.find((group) => group.color === c)
                do {
                    color = generateColor().toString()
                } while (hasColor(color))
                return color
            })
    }

    public static eventNames = (): Array<string | symbol> => Object.values(ServerDeviceEvents)
}

export default Distributor
