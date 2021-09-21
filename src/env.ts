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

const getEnvPath = () => {
    if (fs.existsSync('.env.local')) return '.env.local'
    if (fs.existsSync('.env')) return '.env'
    return `.env.${process.env.NODE_ENV}`
}

const envPath = getEnvPath()
const env = config({ path: envPath })
dotenvExpand(env)

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
    LOGFLARE_API_KEY,
    LOGFLARE_SOURCE_TOKEN,
} = process.env

// eslint-disable-next-line no-console
console.info(`Loaded env from ${envPath}`)
// eslint-disable-next-line no-console
console.info(`Using auth server at ${AUTH_URL}`)

const USE_REDIS = process.env.USE_REDIS && process.env.USE_REDIS === 'true'
const DEBUG_EVENTS = process.env.DEBUG_EVENTS && process.env.DEBUG_EVENTS === 'true'
const DEBUG_PAYLOAD = process.env.DEBUG_PAYLOAD && process.env.DEBUG_PAYLOAD === 'true'
const RESTRICT_STAGE_CREATION =
    process.env.RESTRICT_STAGE_CREATION && process.env.RESTRICT_STAGE_CREATION === 'true'

export {
    API_KEY,
    MONGO_URL,
    REDIS_URL,
    MONGO_DB,
    PORT,
    USE_REDIS,
    DEBUG_PAYLOAD,
    DEBUG_EVENTS,
    AUTH_URL,
    MONGO_CA,
    SENTRY_DSN,
    TURN_SECRET,
    LOGFLARE_API_KEY,
    LOGFLARE_SOURCE_TOKEN,
    RESTRICT_STAGE_CREATION,
}
