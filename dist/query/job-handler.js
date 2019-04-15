"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

var _graphql = require("graphql");

const fs = require(`fs-extra`);

const path = require(`path`);

const report = require(`gatsby-cli/lib/reporter`);

const _require = require(`../redux/actions`),
      boundActionCreators = _require.boundActionCreators;

const _require2 = require(`../redux`),
      store = _require2.store;

const withResolverContext = require(`../schema/context`);

const _require3 = require(`./utils`),
      formatErrorDetails = _require3.formatErrorDetails;

const pageDataUtil = require(`../utils/page-data`);

const resultHashes = {};

const jobHandler =
/*#__PURE__*/
function () {
  var _ref = (0, _asyncToGenerator2.default)(function* ({
    queryJob
  }) {
    const _store$getState = store.getState(),
          schema = _store$getState.schema,
          program = _store$getState.program,
          pages = _store$getState.pages,
          webpackCompilationHash = _store$getState.webpackCompilationHash;

    const graphql = (query, context) => (0, _graphql.graphql)(schema, query, context, withResolverContext(context, schema), context); // Run query


    let result; // Nothing to do if the query doesn't exist.

    if (!queryJob.query || queryJob.query === ``) {
      result = {};
    } else {
      result = yield graphql(queryJob.query, queryJob.context);
    } // If there's a graphql error then log the error. If we're building, also
    // quit.


    if (result && result.errors) {
      const errorDetails = new Map();
      errorDetails.set(`Errors`, result.errors || []);

      if (queryJob.isPage) {
        errorDetails.set(`URL path`, queryJob.context.path);
        errorDetails.set(`Context`, JSON.stringify(queryJob.context.context, null, 2));
      }

      errorDetails.set(`Plugin`, queryJob.pluginCreatorId || `none`);
      errorDetails.set(`Query`, queryJob.query);
      report.panicOnBuild(`
The GraphQL query from ${queryJob.componentPath} failed.

${formatErrorDetails(errorDetails)}`);
    } // Add the page context onto the results.


    if (queryJob && queryJob.isPage) {
      result[`pageContext`] = Object.assign({}, queryJob.context);
    } // Delete internal data from pageContext


    if (result.pageContext) {
      delete result.pageContext.path;
      delete result.pageContext.internalComponentName;
      delete result.pageContext.component;
      delete result.pageContext.componentChunkName;
      delete result.pageContext.updatedAt;
      delete result.pageContext.pluginCreator___NODE;
      delete result.pageContext.pluginCreatorId;
      delete result.pageContext.componentPath;
      delete result.pageContext.context;
    }

    const resultJSON = JSON.stringify(result);

    const resultHash = require(`crypto`).createHash(`sha1`).update(resultJSON).digest(`base64`);

    if (resultHashes[queryJob.id] !== resultHash) {
      resultHashes[queryJob.id] = resultHash;
      const publicDir = path.join(program.directory, `public`);

      if (queryJob.isPage) {
        const page = pages.get(queryJob.id);
        yield pageDataUtil.write({
          publicDir
        }, page, result, webpackCompilationHash);
      } else {
        const staticDir = path.join(publicDir, `static`);
        const resultPath = path.join(staticDir, `d`, `${queryJob.hash}.json`);
        yield fs.outputFile(resultPath, resultJSON);
      }
    } // Send event that the page query finished.


    boundActionCreators.pageQueryRun({
      path: queryJob.id,
      componentPath: queryJob.componentPath,
      isPage: queryJob.isPage
    });
    return result;
  });

  return function jobHandler(_x) {
    return _ref.apply(this, arguments);
  };
}();

module.exports = jobHandler;
//# sourceMappingURL=job-handler.js.map