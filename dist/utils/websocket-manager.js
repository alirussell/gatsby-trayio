"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

const path = require(`path`);

const _require = require(`../redux`),
      store = _require.store;

const fs = require(`fs`);

/**
 * Get cached page query result for given page path.
 * @param {string} pagePath Path to a page.
 * @param {string} directory Root directory of current project.
 */
const getCachedPageData = (pagePath, directory) => {
  const fixedPagePath = pagePath === `/` ? `index` : pagePath;
  const filePath = path.join(directory, `public`, `page-data`, fixedPagePath, `page-data.json`);

  try {
    const fileResult = fs.readFileSync(filePath, `utf-8`);
    return Object.assign({}, JSON.parse(fileResult), {
      id: pagePath
    });
  } catch (err) {
    return null;
  }
};
/**
 * Get cached StaticQuery results for components that Gatsby didn't run query yet.
 * @param {QueryResultsMap} resultsMap Already stored results for queries that don't need to be read from files.
 * @param {string} directory Root directory of current project.
 */


const getCachedStaticQueryResults = (resultsMap, directory) => {
  const cachedStaticQueryResults = new Map();

  const _store$getState = store.getState(),
        staticQueryComponents = _store$getState.staticQueryComponents;

  staticQueryComponents.forEach(staticQueryComponent => {
    // Don't read from file if results were already passed from query runner
    if (resultsMap.has(staticQueryComponent.hash)) return;
    const filePath = path.join(directory, `public`, `static`, `d`, `${staticQueryComponent.hash}.json`);
    const fileResult = fs.readFileSync(filePath, `utf-8`);

    if (fileResult === `undefined`) {
      console.log(`Error loading a result for the StaticQuery in "${staticQueryComponent.componentPath}". Query was not run and no cached result was found.`);
      return;
    }

    const jsonResult = JSON.parse(fileResult);
    cachedStaticQueryResults.set(staticQueryComponent.hash, Object.assign({}, jsonResult, {
      id: staticQueryComponent.hash
    }));
  });
  return cachedStaticQueryResults;
};

const getRoomNameFromPath = path => `path-${path}`;

class WebsocketManager {
  constructor() {
    (0, _defineProperty2.default)(this, "pageResults", void 0);
    (0, _defineProperty2.default)(this, "staticQueryResults", void 0);
    (0, _defineProperty2.default)(this, "errors", void 0);
    (0, _defineProperty2.default)(this, "isInitialised", void 0);
    (0, _defineProperty2.default)(this, "activePaths", void 0);
    (0, _defineProperty2.default)(this, "programDir", void 0);
    this.isInitialised = false;
    this.activePaths = new Set();
    this.pageResults = new Map();
    this.staticQueryResults = new Map();
    this.errors = new Map(); // this.websocket
    // this.programDir

    this.init = this.init.bind(this);
    this.getSocket = this.getSocket.bind(this);
    this.emitPageData = this.emitPageData.bind(this);
    this.emitStaticQueryData = this.emitStaticQueryData.bind(this);
    this.emitError = this.emitError.bind(this);
  }

  init({
    server,
    directory
  }) {
    this.programDir = directory;
    const cachedStaticQueryResults = getCachedStaticQueryResults(this.staticQueryResults, this.programDir);
    this.staticQueryResults = new Map([...this.staticQueryResults, ...cachedStaticQueryResults]);
    this.websocket = require(`socket.io`)(server);
    this.websocket.on(`connection`, s => {
      let activePath = null; // Send already existing static query results

      this.staticQueryResults.forEach(result => {
        this.websocket.send({
          type: `staticQueryResult`,
          payload: result
        });
      });
      this.errors.forEach((message, errorID) => {
        this.websocket.send({
          type: `overlayError`,
          payload: {
            id: errorID,
            message
          }
        });
      });

      const leaveRoom = path => {
        s.leave(getRoomNameFromPath(path));
        const leftRoom = this.websocket.sockets.adapter.rooms[getRoomNameFromPath(path)];

        if (!leftRoom || leftRoom.length === 0) {
          this.activePaths.delete(path);
        }
      };

      const getDataForPath = path => {
        if (!this.pageResults.has(path)) {
          const result = getCachedPageData(path, this.programDir);

          if (result) {
            this.pageResults.set(path, result);
          } else {
            console.log(`Page not found`, path);
            return;
          }
        }

        this.websocket.send({
          type: `pageQueryResult`,
          why: `getDataForPath`,
          payload: this.pageResults.get(path)
        });
      };

      s.on(`getDataForPath`, getDataForPath);
      s.on(`registerPath`, path => {
        s.join(getRoomNameFromPath(path));
        activePath = path;
        this.activePaths.add(path);
      });
      s.on(`disconnect`, s => {
        leaveRoom(activePath);
      });
      s.on(`unregisterPath`, path => {
        leaveRoom(path);
      });
    });
    this.isInitialised = true;
  }

  getSocket() {
    return this.isInitialised && this.websocket;
  }

  emitStaticQueryData(data) {
    this.staticQueryResults.set(data.id, data);

    if (this.isInitialised) {
      this.websocket.send({
        type: `staticQueryResult`,
        payload: data
      });
    }
  }

  emitPageData(data) {
    this.pageResults.set(data.id, data);

    if (this.isInitialised) {
      this.websocket.send({
        type: `pageQueryResult`,
        payload: data
      });
    }
  }

  emitError(id, message) {
    if (message) {
      this.errors.set(id, message);
    } else {
      this.errors.delete(id);
    }

    if (this.isInitialised) {
      this.websocket.send({
        type: `overlayError`,
        payload: {
          id,
          message
        }
      });
    }
  }

}

const manager = new WebsocketManager();
module.exports = manager;
//# sourceMappingURL=websocket-manager.js.map