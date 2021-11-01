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

/* eslint-disable no-console,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-explicit-any,@typescript-eslint/restrict-template-expressions */
import * as Sentry from '@sentry/node'
import * as uncaught from 'uncaught'
import * as Tracing from '@sentry/tracing'
import { SENTRY_DSN } from './env'
import pino from 'pino'
import ecsFormat from '@elastic/ecs-pino-format'

// create pino loggger
const logger = pino({
    ...ecsFormat(),
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
})

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
