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

import { UWSProvider } from 'teckos'
import { TemplatedApp, App } from 'teckos/uws'
import { MongoClient } from 'mongodb'
import { address } from 'ip'
import { DEBUG_PAYLOAD, MONGO_CA, MONGO_DB, MONGO_URL, PORT, REDIS_URL } from './env'
import { useLogger } from './useLogger'
import { handleSocketConnection } from './socket/handleSocketConnection'
import { Distributor } from './distributor/Distributor'

const { error, warn, info } = useLogger('')

const redisEnabled = (REDIS_URL ?? '-disabled-').startsWith('redis') // usually `redis://...:6379`
if (redisEnabled) {
    info(`Using redis at ${REDIS_URL}`)
} else {
    warn('Not synchronizing via redis - running in standalone mode')
}

const app: TemplatedApp = App()
if (DEBUG_PAYLOAD) {
    warn('Verbose output of socket events ON')
}
const io = new UWSProvider(app, {
    redisUrl: redisEnabled ? REDIS_URL : null,
    debug: DEBUG_PAYLOAD,
})

app.get('/beat', (res) => {
    res.end('Boom!')
})

let mongoClient = new MongoClient(MONGO_URL, {
    sslValidate: !!MONGO_CA,
    sslCA: MONGO_CA,
    minPoolSize: 10,
    maxPoolSize: 100,
})

const start = async () => {
    const apiServer = `${address()}:${PORT}`
    mongoClient = await mongoClient.connect()
    const db = mongoClient.db(MONGO_DB)
    const distributor = new Distributor(io, db, apiServer)
    io.onConnection((socket) => handleSocketConnection(distributor, socket))
    return io.listen(PORT)
}

info('Starting ...')
start()
    .then(() => info(`Listening on port ${PORT}`))
    .catch((e) => error(e))
