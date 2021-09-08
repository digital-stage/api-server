/* eslint-disable no-console,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-explicit-any,@typescript-eslint/restrict-template-expressions */
import * as Sentry from '@sentry/node'
import * as uncaught from 'uncaught'
import * as Tracing from '@sentry/tracing'
import { LOGFLARE_API_KEY, LOGFLARE_SOURCE_TOKEN, SENTRY_DSN } from './env'
import pino from 'pino'
import { createPinoBrowserSend, createWriteStream } from 'pino-logflare'

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace NodeJS {
        interface Global {
            __rootdir__: string
        }
    }
}

let logflareWriteStream, logflareBrowserStream
if (!!LOGFLARE_API_KEY && !!LOGFLARE_SOURCE_TOKEN) {
    // create pino-logflare stream
    logflareWriteStream = createWriteStream({
        apiKey: LOGFLARE_API_KEY,
        sourceToken: LOGFLARE_SOURCE_TOKEN,
    })
    // create pino-logflare browser stream
    logflareBrowserStream = createPinoBrowserSend({
        apiKey: LOGFLARE_API_KEY,
        sourceToken: LOGFLARE_SOURCE_TOKEN,
    })
}

// create pino loggger
const logger = pino(
    {
        browser: {
            transmit: {
                send: logflareBrowserStream,
            },
        },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    logflareWriteStream
)

uncaught.start()

if (!!SENTRY_DSN) {
    console.info('Using Sentry for logging')
    Sentry.init({
        dsn: SENTRY_DSN,
        release: process.env.RELEASE,

        integrations: [new Tracing.Integrations.Mongo()],

        // We recommend adjusting this value in production, or using tracesSampler
        // for finer control
        tracesSampleRate: 1.0,
    })

    Sentry.startTransaction({
        op: 'test',
        name: 'My First Test Transaction',
    })

    uncaught.addListener((e) => {
        Sentry.captureException(e)
    })
} else {
    console.info('Using console for logging')
    uncaught.addListener((e) => {
        logger.error('Uncaught error or rejection: ', e.message)
        logger.error('Trace: ', e.trace)
    })
}

const useLogger = (
    context: string
): {
    info: (message: any) => void
    debug: (message: any) => void
    trace: (message: any) => void
    warn: (message: any) => void
    error: (message: any) => void
} => {
    let namespace = context
    if (namespace.length > 0) {
        namespace += ':'
    }
    const info = (message: any): void => {
        logger.info(`${namespace}info ${message}`)
    }
    const trace = (message: any): void => {
        logger.trace(`${namespace}trace ${message}`)
    }
    const debug = (message: any): void => {
        logger.debug(`${namespace}debug ${message}`)
    }
    let warn: (message: any) => void
    let error: (message: any) => void
    if (SENTRY_DSN) {
        warn = (message: any) => console.warn(`${namespace}warn ${message}`)
        error = (message: any) => {
            if (message) {
                console.error(`${namespace}error ${message.toString()}`)
                console.trace(message)
                //Sentry.captureException(message)
            }
        }
    } else {
        warn = (message: string) => {
            logger.warn(`${namespace}warn ${message}`)
        }
        error = (message: string) => {
            logger.error(`${namespace}error ${message}`)
        }
    }
    return {
        info,
        debug,
        trace,
        warn,
        error,
    }
}

export { useLogger }
