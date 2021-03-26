import {ITeckosSocket} from "teckos";
import {ObjectId} from "mongodb";
import Router from "../types/model/Router";
import ServerDeviceEvents from "../types/ServerDeviceEvents";
import Distributor from "../distributor/Distributor";
import ClientRouterEvents from "../types/ClientRouterEvents";
import Payloads from "../types/Payloads";
import getDistance from "../utils/getDistance";
import ServerRouterEvents from "../types/ServerRouterEvents";

const getAvailableRouter = (
  distributor: Distributor,
  type: string,
  preferredPosition?: { lat: number; lng: number }
): Promise<Router<ObjectId>> =>
  distributor.readRoutersAvailableForType(type)
    .then((routers) => {
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

const runManagementJob = (distributor: Distributor) => {
  distributor.readUnmanagedStages()
    .then(stages => stages.map(stage => {
      if( stage.videoTypeManaged ) {

      }
      if( stage.audioTypeManaged ) {
        getAvailableRouter(stage.audioType)
          .then(router => distributor.sendToRouter(router._id, ServerRouterEvents.ManageStage, {

          } as Payloads.ManageStage))
      }
    }))
}

const handleSocketRouterConnection = (
  distributor: Distributor,
  socket: ITeckosSocket,
  initialRouter: Router<ObjectId> & { _id: undefined }
) => {
  /*
  When router is connecting:
  - Register router in database with types
  - For all types: get unmanaged stages for this type and request management of stage

  When stage is created:
  - For each type: get router that supports type AND matches location as close as possible, then let
    the resulting router manage stage
   */


  socket.on(ClientRouterEvents.StageManaged, (payload: Payloads.StageManaged) =>
    distributor.updateStageAsRouter(new ObjectId(payload._id), payload));

  socket.on(ClientRouterEvents.ChangeStage, (payload: Payloads.ChangeStage) =>
    distributor.updateStageAsRouter(new ObjectId(payload._id), payload));

  socket.on(ClientRouterEvents.StageUnManaged, (payload: Payloads.StageUnManaged) => {
    //TODO: Remove router from database, but also trigger a remanagement by other routers
  };

  socket.on(ClientRouterEvents.ChangeRouter, (payload: Payloads.ChangeRouter) => {
    //TODO: Mostly the counter of capabilities for a type changed
    // Expect supported types not changing during a websocket session, so no implementation necessary here
  });

  // Find all stages without server and assign them to this router
  const unassignedStages = await this._database.readStagesWithoutRouter(
    initialRouter.availableOVSlots
  );

  distributor.on(ServerDeviceEvents.StageAdded, stage => {

  });
  distributor.on(ServerDeviceEvents.StageChanged, update => {

  });
  distributor.on(ServerDeviceEvents.StageRemoved, id => {

  });

  return distributor.createRouter(initialRouter)
    .then(router => socket.emit(ServerDeviceEvents.Ready, router));
};
export default handleSocketRouterConnection;
