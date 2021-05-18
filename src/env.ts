import { config } from 'dotenv'
import * as dotenvExpand from 'dotenv-expand'
import * as fs from 'fs'

const getEnvPath = () => {
    if (fs.existsSync('.env.local')) return '.env.local'
    if (fs.existsSync('.env')) return '.env'
    return `.env.${process.env.NODE_ENV}`
}

const envPath = getEnvPath()
const env = config({ path: envPath })
dotenvExpand(env)

const { MONGO_URL, REDIS_URL, MONGO_DB, PORT, AUTH_URL, API_KEY, SENTRY_DSN } = process.env

// eslint-disable-next-line no-console
console.info(`Loaded env from ${envPath}`)
// eslint-disable-next-line no-console
console.info(`Using auth server at ${AUTH_URL}`)

const MONGO_CA = process.env.MONGO_CA ? [fs.readFileSync(process.env.MONGO_CA)] : undefined
const USE_REDIS = process.env.USE_REDIS && process.env.USE_REDIS === 'true'
const USE_SENTRY = process.env.USE_SENTRY && process.env.USE_SENTRY === 'true'
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
    USE_SENTRY,
    SENTRY_DSN,
    RESTRICT_STAGE_CREATION,
}
