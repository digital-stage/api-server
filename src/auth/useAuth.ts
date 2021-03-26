import fetch from "node-fetch";
import { HttpRequest } from "teckos/uws";
import { ObjectId } from "mongodb";
import { AUTH_URL } from "../env";
import User from "../types/model/User";
import Distributor from "../distributor/Distributor";
import useLogger from "../useLogger";
import AuthUser from "./AuthUser";

const { trace, error } = useLogger("auth");

const getAuthUserByToken = (token: string): Promise<AuthUser> =>
  fetch(`${AUTH_URL}/profile`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  }).then((result) => {
    if (result.ok) {
      return result.json();
    }
    throw new Error(result.statusText);
  });

const useAuth = (distributor: Distributor) => {
  const getUserByToken = (reqToken: string): Promise<User<ObjectId>> => {
    let token = reqToken;
    if (reqToken.length > 7 && reqToken.substring(0, 7) === "Bearer ") {
      token = reqToken.substring(7);
    }
    return getAuthUserByToken(token)
      .then((authUser) =>
        distributor.readUserByUid(authUser._id).then((user) => {
          if (!user) {
            trace(`Creating new user ${authUser.name}`);
            return distributor
              .createUser({
                uid: authUser._id,
                name: authUser.name,
                avatarUrl: authUser.avatarUrl,
                canCreateStage: false,
              })
              .then((createdUser) => createdUser);
          }
          return user;
        })
      )
      .catch((e) => {
        error("Invalid token delivered");
        error(e);
        throw new Error("Invalid credentials");
      });
  };

  const authorizeHttpRequest = (req: HttpRequest): Promise<User<ObjectId>> => {
    const authorization: string = req.getHeader("authorization");
    if (!authorization) {
      throw new Error("Missing authorization");
    }
    if (!authorization.startsWith("Bearer ")) {
      throw new Error("Invalid authorization");
    }
    const token = authorization.substr(7);
    return getUserByToken(token);
  };

  return {
    getUserByToken,
    authorizeHttpRequest,
  };
};
export default useAuth;
