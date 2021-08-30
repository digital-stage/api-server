import { Db, ObjectId } from 'mongodb'
import { ITeckosProvider, ITeckosSocket } from 'teckos'
import * as EventEmitter from 'events'
import {
    Router,
    AudioTrack,
    VideoTrack,
    Stage,
    StageMember,
    SoundCard,
    Device,
    Group,
    CustomGroupVolume,
    CustomGroupPosition,
    CustomStageMemberVolume,
    CustomAudioTrackPosition,
    ServerDeviceEvents,
    User,
    CustomStageMemberPosition,
    ServerDevicePayloads,
    ServerRouterEvents,
    ServerRouterPayloads,
    StageDevice,
    CustomAudioTrackVolume,
    CustomStageDevicePosition,
    CustomStageDeviceVolume,
    StagePackage,
    ThreeDimensionalProperties,
    InitialStagePackage,
    DefaultThreeDimensionalProperties,
    DefaultVolumeProperties,
    ErrorCodes,
} from '@digitalstage/api-types'
import { nanoid } from 'nanoid'
import { unionWith } from 'lodash'
import { DEBUG_EVENTS, DEBUG_PAYLOAD } from '../env'
import { useLogger } from '../useLogger'
import { generateColor } from '../utils/generateColor'
import { getDistance } from '../utils/getDistance'
import { Collections } from './Collections'

const { error, debug, warn } = useLogger('distributor')

ObjectId.cacheHexString = true

