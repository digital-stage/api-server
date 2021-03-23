import { ITeckosSocket } from "teckos";

const sendToDevice = (socket: ITeckosSocket, event: string, payload?: any) => {
  return socket.emit(event, payload);
};

export default sendToDevice;
