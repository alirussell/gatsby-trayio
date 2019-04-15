"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

const Queue = require(`better-queue`);

const FastMemoryStore = require(`./better-queue-custom-store`);

const jobHandler = require(`./job-handler`);

const makeBaseOptions = () => {
  return {
    concurrent: 4,
    store: FastMemoryStore()
  };
};

const defaultPostHandler = ({
  queryJob,
  result
}) => result;

const create = ({
  postHandler = defaultPostHandler,
  betterQueueOptions = {}
} = {}) => {
  const queueOptions = Object.assign({}, makeBaseOptions, betterQueueOptions);
  const queue = new Queue(
  /*#__PURE__*/
  function () {
    var _ref = (0, _asyncToGenerator2.default)(function* (queryJob, callback) {
      try {
        const result = yield jobHandler({
          queryJob
        });
        postHandler({
          queryJob,
          result
        });
        callback(null, result);
      } catch (err) {
        console.log(`Error running queryRunner`, err);
        callback(err);
      }
    });

    return function (_x, _x2) {
      return _ref.apply(this, arguments);
    };
  }(), queueOptions);
  return queue;
};

module.exports = {
  create
};
//# sourceMappingURL=query-queue.js.map