import {ITeckosProvider} from "teckos";
import {UserId} from "../../../types/IdTypes";
import {DEBUG_EVENTS, DEBUG_PAYLOAD} from "../../env";
import logger from "../../logger";

const {trace} = logger("sendTouser");

const sendToUser = (io: ITeckosProvider, userId: UserId, event: string, payload?: any): void => {
    if (DEBUG_EVENTS) {
        if (DEBUG_PAYLOAD) {
            trace(`${userId} ${event}: ${JSON.stringify(payload)}`);
        } else {
            trace(`${userId}' ${event}`);
        }
    }
    io.to(userId.toString(), event, payload);
}
export default sendToUser;