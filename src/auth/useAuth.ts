import fetch from 'node-fetch'
import { ObjectId } from 'mongodb'
import { ErrorCodes, User } from '@digitalstage/api-types'
// eslint-disable-next-line import/no-extraneous-dependencies
import { HttpRequest } from 'teckos/uws'
import { AUTH_URL, RESTRICT_STAGE_CREATION } from '../env'
import Distributor from '../distributor/Distributor'
import useLogger from '../useLogger'
import AuthUser from './AuthUser'

const { trace, error } = useLogger('auth')

const getAuthUserByToken = (token: string): Promise<AuthUser> =>
    fetch(`${AUTH_URL}/profile`, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    }).then((result) => {
        if (result.ok) {
            return result.json()
        }
        throw new Error(result.statusText)
    })

const useAuth = (distributor: Distributor) => {
    const getUserByToken = (reqToken: string): Promise<User<ObjectId>> => {
        let token = reqToken
        if (reqToken.length > 7 && reqToken.substring(0, 7) === 'Bearer ') {
            token = reqToken.substring(7)
        }
        return getAuthUserByToken(token)
            .then((authUser) =>
                distributor.readUserByUid(authUser._id).then((user) => {
                    if (!user) {
                        trace(`Creating new user ${authUser.name}`)
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
            .catch((e) => {
                error('Invalid token delivered')
                error(e)
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
export default useAuth
