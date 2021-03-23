import { ITeckosProvider } from "teckos";
import { Db } from "mongodb";
import { StageId } from "../../../types/IdTypes";
import sendToUser from "./sendToUser";
import User from "../../../types/model/User";
import Stage from "../../../types/model/Stage";
import Schema from "../../store/Schema";

const sendToStage = (
  io: ITeckosProvider,
  store: Db,
  stageId: StageId,
  event: string,
  payload?: any
): Promise<any> => {
  return Promise.all([
    // Inform users, that are logged into the stage
    store
      .collection<User>(Schema.User)
      .find({ stageId }, { projection: { _id: true } })
      .toArray()
      .then((users) =>
        users.map((user) => sendToUser(io, user.id, event, payload))
      ),
    // Inform also admins, since they can handle the stage without being logged in
    store
      .collection<Stage>(Schema.Stage)
      .findOne({ _id: stageId }, { projection: { admins: true } })
      .then((stage) =>
        stage.admins.map((userId) => sendToUser(io, userId, event, payload))
      ),
  ]);
};

export default sendToStage;
