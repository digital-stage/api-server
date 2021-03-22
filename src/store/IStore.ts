interface IStore {
    createRouter(initial: Partial<Router>);
    readRouter(initial: Partial<Router>);
}

export default IStore;
