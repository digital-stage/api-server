import { ObjectId } from "mongodb";
import Stage from "../types/model/Stage";
import StageMember from "../types/model/StageMember";

/**
 * Use this interface to implement a stage handler,
 * that will invoke necessary server or add information to the stage.
 * Try to return the stage object as soon as possible,
 * but with the necessary payload you'll need in your clients.
 */
interface IStageHandler {
  prepareStage: (
    stage: Partial<Omit<Stage<ObjectId>, "_id">>
  ) => Promise<Partial<Omit<Stage<ObjectId>, "_id">>>;
  prepareStageMember: (
    stageMember: Omit<StageMember<ObjectId>, "_id">
  ) => Promise<Omit<StageMember<ObjectId>, "_id">>;

  cleanUpStage: (stage: Stage<ObjectId>) => void;
  cleanUpStageMember: (stageMember: StageMember<ObjectId>) => void;
}

export default IStageHandler;
