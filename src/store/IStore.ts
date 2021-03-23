export const TypeNames = {
    User: "u",
    Router: "r",
    Device: "d",
    Stage: "s",
    Group: "g",
    CustomGroupPosition: "cgp",
    CustomGroupVolume: "cgv",
    StageMember: "sm",
    CustomStageMemberPosition: "csmp",
    CustomStageMemberVolume: "csmv",
    RemoteAudioTrack: "a",
    CustomRemoteAudioTrackPosition: "cap",
    CustomRemoteAudioTrackVolume: "cav",
    RemoteVideoTrack: "v",
    SoundCard: "sc",
    //ChatMessage: "c",
    ChatMessage: "c",
}

interface IStore {
    /*
    // we could implement this explicit like:
    createUser: (initial: Partial<User>) => Promise<User>;
    readUser: (id: UserId) => Promise<User>;
    updateUser: (update: Partial<User>) => Promise<any>;
    deleteUser: (id: UserId) => Promise<any>;
    */

    /* Or lazy like: :-D */
    create: <T>(type: string, initial: Partial<T>) => Promise<T>;
    read: <T>(type: string, id: string, filter?: Partial<T>) => Promise<T>;
    readOne: <T>(type: string, filter: Partial<T>) => Promise<T>;
    readMany: <T>(type: string, filter: Partial<T>) => Promise<T[]>;
    update: <T>(type: string, id: string, update: Partial<T>, filter?: Partial<T>) => Promise<void>;
    upsert: <T>(type: string, initial: Partial<T>, filter: Partial<T>) => Promise<Partial<T> & { id: string, created: boolean }[]>;
    delete: <T>(type: string, id: string, filter?: Partial<T>) => Promise<string>;
    deleteMany: <T>(type: string, filter?: Partial<T>) => Promise<string[]>;

    //updateByValue: <T>(type: string, update: Partial<T>, ...selectors: [{ [key: string]: string }]) => Promise<void>;
}

export default IStore;
