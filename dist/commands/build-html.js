"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

const webpack = require(`webpack`);

const fs = require(`fs`);

const webpackConfig = require(`../utils/webpack.config`);

const _require = require(`gatsby-cli/lib/reporter/errors`),
      createErrorFromString = _require.createErrorFromString;

const renderHTMLQueue = require(`../utils/html-renderer-queue`);

const telemetry = require(`gatsby-telemetry`);

const runWebpack = compilerConfig => new Promise((resolve, reject) => {
  webpack(compilerConfig).run((e, stats) => {
    if (e) {
      reject(e);
    } else {
      resolve(stats);
    }
  });
});

const doBuildRenderer =
/*#__PURE__*/
function () {
  var _ref = (0, _asyncToGenerator2.default)(function* (program, webpackConfig) {
    const directory = program.directory;
    const stats = yield runWebpack(webpackConfig);
    const outputFile = `${directory}/public/render-page.js`;

    if (stats.hasErrors()) {
      let webpackErrors = stats.toJson().errors.filter(Boolean);
      const error = webpackErrors.length ? createErrorFromString(webpackErrors[0], `${outputFile}.map`) : new Error(`There was an issue while building the site: ` + `\n\n${stats.toString()}`);
      throw error;
    }
  });

  return function doBuildRenderer(_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();

const buildRenderer =
/*#__PURE__*/
function () {
  var _ref2 = (0, _asyncToGenerator2.default)(function* (program, stage) {
    const directory = program.directory;
    const config = yield webpackConfig(program, directory, stage, null);
    yield doBuildRenderer(program, config);
  });

  return function buildRenderer(_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
}();

function buildPages(_x5) {
  return _buildPages.apply(this, arguments);
}

function _buildPages() {
  _buildPages = (0, _asyncToGenerator2.default)(function* ({
    program,
    pagePaths,
    activity
  }) {
    const directory = program.directory;
    telemetry.decorateEvent(`BUILD_END`, {
      siteMeasurements: {
        pagesCount: pagePaths.length
      }
    });
    const outputFile = `${directory}/public/render-page.js`;

    try {
      yield renderHTMLQueue(outputFile, pagePaths, activity);

      try {
        yield fs.unlink(outputFile);
        yield fs.unlink(`${outputFile}.map`);
      } catch (e) {// This function will fail on Windows with no further consequences.
      }
    } catch (e) {
      const prettyError = createErrorFromString(e.stack, `${outputFile}.map`);
      prettyError.context = e.context;
      throw prettyError;
    }
  });
  return _buildPages.apply(this, arguments);
}

module.exports = {
  buildRenderer,
  buildPages
};
//# sourceMappingURL=build-html.js.map