"use strict";

const Redux = require(`redux`);

const _ = require(`lodash`);

const fs = require(`fs-extra`);

const mitt = require(`mitt`);

const stringify = require(`json-stringify-safe`); // Create event emitter for actions


const emitter = mitt(); // Reducers

const reducers = require(`./reducers`);

const objectToMap = obj => {
  let map = new Map();
  Object.keys(obj).forEach(key => {
    map.set(key, obj[key]);
  });
  return map;
};

const mapToObject = map => {
  const obj = {};

  for (var _iterator = map, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
    var _ref;

    if (_isArray) {
      if (_i >= _iterator.length) break;
      _ref = _iterator[_i++];
    } else {
      _i = _iterator.next();
      if (_i.done) break;
      _ref = _i.value;
    }

    let _ref2 = _ref,
        key = _ref2[0],
        value = _ref2[1];
    obj[key] = value;
  }

  return obj;
}; // Read from cache the old node data.


let initialState = {};

try {
  const file = fs.readFileSync(`${process.cwd()}/.cache/redux-state.json`); // Apparently the file mocking in node-tracking-test.js
  // can override the file reading replacing the mocked string with
  // an already parsed object.

  if (Buffer.isBuffer(file) || typeof file === `string`) {
    initialState = JSON.parse(file);
  }

  if (initialState.staticQueryComponents) {
    initialState.staticQueryComponents = objectToMap(initialState.staticQueryComponents);
  }

  if (initialState.components) {
    initialState.components = objectToMap(initialState.components);
  }

  if (initialState.nodes) {
    initialState.nodes = objectToMap(initialState.nodes);
    initialState.nodesByType = new Map();
    initialState.nodes.forEach(node => {
      const type = node.internal.type;

      if (!initialState.nodesByType.has(type)) {
        initialState.nodesByType.set(type, new Map());
      }

      initialState.nodesByType.get(type).set(node.id, node);
    });
  }
} catch (e) {// ignore errors.
}

const store = Redux.createStore(Redux.combineReducers(Object.assign({}, reducers)), initialState, Redux.applyMiddleware(function multi({
  dispatch
}) {
  return next => action => Array.isArray(action) ? action.filter(Boolean).map(dispatch) : next(action);
})); // Persist state.

function saveState() {
  const state = store.getState();

  const pickedState = _.pick(state, [`nodes`, `status`, `componentDataDependencies`, `components`, `staticQueryComponents`, `webpackCompilationHash`]);

  pickedState.staticQueryComponents = mapToObject(pickedState.staticQueryComponents);
  pickedState.components = mapToObject(pickedState.components);
  pickedState.nodes = pickedState.nodes ? mapToObject(pickedState.nodes) : [];
  const stringified = stringify(pickedState, null, 2);
  return fs.writeFile(`${process.cwd()}/.cache/redux-state.json`, stringified);
}

exports.saveState = saveState;
store.subscribe(() => {
  const lastAction = store.getState().lastAction;
  emitter.emit(lastAction.type, lastAction);
});
/** Event emitter */

exports.emitter = emitter;
/** Redux store */

exports.store = store;
//# sourceMappingURL=index.js.map