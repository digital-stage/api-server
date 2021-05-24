import { Db, ObjectId } from 'mongodb'
import {
    AudioTrack,
    CustomAudioTrackPosition,
    CustomAudioTrackVolume,
    CustomGroupPosition,
    CustomGroupVolume,
    CustomStageDevicePosition,
    CustomStageDeviceVolume,
    CustomStageMemberPosition,
    CustomStageMemberVolume,
    Group,
    Stage,
    StageDevice,
    StageMember,
    StagePackage,
    User,
    VideoTrack,
} from '@digitalstage/api-types'
import Collections from '../../src/distributor/Collections'

const getWholeStage = async (
    db: Db,
    userId: ObjectId,
    stageId: ObjectId,
    skipStageAndGroups: boolean = false
): Promise<StagePackage<ObjectId>> => {
    const stage = await db.collection<Stage<ObjectId>>(Collections.STAGES).findOne({ _id: stageId })
    const groups = await db
        .collection<Group<ObjectId>>(Collections.GROUPS)
        .find({ stageId })
        .toArray()
    const customGroupVolumes = await db
        .collection<CustomGroupVolume<ObjectId>>(Collections.CUSTOM_GROUP_VOLUMES)
        .find({
            userId,
            groupId: { $in: groups.map((group) => group._id) },
        })
        .toArray()
    const customGroupPositions = await db
        .collection<CustomGroupPosition<ObjectId>>(Collections.CUSTOM_GROUP_POSITIONS)
        .find({
            userId,
            groupId: { $in: groups.map((group) => group._id) },
        })
        .toArray()
    const stageMembers = await db
        .collection<StageMember<ObjectId>>(Collections.STAGE_MEMBERS)
        .find({ stageId })
        .toArray()
    const stageMemberObjectIds = stageMembers.map((stageMember) => stageMember.userId)
    const remoteUsers = await db
        .collection<User<ObjectId>>(Collections.USERS)
        .find({ _id: { $in: stageMemberObjectIds } })
        .toArray()
    const customStageMemberVolumes: CustomStageMemberVolume<ObjectId>[] = await db
        .collection<CustomStageMemberVolume<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_VOLUMES)
        .find({
            userId,
            stageId,
        })
        .toArray()
    const customStageMemberPositions: CustomStageMemberPosition<ObjectId>[] = await db
        .collection<CustomStageMemberPosition<ObjectId>>(Collections.CUSTOM_STAGE_MEMBER_POSITIONS)
        .find({
            userId,
            stageId,
        })
        .toArray()
    const stageDevices = await db
        .collection<StageDevice<ObjectId>>(Collections.STAGE_DEVICES)
        .find({ stageId })
        .toArray()
    const customStageDeviceVolumes: CustomStageDeviceVolume<ObjectId>[] = await db
        .collection<CustomStageDeviceVolume<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_VOLUMES)
        .find({
            userId,
            stageId,
        })
        .toArray()
    const customStageDevicePositions: CustomStageDevicePosition<ObjectId>[] = await db
        .collection<CustomStageDevicePosition<ObjectId>>(Collections.CUSTOM_STAGE_DEVICE_POSITIONS)
        .find({
            userId,
            stageId,
        })
        .toArray()
    const videoTracks: VideoTrack<ObjectId>[] = await db
        .collection<VideoTrack<ObjectId>>(Collections.VIDEO_TRACKS)
        .find({
            stageId,
        })
        .toArray()
    const audioTracks: AudioTrack<ObjectId>[] = await db
        .collection<AudioTrack<ObjectId>>(Collections.AUDIO_TRACKS)
        .find({
            stageId,
        })
        .toArray()
    const customAudioTrackVolumes: CustomAudioTrackVolume<ObjectId>[] = await db
        .collection<CustomAudioTrackVolume<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_VOLUMES)
        .find({
            userId,
            stageId,
        })
        .toArray()
    const customAudioTrackPositions: CustomAudioTrackPosition<ObjectId>[] = await db
        .collection<CustomAudioTrackPosition<ObjectId>>(Collections.CUSTOM_AUDIO_TRACK_POSITIONS)
        .find({
            userId,
            stageId,
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
        remoteUsers,
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
// eslint-disable-next-line import/prefer-default-export
export { getWholeStage }
