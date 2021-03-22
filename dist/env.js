"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SENTRY_DSN = exports.USE_SENTRY = exports.MONGO_CA = exports.AUTH_URL = exports.DEBUG_EVENTS = exports.DEBUG_PAYLOAD = exports.USE_REDIS = exports.PORT = exports.MONGO_DB = exports.REDIS_URL = exports.MONGO_URL = exports.API_KEY = void 0;
const dotenv_1 = require("dotenv");
const fs = require("fs");
dotenv_1.config();
const { MONGO_URL, REDIS_URL, MONGO_DB, PORT, AUTH_URL, API_KEY, SENTRY_DSN, } = process.env;
exports.MONGO_URL = MONGO_URL;
exports.REDIS_URL = REDIS_URL;
exports.MONGO_DB = MONGO_DB;
exports.PORT = PORT;
exports.AUTH_URL = AUTH_URL;
exports.API_KEY = API_KEY;
exports.SENTRY_DSN = SENTRY_DSN;
const MONGO_CA = process.env.MONGO_CA
    ? [fs.readFileSync(process.env.MONGO_CA)]
    : undefined;
exports.MONGO_CA = MONGO_CA;
const USE_REDIS = process.env.USE_REDIS && process.env.USE_REDIS === "true";
exports.USE_REDIS = USE_REDIS;
const USE_SENTRY = process.env.USE_SENTRY && process.env.USE_SENTRY === "true";
exports.USE_SENTRY = USE_SENTRY;
const DEBUG_EVENTS = process.env.DEBUG_EVENTS && process.env.DEBUG_EVENTS === "true";
exports.DEBUG_EVENTS = DEBUG_EVENTS;
const DEBUG_PAYLOAD = process.env.DEBUG_PAYLOAD && process.env.DEBUG_PAYLOAD === "true";
exports.DEBUG_PAYLOAD = DEBUG_PAYLOAD;
//# sourceMappingURL=env.js.map