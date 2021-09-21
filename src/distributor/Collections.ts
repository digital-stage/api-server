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

enum Collections {
    ROUTERS = 'r',
    USERS = 'u',
    DEVICES = 'd',
    SOUND_CARDS = 'sc',
    STAGES = 's',
    GROUPS = 'g',
    CUSTOM_GROUP_POSITIONS = 'c_g_p',
    CUSTOM_GROUP_VOLUMES = 'c_g_v',
    STAGE_MEMBERS = 'sm',
    CUSTOM_STAGE_MEMBER_POSITIONS = 'c_sm_p',
    CUSTOM_STAGE_MEMBER_VOLUMES = 'c_sm_v',
    STAGE_DEVICES = 'sd',
    CUSTOM_STAGE_DEVICE_POSITIONS = 'c_sd_p',
    CUSTOM_STAGE_DEVICE_VOLUMES = 'c_sd_v',
    VIDEO_TRACKS = 'v',
    AUDIO_TRACKS = 'a',
    CUSTOM_AUDIO_TRACK_POSITIONS = 'c_r_ap_p',
    CUSTOM_AUDIO_TRACK_VOLUMES = 'c_r_ap_v',
    INVITE_LINKS = 'i',
    TURNSERVERS = 'tu',
}
export { Collections }
