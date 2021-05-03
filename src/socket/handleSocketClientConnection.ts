import ITeckosSocket from 'teckos/lib/types/ITeckosSocket'
import { ObjectId } from 'mongodb'
import User from '../types/model/User'
import Device from '../types/model/Device'
import ClientDeviceEvents from '../types/ClientDeviceEvents'
import useLogger from '../useLogger'
import Distributor from '../distributor/Distributor'
import ServerDeviceEvents from '../types/ServerDeviceEvents'
import ClientDevicePayloads from '../types/ClientDevicePayloads'
import ChatMessage from '../types/model/ChatMessage'
import { Group, LocalVideoTrack, Stage } from '../types'

const { error, trace } = useLogger('socket:client')

const handleSocketClientConnection = async (
    distributor: Distributor,
    socket: ITeckosSocket,
    user: User<ObjectId>,
    initialDevice?: Partial<Device<ObjectId>>
): Promise<Device<ObjectId> | undefined> => {
    let device: Device<ObjectId>
    if (initialDevice) {
        // Handle this connection as device
        if (initialDevice.uuid) {
            device = await distributor.readDeviceByUserAndUUID(user._id, initialDevice.uuid)
            if (device) {
                // Update status
                trace(`Found existing device with uuid ${initialDevice.uuid}`)
                await distributor.updateDevice(user._id, device._id, {
                    ...initialDevice,
                    online: true,
                    lastLoginAt: new Date(),
                })
                device.online = true
            }
        }
        if (!device) {
            device = await distributor.createDevice({
                ...initialDevice,
                userId: user._id,
                online: true,
            })
        }

        socket.on('disconnect', () => {
            // TODO: Remove all local tracks associated with this device!
            return Promise.all([
                distributor
                    .readLocalVideoTrackIdsByDevice(device._id)
                    .then((trackIds) =>
                        Promise.all(
                            trackIds.map((trackId) =>
                                distributor.deleteLocalVideoTrack(user._id, trackId)
                            )
                        )
                    ),
                distributor
                    .readLocalAudioTrackIdsByDevice(device._id)
                    .then((tracks) =>
                        Promise.all(
                            tracks.map((track) =>
                                distributor.deleteLocalAudioTrack(user._id, track)
                            )
                        )
                    ),
            ])
                .then(() => {
                    if (device.uuid) {
                        trace(`Set device ${device._id} offline`)
                        return distributor.updateDevice(user._id, device._id, { online: false })
                    }
                    trace(`Removing device ${device._id}`)
                    return distributor.deleteDevice(device._id)
                })
                .catch((err) => error(err))
        })

        await distributor
            .readDevicesByUser(user._id)
            .then((devices) =>
                Promise.all(
                    devices.map((currentDevice) =>
                        Distributor.sendToDevice(
                            socket,
                            ServerDeviceEvents.DeviceAdded,
                            currentDevice
                        )
                    )
                )
            )
        Distributor.sendToDevice(socket, ServerDeviceEvents.LocalDeviceReady, device)

        // Send sound cards
        await distributor.sendDeviceConfigurationToDevice(socket, user)

        /* LOCAL AUDIO TRACK */
        socket.on(
            ClientDeviceEvents.CreateLocalAudioTrack,
            (
                payload: ClientDevicePayloads.CreateLocalAudioTrack,
                fn?: (error: string | null, track?: LocalVideoTrack<ObjectId>) => void
            ) => {
                trace(
                    `${user.name}: ${ClientDeviceEvents.CreateLocalAudioTrack}(${JSON.stringify(
                        payload
                    )})`
                )
                return distributor
                    .createLocalAudioTrack({
                        type: '',
                        ...payload,
                        userId: user._id,
                        deviceId: device._id,
                    })
                    .then((track) => {
                        if (fn) {
                            return fn(null, track)
                        }
                        return undefined
                    })
                    .catch((e) => {
                        error(e)
                        if (fn) fn(e.message)
                    })
            }
        )
        socket.on(
            ClientDeviceEvents.ChangeLocalAudioTrack,
            (
                payload: ClientDevicePayloads.ChangeLocalAudioTrack,
                fn?: (error: string | null) => void
            ) => {
                trace(
                    `${user.name}: ${ClientDeviceEvents.ChangeLocalAudioTrack}(${JSON.stringify(
                        payload
                    )})`
                )
                const { _id, userId, deviceId, ...data } = payload
                const id = new ObjectId(_id)
                return distributor
                    .updateLocalAudioTrack(user._id, id, data)
                    .then(() => {
                        if (fn) {
                            return fn(null)
                        }
                        return undefined
                    })
                    .catch((e) => {
                        if (fn) {
                            fn(e.message)
                        }
                        error(e)
                    })
            }
        )
        socket.on(
            ClientDeviceEvents.RemoveLocalAudioTrack,
            (
                payload: ClientDevicePayloads.RemoveLocalAudioTrack,
                fn?: (error: string | null) => void
            ) => {
                trace(
                    `${user.name}: ${ClientDeviceEvents.RemoveLocalAudioTrack}(${JSON.stringify(
                        payload
                    )})`
                )
                const id = new ObjectId(payload)
                return distributor
                    .deleteLocalAudioTrack(user._id, id)
                    .then(() => {
                        if (fn) {
                            return fn(null)
                        }
                        return undefined
                    })
                    .catch((e) => {
                        if (fn) {
                            fn(e.message)
                        }
                        error(e)
                    })
            }
        )
        socket.on(
            ClientDeviceEvents.CreateLocalVideoTrack,
            (
                payload: ClientDevicePayloads.CreateLocalVideoTrack,
                fn?: (error: string | null, track?: LocalVideoTrack<ObjectId>) => void
            ) => {
                trace(
                    `${user.name}: ${ClientDeviceEvents.CreateLocalVideoTrack}(${JSON.stringify(
                        payload
                    )})`
                )
                return distributor
                    .createLocalVideoTrack({
                        type: '',
                        ...payload,
                        userId: user._id,
                        deviceId: device._id,
                    })
                    .then((track) => {
                        if (fn) {
                            return fn(null, track)
                        }
                        return undefined
                    })
                    .catch((e) => {
                        error(e)
                        if (fn) fn(e.message)
                    })
            }
        )
        socket.on(
            ClientDeviceEvents.ChangeLocalVideoTrack,
            (
                payload: ClientDevicePayloads.ChangeLocalVideoTrack,
                fn?: (error: string | null) => void
            ) => {
                trace(
                    `${user.name}: ${ClientDeviceEvents.ChangeLocalVideoTrack}(${JSON.stringify(
                        payload
                    )})`
                )
                const { _id, deviceId, userId, ...data } = payload
                const id = new ObjectId(_id)
                return distributor
                    .updateLocalVideoTrack(user._id, id, data)
                    .then(() => {
                        if (fn) {
                            return fn(null)
                        }
                        return undefined
                    })
                    .catch((e) => {
                        if (fn) {
                            fn(e.message)
                        }
                        error(e)
                    })
            }
        )
        socket.on(
            ClientDeviceEvents.RemoveLocalVideoTrack,
            (
                payload: ClientDevicePayloads.RemoveLocalVideoTrack,
                fn?: (error: string | null) => void
            ) => {
                trace(
                    `${user.name}: ${ClientDeviceEvents.RemoveLocalVideoTrack}(${JSON.stringify(
                        payload
                    )})`
                )
                const id = new ObjectId(payload)
                return distributor
                    .deleteLocalVideoTrack(user._id, id)
                    .then(() => {
                        if (fn) {
                            return fn(null)
                        }
                        return undefined
                    })
                    .catch((e) => {
                        if (fn) {
                            fn(e.message)
                        }
                        error(e)
                    })
            }
        )
    }

    // USER
    socket.on(
        ClientDeviceEvents.ChangeUser,
        (payload: ClientDevicePayloads.ChangeUser, fn: (error: string | null) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.ChangeUser}(${JSON.stringify(payload)})`)
            return distributor
                .updateUser(new ObjectId(user._id), payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(ClientDeviceEvents.RemoveUser, (fn: (error: string | null) => void) => {
        trace(`${user.name}: ${ClientDeviceEvents.RemoveUser}`)
        return distributor
            .deleteUser(user._id)
            .then(() => {
                if (fn) {
                    return fn(null)
                }
                return undefined
            })
            .catch((e) => {
                if (fn) fn(e.message)
                error(e)
            })
    })
    // DEVICE
    socket.on(
        ClientDeviceEvents.ChangeDevice,
        (payload: ClientDevicePayloads.ChangeDevice, fn?: (error: string | null) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.ChangeDevice}(${JSON.stringify(payload)})`)
            const { _id, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .updateDevice(new ObjectId(user._id), id, {
                    ...data,
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    // Sound card
    socket.on(
        ClientDeviceEvents.SetSoundCard,
        (
            payload: ClientDevicePayloads.SetSoundCard,
            fn?: (error: string | null, id?: ObjectId) => void
        ) => {
            trace(`${user.name}: ${ClientDeviceEvents.SetSoundCard}(${JSON.stringify(payload)})`)
            const { uuid, ...update } = payload
            if (!uuid || uuid.length === 0) {
                if (fn) {
                    fn('UUID missing')
                    error('UUID missing')
                }
                return null
            }
            return distributor
                .upsertSoundCard(new ObjectId(user._id), uuid, update)
                .then((id: ObjectId) => {
                    if (fn) {
                        return fn(null, id)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.ChangeSoundCard,
        (
            payload: ClientDevicePayloads.ChangeSoundCard,
            fn?: (error: string | null, id?: ObjectId) => void
        ) => {
            trace(`${user.name}: ${ClientDeviceEvents.ChangeSoundCard}(${JSON.stringify(payload)})`)
            const { _id, userId, ...update } = payload
            return distributor
                .updateSoundCard(new ObjectId(_id), update)
                .then((id: ObjectId) => {
                    if (fn) {
                        return fn(null, id)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SendChatMessage,
        (payload: ClientDevicePayloads.SendChatMessage) => {
            trace(`${user.name}: ${ClientDeviceEvents.SendChatMessage}(${JSON.stringify(payload)})`)
            return distributor
                .readUser(user._id)
                .then((currentUser) => {
                    if (currentUser && currentUser.stageId && currentUser.stageMemberId) {
                        const chatMessage: ChatMessage<any> = {
                            userId: currentUser._id,
                            stageMemberId: currentUser.stageMemberId,
                            message: payload,
                            time: Date.now(),
                        }
                        return distributor.sendToStage(
                            currentUser.stageId,
                            ServerDeviceEvents.ChatMessageSend,
                            chatMessage
                        )
                    }
                    throw new Error(
                        `User ${user.name} is outside any stages and cannot send chat messages`
                    )
                })
                .catch((e) => error(e))
        }
    )
    // STAGE
    socket.on(
        ClientDeviceEvents.CreateStage,
        (
            payload: ClientDevicePayloads.CreateStage,
            fn: (error: string | null, stage?: Stage<ObjectId>) => void
        ) => {
            trace(`${user.name}: ${ClientDeviceEvents.CreateStage}(${JSON.stringify(payload)})`)
            return distributor
                .readUser(user._id)
                .then((currentUser) => {
                    if (currentUser.canCreateStage) {
                        return distributor.createStage({
                            ...payload,
                            admins: payload.admins ? [...payload.admins, user._id] : [user._id],
                            soundEditors: payload.soundEditors
                                ? [...payload.soundEditors, user._id]
                                : [user._id],
                        })
                    }
                    throw new Error(`User ${user.name} has no privileges to create a stage`)
                })
                .then((stage) => {
                    if (fn) {
                        return fn(null, stage)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.ChangeStage,
        (payload: ClientDevicePayloads.ChangeStage, fn: (error: string | null) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.ChangeStage}(${JSON.stringify(payload)})`)
            const { _id, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .readAdministratedStage(user._id, id)
                .then((stage) => {
                    if (stage) {
                        return distributor.updateStage(id, data)
                    }
                    throw new Error(`User ${user.name} has no privileges to update the stage ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveStage,
        (payload: ClientDevicePayloads.RemoveStage, fn?: (error: string | null) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.RemoveStage}(${JSON.stringify(payload)})`)
            const id = new ObjectId(payload)
            return distributor
                .readAdministratedStage(user._id, id)
                .then((stage) => {
                    if (stage) {
                        return distributor.deleteStage(id)
                    }
                    throw new Error(`User ${user.name} has no privileges to remove the stage ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) fn(e.message)
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.CreateGroup,
        (
            payload: ClientDevicePayloads.CreateGroup,
            fn?: (error: string | null, group?: Group<ObjectId>) => void
        ) => {
            trace(`${user.name}: ${ClientDeviceEvents.CreateGroup}(${JSON.stringify(payload)})`)
            const stageId = new ObjectId(payload.stageId)
            distributor
                .readAdministratedStage(user._id, stageId)
                .then((stage) => {
                    if (stage) {
                        return distributor.createGroup({
                            name: payload.name,
                            description: '',
                            directivity: 'omni',
                            x: 0,
                            y: 0,
                            z: 0,
                            rX: 0,
                            rY: 0,
                            rZ: 0,
                            iconUrl: null,
                            volume: 1,
                            muted: false,
                            ...payload,
                            stageId,
                        })
                    }
                    throw new Error(
                        `User ${user.name} has no privileges to add group for stage ${stageId}`
                    )
                })
                .then((group) => {
                    if (fn) {
                        return fn(null, group)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.ChangeGroup,
        (payload: ClientDevicePayloads.ChangeGroup, fn?: (error: string | null) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.ChangeGroup}(${JSON.stringify(payload)})`)
            const { _id, stageId, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .readGroup(id)
                .then((group) => {
                    if (group) {
                        return distributor
                            .readAdministratedStage(user._id, group.stageId)
                            .then((stage) => {
                                if (stage) {
                                    return distributor.updateGroup(id, data)
                                }
                                throw new Error(
                                    `User ${user.name} has no privileges to change group ${group.name}`
                                )
                            })
                    }
                    throw new Error(`Unknown group ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveGroup,
        (payload: ClientDevicePayloads.RemoveGroup, fn?: (error: string | null) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.RemoveGroup}(${JSON.stringify(payload)})`)
            // REMOVE GROUP
            const id = new ObjectId(payload)
            return distributor
                .readGroup(id)
                .then((group) => {
                    if (group) {
                        return distributor
                            .readAdministratedStage(user._id, group.stageId)
                            .then((stage) => {
                                if (stage) return distributor.deleteGroup(id)
                                throw new Error(
                                    `User ${user.name} has no privileges to remove group ${id}`
                                )
                            })
                    }
                    throw new Error(`Could not find and delete group ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    socket.on(
        ClientDeviceEvents.SetCustomGroupPosition,
        (
            payload: ClientDevicePayloads.SetCustomGroupPosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.SetCustomGroupPosition}(${JSON.stringify(
                    payload
                )})`
            )
            const groupId = new ObjectId(payload.groupId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomGroupPosition(user._id, groupId, deviceId, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SetCustomGroupVolume,
        (
            payload: ClientDevicePayloads.SetCustomGroupVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.SetCustomGroupVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const groupId = new ObjectId(payload.groupId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomGroupVolume(user._id, groupId, deviceId, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomGroupPosition,
        (
            payload: ClientDevicePayloads.RemoveCustomGroupPosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveCustomGroupPosition}(${JSON.stringify(
                    payload
                )})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readCustomGroupPosition(id)
                .then((customPosition) => {
                    if (customPosition) {
                        if (customPosition.userId.equals(user._id)) {
                            return distributor.deleteCustomGroupPosition(id)
                        }
                        throw new Error(
                            `User ${user.name} has no privileges to remove custom group position ${id}`
                        )
                    }
                    throw new Error(`Unknown custom group position ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomGroupVolume,
        (
            payload: ClientDevicePayloads.RemoveCustomGroupVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveCustomGroupVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readCustomGroupVolume(id)
                .then((customVolume) => {
                    if (customVolume) {
                        if (customVolume.userId.equals(user._id)) {
                            return distributor.deleteCustomGroupVolume(id)
                        }
                        throw new Error(
                            `User ${user.name} has no privileges to remove custom group volume ${id}`
                        )
                    }
                    throw new Error(`Unknown custom group volume ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    socket.on(
        ClientDeviceEvents.ChangeStageMember,
        (payload: ClientDevicePayloads.ChangeStageMember, fn?: (error: string | null) => void) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.ChangeStageMember}(${JSON.stringify(payload)})`
            )
            const { _id, stageId, groupId, userId, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .readStageMember(id)
                .then((stageMember) => {
                    if (stageMember) {
                        return distributor
                            .readManagedStage(user._id, stageMember.stageId)
                            .then((stage) => {
                                if (stage) {
                                    return distributor.updateStageMember(id, data)
                                }
                                throw new Error(
                                    `User ${user.name} has no privileges to change stage member ${id}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage member ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveStageMember,
        (payload: ClientDevicePayloads.RemoveStageMember, fn?: (error: string | null) => void) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveStageMember}(${JSON.stringify(payload)})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readStageMember(id)
                .then((stageMember) => {
                    if (stageMember) {
                        return distributor
                            .readManagedStage(user._id, stageMember.stageId)
                            .then((stage) => {
                                if (stage) {
                                    return distributor.deleteStageMember(id)
                                }
                                throw new Error(
                                    `User ${user.name} has no privileges to remove stage member ${id}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage member ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SetCustomStageMemberPosition,
        (
            payload: ClientDevicePayloads.SetCustomStageMemberPosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageMemberPosition}(${JSON.stringify(
                    payload
                )})`
            )
            const stageMemberId = new ObjectId(payload.stageMemberId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomStageMemberPosition(user._id, stageMemberId, deviceId, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SetCustomStageMemberVolume,
        (
            payload: ClientDevicePayloads.SetCustomStageMemberVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageMemberVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const stageMemberId = new ObjectId(payload.stageMemberId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomStageMemberVolume(user._id, stageMemberId, deviceId, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomStageMemberPosition,
        (
            payload: ClientDevicePayloads.RemoveCustomStageMemberPosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${
                    ClientDeviceEvents.RemoveCustomStageMemberPosition
                }(${JSON.stringify(payload)})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readCustomStageMemberPosition(id)
                .then((customPosition) => {
                    if (customPosition) {
                        if (customPosition.userId.equals(user._id)) {
                            return distributor.deleteCustomStageMemberPosition(id)
                        }
                        throw new Error(
                            `User ${user.name} has no privileges to remove custom stage member position ${id}`
                        )
                    }
                    throw new Error(`Unknown custom stage member position ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomStageMemberVolume,
        (
            payload: ClientDevicePayloads.RemoveCustomStageMemberVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveCustomStageMemberVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readCustomStageMemberVolume(id)
                .then((customVolume) => {
                    if (customVolume) {
                        if (customVolume.userId.equals(user._id)) {
                            return distributor.deleteCustomStageMemberVolume(id)
                        }
                        throw new Error(
                            `User ${user.name} has no privileges to remove custom stage member volume ${id}`
                        )
                    }
                    throw new Error(`Unknown custom stage member volume ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    /* STAGE DEVICE */
    socket.on(
        ClientDeviceEvents.ChangeStageDevice,
        (payload: ClientDevicePayloads.ChangeStageDevice, fn?: (error: string | null) => void) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.ChangeStageDevice}(${JSON.stringify(payload)})`
            )
            const { _id, stageId, groupId, userId, deviceId, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .readStageDevice(id)
                .then((StageDevice) => {
                    if (StageDevice) {
                        return distributor
                            .readManagedStage(user._id, StageDevice.stageId)
                            .then((stage) => {
                                if (stage) {
                                    return distributor.updateStageDevice(id, data)
                                }
                                throw new Error(
                                    `User ${user.name} has no privileges to change stage device ${id}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage device ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveStageDevice,
        (payload: ClientDevicePayloads.RemoveStageDevice, fn?: (error: string | null) => void) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveStageDevice}(${JSON.stringify(payload)})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readStageDevice(id)
                .then((StageDevice) => {
                    if (StageDevice) {
                        return distributor
                            .readManagedStage(user._id, StageDevice.stageId)
                            .then((stage) => {
                                if (stage) {
                                    return distributor.deleteStageDevice(id)
                                }
                                throw new Error(
                                    `User ${user.name} has no privileges to remove stage device ${id}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage device ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SetCustomStageDevicePosition,
        (
            payload: ClientDevicePayloads.SetCustomStageDevicePosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageDevicePosition}(${JSON.stringify(
                    payload
                )})`
            )
            const stageDeviceId = new ObjectId(payload.stageDeviceId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomStageDevicePosition(user._id, stageDeviceId, deviceId, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SetCustomStageDeviceVolume,
        (
            payload: ClientDevicePayloads.SetCustomStageDeviceVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageDeviceVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const stageDeviceId = new ObjectId(payload.stageDeviceId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomStageDeviceVolume(user._id, stageDeviceId, deviceId, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomStageDevicePosition,
        (
            payload: ClientDevicePayloads.RemoveCustomStageDevicePosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${
                    ClientDeviceEvents.RemoveCustomStageDevicePosition
                }(${JSON.stringify(payload)})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readCustomStageDevicePosition(id)
                .then((customPosition) => {
                    if (customPosition) {
                        if (customPosition.userId.equals(user._id)) {
                            return distributor.deleteCustomStageDevicePosition(id)
                        }
                        throw new Error(
                            `User ${user.name} has no privileges to remove custom stage device position ${id}`
                        )
                    }
                    throw new Error(`Unknown custom stage device position ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomStageDeviceVolume,
        (
            payload: ClientDevicePayloads.RemoveCustomStageDeviceVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveCustomStageDeviceVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const id = new ObjectId(payload)
            return distributor
                .readCustomStageDeviceVolume(id)
                .then((customVolume) => {
                    if (customVolume) {
                        if (customVolume.userId.equals(user._id)) {
                            return distributor.deleteCustomStageDeviceVolume(id)
                        }
                        throw new Error(
                            `User ${user.name} has no privileges to remove custom stage device volume ${id}`
                        )
                    }
                    throw new Error(`Unknown custom stage device volume ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    socket.on(
        ClientDeviceEvents.ChangeRemoteAudioTrack,
        (
            payload: ClientDevicePayloads.ChangeRemoteAudioTrack,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.ChangeRemoteAudioTrack}(${JSON.stringify(
                    payload
                )})`
            )
            const { _id, userId, stageId, stageMemberId, localAudioTrackId, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .readRemoteAudioTrack(id)
                .then((remoteAudioTrack) => {
                    if (remoteAudioTrack) {
                        return distributor
                            .readManagedStage(user._id, remoteAudioTrack.stageId)
                            .then((stage) => {
                                if (stage) {
                                    return distributor.updateRemoteAudioTrack(id, data)
                                }
                                throw new Error(
                                    `User ${user.name} has no privileges to change remote audio track ${id}`
                                )
                            })
                    }
                    throw new Error(`Unknown remote audio track ${id}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        return fn(e.message)
                    }
                    return error(e)
                })
        }
    )

    socket.on(
        ClientDeviceEvents.SetCustomRemoteAudioTrackPosition,
        (
            payload: ClientDevicePayloads.SetCustomRemoteAudioTrackPosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.SetCustomRemoteAudioTrackPosition}(${payload})`
            )
            const remoteAudioTrackId = new ObjectId(payload.remoteAudioTrackId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomRemoteAudioTrackPosition(
                    user._id,
                    remoteAudioTrackId,
                    deviceId,
                    payload
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SetCustomRemoteAudioTrackVolume,
        (
            payload: ClientDevicePayloads.SetCustomRemoteAudioTrackVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${
                    ClientDeviceEvents.SetCustomRemoteAudioTrackVolume
                }(${JSON.stringify(payload)})`
            )
            const remoteAudioTrackId = new ObjectId(payload.remoteAudioTrackId)
            const deviceId = new ObjectId(payload.deviceId)
            return distributor
                .upsertCustomRemoteAudioTrackVolume(user._id, remoteAudioTrackId, deviceId, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomRemoteAudioTrackPosition,
        (
            payload: ClientDevicePayloads.RemoveCustomRemoteAudioTrackPosition,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveCustomRemoteAudioTrackPosition}(${payload})`
            )
            const customRemoteAudioTrackPositionId = new ObjectId(payload)
            return distributor
                .deleteCustomRemoteAudioTrackPosition(customRemoteAudioTrackPositionId)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomRemoteAudioTrackVolume,
        (
            payload: ClientDevicePayloads.RemoveCustomRemoteAudioTrackVolume,
            fn?: (error: string | null) => void
        ) => {
            trace(
                `${user.name}: ${ClientDeviceEvents.RemoveCustomRemoteAudioTrackVolume}(${payload})`
            )
            const customRemoteAudioTrackVolumeId = new ObjectId(payload)
            return distributor
                .deleteCustomRemoteAudioTrackVolume(customRemoteAudioTrackVolumeId)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    // STAGE ASSIGNMENT HANDLING
    socket.on(
        ClientDeviceEvents.JoinStage,
        (payload: ClientDevicePayloads.JoinStage, fn?: (error?: string) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.JoinStage}`)
            const stageId = new ObjectId(payload.stageId)
            const groupId = new ObjectId(payload.groupId)
            return distributor
                .joinStage(user._id, stageId, groupId, payload.password)
                .then(() => trace(`${user.name} joined stage ${stageId} and group ${groupId}`))
                .then(() => fn && fn())
                .catch((e) => {
                    error(e)
                    if (fn) fn(e.message)
                })
        }
    )
    socket.on(ClientDeviceEvents.LeaveStage, (fn?: (error: string | null) => void) => {
        trace(`${user.name}: ${ClientDeviceEvents.LeaveStage}`)
        distributor
            .leaveStage(user._id)
            .then(() => trace(`${user.name} left stage`))
            .then(() => {
                if (fn) {
                    return fn(null)
                }
                return undefined
            })
            .catch((e) => {
                if (fn) {
                    fn(e)
                }
                error(e)
            })
    })

    socket.on(
        ClientDeviceEvents.LeaveStageForGood,
        (payload: ClientDevicePayloads.LeaveStageForGood, fn?: (error: string | null) => void) => {
            trace(`${user.name}: ${ClientDeviceEvents.LeaveStageForGood}`)
            // LEAVE STAGE FOR GOOD
            const stageId = new ObjectId(payload)
            return distributor
                .leaveStageForGood(user._id, stageId)
                .then(() => trace(`${user.name} left stage ${stageId} for good`))
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e) => {
                    if (fn) {
                        fn(e)
                    }
                    error(e)
                })
        }
    )

    // Send stage data
    await distributor.sendStageDataToDevice(socket, user)
    Distributor.sendToDevice(socket, ServerDeviceEvents.UserReady, user)
    socket.join(user._id.toHexString())
    Distributor.sendToDevice(socket, ServerDeviceEvents.Ready)
    if (device) {
        trace(
            `Registered socket handler for user ${user.name} and device ${device._id} at socket ${socket.id}`
        )
    } else {
        trace(`Registered socket handler for user ${user.name}  at socket ${socket.id}`)
    }
    return device
}
export default handleSocketClientConnection
