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

import crypto from 'crypto'
import { TURN_SECRET } from '../env'

function generateTurnKey(): {
    username: string
    credential: string
} {
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
export { generateTurnKey }
