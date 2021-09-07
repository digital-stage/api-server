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
