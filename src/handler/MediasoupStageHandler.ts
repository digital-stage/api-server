import { ObjectId } from "mongodb";
import IStageHandler from "./IStageHandler";
import Stage from "../types/model/Stage";
import StageMember from "../types/model/StageMember";
import getDistance from "../utils/getDistance";
import Distributor from "../distributor/Distributor";
import Router from "../types/model/Router";

const MEDIASOUP_IDENTIFIER = "mediasoup";

const getAvailableMediasoupRouter = (
  distributor: Distributor,
  preferredPosition?: { lat: number; lng: number }
): Promise<Router<ObjectId>> =>
  distributor.readRoutersByType(MEDIASOUP_IDENTIFIER).then((routers) => {
    if (routers.length > 1) {
      let router = routers[0];
      if (preferredPosition) {
        let nearest = getDistance(preferredPosition, router.position);
        for (const r of routers) {
          const n = getDistance(preferredPosition, r.positon);
          if (n < nearest) {
            nearest = n;
            router = r;
          }
        }
      }
      return router;
    }
    if (routers.length === 1) {
      return routers[0];
    }
    throw new Error("No router available");
  });

class MediasoupStageHandler implements IStageHandler {
  private _distributor: Distributor;

  constructor(distributor: Distributor) {
    this._distributor = distributor;
  }

  cleanUpStage(stage: Stage<ObjectId>): void {}

  cleanUpStageMember(stageMember: StageMember<ObjectId>): void {}

  async prepareStage(
    stage: Partial<Omit<Stage<ObjectId>, "_id">>
  ): Promise<Partial<Omit<Stage<ObjectId>, "_id">>> {
    const preferredPosition = stage.preferredPosition
      ? {
          lat: stage.preferredPosition.lat,
          lng: stage.preferredPosition.lng,
        }
      : undefined;
    const router = await getAvailableMediasoupRouter(
      this._distributor,
      preferredPosition
    );
    stage.types = [...stage.types, MEDIASOUP_IDENTIFIER];
    stage.mediasoup = {
      url: router.url,
      port: router.port,
    };
    return Promise.resolve(stage);
  }

  prepareStageMember(
    stageMember: Omit<StageMember<ObjectId>, "_id">
  ): Promise<Omit<StageMember<ObjectId>, "_id">> {
    return Promise.resolve(stageMember);
  }
}

export default MediasoupStageHandler;
