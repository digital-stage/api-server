import { UWSProvider } from 'teckos'
import * as uWS from 'teckos/uws'
import { MongoClient } from 'mongodb'
import { address } from 'ip'
import { DEBUG_PAYLOAD, MONGO_CA, MONGO_DB, MONGO_URL, PORT, REDIS_URL } from './env'
import useLogger from './useLogger'
import handleSocketConnection from './socket/handleSocketConnection'
import Distributor from './distributor/Distributor'

const { error, warn, info } = useLogger('')

const port = PORT ? parseInt(PORT, 10) : 4000

if (REDIS_URL) {
    info(`Using redis at ${REDIS_URL}`)
} else {
    warn('Not synchronizing via redis - running in standalone mode')
}

const uws = uWS.App()
if (DEBUG_PAYLOAD) {
    warn('Verbose output of socket events ON')
}
const io = new UWSProvider(uws, {
    redisUrl: REDIS_URL,
    debug: DEBUG_PAYLOAD,
})

uws.get('/beat', (res) => {
    res.end('Boom!')
})

let mongoClient = new MongoClient(MONGO_URL, {
    sslValidate: !!MONGO_CA,
    sslCA: MONGO_CA,
    poolSize: 10,
    maxPoolSize: 100,
    bufferMaxEntries: 0,
    useNewUrlParser: true,
    useUnifiedTopology: true,
})

const start = async () => {
    const apiServer: string = `${address()}:${PORT}`
    mongoClient = await mongoClient.connect()
    const db = mongoClient.db(MONGO_DB)
    const distributor = new Distributor(io, db, apiServer)
    io.onConnection((socket) => handleSocketConnection(distributor, socket))
    return io.listen(port)
}

info('Starting ...')
start()
    .then(() => info(`Listening on port ${port}`))
    .catch((e) => error(e))
