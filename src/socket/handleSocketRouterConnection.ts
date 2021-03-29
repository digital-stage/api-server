import { ITeckosSocket } from "teckos";
import { ObjectId } from "mongodb";
import Router from "../types/model/Router";
import Distributor from "../distributor/Distributor";
import ClientRouterEvents from "../types/ClientRouterEvents";
import useLogger from "../useLogger";
import ServerRouterEvents from "../types/ServerRouterEvents";
import ClientRouterPayloads from "../types/ClientRouterPayloads";

const { error, trace } = useLogger("socket:router");

const handleSocketRouterConnection = async (
  distributor: Distributor,
  socket: ITeckosSocket,
  initialRouter: Omit<Router<ObjectId>, "_id">
): Promise<Router<ObjectId>> => {
  /*
  When router is connecting:
  - Register router in database with types
  - For all types: get unmanaged stages for this type and request management of stage

  When stage is created:
  - For each type: get router that supports type AND matches location as close as possible, then let
    the resulting router manage stage
   */
  const router: Router<ObjectId> = await distributor.createRouter(
    initialRouter
  );

  socket.on("disconnect", () => {
    trace(`${router._id} disconnected`);
    return distributor.deleteRouter(router._id).catch((e) => error(e));
  });

  socket.on(
    ClientRouterEvents.StageServed,
    (payload: ClientRouterPayloads.StageServed) => {
      trace(`${router._id}: ${ClientRouterEvents.StageServed}(${payload})`);
      return distributor.updateStage(new ObjectId(payload._id), payload);
    }
  );

  socket.on(
    ClientRouterEvents.StageUnServed,
    (payload: ClientRouterPayloads.StageUnServed) => {
      trace(`${router._id}: ${ClientRouterEvents.StageUnServed}(${payload})`);
      const stageId = new ObjectId(payload.stageId);
      if (payload.kind === "audio") {
        return distributor
          .updateStage(stageId, {
            audioRouter: null,
          })
          .catch((e) => error(e));
      }
      if (payload.kind === "video") {
        return distributor
          .updateStage(stageId, {
            videoRouter: null,
          })
          .catch((e) => error(e));
      }
      if (payload.kind === "both") {
        return distributor
          .updateStage(stageId, {
            videoRouter: null,
            audioRouter: null,
          })
          .catch((e) => error(e));
      }
      throw new Error("Unknown kind of media type unserved");
    }
  );

  socket.on(
    ClientRouterEvents.ChangeRouter,
    (payload: ClientRouterPayloads.ChangeRouter) => {
      trace(`${router._id}: ${ClientRouterEvents.ChangeRouter}(${payload})`);
      // TODO: Mostly the counter of capabilities for a type changed
      // Expect supported types not changing during a websocket session, so no implementation necessary here
      const routerId = new ObjectId(payload._id);
      return distributor.updateRouter(routerId, {
        ...payload,
        _id: undefined,
      });
    }
  );

  socket.emit(ServerRouterEvents.Ready, router);
  trace(
    `Registered socket handler for router ${router._id} at socket ${socket.id}`
  );
  return router;
};

export default handleSocketRouterConnection;
