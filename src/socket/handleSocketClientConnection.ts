import ITeckosSocket from "teckos/lib/types/ITeckosSocket";
import { ObjectId } from "mongodb";
import User from "../types/model/User";
import Device from "../types/model/Device";
import ClientDeviceEvents from "../types/ClientDeviceEvents";
import Payloads from "../types/Payloads";
import useLogger from "../useLogger";
import Distributor from "../distributor/Distributor";

const { error } = useLogger("handleClientSocket");

const handleSocketClientConnection = (
  distributor: Distributor,
  socket: ITeckosSocket,
  user: User<ObjectId>,
  initialDevice: Partial<Device>
) => {
  // TODO: Replace all payloads with any and type the necessary fields manually

  // USER
  socket.on(ClientDeviceEvents.ChangeUser, (payload: Payloads.ChangeUser) =>
    distributor
      .updateUser(new ObjectId(user._id), payload)
      .catch((e) => error(e))
  );
  // DEVICE
  socket.on(ClientDeviceEvents.ChangeDevice, (payload: Payloads.ChangeDevice) =>
    distributor
      .updateDevice(new ObjectId(user._id), new ObjectId(payload._id), payload)
      .catch((e) => error(e))
  );
  // STAGE
  socket.on(ClientDeviceEvents.CreateStage, (payload: Payloads.CreateStage) =>
    distributor
      .createStage(new ObjectId(user._id), payload)
      .catch((e) => error(e))
  );
  socket.on(ClientDeviceEvents.ChangeStage, (payload: Payloads.ChangeStage) =>
    distributor
      .updateStage(new ObjectId(user._id), new ObjectId(payload._id), payload)
      .catch((e) => error(e))
  );
  socket.on(ClientDeviceEvents.RemoveStage, (payload: Payloads.RemoveStage) =>
    distributor
      .deleteStage(new ObjectId(user._id), new ObjectId(payload))
      .catch((e) => error(e))
  );
};
export default handleSocketClientConnection;
