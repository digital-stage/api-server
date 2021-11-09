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

import fetch from 'node-fetch'
import { ObjectId } from 'mongodb'
import { ErrorCodes, User } from '@digitalstage/api-types'
import { HttpRequest } from 'teckos/uws'
import { AUTH_URL, RESTRICT_STAGE_CREATION } from '../env'
import { Distributor } from '../distributor/Distributor'
import { useLogger } from '../useLogger'
import { AuthUser } from './AuthUser'

const { debug } = useLogger('auth')

const getAuthUserByToken = (token: string): Promise<AuthUser> =>
    fetch(`${AUTH_URL}/profile`, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    }).then((result) => {
        if (result.ok) {
            return result.json() as Promise<AuthUser>
        }
        throw new Error(result.statusText)
    })

const useAuth = (
    distributor: Distributor
): {
    authorizeHttpRequest: (req: HttpRequest) => Promise<User<ObjectId>>
    getUserByToken: (token: string) => Promise<User<ObjectId>>
} => {
    const getUserByToken = (reqToken: string): Promise<User<ObjectId>> => {
        let token = reqToken
        if (reqToken.length > 7 && reqToken.substring(0, 7) === 'Bearer ') {
            token = reqToken.substring(7)
        }
        return getAuthUserByToken(token)
            .then((authUser) =>
                distributor.readUserByUid(authUser._id).then((user) => {
                    if (!user) {
                        debug(`Creating new user ${authUser.name}`)
                        return distributor
                            .createUser({
                                uid: authUser._id,
                                name: authUser.name,
                                avatarUrl: authUser.avatarUrl,
                                canCreateStage: !RESTRICT_STAGE_CREATION,
                            })
                            .then((createdUser) => createdUser)
                    }
                    return user
                })
            )
            .catch(() => {
                throw new Error(ErrorCodes.InvalidCredentials)
            })
    }

    const authorizeHttpRequest = (req: HttpRequest): Promise<User<ObjectId>> => {
        const authorization: string = req.getHeader('authorization')
        if (!authorization) {
            throw new Error(ErrorCodes.MissingAuthorization)
        }
        if (!authorization.startsWith('Bearer ')) {
            throw new Error(ErrorCodes.InvalidAuthorization)
        }
        const token = authorization.substr(7)
        return getUserByToken(token)
    }

    return {
        getUserByToken,
        authorizeHttpRequest,
    }
}
export { useAuth }
