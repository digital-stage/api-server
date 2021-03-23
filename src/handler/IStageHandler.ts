import Stage from "../../types/model/Stage";

/**
 * Use this interface to implement a stage handler,
 * that will invoke necessary server or add information to the stage.
 * Try to return the stage object as soon as possible,
 * but with the necessary payload you'll need in your clients.
 */
interface IStageHandler {
  stageAdded: (stage: Stage) => Promise<Stage>;
  stageChanged: (stage: Stage) => Promise<Stage>;
  stageRemoved: (stage: Stage) => Promise<Stage>;
}

export default IStageHandler;
