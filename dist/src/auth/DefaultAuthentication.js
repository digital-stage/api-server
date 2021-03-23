"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
const env_1 = require("../env");
const logger_1 = require("../logger");
const { error, trace } = logger_1.default("auth");
const getUserByToken = (token) => node_fetch_1.default(`${env_1.AUTH_URL}/profile`, {
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    },
}).then((result) => {
    if (result.ok) {
        return result.json();
    }
    throw new Error(result.statusText);
});
class DefaultAuthentication {
    constructor(database) {
        this.database = database;
    }
    verifyWithToken(reqToken) {
        let token = reqToken;
        if (reqToken.length > 7 && reqToken.substring(0, 7) === "Bearer ") {
            token = reqToken.substring(7);
        }
        return getUserByToken(token)
            .then((authUser) => this.database.readUserByUid(authUser._id).then((user) => {
            if (!user) {
                trace(`Creating new user ${authUser.name}`);
                return this.database
                    .createUser({
                    uid: authUser._id,
                    name: authUser.name,
                    avatarUrl: authUser.avatarUrl,
                })
                    .then((createdUser) => createdUser);
            }
            return user;
        }))
            .catch((e) => {
            error("Invalid token delivered");
            error(e);
            throw new Error("Invalid credentials");
        });
    }
    authorizeRequest(req) {
        const authorization = req.getHeader("authorization");
        if (!authorization) {
            throw new Error("Missing authorization");
        }
        if (!authorization.startsWith("Bearer ")) {
            throw new Error("Invalid authorization");
        }
        const token = authorization.substr(7);
        return this.verifyWithToken(token);
    }
}
exports.default = DefaultAuthentication;
//# sourceMappingURL=DefaultAuthentication.js.map