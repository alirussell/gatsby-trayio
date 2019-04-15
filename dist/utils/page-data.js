"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

const fs = require(`fs-extra`);

const path = require(`path`);

const Queue = require(`better-queue`);

const getFilePath = ({
  publicDir
}, pagePath) => {
  const fixedPagePath = pagePath === `/` ? `index` : pagePath;
  return path.join(publicDir, `page-data`, fixedPagePath, `page-data.json`);
};

const write =
/*#__PURE__*/
function () {
  var _ref = (0, _asyncToGenerator2.default)(function* ({
    publicDir
  }, page, result, webpackCompilationHash) {
    const filePath = getFilePath({
      publicDir
    }, page.path);
    const body = Object.assign({
      componentChunkName: page.componentChunkName,
      path: page.path,
      compilationHash: webpackCompilationHash
    }, result);
    yield fs.outputFile(filePath, JSON.stringify(body));
  });

  return function write(_x, _x2, _x3, _x4) {
    return _ref.apply(this, arguments);
  };
}();

const read =
/*#__PURE__*/
function () {
  var _ref2 = (0, _asyncToGenerator2.default)(function* ({
    publicDir
  }, pagePath) {
    const filePath = getFilePath({
      publicDir
    }, pagePath);
    const rawPageData = yield fs.readFile(filePath);
    return JSON.parse(rawPageData);
  });

  return function read(_x5, _x6) {
    return _ref2.apply(this, arguments);
  };
}();

const updateCompilationHash =
/*#__PURE__*/
function () {
  var _ref3 = (0, _asyncToGenerator2.default)(function* ({
    publicDir
  }, pagePath, webpackCompilationHash) {
    const filePath = getFilePath({
      publicDir
    }, pagePath);
    const pageData = yield read({
      publicDir
    }, pagePath);
    pageData.compilationHash = webpackCompilationHash;
    yield fs.outputFile(filePath, JSON.stringify(pageData));
  });

  return function updateCompilationHash(_x7, _x8, _x9) {
    return _ref3.apply(this, arguments);
  };
}(); // TODO We should move this to a worker model (like html page
// rendering) for performance


const rewriteCompilationHashes = ({
  publicDir
}, pagePaths, compilationHash) => {
  if (pagePaths.length === 0) {
    return Promise.resolve();
  }

  const queueOptions = {
    concurrent: 4
  };

  const handler =
  /*#__PURE__*/
  function () {
    var _ref4 = (0, _asyncToGenerator2.default)(function* (pagePath, callback) {
      yield updateCompilationHash({
        publicDir
      }, pagePath, compilationHash);
      callback(null);
    });

    return function handler(_x10, _x11) {
      return _ref4.apply(this, arguments);
    };
  }();

  const q = new Queue(handler, queueOptions);
  const drainPromise = new Promise(resolve => {
    q.once(`drain`, () => resolve());
  });
  pagePaths.forEach(pagePath => q.push(pagePath));
  return drainPromise;
};

module.exports = {
  write,
  read,
  updateCompilationHash,
  rewriteCompilationHashes
};
//# sourceMappingURL=page-data.js.map