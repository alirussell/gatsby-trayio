"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

var _path = require("../utils/path");

const _ = require(`lodash`);

const fs = require(`fs-extra`);

const _require = require(`../redux`),
      store = _require.store,
      emitter = _require.emitter;

const writeAll =
/*#__PURE__*/
function () {
  var _ref = (0, _asyncToGenerator2.default)(function* (state) {
    let program = state.program,
        pages = state.pages,
        matchPaths = state.matchPaths;
    pages = [...pages.values()];
    let components = [];
    pages.forEach(p => {
      components.push({
        componentChunkName: p.componentChunkName,
        component: p.component
      });
    });
    components = _.uniqBy(components, c => c.componentChunkName); // Create file with sync requires of components/json files.

    let syncRequires = `const { hot } = require("react-hot-loader/root")

// prefer default export if available
const preferDefault = m => m && m.default || m
\n\n`;
    syncRequires += `exports.components = {\n${components.map(c => `  "${c.componentChunkName}": hot(preferDefault(require("${(0, _path.joinPath)(c.component)}")))`).join(`,\n`)}
}\n\n`; // Create file with async requires of components/json files.

    let asyncRequires = `// prefer default export if available
const preferDefault = m => m && m.default || m
\n`;
    asyncRequires += `exports.components = {\n${components.map(c => `  "${c.componentChunkName}": () => import("${(0, _path.joinPath)(c.component)}" /* webpackChunkName: "${c.componentChunkName}" */)`).join(`,\n`)}
}\n\n`;

    const writeAndMove = (file, data) => {
      const destination = (0, _path.joinPath)(program.directory, `.cache`, file);
      const tmp = `${destination}.${Date.now()}`;
      return fs.writeFile(tmp, data).then(() => fs.move(tmp, destination, {
        overwrite: true
      }));
    };

    return yield Promise.all([// writeAndMove(`pages.json`, JSON.stringify(pagesData, null, 4)),
    writeAndMove(`sync-requires.js`, syncRequires), writeAndMove(`async-requires.js`, asyncRequires), writeAndMove(`match-paths.json`, JSON.stringify(matchPaths, null, 4))]);
  });

  return function writeAll(_x) {
    return _ref.apply(this, arguments);
  };
}();

const debouncedWriteAll = _.debounce(() => writeAll(store.getState()), 500, {
  leading: true
});

const startPageListener = () => {
  emitter.on(`CREATE_PAGE`, () => {
    debouncedWriteAll();
  });
  emitter.on(`CREATE_PAGE_END`, () => {
    debouncedWriteAll();
  });
  emitter.on(`DELETE_PAGE`, () => {
    debouncedWriteAll();
  });
  emitter.on(`DELETE_PAGE_BY_PATH`, () => {
    debouncedWriteAll();
  });
};

module.exports = {
  writeAll,
  startPageListener
};
//# sourceMappingURL=write-js-requires.js.map