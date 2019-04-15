"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

const _ = require(`lodash`);

const path = require(`path`);

const report = require(`gatsby-cli/lib/reporter`);

const buildHTML = require(`./build-html`);

const buildProductionBundle = require(`./build-javascript`);

const bootstrap = require(`../bootstrap`);

const apiRunnerNode = require(`../utils/api-runner-node`);

const _require = require(`../utils/get-static-dir`),
      copyStaticDirs = _require.copyStaticDirs;

const _require2 = require(`../utils/tracer`),
      initTracer = _require2.initTracer,
      stopTracer = _require2.stopTracer;

const chalk = require(`chalk`);

const tracer = require(`opentracing`).globalTracer();

const signalExit = require(`signal-exit`);

const telemetry = require(`gatsby-telemetry`);

const queryRunner = require(`../query`);

const _require3 = require(`../redux`),
      store = _require3.store,
      emitter = _require3.emitter;

const db = require(`../db`);

const pageDataUtil = require(`../utils/page-data`);

function reportFailure(msg, err) {
  report.log(``);
  report.panic(msg, err);
}

const handleChangedCompilationHash =
/*#__PURE__*/
function () {
  var _ref = (0, _asyncToGenerator2.default)(function* (state, pageQueryIds, newHash) {
    const publicDir = path.join(state.program.directory, `public`);

    const stalePaths = _.difference([...state.pages.keys()], pageQueryIds);

    yield pageDataUtil.rewriteCompilationHashes({
      publicDir
    }, stalePaths, newHash);
    store.dispatch({
      type: `SET_WEBPACK_COMPILATION_HASH`,
      payload: newHash
    });
  });

  return function handleChangedCompilationHash(_x, _x2, _x3) {
    return _ref.apply(this, arguments);
  };
}();

module.exports =
/*#__PURE__*/
function () {
  var _build = (0, _asyncToGenerator2.default)(function* (program) {
    let activity;
    initTracer(program.openTracingConfigFile);
    telemetry.trackCli(`BUILD_START`);
    signalExit(() => {
      telemetry.trackCli(`BUILD_END`);
    });
    const buildSpan = tracer.startSpan(`build`);
    buildSpan.setTag(`directory`, program.directory);

    const _ref2 = yield bootstrap(Object.assign({}, program, {
      parentSpan: buildSpan
    })),
          graphqlRunner = _ref2.graphqlRunner;

    const queryIds = queryRunner.calcBootstrapDirtyQueryIds(store.getState());

    const _queryRunner$groupQue = queryRunner.groupQueryIds(queryIds),
          staticQueryIds = _queryRunner$groupQue.staticQueryIds,
          pageQueryIds = _queryRunner$groupQue.pageQueryIds;

    activity = report.activityTimer(`run static queries`, {
      parentSpan: buildSpan
    });
    activity.start();
    yield queryRunner.processStaticQueries(staticQueryIds, {
      activity
    });
    activity.end();
    yield apiRunnerNode(`onPreBuild`, {
      graphql: graphqlRunner,
      parentSpan: buildSpan
    }); // Copy files from the static directory to
    // an equivalent static directory within public.

    copyStaticDirs();
    activity = report.activityTimer(`Building production JavaScript and CSS bundles`, {
      parentSpan: buildSpan
    });
    activity.start();
    const stats = yield buildProductionBundle(program).catch(err => {
      reportFailure(`Generating JavaScript bundles failed`, err);
    });
    activity.end();
    const webpackCompilationHash = stats.hash;

    if (webpackCompilationHash !== store.getState().webpackCompilationHash) {
      activity = report.activityTimer(`Rewriting compilation hashes`, {
        parentSpan: buildSpan
      });
      activity.start();
      yield handleChangedCompilationHash(store.getState(), pageQueryIds, webpackCompilationHash);
      activity.end();
    }

    activity = report.activityTimer(`run page queries`);
    activity.start();
    yield queryRunner.processPageQueries(pageQueryIds, {
      activity
    });
    activity.end();

    const waitJobsFinished = () => new Promise((resolve, reject) => {
      const onEndJob = () => {
        if (store.getState().jobs.active.length === 0) {
          resolve();
          emitter.off(`END_JOB`, onEndJob);
        }
      };

      emitter.on(`END_JOB`, onEndJob);
      onEndJob();
    });

    yield waitJobsFinished();
    yield db.saveState();

    require(`../redux/actions`).boundActionCreators.setProgramStatus(`BOOTSTRAP_QUERY_RUNNING_FINISHED`);

    activity = report.activityTimer(`Building static HTML for pages`, {
      parentSpan: buildSpan
    });
    activity.start();

    try {
      yield buildHTML.buildRenderer(program, `build-html`);
      const pagePaths = [...store.getState().pages.keys()];
      yield buildHTML.buildPages({
        program,
        pagePaths,
        activity
      });
    } catch (err) {
      reportFailure(report.stripIndent`
        Building static HTML failed${err.context && err.context.path ? ` for path "${chalk.bold(err.context.path)}"` : ``}

        See our docs page on debugging HTML builds for help https://gatsby.dev/debug-html
      `, err);
    }

    activity.end();
    yield apiRunnerNode(`onPostBuild`, {
      graphql: graphqlRunner,
      parentSpan: buildSpan
    });
    report.info(`Done building in ${process.uptime()} sec`);
    buildSpan.finish();
    yield stopTracer();
  });

  return function build(_x4) {
    return _build.apply(this, arguments);
  };
}();
//# sourceMappingURL=build.js.map