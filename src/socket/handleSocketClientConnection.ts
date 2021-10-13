/*
 * Copyright (c) 2021 Tobias Hegemann
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { ITeckosSocket } from 'teckos'
import { ObjectId } from 'mongodb'
import {
    User,
    Device,
    Group,
    Stage,
    ClientDeviceEvents,
    ServerDeviceEvents,
    ClientDevicePayloads,
    ChatMessage,
    VideoTrack,
    AudioTrack,
    ErrorCodes,
    ServerDevicePayloads,
} from '@digitalstage/api-types'
import { useLogger } from '../useLogger'
import { Distributor } from '../distributor/Distributor'
import { generateTurnKey } from '../utils/generateTurnKey'
import { verifyPayload } from '../utils/verifyPayload'

const { error, debug } = useLogger('socket:client')

const handleSocketClientConnection = async (
    distributor: Distributor,
    socket: ITeckosSocket,
    user: User<ObjectId>,
    initialDevice?: Partial<Device<ObjectId>>
): Promise<Device<ObjectId>> => {
    let device: Device<ObjectId>
    if (initialDevice?.uuid) {
        // Try to determine an existing device
        device = await distributor.readDeviceByUserAndUUID(user._id, initialDevice.uuid)
        if (device) {
            debug(`Found existing device with uuid ${initialDevice.uuid}`)
        }
    }
    if (!device) {
        // No existing device found, so create new, BUT set it offline first ...
        device = await distributor.createDevice({
            ...initialDevice,
            online: false,
            userId: user._id,
        })
    }
    socket.join(device._id.toHexString())

    socket.on('disconnect', async () => {
        try {
            await Promise.all([
                distributor
                    .readVideoTrackIdsByDevice(device._id)
                    .then((trackIds) =>
                        Promise.all(
                            trackIds.map((trackId) => distributor.deleteVideoTrack(trackId))
                        )
                    ),
                distributor
                    .readAudioTrackIdsByDevice(device._id)
                    .then((trackIds_1) =>
                        Promise.all(
                            trackIds_1.map((trackId_1) => distributor.deleteAudioTrack(trackId_1))
                        )
                    ),
            ])
            if (device.uuid) {
                debug(`Set device ${device._id.toHexString()} offline`)
                return await distributor.updateDevice(user._id, device._id, { online: false })
            } else {
                debug(`Removing device ${device._id.toHexString()}`)
                return await distributor.deleteDevice(device._id)
            }
        } catch (err) {
            return error(err)
        }
    })

    await distributor
        .readDevicesByUser(user._id)
        .then((devices) =>
            Promise.all(
                devices.map((currentDevice) =>
                    Distributor.sendToDevice(socket, ServerDeviceEvents.DeviceAdded, currentDevice)
                )
            )
        )
    Distributor.sendToDevice(socket, ServerDeviceEvents.LocalDeviceReady, device)

    // Send sound cards
    await distributor.sendDeviceConfigurationToDevice(socket, user)

    /* AUDIO TRACK */
    socket.on(
        ClientDeviceEvents.CreateAudioTrack,
        (
            payload: ClientDevicePayloads.CreateAudioTrack,
            fn?: (error: string | null, track?: AudioTrack<ObjectId>) => void
        ) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.CreateAudioTrack}(${JSON.stringify(payload)})`
            )
            const { stageId, ...data } = payload
            if (!stageId) {
                return fn('Missing stage ID')
            }
            return distributor
                .readStageDeviceByStage(device._id, new ObjectId(stageId))
                .then((stageDevice) => {
                    if (stageDevice) {
                        return distributor
                            .createAudioTrack({
                                type: '',
                                ...data,
                                userId: user._id,
                                deviceId: device._id,
                                stageId: stageDevice.stageId,
                                stageMemberId: stageDevice.stageMemberId,
                                stageDeviceId: stageDevice._id,
                            })
                            .then((track) => {
                                if (fn) {
                                    return fn(null, track)
                                }
                                return undefined
                            })
                    }
                    throw new Error('No stage device found to assign audio track to')
                })
                .catch((e: Error) => {
                    error(e)
                    if (fn) fn(e.message)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.ChangeAudioTrack,
        (payload: ClientDevicePayloads.ChangeAudioTrack, fn?: (error: string | null) => void) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.ChangeAudioTrack}(${JSON.stringify(payload)})`
            )
            const { _id, userId, deviceId, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .readAudioTrack(id)
                .then(async (audioTrack) => {
                    if (audioTrack.userId === user._id) return true
                    const managedStage = await distributor.readManagedStage(
                        user._id,
                        audioTrack.stageId
                    )
                    return !!managedStage
                })
                .then((hasPrivileges) => {
                    if (hasPrivileges) {
                        return distributor.updateAudioTrack(id, data).then(() => {
                            if (fn) {
                                return fn(null)
                            }
                            return undefined
                        })
                    }
                    throw new Error(ErrorCodes.NoPrivileges)
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveAudioTrack,
        (payload: ClientDevicePayloads.RemoveAudioTrack, fn?: (error: string | null) => void) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.RemoveAudioTrack}(${JSON.stringify(payload)})`
            )
            const id = new ObjectId(payload)
            return distributor
                .deleteAudioTrack(id, user._id)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    /* VIDEO TRACK */
    socket.on(
        ClientDeviceEvents.CreateVideoTrack,
        (
            payload: ClientDevicePayloads.CreateVideoTrack,
            fn?: (error: string | null, track?: VideoTrack<ObjectId>) => void
        ) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.CreateVideoTrack}(${JSON.stringify(payload)})`
            )
            const { stageId, ...data } = payload
            if (!stageId) {
                return fn('Missing stage ID')
            }
            return distributor
                .readStageDeviceByStage(device._id, new ObjectId(stageId))
                .then((stageDevice) => {
                    if (stageDevice) {
                        return distributor
                            .createVideoTrack({
                                type: '',
                                ...data,
                                userId: user._id,
                                deviceId: device._id,
                                stageId: stageDevice.stageId,
                                stageMemberId: stageDevice.stageMemberId,
                                stageDeviceId: stageDevice._id,
                            })
                            .then((track) => {
                                if (fn) {
                                    return fn(null, track)
                                }
                                return undefined
                            })
                    }
                    throw new Error('No stage device found to assign video track to')
                })
                .catch((e: Error) => {
                    error(e)
                    if (fn) fn(e.message)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.ChangeVideoTrack,
        (payload: ClientDevicePayloads.ChangeVideoTrack, fn?: (error: string | null) => void) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.ChangeVideoTrack}(${JSON.stringify(payload)})`
            )
            const { _id, userId, deviceId, ...data } = payload
            const id = new ObjectId(_id)
            return distributor
                .readVideoTrack(id)
                .then(async (audioTrack) => {
                    if (audioTrack.userId === user._id) return true
                    const managedStage = await distributor.readManagedStage(
                        user._id,
                        audioTrack.stageId
                    )
                    return !!managedStage
                })
                .then((hasPrivileges) => {
                    if (hasPrivileges) {
                        return distributor.updateVideoTrack(id, data).then(() => {
                            if (fn) {
                                return fn(null)
                            }
                            return undefined
                        })
                    }
                    throw new Error(ErrorCodes.NoPrivileges)
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveVideoTrack,
        (payload: ClientDevicePayloads.RemoveVideoTrack, fn?: (error: string | null) => void) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.RemoveVideoTrack}(${JSON.stringify(payload)})`
            )
            const id = new ObjectId(payload)
            return distributor
                .deleteVideoTrack(id, user._id)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    // USER
    socket.on(
        ClientDeviceEvents.ChangeUser,
        (payload: ClientDevicePayloads.ChangeUser, fn: (error: string | null) => void) => {
            debug(`${user.name}: ${ClientDeviceEvents.ChangeUser}(${JSON.stringify(payload)})`)
            return distributor
                .updateUser(new ObjectId(user._id), payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(ClientDeviceEvents.RemoveUser, (fn: (error: string | null) => void) => {
        debug(`${user.name}: ${ClientDeviceEvents.RemoveUser}`)
        return distributor
            .deleteUser(user._id)
            .then(() => {
                if (fn) {
                    return fn(null)
                }
                return undefined
            })
            .catch((e: Error) => {
                if (fn) fn(e.message)
                error(e)
            })
    })
    // DEVICE
    socket.on(
        ClientDeviceEvents.ChangeDevice,
        (payload: ClientDevicePayloads.ChangeDevice, fn?: (error: string | null) => void) => {
            debug(`${user.name}: ${ClientDeviceEvents.ChangeDevice}(${JSON.stringify(payload)})`)
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
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveDevice,
        (payload: ClientDevicePayloads.RemoveDevice, fn?: (error: string | null) => void) => {
            debug(`${user.name}: ${ClientDeviceEvents.RemoveDevice}(${JSON.stringify(payload)})`)
            const id = new ObjectId(payload)
            return distributor
                .readDeviceByUser(id, user._id)
                .then((foundDevice) => {
                    if (foundDevice) {
                        return distributor.deleteDevice(id)
                    }
                    throw new Error(ErrorCodes.NoPrivileges)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.SetSoundCard}(${JSON.stringify(payload)})`)
            if (!verifyPayload(payload, ['audioDriver', 'type', 'label'], fn)) {
                error(
                    ClientDeviceEvents.SetSoundCard + ': Invalid payload' + JSON.stringify(payload)
                )
                return
            }
            const { audioDriver, type, label, ...update } = payload
            return distributor
                .upsertSoundCard(user._id, device._id, audioDriver, type, label, update)
                .then((id: ObjectId) => {
                    if (fn) {
                        return fn(null, id)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.ChangeSoundCard}(${JSON.stringify(payload)})`)
            if (!verifyPayload(payload, ['_id', 'type', 'label'], fn)) {
                error(
                    ClientDeviceEvents.SetSoundCard + ': Invalid payload' + JSON.stringify(payload)
                )
                return
            }
            const { _id, userId, ...update } = payload
            return distributor
                .updateSoundCard(new ObjectId(_id), update)
                .then((id: ObjectId) => {
                    if (fn) {
                        return fn(null, id)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.SendChatMessage}(${JSON.stringify(payload)})`)
            return distributor
                .readUser(user._id)
                .then((currentUser) => {
                    if (currentUser && currentUser.stageId && currentUser.stageMemberId) {
                        const chatMessage: ChatMessage = {
                            userId: currentUser._id.toHexString(),
                            stageMemberId: currentUser.stageMemberId.toHexString(),
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
        ClientDeviceEvents.EncodeInviteCode,
        (
            payload: ClientDevicePayloads.EncodeInviteCode,
            fn: (error: string | null, code?: string) => void
        ) =>
            distributor
                .readAdministratedStage(user._id, new ObjectId(payload.stageId))
                .then((stage) => {
                    if (stage) {
                        return distributor.generateInviteCode(
                            stage._id,
                            new ObjectId(payload.groupId)
                        )
                    }
                    throw new Error(
                        `User ${user.name} has no privileges to generate a code for the stage ${payload.stageId} and group ${payload.groupId}`
                    )
                })
                .then((code) => fn(null, code))
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
    )
    socket.on(
        ClientDeviceEvents.RevokeInviteCode,
        (
            payload: ClientDevicePayloads.RevokeInviteCode,
            fn: (error: string | null, code?: string) => void
        ) =>
            distributor
                .readAdministratedStage(user._id, new ObjectId(payload.stageId))
                .then((stage) => {
                    if (stage) {
                        return distributor.resetInviteCode(stage._id, new ObjectId(payload.groupId))
                    }
                    throw new Error(
                        `User ${user.name} has no privileges to generate a code for the stage ${payload.stageId} and group ${payload.groupId}`
                    )
                })
                .then((code) => fn(null, code))
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
    )
    socket.on(
        ClientDeviceEvents.DecodeInviteCode,
        (
            payload: ClientDevicePayloads.DecodeInviteCode,
            fn: (
                error: string | null,
                result?: { stageId: ObjectId; groupId: ObjectId; code: string }
            ) => void
        ) =>
            distributor
                .decodeInviteCode(payload)
                .then((result) => fn(null, result))
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
    )
    socket.on(
        ClientDeviceEvents.CreateStage,
        (
            payload: ClientDevicePayloads.CreateStage,
            fn: (error: string | null, stage?: Stage<ObjectId>) => void
        ) => {
            debug(`${user.name}: ${ClientDeviceEvents.CreateStage}(${JSON.stringify(payload)})`)
            const admins =
                payload?.admins && Array.isArray(payload.admins)
                    ? payload.admins.map((admin: string) => new ObjectId(admin))
                    : []
            const soundEditors =
                payload?.soundEditors && Array.isArray(payload.soundEditors)
                    ? payload.soundEditors.map((soundEditor: string) => new ObjectId(soundEditor))
                    : []
            return distributor
                .readUser(user._id)
                .then((currentUser) => {
                    if (currentUser.canCreateStage) {
                        return distributor.createStage({
                            ...payload,
                            admins: payload.admins ? [...admins, user._id] : [user._id],
                            soundEditors: payload.soundEditors
                                ? [...soundEditors, user._id]
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
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.ChangeStage}(${JSON.stringify(payload)})`)
            const { _id, videoRouter, audioRouter, ...safePayload } = payload
            const id = new ObjectId(_id)
            return distributor
                .readAdministratedStage(user._id, id)
                .then((stage) => {
                    if (stage) {
                        let convertedPayload = safePayload as Stage<unknown>
                        if (safePayload.admins) {
                            convertedPayload = {
                                ...convertedPayload,
                                admins: safePayload.admins.map((adminId) => new ObjectId(adminId)),
                            }
                        }
                        if (safePayload.soundEditors) {
                            convertedPayload = {
                                ...convertedPayload,
                                soundEditors: safePayload.soundEditors.map(
                                    (soundEditorId) => new ObjectId(soundEditorId)
                                ),
                            }
                        }
                        return distributor.updateStage(id, convertedPayload)
                    }
                    throw new Error(
                        `User ${
                            user.name
                        } has no privileges to update the stage ${id.toHexString()}`
                    )
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.RemoveStage}(${JSON.stringify(payload)})`)
            const id = new ObjectId(payload)
            return distributor
                .readAdministratedStage(user._id, id)
                .then((stage) => {
                    if (stage) {
                        return distributor.deleteStage(id)
                    }
                    throw new Error(
                        `User ${
                            user.name
                        } has no privileges to remove the stage ${id.toHexString()}`
                    )
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.CreateGroup}(${JSON.stringify(payload)})`)
            const stageId = new ObjectId(payload.stageId)
            distributor
                .readAdministratedStage(user._id, stageId)
                .then((stage) => {
                    if (stage) {
                        return distributor.createGroup({
                            name: 'Unnamed group',
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
                        `User ${
                            user.name
                        } has no privileges to add group for stage ${stageId.toHexString()}`
                    )
                })
                .then((group) => {
                    if (fn) {
                        return fn(null, group)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.ChangeGroup}(${JSON.stringify(payload)})`)
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
                    throw new Error(`Unknown group ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.RemoveGroup}(${JSON.stringify(payload)})`)
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
                                    `User ${
                                        user.name
                                    } has no privileges to remove group ${id.toHexString()}`
                                )
                            })
                    }
                    throw new Error(`Could not find and delete group ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomGroupPosition}(${JSON.stringify(
                    payload
                )})`
            )
            const { groupId, deviceId, x, y, z, rY, rZ, rX, directivity } = payload
            return distributor
                .upsertCustomGroupPosition(
                    user._id,
                    new ObjectId(groupId),
                    new ObjectId(deviceId),
                    { x, y, z, rY, rZ, rX, directivity }
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomGroupVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const { groupId, deviceId, volume, muted } = payload
            return distributor
                .upsertCustomGroupVolume(user._id, new ObjectId(groupId), new ObjectId(deviceId), {
                    volume,
                    muted,
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                            `User ${
                                user.name
                            } has no privileges to remove custom group position ${id.toHexString()}`
                        )
                    }
                    throw new Error(`Unknown custom group position ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                            `User ${
                                user.name
                            } has no privileges to remove custom group volume ${id.toHexString()}`
                        )
                    }
                    throw new Error(`Unknown custom group volume ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                                    `User ${
                                        user.name
                                    } has no privileges to change stage member ${id.toHexString()}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage member ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                                    `User ${
                                        user.name
                                    } has no privileges to remove stage member ${id.toHexString()}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage member ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageMemberPosition}(${JSON.stringify(
                    payload
                )})`
            )
            const { deviceId, stageMemberId, x, y, z, rX, rY, rZ, directivity } = payload
            return distributor
                .upsertCustomStageMemberPosition(
                    user._id,
                    new ObjectId(stageMemberId),
                    new ObjectId(deviceId),
                    { x, y, z, rY, rZ, rX, directivity }
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageMemberVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const { stageMemberId, deviceId, volume, muted } = payload
            return distributor
                .upsertCustomStageMemberVolume(
                    user._id,
                    new ObjectId(stageMemberId),
                    new ObjectId(deviceId),
                    { volume, muted }
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                            `User ${
                                user.name
                            } has no privileges to remove custom stage member position ${id.toHexString()}`
                        )
                    }
                    throw new Error(`Unknown custom stage member position ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                            `User ${
                                user.name
                            } has no privileges to remove custom stage member volume ${id.toHexString()}`
                        )
                    }
                    throw new Error(`Unknown custom stage member volume ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                                    `User ${
                                        user.name
                                    } has no privileges to change stage device ${id.toHexString()}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage device ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                                    `User ${
                                        user.name
                                    } has no privileges to remove stage device ${id.toHexString()}`
                                )
                            })
                    }
                    throw new Error(`Unknown stage device ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageDevicePosition}(${JSON.stringify(
                    payload
                )})`
            )
            const { deviceId, stageDeviceId, x, y, z, rX, rY, rZ, directivity } = payload
            return distributor
                .upsertCustomStageDevicePosition(
                    user._id,
                    new ObjectId(stageDeviceId),
                    new ObjectId(deviceId),
                    { x, y, z, rY, rZ, rX, directivity }
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomStageDeviceVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const { stageDeviceId, deviceId, volume, muted } = payload
            return distributor
                .upsertCustomStageDeviceVolume(
                    user._id,
                    new ObjectId(stageDeviceId),
                    new ObjectId(deviceId),
                    {
                        volume,
                        muted,
                    }
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                            `User ${
                                user.name
                            } has no privileges to remove custom stage device position ${id.toHexString()}`
                        )
                    }
                    throw new Error(`Unknown custom stage device position ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(
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
                            `User ${
                                user.name
                            } has no privileges to remove custom stage device volume ${id.toHexString()}`
                        )
                    }
                    throw new Error(`Unknown custom stage device volume ${id.toHexString()}`)
                })
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    socket.on(
        ClientDeviceEvents.SetCustomAudioTrackPosition,
        (
            payload: ClientDevicePayloads.SetCustomAudioTrackPosition,
            fn?: (error: string | null) => void
        ) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomAudioTrackPosition}(${JSON.stringify(
                    payload
                )})`
            )
            const { audioTrackId, deviceId, x, y, z, rX, rY, rZ, directivity } = payload
            return distributor
                .upsertCustomAudioTrackPosition(
                    user._id,
                    new ObjectId(audioTrackId),
                    new ObjectId(deviceId),
                    { x, y, z, rX, rY, rZ, directivity }
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SetCustomAudioTrackVolume,
        (
            payload: ClientDevicePayloads.SetCustomAudioTrackVolume,
            fn?: (error: string | null) => void
        ) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.SetCustomAudioTrackVolume}(${JSON.stringify(
                    payload
                )})`
            )
            const { audioTrackId, deviceId, volume, muted } = payload
            return distributor
                .upsertCustomAudioTrackVolume(
                    user._id,
                    new ObjectId(audioTrackId),
                    new ObjectId(deviceId),
                    { volume, muted }
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomAudioTrackPosition,
        (
            payload: ClientDevicePayloads.RemoveCustomAudioTrackPosition,
            fn?: (error: string | null) => void
        ) => {
            debug(`${user.name}: ${ClientDeviceEvents.RemoveCustomAudioTrackPosition}(${payload})`)
            const customAudioTrackPositionId = new ObjectId(payload)
            return distributor
                .deleteCustomAudioTrackPosition(customAudioTrackPositionId)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.RemoveCustomAudioTrackVolume,
        (
            payload: ClientDevicePayloads.RemoveCustomAudioTrackVolume,
            fn?: (error: string | null) => void
        ) => {
            debug(`${user.name}: ${ClientDeviceEvents.RemoveCustomAudioTrackVolume}(${payload})`)
            const customAudioTrackVolumeId = new ObjectId(payload)
            return distributor
                .deleteCustomAudioTrackVolume(customAudioTrackVolumeId)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
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
            debug(`${user.name}: ${ClientDeviceEvents.JoinStage}`)
            const stageId = new ObjectId(payload.stageId)
            const groupId = payload.groupId ? new ObjectId(payload.groupId) : undefined
            return distributor
                .joinStage(user._id, stageId, groupId, payload.password)
                .then(() =>
                    debug(
                        `${user.name} joined stage ${payload.stageId} and group ${payload.groupId}`
                    )
                )
                .then(() => fn && fn())
                .catch((e: Error) => {
                    error(e)
                    if (fn) fn(e.message)
                })
        }
    )
    socket.on(ClientDeviceEvents.LeaveStage, (fn?: (error: string | null) => void) => {
        debug(`${user.name}: ${ClientDeviceEvents.LeaveStage}`)
        distributor
            .leaveStage(user._id)
            .then(() => debug(`${user.name} left stage`))
            .then(() => {
                if (fn) {
                    return fn(null)
                }
                return undefined
            })
            .catch((e: Error) => {
                if (fn) {
                    fn(e.message)
                }
                error(e)
            })
    })

    socket.on(
        ClientDeviceEvents.LeaveStageForGood,
        (payload: ClientDevicePayloads.LeaveStageForGood, fn?: (error: string | null) => void) => {
            debug(`${user.name}: ${ClientDeviceEvents.LeaveStageForGood}`)
            // LEAVE STAGE FOR GOOD
            const stageId = new ObjectId(payload)
            return distributor
                .leaveStageForGood(user._id, stageId)
                .then(() => debug(`${user.name} left stage ${stageId.toHexString()} for good`))
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    // P2P signaling
    socket.on(
        ClientDeviceEvents.SendP2PRestart,
        (payload: ClientDevicePayloads.SendP2PRestart, fn?: (error: string | null) => void) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.SendP2PRestart} to stage device ${payload.to}`
            )
            return distributor
                .sendToStageDevice(new ObjectId(payload.to), ServerDeviceEvents.P2PRestart, payload)
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SendP2POffer,
        (payload: ClientDevicePayloads.SendP2POffer, fn?: (error: string | null) => void) => {
            debug(`${user.name}: ${ClientDeviceEvents.SendP2POffer} to stage device ${payload.to}`)
            return distributor
                .sendToStageDevice(
                    new ObjectId(payload.to),
                    ServerDeviceEvents.P2POfferSent,
                    payload
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SendP2PAnswer,
        (payload: ClientDevicePayloads.SendP2PAnswer, fn?: (error: string | null) => void) => {
            debug(`${user.name}: ${ClientDeviceEvents.SendP2PAnswer} to stage device ${payload.to}`)
            return distributor
                .sendToStageDevice(
                    new ObjectId(payload.to),
                    ServerDeviceEvents.P2PAnswerSent,
                    payload
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )
    socket.on(
        ClientDeviceEvents.SendIceCandidate,
        (payload: ClientDevicePayloads.SendIceCandidate, fn?: (error: string | null) => void) => {
            debug(
                `${user.name}: ${ClientDeviceEvents.SendIceCandidate} to stage device ${payload.to}`
            )
            return distributor
                .sendToStageDevice(
                    new ObjectId(payload.to),
                    ServerDeviceEvents.IceCandidateSent,
                    payload
                )
                .then(() => {
                    if (fn) {
                        return fn(null)
                    }
                    return undefined
                })
                .catch((e: Error) => {
                    if (fn) {
                        fn(e.message)
                    }
                    error(e)
                })
        }
    )

    // Send stage data
    await distributor.sendStageDataToDevice(socket, user)
    Distributor.sendToDevice(socket, ServerDeviceEvents.UserReady, user)
    socket.join(user._id.toHexString())
    const turnUrls = await distributor.readTurnUrls()
    const turnCredentails = generateTurnKey()
    Distributor.sendToDevice(socket, ServerDeviceEvents.Ready, {
        turn: {
            urls: turnUrls,
            username: turnCredentails.username,
            credential: turnCredentails.credential,
        },
    } as ServerDevicePayloads.Ready)

    // Now set the device online
    await distributor.updateDevice(user._id, device._id, {
        ...initialDevice,
        online: true,
        lastLoginAt: new Date().getTime(),
    })
    device.online = true

    debug(
        `Registered socket handler for user ${
            user.name
        } and device ${device._id.toHexString()} at socket ${socket.id}`
    )
    return device
}
export { handleSocketClientConnection }
