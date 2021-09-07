import crypto from 'crypto'
import { TURN_SECRET } from '../env'

function generateTurnKey():
    | {
          username: string
          credential: string
      }
    | undefined {
    if (TURN_SECRET) {
        // The username is a timestamp that represents the expiration date of this credential
        // In this case, it's valid for 12 hours (change the '12' to how many hours you want)
        const username = (Date.now() / 1000 + 12 * 3600).toString()

        // Now create the corresponding credential based on the secret
        const hmac = crypto.createHmac('sha1', TURN_SECRET)
        hmac.setEncoding('base64')
        hmac.write(username)
        hmac.end()
        const credential = hmac.read() as string

        return {
            username,
            credential,
        }
    }
    return undefined
}
export { generateTurnKey }