/**
 * The distributor ensures the persistence, consistency and distribution of all state data.
 *
 * Regarding audio and video tracks:
 *  - A user can create audio and video tracks for his current device at any time.
 *    Only needed is the initial payload and stage Id.
 *  - The socket handler will remove all tracks when the device goes offline.
 *  - Theoretically tracks can be shared for several stages at a time (but usually the client side
 *    is implemented to share only tracks for the current stage)
 */
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
            .then(() => this.cleanUp(this._apiServer))
            .catch((err) => error(err))
    }

    getStore = (): Db => this._db

    public db = (): Db => this._db

    public prepareStore = (): Promise<unknown> =>
        Promise.all([
            this._db.collection<Router>(Collections.ROUTERS).createIndex({ server: 1 }),
            this._db.collection<Stage>(Collections.STAGES).createIndex({ admins: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ userId: 1 }),
            this._db.collection<SoundCard>(Collections.SOUND_CARDS).createIndex({ userId: 1 }),
            this._db.collection<Device>(Collections.DEVICES).createIndex({ userId: 1 }),
            this._db.collection<Device>(Collections.DEVICES).createIndex({ server: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ stageId: 1 }),
            this._db
                .collection<AudioTrack>(Collections.AUDIO_TRACKS)
                .createIndex({ stageMemberId: 1 }),
            this._db
                .collection<VideoTrack>(Collections.VIDEO_TRACKS)
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
            this._db.collection<VideoTrack>(Collections.VIDEO_TRACKS).createIndex({ stageId: 1 }),
            this._db.collection<AudioTrack>(Collections.AUDIO_TRACKS).createIndex({ stageId: 1 }),
            this._db
                .collection<CustomAudioTrackVolume>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
                .createIndex({ userId: 1, ObjectId: 1 }),
            this._db
                .collection<CustomAudioTrackPosition>(Collections.CUSTOM_AUDIO_TRACK_POSITIONS)
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
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ userId: 1 }),
            this._db.collection<Group>(Collections.GROUPS).createIndex({ stageId: 1 }),
            this._db.collection<SoundCard>(Collections.SOUND_CARDS).createIndex({ userId: 1 }),
            this._db.collection<StageMember>(Collections.STAGE_MEMBERS).createIndex({ stageId: 1 }),
            this._db.collection<User>(Collections.USERS).createIndex({ stageId: 1 }),
            this._db.collection<Group>(Collections.GROUPS).createIndex({ stageId: 1 }),
        ])

    public cleanUp = (serverAddress: string): Promise<unknown> => {
        return Promise.all([
            this.readDevicesByApiServer(serverAddress).then((devices) =>
                devices.map((device) =>
                    this.deleteDevice(device._id).then(() =>
                        debug(
                            `cleanUp(${serverAddress}): Removed device ${device._id.toHexString()}`
                        )
                    )
                )
            ),
            this.readRoutersByServer(serverAddress).then((routers) =>
                routers.map((router) =>
                    this.deleteRouter(router._id).then(() =>
                        debug(
                            `cleanUp(${serverAddress}): Removed router ${router._id.toHexString()}`
                        )
                    )
                )
            ),
            this._db
                .collection<Stage<ObjectId>>(Collections.STAGES)
                .find({ $or: [{ audioRouter: { $ne: null } }, { videoRouter: { $ne: null } }] })
                .toArray()
                .then((stages) =>
                    stages.map(async (stage) => {
                        // Find matching router
                        if (
                            stage.videoRouter !== null &&
                            stage.audioRouter !== null &&
                            stage.videoRouter.equals(stage.audioRouter)
                        ) {
                            const router = await this.readRouter(stage.videoRouter)
                            if (!router) {
                                await this.updateStage(stage._id, {
                                    videoRouter: null,
                                    audioRouter: null,
                                })
                            }
                        } else {
                            if (stage.videoRouter !== null) {
                                const router = await this.readRouter(stage.videoRouter)
                                if (!router) {
                                    await this.updateStage(stage._id, { videoRouter: null })
                                }
                            }
                            if (stage.audioRouter !== null) {
                                const router = await this.readRouter(stage.audioRouter)
                                if (!router) {
                                    await this.updateStage(stage._id, { audioRouter: null })
                                }
                            }
                        }
                    })
                ),
        ])
    }

    /* ROUTER */
    createRouter = (initial: Partial<Router<ObjectId>>): Promise<Router<ObjectId>> => {
        debug(`createRouter(): Creating router with initial data: ${JSON.stringify(initial)}`)
        const { _id, ...initialWithoutId } = initial
        const doc = {
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
        }
        return this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .insertOne(doc)
            .then(
                (result) =>
                    ({
                        ...doc,
                        _id: result.insertedId,
                    } as Router<ObjectId>)
            )
            .then((router) => {
                this.emit(ServerDeviceEvents.RouterAdded, router)
                this.sendToAll(ServerDeviceEvents.RouterAdded, router)
                return router
            })
    }

    assignRoutersToStages = (): Promise<unknown> =>
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

    readNearestRouter = (
        type: string,
        preferredPosition?: { lat: number; lng: number }
    ): Promise<Router<ObjectId>> =>
        this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .find({ [`types.${type}`]: { $gt: 0 } })
            .toArray()
            .then((routers) => {
                debug(`Found ${routers.length} available routers for type ${type}`)
                if (routers.length > 1) {
                    let router = routers[0]
                    if (preferredPosition) {
                        let nearest = Number.MAX_VALUE
                        if (router.position) {
                            nearest = getDistance(preferredPosition, router.position)
                        } else {
                            warn(`Router ${router._id.toHexString()} has no position`)
                        }
                        routers.forEach((r) => {
                            if (r.position) {
                                const n = getDistance(preferredPosition, r.position)
                                if (n < nearest) {
                                    nearest = n
                                    router = r
                                }
                            } else {
                                warn(`Router ${router._id.toHexString()} has no position`)
                            }
                        })
                    }
                    debug(`Found nearest router ${router._id.toHexString()}`)
                    return router
                }
                if (routers.length === 1) {
                    return routers[0]
                }
                throw new Error(ErrorCodes.NoRouterAvailable)
            })

    readRoutersByServer = (serverAddress: string): Promise<Router<ObjectId>[]> =>
        this._db
            .collection<Router<ObjectId>>(Collections.ROUTERS)
            .find({
                apiServer: serverAddress,
            })
            .toArray()

    updateRouter = (id: ObjectId, update: Partial<Omit<Router<ObjectId>, '_id'>>): Promise<void> =>
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
                throw new Error(`Could not find and update router ${id.toHexString()}`)
            })

    deleteRouter = (id: ObjectId): Promise<unknown> =>
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
                                    debug(`Found ${stages.length}`)
                                    if (
                                        stage.audioRouter &&
                                        stage.videoRouter &&
                                        stage.audioRouter.equals(id) &&
                                        stage.videoRouter.equals(id)
                                    ) {
                                        debug(
                                            `Deallocate video and audio router ${id.toHexString()} from stage ${stage._id.toHexString()}`
                                        )
                                        return this.updateStage(stage._id, {
                                            audioRouter: null,
                                            videoRouter: null,
                                        })
                                    }
                                    if (stage.audioRouter && stage.audioRouter.equals(id)) {
                                        debug(
                                            `Deallocate audio router ${id.toHexString()} from stage ${stage._id.toHexString()}`
                                        )
                                        return this.updateStage(stage._id, {
                                            audioRouter: null,
                                        })
                                    }
                                    if (stage.videoRouter && stage.videoRouter.equals(id)) {
                                        debug(
                                            `Deallocate video router ${id.toHexString()} from stage ${stage._id.toHexString()}`
                                        )
                                        return this.updateStage(stage._id, {
                                            videoRouter: null,
                                        })
                                    }
                                    return undefined
                                })
                            )
                        )
                }
                throw new Error(`Could not find and delete router ${id.toHexString()}`)
            })

    /* USER */
    createUser(
        initial: Omit<User<ObjectId>, '_id' | 'stageId' | 'stageMemberId' | 'groupId'>
    ): Promise<User<ObjectId>> {
        const doc = {
            ...initial,
            _id: undefined,
            groupId: null,
            stageId: null,
            stageMemberId: null,
        }
        return this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .insertOne(doc)
            .then(
                (result) =>
                    ({
                        ...doc,
                        _id: result.insertedId,
                    } as User<ObjectId>)
            )
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
                            ServerDeviceEvents.UserChanged,
                            payload
                        )
                    }
                    return undefined
                }
                throw new Error(`Could not find and update user ${id.toHexString()}`)
            })
    }
    /*
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
                            ServerDeviceEvents.UserChanged,
                            payload
                        )
                    }
                }
                throw new Error(
                    `Could not find and update user with permission ${id.toHexString()}: ${result.lastErrorObject}`
                )
            })
    } */

    deleteUser = (id: ObjectId): Promise<unknown> =>
        this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .deleteOne({ _id: id })
            .then((result) => {
                if (result.deletedCount > 0) {
                    return this.emit(ServerDeviceEvents.UserRemoved, id)
                }
                throw new Error(`Could not find and delete user ${id.toHexString()}`)
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

    /* DEVICE */
    createDevice = (
        init: Partial<Omit<Device<ObjectId>, '_id'>> & { userId: ObjectId }
    ): Promise<Device<ObjectId>> => {
        if (!init.type) {
            throw new Error(ErrorCodes.MissingTypeOfDevice)
        }
        const time = new Date().getTime()
        const doc: Device<ObjectId> & { _id?: ObjectId } = {
            uuid: null,
            name: '',
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
            type: 'browser',
            ...init,
            _id: undefined,
            userId: init.userId,
            online: true,
            lastLoginAt: time,
            createdAt: time,
            apiServer: this._apiServer,
        }
        return this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .insertOne(doc)
            .then(
                (result) =>
                    ({
                        ...doc,
                        _id: result.insertedId,
                    } as Device<ObjectId>)
            )
            .then(async (device) => {
                const stageMembers = await this._db
                    .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
                    .find({ userId: device.userId })
                    .toArray()
                await Promise.all(
                    stageMembers.map((stageMember) =>
                        this.createStageDevice({
                            userId: device.userId,
                            deviceId: device._id,
                            stageId: stageMember.stageId,
                            groupId: stageMember.groupId,
                            stageMemberId: stageMember._id,
                            active: device.online,
                            type: device.type,
                            name: device.type,
                            sendLocal: true,
                            ...DefaultThreeDimensionalProperties,
                            ...DefaultVolumeProperties,
                        })
                    )
                )
                return device
            })
            .then((device) => {
                if (device.requestSession) {
                    debug('Generating UUID session for new device')
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
                debug('no generation')
                return device
            })
            .then((device) => {
                this.emit(ServerDeviceEvents.DeviceAdded, device)
                this.sendToUser(init.userId, ServerDeviceEvents.DeviceAdded, device)
                return this.renewOnlineStatus(init.userId).then(() => device)
            })
    }

    readDevice = (id: ObjectId): Promise<Device<ObjectId>> => {
        return this._db.collection<Device<ObjectId>>(Collections.DEVICES).findOne({ _id: id })
    }

    readDeviceByUser = (id: ObjectId, userId: ObjectId): Promise<Device<ObjectId> | undefined> => {
        return this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .findOne({ _id: id, userId })
    }

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
            .findOneAndUpdate(
                { _id: id },
                {
                    $set: update,
                }
            )
            .then(async (result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.DeviceChanged, payload)
                    if (update.online !== undefined) {
                        // Set all sound cards offline
                        if (!update.online) {
                            await this._db
                                .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
                                .find({ deviceId: id })
                                .toArray()
                                .then((soundCards) =>
                                    soundCards.map((soundCard) =>
                                        this.updateSoundCard(soundCard._id, {
                                            online: false,
                                        })
                                    )
                                )
                        }
                        // Also update stage device
                        if (update.online) {
                            const stageId = await this.readUser(result.value.userId).then(
                                (user) => user.stageId
                            )
                            if (stageId) {
                                await this._db
                                    .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                                    .findOne(
                                        { stageId, deviceId: result.value._id },
                                        { projection: { _id: 1 } }
                                    )
                                    .then((stageDevice) => {
                                        if (stageDevice) {
                                            return this.updateStageDevice(stageDevice._id, {
                                                active: true,
                                            })
                                        }
                                        return null
                                    })
                            }
                        } else {
                            // Set all stage devices offline, equal to the current stage
                            await this._db
                                .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                                .find({ deviceId: result.value._id }, { projection: { _id: 1 } })
                                .toArray()
                                .then((stageDevices: { _id: ObjectId }[]) =>
                                    stageDevices.map((stageDevice) =>
                                        this.updateStageDevice(stageDevice._id, {
                                            active: false,
                                            offer: null,
                                        })
                                    )
                                )
                        }
                    }
                }
                return
            })
    }

    deleteDevice = (id: ObjectId): Promise<void> =>
        this._db
            .collection<Device<ObjectId>>(Collections.DEVICES)
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.DeviceRemoved, id)
                    this.sendToUser(result.value.userId, ServerDeviceEvents.DeviceRemoved, id)
                    return Promise.all([
                        this._db
                            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                            .find({ deviceId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((stageDevices) =>
                                stageDevices.map((stageDevice) =>
                                    this.deleteStageDevice(stageDevice._id)
                                )
                            ),
                        this._db
                            .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
                            .find(
                                {
                                    deviceId: id,
                                },
                                { projection: { _id: 1, userId: 1 } }
                            )
                            .toArray()
                            .then((audioTracks) =>
                                audioTracks.map((audioTrack) =>
                                    this.deleteAudioTrack(audioTrack._id)
                                )
                            ),
                        this._db
                            .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
                            .find(
                                {
                                    deviceId: id,
                                },
                                { projection: { _id: 1, userId: 1 } }
                            )
                            .toArray()
                            .then((videoTracks) =>
                                videoTracks.map((videoTrack) =>
                                    this.deleteVideoTrack(videoTrack._id)
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
                            .collection<CustomAudioTrackVolume<ObjectId>>(
                                Collections.CUSTOM_AUDIO_TRACK_VOLUMES
                            )
                            .deleteMany({ deviceId: id }),
                        this._db
                            .collection<CustomAudioTrackPosition<ObjectId>>(
                                Collections.CUSTOM_AUDIO_TRACK_POSITIONS
                            )
                            .deleteMany({ deviceId: id }),
                        this._db
                            .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
                            .deleteMany({ deviceId: id }),
                    ]).then(() => this.renewOnlineStatus(result.value.userId))
                }
                throw new Error(`Could not find and delete device ${id.toHexString()}`)
            })

    /* SOUND CARD */
    upsertSoundCard(
        userId: ObjectId,
        deviceId: ObjectId,
        uuid: string,
        update: Partial<Omit<SoundCard<ObjectId>, '_id' | 'userId' | 'deviceId' | 'uuid'>>
    ): Promise<ObjectId> {
        return this._db
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
                    this.sendToUser(userId, ServerDeviceEvents.SoundCardChanged, {
                        ...update,
                        _id: result.value._id,
                    })
                    return result.value._id
                }
                if (result.ok) {
                    const doc = {
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
                    }
                    return this._db
                        .collection<SoundCard<ObjectId>>(Collections.SOUND_CARDS)
                        .insertOne(doc)
                        .then(
                            (r) =>
                                ({
                                    ...doc,
                                    _id: r.insertedId,
                                } as SoundCard<ObjectId>)
                        )
                        .then((soundCard) => {
                            this.sendToUser(userId, ServerDeviceEvents.SoundCardAdded, soundCard)
                            return soundCard._id
                        })
                }
                throw new Error('Could not create sound card')
            })
    }

    updateSoundCard(
        id: ObjectId,
        update: Partial<Omit<SoundCard<ObjectId>, '_id' | 'userId' | 'deviceId'>>
    ): Promise<ObjectId> {
        return this._db
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
                    this.sendToUser(result.value.userId, ServerDeviceEvents.SoundCardChanged, {
                        ...update,
                        _id: result.value._id,
                    })
                    return result.value._id
                }
                throw new Error(`Could not find or update sound card ${id.toHexString()}`)
            })
    }

    deleteSoundCard = (userId: ObjectId, id: ObjectId): Promise<unknown> =>
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
                                devices.map((device) =>
                                    this.updateDevice(device.userId, device._id, {
                                        soundCardId:
                                            device.soundCardId === id ? null : device.soundCardId,
                                    })
                                )
                            ),
                    ])
                }
                throw new Error(`Could not find and delete the sound card ${id.toHexString()}`)
            })

    /* STAGE */
    generateInviteCode = (stageId: ObjectId, groupId: ObjectId): Promise<string> => {
        return this._db
            .collection<{ stageId: ObjectId; groupId: ObjectId; code: string }>(
                Collections.INVITE_LINKS
            )
            .findOne({
                stageId,
                groupId,
            })
            .then(async (result) => {
                if (result) {
                    return result.code
                }
                return this.resetInviteCode(stageId, groupId)
            })
    }

    resetInviteCode = async (stageId: ObjectId, groupId: ObjectId): Promise<string> => {
        // Generate short UUID
        let isUnique = false
        let code: string
        do {
            code = nanoid(4)
            // eslint-disable-next-line no-await-in-loop
            const existingEntry = await this._db
                .collection<{
                    _id: ObjectId
                    stageId: ObjectId
                    groupId: ObjectId
                    code: string
                }>(Collections.INVITE_LINKS)
                .findOne({ code })
            isUnique = !existingEntry
        } while (!isUnique)
        return this._db
            .collection<{ stageId: ObjectId; groupId: ObjectId; code: string }>(
                Collections.INVITE_LINKS
            )
            .updateOne(
                {
                    stageId,
                    groupId,
                },
                {
                    $set: {
                        code,
                    },
                    $setOnInsert: {
                        stageId,
                        groupId,
                    },
                },
                { upsert: true }
            )
            .then(() => code)
    }

    decodeInviteCode = (
        code: string
    ): Promise<{ stageId: ObjectId; groupId: ObjectId; code: string }> =>
        this._db
            .collection<{ stageId: ObjectId; groupId: ObjectId; code: string }>(
                Collections.INVITE_LINKS
            )
            .findOne({ code })

    createStage = (
        initialStage: Partial<Exclude<Stage<ObjectId>, '_id'>>
    ): Promise<Stage<ObjectId>> => {
        const doc = {
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
        }
        return this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .insertOne(doc)
            .then(async (result) => {
                const stage = {
                    ...doc,
                    _id: result.insertedId,
                } as Stage<ObjectId>
                this.emit(
                    ServerDeviceEvents.StageAdded,
                    stage as unknown as ServerDevicePayloads.StageAdded
                )
                stage.admins.forEach((adminId) =>
                    this.sendToUser(
                        adminId,
                        ServerDeviceEvents.StageAdded,
                        stage as unknown as ServerDevicePayloads.StageAdded
                    )
                )
                await this.assignRoutersToStage(stage).catch((err) => warn(err))
                return stage
            })
    }

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

    updateStage = (id: ObjectId, update: Partial<Omit<Stage<ObjectId>, '_id'>>): Promise<void> =>
        this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .updateOne({ _id: id }, { $set: update })
            .then((response) => {
                if (response.matchedCount > 0) {
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
                throw new Error(`Could not find and update stage ${id.toHexString()}.`)
            })

    deleteStage = (id: ObjectId): Promise<unknown> =>
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
                            if (
                                stage.audioRouter &&
                                stage.videoRouter &&
                                stage.audioRouter.equals(stage.videoRouter)
                            ) {
                                return this.sendToRouter(
                                    stage.audioRouter,
                                    ServerRouterEvents.UnServeStage,
                                    {
                                        kind: 'both',
                                        type: stage.videoType,
                                        stageId: stage._id.toHexString(),
                                    } as ServerRouterPayloads.UnServeStage
                                )
                            }
                            if (stage.audioRouter) {
                                this.sendToRouter(
                                    stage.audioRouter,
                                    ServerRouterEvents.UnServeStage,
                                    {
                                        kind: 'audio',
                                        type: stage.audioType,
                                        stageId: stage._id.toHexString(),
                                    } as ServerRouterPayloads.UnServeStage
                                )
                            }
                            if (stage.videoRouter) {
                                this.sendToRouter(
                                    stage.videoRouter,
                                    ServerRouterEvents.UnServeStage,
                                    {
                                        kind: 'video',
                                        type: stage.videoType,
                                        stageId: stage._id.toHexString(),
                                    } as ServerRouterPayloads.UnServeStage
                                )
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
                throw new Error(`Could not find and delete stage ${id.toHexString()}.`)
            })

    /* GROUP */
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
                _id: undefined,
            })
            .then((result) => ({ ...initial, color, _id: result.insertedId } as Group<ObjectId>))
            .then((group) => {
                this.emit(ServerDeviceEvents.GroupAdded, group)
                return this.sendToStage(group.stageId, ServerDeviceEvents.GroupAdded, group).then(
                    () => group
                )
            })
    }

    readGroup = (id: ObjectId): Promise<Group<ObjectId>> =>
        this._db.collection<Group<ObjectId>>(Collections.GROUPS).findOne({ _id: id })

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

    deleteGroup = (id: ObjectId): Promise<unknown> =>
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
                                stageMembers.map(async (stageMember) =>
                                    this.deleteStageMember(stageMember._id)
                                )
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
                throw new Error(`Could not find or delete group ${id.toHexString()}`)
            })

    /* STAGE MEMBER */
    private createStageMember = async (
        initial: Omit<StageMember<ObjectId>, '_id'>
    ): Promise<StageMember<ObjectId>> => {
        return this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .insertOne(initial)
            .then(
                (result) =>
                    ({
                        _id: result.insertedId,
                        ...initial,
                    } as StageMember<ObjectId>)
            )
            .then((stageMember) => {
                this.emit(ServerDeviceEvents.StageMemberAdded, stageMember)
                // Create stage devices for all devices of this user
                return Promise.all([
                    this.readDevicesByUser(initial.userId).then((devices) =>
                        devices.map((device) =>
                            this.createStageDevice({
                                userId: device.userId,
                                deviceId: device._id,
                                stageId: initial.stageId,
                                groupId: initial.groupId,
                                stageMemberId: stageMember._id,
                                active: device.online,
                                name: device.type,
                                type: device.type,
                                sendLocal: true,
                                ...DefaultThreeDimensionalProperties,
                                ...DefaultVolumeProperties,
                            })
                        )
                    ),
                    this.sendToJoinedStageMembers(
                        stageMember.stageId,
                        ServerDeviceEvents.StageMemberAdded,
                        stageMember
                    ),
                ]).then(() => stageMember)
            })
    }

    readStageMember = (id: ObjectId): Promise<StageMember<ObjectId>> =>
        this._db.collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS).findOne({ _id: id })

    updateStageMember = (
        id: ObjectId,
        update: Partial<Omit<StageMember<ObjectId>, '_id' | 'stageId' | 'userId'>>
    ): Promise<void> =>
        this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .findOneAndUpdate({ _id: id }, { $set: update }, { projection: { stageId: 1 } })
            .then(async (result) => {
                if (result.value) {
                    const payload = {
                        ...update,
                        _id: id,
                    }
                    if (update.active !== undefined) {
                        // Also update all related stage devices
                        await this._db
                            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                            .find({ stageMemberId: id }, { projection: { _id: 1, deviceId: 1 } })
                            .toArray()
                            .then((stageDevices) =>
                                stageDevices.map((stageDevice) => {
                                    this._db
                                        .collection<Device<ObjectId>>(Collections.DEVICES)
                                        .findOne({ _id: stageDevice.deviceId, online: true })
                                        .then((device) => {
                                            if (device) {
                                                return this.updateStageDevice(stageDevice._id, {
                                                    active: update.active,
                                                })
                                            }
                                            return
                                        })
                                        .catch((e) => error(e))
                                })
                            )
                    }
                    this.emit(ServerDeviceEvents.StageMemberChanged, payload)
                    return this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.StageMemberChanged,
                        payload
                    )
                }
                throw new Error(`Could not find or update stage member ${id.toHexString()}`)
            })

    deleteStageMember = (id: ObjectId): Promise<unknown> =>
        this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .findOneAndDelete({ _id: id })
            .then((result) => {
                if (result.value) {
                    // Delete all custom stage members and stage member tracks
                    this.emit(ServerDeviceEvents.StageMemberRemoved, id)
                    // Throw out user, if currently inside the stage
                    return this.readUser(result.value.userId)
                        .then((user) => {
                            if (user.stageId === id) {
                                return this.leaveStage(result.value.userId)
                            }
                            return null
                        })
                        .then(() =>
                            Promise.all([
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
                                    .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
                                    .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                                    .toArray()
                                    .then((stageDevices) =>
                                        stageDevices.map((stageDevice) =>
                                            this.deleteStageDevice(stageDevice._id)
                                        )
                                    ),
                                this.sendToJoinedStageMembers(
                                    result.value.stageId,
                                    ServerDeviceEvents.StageMemberRemoved,
                                    id
                                ),
                            ])
                        )
                }
                throw new Error(`Could not find or delete stage member ${id.toHexString()}`)
            })

    /* STAGE DEVICE */
    private createStageDevice = async (
        initial: Omit<StageDevice<ObjectId>, '_id' | 'order'> & { stageId: ObjectId }
    ): Promise<StageDevice<ObjectId>> => {
        // obtain an order ID (necessary for ov based technologies)
        const order = await this._db
            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
            .find({ stageId: initial.stageId })
            .toArray()
            .then((stageDevices: StageDevice<ObjectId>[]) => {
                if (stageDevices.length > 0) {
                    for (let i = 0; i < 30; i += 1) {
                        if (!stageDevices.find((current) => current.order === i)) {
                            return i
                        }
                    }
                    return -1
                }
                return 0
            })
        if (order === -1) throw new Error(ErrorCodes.MaxMembersReached)
        const doc = {
            ...initial,
            order,
            _id: undefined,
        } as StageDevice<ObjectId> & { _id?: ObjectId }
        return this._db
            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
            .insertOne(doc)
            .then(
                (result) => ({ ...initial, order, _id: result.insertedId } as StageDevice<ObjectId>)
            )
            .then(async (stageDevice): Promise<StageDevice<ObjectId>> => {
                this.emit(ServerDeviceEvents.StageDeviceAdded, stageDevice)
                await this.sendToJoinedStageMembers(
                    stageDevice.stageId,
                    ServerDeviceEvents.StageDeviceAdded,
                    stageDevice
                )
                return stageDevice
            })
    }

    readStageDevice = (id: ObjectId): Promise<StageDevice<ObjectId>> =>
        this._db.collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES).findOne({ _id: id })

    readStageDeviceByStage = (
        deviceId: ObjectId,
        stageId: ObjectId
    ): Promise<StageDevice<ObjectId>> =>
        this._db
            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
            .findOne({ deviceId, stageId })

    updateStageDevice = (
        id: ObjectId,
        update: Partial<
            Omit<StageDevice<ObjectId>, '_id' | 'stageId' | 'userId' | 'stageMemberId' | 'order'>
        >
    ): Promise<void> =>
        this._db
            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
            .findOneAndUpdate(
                { _id: id },
                { $set: update },
                { projection: { stageId: 1, deviceId: 1 } }
            )
            .then(async (result) => {
                if (result.value) {
                    const payload = {
                        ...update,
                        _id: id,
                    }
                    this.emit(ServerDeviceEvents.StageDeviceChanged, payload)
                    if (update.active !== undefined) {
                        if (!update.active) {
                            // Remove all related audio and video tracks
                            await Promise.all([
                                this._db
                                    .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
                                    .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                                    .toArray()
                                    .then((videoTracks) =>
                                        videoTracks.map((videoTrack) =>
                                            this.deleteVideoTrack(videoTrack._id)
                                        )
                                    ),
                                this._db
                                    .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
                                    .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                                    .toArray()
                                    .then((audioTracks) =>
                                        audioTracks.map((audioTrack) =>
                                            this.deleteAudioTrack(audioTrack._id)
                                        )
                                    ),
                            ])
                        }
                    }
                    return this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.StageDeviceChanged,
                        payload
                    )
                }
                throw new Error(`Could not find or update stage device ${id.toHexString()}`)
            })

    deleteStageDevice = (id: ObjectId): Promise<unknown> =>
        this._db
            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
            .findOneAndDelete({ _id: id })
            .then((result) => {
                if (result.value) {
                    // Delete all custom stage device and remote audio/video tracks
                    this.emit(ServerDeviceEvents.StageDeviceRemoved, id)
                    return Promise.all([
                        this._db
                            .collection<CustomStageDeviceVolume<ObjectId>>(
                                Collections.CUSTOM_STAGE_DEVICE_VOLUMES
                            )
                            .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((items) =>
                                Promise.all(
                                    items.map((item) =>
                                        this.deleteCustomStageDeviceVolume(item._id)
                                    )
                                )
                            ),
                        this._db
                            .collection<CustomStageDevicePosition<ObjectId>>(
                                Collections.CUSTOM_STAGE_DEVICE_POSITIONS
                            )
                            .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((items) =>
                                Promise.all(
                                    items.map((item) =>
                                        this.deleteCustomStageDevicePosition(item._id)
                                    )
                                )
                            ),
                        this._db
                            .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
                            .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((videoTracks) =>
                                videoTracks.map((videoTrack) =>
                                    this.deleteVideoTrack(videoTrack._id)
                                )
                            ),
                        this._db
                            .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
                            .find({ stageDeviceId: id }, { projection: { _id: 1 } })
                            .toArray()
                            .then((audioTracks) =>
                                audioTracks.map((audioTrack) =>
                                    this.deleteAudioTrack(audioTrack._id)
                                )
                            ),
                        this.sendToJoinedStageMembers(
                            result.value.stageId,
                            ServerDeviceEvents.StageDeviceRemoved,
                            id
                        ),
                    ])
                }
                throw new Error(`Could not find or delete stage device ${id.toHexString()}`)
            })

    /* AUDIO TRACK */
    createAudioTrack(
        initial: Partial<Omit<AudioTrack<ObjectId>, '_id'>> & {
            userId: ObjectId
            deviceId: ObjectId
            stageId: ObjectId
            stageMemberId: ObjectId
            stageDeviceId: ObjectId
        }
    ): Promise<AudioTrack<ObjectId>> {
        const doc: AudioTrack<ObjectId> = {
            ...DefaultVolumeProperties,
            ...DefaultThreeDimensionalProperties,
            type: '',
            ...initial,
            userId: initial.userId,
            deviceId: initial.deviceId,
            stageId: initial.stageId,
            stageMemberId: initial.stageMemberId,
            stageDeviceId: initial.stageDeviceId,
            _id: undefined,
        }
        return this._db
            .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
            .insertOne(doc)
            .then((result) => ({ ...doc, _id: result.insertedId } as AudioTrack<ObjectId>))
            .then((remoteAudioTrack) => {
                this.emit(ServerDeviceEvents.AudioTrackAdded, remoteAudioTrack)
                return this.sendToJoinedStageMembers(
                    initial.stageId,
                    ServerDeviceEvents.AudioTrackAdded,
                    remoteAudioTrack // as DevicePayloads.AudioTrackAdded
                ).then(() => remoteAudioTrack)
            })
    }

    readAudioTrack(id: ObjectId): Promise<AudioTrack<ObjectId>> {
        return this._db.collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS).findOne({
            _id: id,
        })
    }

    readAudioTrackIdsByDevice = (deviceId: ObjectId): Promise<ObjectId[]> => {
        return this._db
            .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
            .find({ deviceId }, { projection: { _id: 1 } })
            .toArray()
            .then((tracks) => tracks.map((track) => track._id))
    }

    updateAudioTrack(
        id: ObjectId,
        update: Partial<Omit<AudioTrack<ObjectId>, '_id'>>
    ): Promise<void> {
        const { _id, localAudioTrackId, userId, ...secureUpdate } = update
        return this._db
            .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
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
                    this.emit(ServerDeviceEvents.AudioTrackChanged, payload)
                    await this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.AudioTrackChanged,
                        payload
                    )
                }
                throw new Error(`Could not find and update remote audio track ${id.toHexString()}`)
            })
    }

    deleteAudioTrack(id: ObjectId, userId?: ObjectId): Promise<unknown> {
        return this._db
            .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
            .findOneAndDelete(
                userId
                    ? {
                          _id: id,
                          userId,
                      }
                    : { _id: id },
                { projection: { stageId: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.AudioTrackRemoved, id)
                    return Promise.all([
                        this.sendToJoinedStageMembers(
                            result.value.stageId,
                            ServerDeviceEvents.AudioTrackRemoved,
                            id
                        ),
                        this._db
                            .collection<CustomAudioTrackPosition<ObjectId>>(
                                Collections.CUSTOM_AUDIO_TRACK_POSITIONS
                            )
                            .find({ audioTrackId: id }, { projection: { _id: true } })
                            .toArray()
                            .then((customizedItems) =>
                                customizedItems.map((customizedItem) =>
                                    this.deleteCustomAudioTrackPosition(customizedItem._id)
                                )
                            ),
                        this._db
                            .collection<CustomAudioTrackVolume<ObjectId>>(
                                Collections.CUSTOM_AUDIO_TRACK_VOLUMES
                            )
                            .find({ audioTrackId: id }, { projection: { _id: true } })
                            .toArray()
                            .then((customizedItems) =>
                                customizedItems.map((customizedItem) =>
                                    this.deleteCustomAudioTrackVolume(customizedItem._id)
                                )
                            ),
                    ])
                }
                throw new Error(`Could not find and delete audio track ${id.toHexString()}`)
            })
    }

    /* VIDEO TRACK */
    createVideoTrack(
        initialTrack: Omit<VideoTrack<ObjectId>, '_id'> & {
            userId: ObjectId
            deviceId: ObjectId
            stageId: ObjectId
            stageMemberId: ObjectId
            stageDeviceId: ObjectId
        }
    ): Promise<VideoTrack<ObjectId>> {
        return this._db
            .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
            .insertOne({
                type: '',
                ...initialTrack,
                _id: undefined,
            })
            .then((result) => ({ ...initialTrack, _id: result.insertedId } as VideoTrack<ObjectId>))
            .then((producer) => {
                this.emit(ServerDeviceEvents.VideoTrackAdded, producer)
                return this.sendToJoinedStageMembers(
                    initialTrack.stageId,
                    ServerDeviceEvents.VideoTrackAdded,
                    producer
                ).then(() => producer)
            })
    }

    readVideoTrack(id: ObjectId): Promise<VideoTrack<ObjectId>> {
        return this._db.collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS).findOne({
            _id: id,
        })
    }

    readVideoTrackIdsByDevice = (deviceId: ObjectId): Promise<ObjectId[]> => {
        return this._db
            .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
            .find({ deviceId }, { projection: { _id: 1 } })
            .toArray()
            .then((tracks) => tracks.map((track) => track._id))
    }

    updateVideoTrack(
        id: ObjectId,
        update: Partial<Omit<VideoTrack<ObjectId>, '_id'>>
    ): Promise<void> {
        const { localVideoTrackId, userId, ...secureUpdate } = update
        return this._db
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
                    this.emit(ServerDeviceEvents.VideoTrackChanged, payload)
                    return this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.VideoTrackChanged,
                        payload
                    )
                }
                throw new Error(`Could not find and update remote video track ${id.toHexString()}`)
            })
    }

    deleteVideoTrack(id: ObjectId, userId?: ObjectId): Promise<void> {
        return this._db
            .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
            .findOneAndDelete(
                userId
                    ? {
                          _id: id,
                          userId,
                      }
                    : { _id: id },
                { projection: { stageId: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.VideoTrackRemoved, id)
                    return this.sendToJoinedStageMembers(
                        result.value.stageId,
                        ServerDeviceEvents.VideoTrackRemoved,
                        id
                    )
                }
                throw new Error(`Could not find and delete video track ${id.toHexString()}`)
            })
    }

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
                { upsert: false, projection: { _id: 1 } }
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
                                directivity: group.directivity,
                                ...update,
                                stageId: group.stageId,
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
                                    if (result2.acknowledged) {
                                        const payload = {
                                            ...initial,
                                            _id: result2.insertedId,
                                        }
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
                                        `Could not create custom position of group ${groupId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize position of group ${groupId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
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
                throw new Error(
                    `Could not find and delete custom group position ${id.toHexString()}`
                )
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
                { upsert: false, projection: { _id: 1 } }
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
                                stageId: group.stageId,
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
                                    if (result2.acknowledged) {
                                        const payload = {
                                            ...initial,
                                            _id: result2.insertedId,
                                        }
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
                                        `Could not create custom volume of group ${groupId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize volume of group ${groupId.toHexString()} for user ${userId.toHexString()}`
                )
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
                throw new Error(`Could not find and delete custom group volume ${id.toHexString()}`)
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
                { projection: { _id: 1 } }
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
                // Custom entry not available yet, we have to create it
                return this.readStageMember(stageMemberId)
                    .then(
                        (stageMember): Omit<CustomStageMemberPosition<ObjectId>, '_id'> => ({
                            x: stageMember.x,
                            y: stageMember.y,
                            z: stageMember.z,
                            rX: stageMember.rX,
                            rY: stageMember.rY,
                            rZ: stageMember.rZ,
                            directivity: stageMember.directivity,
                            ...update,
                            stageId: stageMember.stageId,
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
                                if (response.acknowledged) {
                                    const payload2 = {
                                        ...payload,
                                        _id: response.insertedId,
                                    }
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
                                    `Could not create custom position of stage member ${stageMemberId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                                )
                            })
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
                throw new Error(
                    `Could not find and delete custom stage member position ${id.toHexString()}`
                )
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
                { userId, stageMemberId, deviceId },
                {
                    $set: update,
                },
                { upsert: false, projection: { _id: 1 } }
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
                                stageId: stageMember.stageId,
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
                                    if (response.acknowledged) {
                                        const payload = {
                                            ...initial,
                                            _id: response.insertedId,
                                        }
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
                                        `Could not create custom volume of stage member ${stageMemberId.toHexString()} for user ${userId.toHexString()} and ${deviceId.toHexString()}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize volume of stage member ${stageMemberId.toHexString()} for user ${userId.toHexString()} and ${deviceId.toHexString()}`
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
                throw new Error(
                    `Could not find and delete custom stage member volume ${id.toHexString()}`
                )
            })

    /* CUSTOM STAGE DEVICE */
    upsertCustomStageDevicePosition = (
        userId: ObjectId,
        stageDeviceId: ObjectId,
        deviceId: ObjectId,
        update: Partial<ThreeDimensionalProperties>
    ): Promise<void> =>
        this._db
            .collection<CustomStageDevicePosition<ObjectId>>(
                Collections.CUSTOM_STAGE_DEVICE_POSITIONS
            )
            .findOneAndUpdate(
                { userId, stageDeviceId, deviceId },
                {
                    $set: update,
                },
                { upsert: false, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id,
                    }
                    this.emit(ServerDeviceEvents.CustomStageDevicePositionChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomStageDevicePositionChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readStageDevice(stageDeviceId)
                        .then(
                            (stageDevice): Omit<CustomStageDevicePosition<ObjectId>, '_id'> => ({
                                x: stageDevice.x,
                                y: stageDevice.y,
                                z: stageDevice.z,
                                rX: stageDevice.rX,
                                rY: stageDevice.rY,
                                rZ: stageDevice.rZ,
                                directivity: stageDevice.directivity,
                                ...update,
                                userId,
                                stageId: stageDevice.stageId,
                                stageDeviceId,
                                deviceId,
                            })
                        )
                        .then((payload) =>
                            this._db
                                .collection<CustomStageDevicePosition<ObjectId>>(
                                    Collections.CUSTOM_STAGE_DEVICE_POSITIONS
                                )
                                .insertOne(payload)
                                .then((response) => {
                                    if (response.acknowledged) {
                                        const payload2 = {
                                            ...payload,
                                            _id: response.insertedId,
                                        }
                                        this.emit(
                                            ServerDeviceEvents.CustomStageDevicePositionAdded,
                                            payload2
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomStageDevicePositionAdded,
                                            payload2
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom position of stage device ${stageDeviceId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize position of stage device ${stageDeviceId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                )
            })

    readCustomStageDevicePosition = (id: ObjectId): Promise<CustomStageDevicePosition<ObjectId>> =>
        this._db
            .collection<CustomStageDevicePosition<ObjectId>>(
                Collections.CUSTOM_STAGE_DEVICE_POSITIONS
            )
            .findOne({ _id: id })

    deleteCustomStageDevicePosition = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomStageDevicePosition<ObjectId>>(
                Collections.CUSTOM_STAGE_DEVICE_POSITIONS
            )
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomStageDevicePositionRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomStageDevicePositionRemoved,
                        id
                    )
                }
                throw new Error(
                    `Could not find and delete custom stage member position ${id.toHexString()}`
                )
            })

    upsertCustomStageDeviceVolume = (
        userId: ObjectId,
        stageDeviceId: ObjectId,
        deviceId: ObjectId,
        update: { volume?: number; muted?: boolean }
    ): Promise<void> =>
        this._db
            .collection<CustomStageDeviceVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
            .findOneAndUpdate(
                { userId, stageDeviceId, deviceId },
                {
                    $set: update,
                },
                { upsert: false, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id,
                    }
                    this.emit(ServerDeviceEvents.CustomStageDeviceVolumeChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomStageDeviceVolumeChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readStageDevice(stageDeviceId)
                        .then(
                            (stageDevice): Omit<CustomStageDeviceVolume<ObjectId>, '_id'> => ({
                                volume: stageDevice.volume,
                                muted: stageDevice.muted,
                                ...update,
                                userId,
                                stageId: stageDevice.stageId,
                                stageDeviceId,
                                deviceId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomStageDeviceVolume<ObjectId>>(
                                    Collections.CUSTOM_STAGE_DEVICE_VOLUMES
                                )
                                .insertOne(initial)
                                .then((response) => {
                                    if (response.acknowledged) {
                                        const payload = {
                                            ...initial,
                                            _id: response.insertedId,
                                        }
                                        this.emit(
                                            ServerDeviceEvents.CustomStageDeviceVolumeAdded,
                                            response
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomStageDeviceVolumeAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom volume of stage device ${stageDeviceId.toHexString()} for user ${userId.toHexString()} and ${deviceId.toHexString()}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize volume of stage device ${stageDeviceId.toHexString()} for user ${userId.toHexString()} and ${deviceId.toHexString()}`
                )
            })

    readCustomStageDeviceVolume = (id: ObjectId): Promise<CustomStageDeviceVolume<ObjectId>> =>
        this._db
            .collection<CustomStageDeviceVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
            .findOne({ _id: id })

    deleteCustomStageDeviceVolume = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomStageDeviceVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomStageDeviceVolumeRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomStageDeviceVolumeRemoved,
                        id
                    )
                }
                throw new Error(
                    `Could not find and delete custom stage device volume ${id.toHexString()}`
                )
            })

    upsertCustomAudioTrackPosition = (
        userId: ObjectId,
        audioTrackId: ObjectId,
        deviceId: ObjectId,
        update: Partial<ThreeDimensionalProperties>
    ): Promise<void> =>
        this._db
            .collection<CustomAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_AUDIO_TRACK_POSITIONS
            )
            .findOneAndUpdate(
                { userId, audioTrackId, deviceId },
                {
                    $set: update,
                },
                { upsert: false, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id.toHexString(),
                    } as ServerDevicePayloads.CustomAudioTrackPositionChanged
                    this.emit(ServerDeviceEvents.CustomAudioTrackPositionChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomAudioTrackPositionChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readAudioTrack(audioTrackId)
                        .then(
                            (
                                remoteAudioTrack
                            ): Omit<CustomAudioTrackPosition<ObjectId>, '_id'> => ({
                                x: remoteAudioTrack.x,
                                y: remoteAudioTrack.y,
                                z: remoteAudioTrack.z,
                                rX: remoteAudioTrack.rX,
                                rY: remoteAudioTrack.rY,
                                rZ: remoteAudioTrack.rZ,
                                directivity: remoteAudioTrack.directivity,
                                ...update,
                                userId,
                                stageId: remoteAudioTrack.stageId,
                                audioTrackId,
                                deviceId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomAudioTrackPosition<ObjectId>>(
                                    Collections.CUSTOM_AUDIO_TRACK_POSITIONS
                                )
                                .insertOne(initial)
                                .then((response) => {
                                    if (response.acknowledged) {
                                        const payload = {
                                            ...initial,
                                            _id: response.insertedId,
                                        }
                                        this.emit(
                                            ServerDeviceEvents.CustomAudioTrackPositionAdded,
                                            payload
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomAudioTrackPositionAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom position of remote audio track ${audioTrackId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize position of remote audio track ${audioTrackId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                )
            })

    readCustomAudioTrackPosition = (id: ObjectId): Promise<CustomAudioTrackPosition<ObjectId>> =>
        this._db
            .collection<CustomAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_AUDIO_TRACK_POSITIONS
            )
            .findOne({ _id: id })

    deleteCustomAudioTrackPosition = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_AUDIO_TRACK_POSITIONS
            )
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomAudioTrackPositionRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomAudioTrackPositionRemoved,
                        id
                    )
                }
                throw new Error(
                    `Could not find and delete remote audio track position ${id.toHexString()}`
                )
            })

    upsertCustomAudioTrackVolume = (
        userId: ObjectId,
        audioTrackId: ObjectId,
        deviceId: ObjectId,
        update: { volume?: number; muted?: boolean }
    ): Promise<void> =>
        this._db
            .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
            .findOneAndUpdate(
                { userId, audioTrackId, deviceId },
                {
                    $set: update,
                },
                { upsert: false, projection: { _id: 1 } }
            )
            .then((result) => {
                if (result.value) {
                    // Return updated document
                    const payload = {
                        ...update,
                        _id: result.value._id.toHexString(),
                    } as ServerDevicePayloads.CustomAudioTrackVolumeChanged
                    this.emit(ServerDeviceEvents.CustomAudioTrackVolumeChanged, payload)
                    return this.sendToUser(
                        userId,
                        ServerDeviceEvents.CustomAudioTrackVolumeChanged,
                        payload
                    )
                }
                if (result.ok) {
                    return this.readAudioTrack(audioTrackId)
                        .then(
                            (remoteAudioTrack): Omit<CustomAudioTrackVolume<ObjectId>, '_id'> => ({
                                volume: remoteAudioTrack.volume,
                                muted: remoteAudioTrack.muted,
                                ...update,
                                userId,
                                stageId: remoteAudioTrack.stageId,
                                audioTrackId,
                                deviceId,
                            })
                        )
                        .then((initial) =>
                            this._db
                                .collection<CustomAudioTrackVolume<ObjectId>>(
                                    Collections.CUSTOM_AUDIO_TRACK_VOLUMES
                                )
                                .insertOne(initial)
                                .then((response) => {
                                    if (response.acknowledged) {
                                        const payload = {
                                            ...initial,
                                            _id: response.insertedId,
                                        }
                                        this.emit(
                                            ServerDeviceEvents.CustomAudioTrackVolumeAdded,
                                            payload
                                        )
                                        return this.sendToUser(
                                            userId,
                                            ServerDeviceEvents.CustomAudioTrackVolumeAdded,
                                            payload
                                        )
                                    }
                                    throw new Error(
                                        `Could not create custom volume of remote audio track ${audioTrackId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                                    )
                                })
                        )
                }
                throw new Error(
                    `Could not customize volume of remote audio track ${audioTrackId.toHexString()} for user ${userId.toHexString()} and device ${deviceId.toHexString()}`
                )
            })

    readCustomAudioTrackVolume = (id: ObjectId): Promise<CustomAudioTrackVolume<ObjectId>> =>
        this._db
            .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
            .findOne({ _id: id })

    deleteCustomAudioTrackVolume = (id: ObjectId): Promise<void> =>
        this._db
            .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
            .findOneAndDelete({ _id: id }, { projection: { userId: 1 } })
            .then((result) => {
                if (result.value) {
                    this.emit(ServerDeviceEvents.CustomAudioTrackVolumeRemoved, id)
                    return this.sendToUser(
                        result.value.userId,
                        ServerDeviceEvents.CustomAudioTrackVolumeRemoved,
                        id
                    )
                }
                throw new Error(
                    `Could not find and delete custom remote audio track volume ${id.toHexString()}`
                )
            })

    /* STAGE HANDLING */
    /**
     * Checks for stage credentials.
     * Creates a stage member if user is new to stage.
     * Updates the existing stage member to be online.
     * Updates also all stage devices to be online.
     * Creates a muted custom stage member track for him/herself if new to stage.
     *
     * @param userId
     * @param stageId
     * @param groupId
     * @param password
     */
    joinStage = async (
        userId: ObjectId,
        stageId: ObjectId,
        groupId?: ObjectId,
        password?: string
    ): Promise<void> => {
        const startTime = Date.now()

        const user = await this.readUser(userId)
        const stage = await this.readStage(stageId)

        if (stage.password && stage.password !== password) {
            throw new Error(ErrorCodes.InvalidPassword)
        }

        const isAdmin: boolean = stage.admins.find((admin) => admin.equals(userId)) !== undefined
        const previousStageMemberId = user.stageMemberId

        let stageMember = await this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .findOne({
                userId: user._id,
                stageId: stage._id,
            })

        const wasUserAlreadyInStage = !!stageMember
        if (!stageMember) {
            if (!groupId) {
                throw new Error(ErrorCodes.GroupIdMissing)
            }
            stageMember = await this.createStageMember({
                userId: user._id,
                stageId: stage._id,
                groupId,
                active: true,
                isDirector: false,
                ...DefaultVolumeProperties,
                ...DefaultThreeDimensionalProperties,
            })
        } else if (groupId && !stageMember.groupId.equals(groupId)) {
            stageMember.active = true
            stageMember.groupId = groupId
            await this.updateStageMember(stageMember._id, {
                groupId,
                active: true,
            })
        } else if (!stageMember.active) {
            stageMember.active = true
            await this.updateStageMember(stageMember._id, {
                active: true,
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
        if (!previousStageMemberId || !previousStageMemberId.equals(stageMember._id)) {
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
                    groupId: stageMember.groupId,
                    user: user._id,
                })
                return this.sendToUser(user._id, ServerDeviceEvents.StageJoined, {
                    ...wholeStage,
                    stageId: stage._id,
                    groupId: stageMember.groupId,
                    stageMemberId: stageMember,
                })
            }
        )

        if (previousStageMemberId && !previousStageMemberId.equals(stageMember._id)) {
            await this.updateStageMember(previousStageMemberId, { active: false })
        }
        debug(`joinStage: ${Date.now() - startTime}ms`)
    }

    /**
     * Sets the stage member inactive and de-assigns the user from the stage
     * @param userId
     */
    leaveStage = async (userId: ObjectId): Promise<void> => {
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
            await this.updateStageMember(previousObjectId, { active: false })
        }
        debug(`leaveStage: ${Date.now() - startTime}ms`)
    }

    /**
     * Removes all user related data from the stage and de-assign the user from stage
     * @param userId
     * @param stageId
     */
    leaveStageForGood = (userId: ObjectId, stageId: ObjectId): Promise<void> =>
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
                    throw new Error(ErrorCodes.NotMemberOfStage)
                })
        })

    renewOnlineStatus = (userId: ObjectId): Promise<void> => {
        // Has the user online devices?
        return this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .findOne({ _id: userId }, { projection: { stageMemberId: 1 } })
            .then((user) => {
                if (user.stageMemberId) {
                    // User is inside stage
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
                                    active: true,
                                })
                            }
                            // User has no more online devices
                            return this.updateStageMember(user.stageMemberId, {
                                active: false,
                            })
                        })
                }
                return null
            })
    }

    private getWholeStage = async (
        userId: ObjectId,
        stageId: ObjectId,
        skipStageAndGroups = false
    ): Promise<StagePackage<ObjectId>> => {
        const stage = await this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .findOne({ _id: stageId })
        const groups = await this._db
            .collection<Group<ObjectId>>(Collections.GROUPS)
            .find({ stageId })
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
        const stageMembers = await this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .find({ stageId })
            .toArray()
        const stageMemberObjectIds = stageMembers.map((stageMember) => stageMember.userId)
        const users = await this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .find({ _id: { $in: stageMemberObjectIds } })
            .toArray()
        const customStageMemberVolumes: CustomStageMemberVolume<ObjectId>[] = await this._db
            .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
            .find({
                userId,
                stageId,
            })
            .toArray()
        const customStageMemberPositions: CustomStageMemberPosition<ObjectId>[] = await this._db
            .collection<CustomStageMemberPosition<ObjectId>>(
                Collections.CUSTOM_STAGE_MEMBER_POSITIONS
            )
            .find({
                userId,
                stageId,
            })
            .toArray()
        const stageDevices = await this._db
            .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
            .find({ stageId })
            .toArray()
        const customStageDeviceVolumes: CustomStageDeviceVolume<ObjectId>[] = await this._db
            .collection<CustomStageDeviceVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
            .find({
                userId,
                stageId,
            })
            .toArray()
        const customStageDevicePositions: CustomStageDevicePosition<ObjectId>[] = await this._db
            .collection<CustomStageDevicePosition<ObjectId>>(
                Collections.CUSTOM_STAGE_DEVICE_POSITIONS
            )
            .find({
                userId,
                stageId,
            })
            .toArray()
        const videoTracks: VideoTrack<ObjectId>[] = await this._db
            .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
            .find({
                stageId,
            })
            .toArray()
        const audioTracks: AudioTrack<ObjectId>[] = await this._db
            .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
            .find({
                stageId,
            })
            .toArray()
        const customAudioTrackVolumes: CustomAudioTrackVolume<ObjectId>[] = await this._db
            .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
            .find({
                userId,
                stageId,
            })
            .toArray()
        const customAudioTrackPositions: CustomAudioTrackPosition<ObjectId>[] = await this._db
            .collection<CustomAudioTrackPosition<ObjectId>>(
                Collections.CUSTOM_AUDIO_TRACK_POSITIONS
            )
            .find({
                userId,
                stageId,
            })
            .toArray()

        if (skipStageAndGroups) {
            return {
                users,
                stageMembers,
                customGroupVolumes,
                customGroupPositions,
                customStageMemberVolumes,
                customStageMemberPositions,
                stageDevices,
                customStageDeviceVolumes,
                customStageDevicePositions,
                videoTracks,
                audioTracks,
                customAudioTrackVolumes,
                customAudioTrackPositions,
            }
        }
        return {
            users,
            stage,
            groups,
            stageMembers,
            customGroupVolumes,
            customGroupPositions,
            customStageMemberVolumes,
            customStageMemberPositions,
            stageDevices,
            customStageDeviceVolumes,
            customStageDevicePositions,
            videoTracks,
            audioTracks,
            customAudioTrackVolumes,
            customAudioTrackPositions,
        }
    }

    /* SENDING METHODS */
    public sendStageDataToDevice = async (
        socket: ITeckosSocket,
        user: User<ObjectId>
    ): Promise<void> => {
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
        stages.map((stage) =>
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
    ): Promise<void> => {
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

    /* ROUTER HANDLING */
    assignRoutersToStage = async (stage: Stage<ObjectId>): Promise<void> => {
        if (stage.videoRouter === null || stage.audioRouter === null) {
            if (stage.videoType === stage.audioType) {
                debug(
                    `Seeking for same router for stage ${stage.name}, since type ${stage.videoType} is same for both`
                )
                return this.readNearestRouter(stage.videoType, stage.preferredPosition).then(
                    (router) =>
                        this.sendToRouter(router._id, ServerRouterEvents.ServeStage, {
                            kind: 'both',
                            type: stage.videoType,
                            stage: stage as unknown as Stage,
                        } as ServerRouterPayloads.ServeStage)
                )
            }
            if (stage.videoRouter === null) {
                await this.readNearestRouter(stage.videoType, stage.preferredPosition).then(
                    (router) =>
                        this.sendToRouter(router._id, ServerRouterEvents.ServeStage, {
                            kind: 'video',
                            type: stage.videoType,
                            stage: stage as unknown as Stage,
                        } as ServerRouterPayloads.ServeStage)
                )
            }
            if (stage.audioRouter === null) {
                await this.readNearestRouter(stage.audioType, stage.preferredPosition).then(
                    (router) =>
                        this.sendToRouter(router._id, ServerRouterEvents.ServeStage, {
                            kind: 'audio',
                            type: stage.audioType,
                            stage: stage as unknown as Stage,
                        } as ServerRouterPayloads.ServeStage)
                )
            }
            return Promise.resolve()
        }
        throw new Error(ErrorCodes.StageIsAlreadyFullyServed)
    }

    sendToStage = async (stageId: ObjectId, event: string, payload?: unknown): Promise<void> => {
        const adminIds: ObjectId[] = await this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .findOne({ _id: stageId }, { projection: { admins: 1 } })
            .then((stage) => (stage ? stage.admins : []))
        const stageMemberIds: ObjectId[] = await this._db
            .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
            .find({ stageId }, { projection: { userId: 1 } })
            .toArray()
            .then((stageMembers) => stageMembers.map((stageMember) => stageMember.userId))
        const userIds = unionWith<ObjectId>(adminIds, stageMemberIds, (prev, curr) =>
            prev.equals(curr)
        )
        console.log('Send to stage')
        console.log(adminIds, stageMemberIds)
        console.log(userIds)
        userIds.map((userId) => this.sendToUser(userId, event, payload))
        return undefined
    }

    sendToStageManagers = (stageId: ObjectId, event: string, payload?: unknown): Promise<void> =>
        this._db
            .collection<Stage<ObjectId>>(Collections.STAGES)
            .findOne({ _id: stageId }, { projection: { admins: 1 } })
            .then((foundStage) =>
                foundStage.admins.forEach((admin) => this.sendToUser(admin, event, payload))
            )

    sendToJoinedStageMembers = (
        stageId: ObjectId,
        event: string,
        payload?: unknown
    ): Promise<void> =>
        this._db
            .collection<User<ObjectId>>(Collections.USERS)
            .find({ stageId }, { projection: { _id: 1 } })
            .toArray()
            .then((users: { _id: ObjectId }[]) =>
                users.forEach((user) => this.sendToUser(user._id, event, payload))
            )

    static sendToDevice = (socket: ITeckosSocket, event: string, payload?: unknown): void => {
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                debug(`SEND TO DEVICE '${socket.id}' ${event}: ${JSON.stringify(payload)}`)
            } else {
                debug(`SEND TO DEVICE '${socket.id}' ${event}`)
            }
        }
        socket.emit(event, payload)
    }

    sendToUser = (userId: ObjectId, event: string, payload?: unknown): void => {
        const groupId = userId.toHexString()
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                debug(`SEND TO USER '${groupId}' ${event}: ${JSON.stringify(payload)}`)
            } else {
                debug(`SEND TO USER '${groupId}' ${event}`)
            }
        }
        this._io.to(userId.toHexString(), event, payload)
    }

    sendToStageDevice = (
        stageDeviceId: ObjectId,
        event: string,
        payload?: unknown
    ): Promise<void> =>
        this.readStageDevice(stageDeviceId)
            .then((stageDevice) => this.readDevice(stageDevice.deviceId))
            .then((device) => {
                const id = device._id.toHexString()
                if (DEBUG_EVENTS) {
                    if (DEBUG_PAYLOAD) {
                        debug(`SEND TO SINGLE SOCKET '${id}' ${event}: ${JSON.stringify(payload)}`)
                    } else {
                        debug(`SEND TO SINGLE SOCKET '${id}' ${event}`)
                    }
                }
                this._io.to(id, event, payload)
                return
            })

    sendToRouter = (routerId: ObjectId, event: string, payload?: unknown): void => {
        const groupId = routerId.toHexString()
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                debug(`SEND TO ROUTER '${groupId}' ${event}: ${JSON.stringify(payload)}`)
            } else {
                debug(`SEND TO ROUTER '${groupId}' ${event}`)
            }
        }
        this._io.to(groupId, event, payload)
    }

    sendToAll = (event: string, payload?: unknown): void => {
        if (DEBUG_EVENTS) {
            if (DEBUG_PAYLOAD) {
                debug(`SEND TO ALL ${event}: ${JSON.stringify(payload)}`)
            } else {
                debug(`SEND TO ALL ${event}`)
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

export { Distributor }
