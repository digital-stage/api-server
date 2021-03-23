// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  readOneId: <T>(type: string, filter: Partial<T>) => Promise<string>;
  readMany: <T>(type: string, filter: Partial<T>) => Promise<T[]>;
  readManyIds: <T>(type: string, filter: Partial<T>) => Promise<string[]>;
  update: <T>(
    type: string,
    id: string,
    update: Partial<T>,
    filter?: Partial<T>
  ) => Promise<void>;
  upsert: <T>(
    type: string,
    initial: Partial<T>,
    filter: Partial<T>
  ) => Promise<Partial<T> & { id: string; created: boolean }[]>;
  delete: <T>(type: string, id: string, filter?: Partial<T>) => Promise<string>;
  deleteMany: <T>(type: string, filter?: Partial<T>) => Promise<string[]>;

  // updateByValue: <T>(type: string, update: Partial<T>, ...selectors: [{ [key: string]: string }]) => Promise<void>;
}
