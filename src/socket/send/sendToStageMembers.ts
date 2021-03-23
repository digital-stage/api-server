import { ITeckosProvider } from "teckos";
import { Db } from "mongodb";
import { StageId } from "../../../types/IdTypes";
import sendToUser from "./sendToUser";
import StageMember from "../../../types/model/StageMember";
import Schema from "../../store/Schema";

const sendToStageMembers = (
  io: ITeckosProvider,
  store: Db,
  stageId: StageId,
  event: string,
  payload?: any
): Promise<void> =>
  store
    .collection<StageMember>(Schema.StageMember)
    .find(
      { stage: stageId },
      {
        projection: { userId: true },
      }
    )
    .toArray()
    .then((stageMembers) =>
      stageMembers.forEach((stageMember) =>
        sendToUser(io, stageMember.userId, event, payload)
      )
    );

export default sendToStageMembers;
