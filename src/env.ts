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

import { config } from 'dotenv'
import dotenvExpand from 'dotenv-expand'
import * as fs from 'fs'
import { cleanEnv, str, bool, port } from 'envalid'

const getEnvPath = (): string | undefined => {
    if (fs.existsSync('.env.local')) return '.env.local'
    if (process.env.NODE_ENV && fs.existsSync(`.env.${process.env.NODE_ENV}`))
        return `.env.${process.env.NODE_ENV}`
    if (fs.existsSync('.env')) return undefined
}

const envPath = getEnvPath()
const env = envPath ? dotenvExpand(config({ path: envPath })).parsed : process.env

const variables = cleanEnv(env, {
    // Required
    AUTH_URL: str(),
    API_KEY: str(),
    MONGO_URL: str(),
    MONGO_DB: str(),
    MONGO_CA: str({ default: undefined }),
    PORT: port({ default: 3000 }),
    RESTRICT_STAGE_CREATION: bool({ default: false }),
    TURN_SECRET: str({ default: 'default' }),

    // Optional: Redis
    REDIS_URL: str({ default: '' }),

    // Optional: Debugging
    DEBUG_EVENTS: bool({ default: false }),
    DEBUG_PAYLOAD: bool({ default: false }),
    SENTRY_DSN: str({ default: undefined }),
    NODE_ENV: str({ choices: ['development', 'preview', 'production'] }),
})

const {
    MONGO_URL,
    REDIS_URL,
    MONGO_DB,
    MONGO_CA,
    PORT,
    AUTH_URL,
    API_KEY,
    TURN_SECRET,
    SENTRY_DSN,
    DEBUG_PAYLOAD,
    DEBUG_EVENTS,
    RESTRICT_STAGE_CREATION,
} = variables

// eslint-disable-next-line no-console
console.info(`Loaded env from ${envPath}`)
// eslint-disable-next-line no-console
console.info(`Using auth server at ${AUTH_URL}`)

export {
    API_KEY,
    MONGO_URL,
    REDIS_URL,
    MONGO_DB,
    PORT,
    DEBUG_PAYLOAD,
    DEBUG_EVENTS,
    AUTH_URL,
    MONGO_CA,
    SENTRY_DSN,
    TURN_SECRET,
    RESTRICT_STAGE_CREATION,
}
