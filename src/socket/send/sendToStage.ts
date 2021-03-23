import IStore, {TypeNames} from "../../store/IStore";
import {StageId} from "../../../types/IdTypes";
import StageMember from "../../../types/model/StageMember";
import {ITeckosProvider} from "teckos";
import sendToUser from "./sendToUser";

const sendToStage = (io: ITeckosProvider, store: IStore, stageId: StageId, event: string, payload?: any): Promise<void> => {
    return store
        .readManyByValues<StageMember>(TypeNames.StageMember, {"stageId": stageId})
        .then(stageMembers => stageMembers.forEach(stageMember => sendToUser(io, stageMember.userId, event, payload)));
}

export default sendToStage;