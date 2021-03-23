"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable no-console */
const debug_1 = require("debug");
const Sentry = require("@sentry/node");
const uncaught = require("uncaught");
const Tracing = require("@sentry/tracing");
const integrations_1 = require("@sentry/integrations");
const env_1 = require("./env");
const d = debug_1.default("server");
uncaught.start();
if (env_1.USE_SENTRY) {
    d("Using Sentry for logging");
    Sentry.init({
        dsn: env_1.SENTRY_DSN,
        release: process.env.RELEASE,
        integrations: [
            new Tracing.Integrations.Mongo(),
            new integrations_1.CaptureConsole({
                levels: ["warn", "error"],
            }),
            new integrations_1.RewriteFrames({
                root: global.__rootdir__,
            }),
        ],
        // We recommend adjusting this value in production, or using tracesSampler
        // for finer control
        tracesSampleRate: 1.0,
    });
    Sentry.startTransaction({
        op: "test",
        name: "My First Test Transaction",
    });
    uncaught.addListener((e) => {
        Sentry.captureException(e);
    });
}
else {
    d("Using console for logging");
    const reportError = d.extend("error");
    reportError.log = console.error.bind(console);
    uncaught.addListener((e) => {
        reportError("Uncaught error or rejection: ", e.message);
    });
}
const logger = (context) => {
    let namespace = context;
    if (namespace.length > 0) {
        namespace += ":";
    }
    const info = d.extend(`${namespace}info`);
    info.log = console.info.bind(console);
    const trace = d.extend(`${namespace}trace`);
    trace.log = console.debug.bind(console);
    let warn;
    let error;
    if (env_1.USE_SENTRY) {
        warn = (message) => console.warn(`${namespace}:warn ${message}`);
        error = (message) => {
            if (message) {
                console.error(`${namespace}:error ${message}`);
                console.trace(message);
                Sentry.captureException(message);
            }
        };
    }
    else {
        warn = d.extend(`${namespace}warn`);
        warn.log = console.warn.bind(console);
        error = d.extend(`${namespace}error`);
        error.log = console.error.bind(console);
    }
    return {
        info,
        trace,
        warn,
        error,
    };
};
exports.default = logger;
//# sourceMappingURL=logger.js.map