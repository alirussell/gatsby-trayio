"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

const url = require(`url`);

const glob = require(`glob`);

const fs = require(`fs`);

const openurl = require(`better-opn`);

const chokidar = require(`chokidar`);

const express = require(`express`);

const graphqlHTTP = require(`express-graphql`);

const graphqlPlayground = require(`graphql-playground-middleware-express`).default;

const _require = require(`graphql`),
      formatError = _require.formatError;

const request = require(`request`);

const rl = require(`readline`);

const webpack = require(`webpack`);

const webpackConfig = require(`../utils/webpack.config`);

const bootstrap = require(`../bootstrap`);

const _require2 = require(`../redux`),
      store = _require2.store,
      emitter = _require2.emitter;

const _require3 = require(`../utils/get-static-dir`),
      syncStaticDir = _require3.syncStaticDir;

const buildHTML = require(`./build-html`);

const _require4 = require(`../utils/path`),
      withBasePath = _require4.withBasePath;

const report = require(`gatsby-cli/lib/reporter`);

const launchEditor = require(`react-dev-utils/launchEditor`);

const formatWebpackMessages = require(`react-dev-utils/formatWebpackMessages`);

const chalk = require(`chalk`);

const address = require(`address`);

const withResolverContext = require(`../schema/context`);

const sourceNodes = require(`../utils/source-nodes`);

const websocketManager = require(`../utils/websocket-manager`);

const getSslCert = require(`../utils/get-ssl-cert`);

const slash = require(`slash`);

const _require5 = require(`../utils/tracer`),
      initTracer = _require5.initTracer;

const apiRunnerNode = require(`../utils/api-runner-node`);

const telemetry = require(`gatsby-telemetry`);

const queryRunner = require(`../query`);

const queryWatcher = require(`../query/query-watcher`);

const writeJsRequires = require(`../bootstrap/write-js-requires`);

const db = require(`../db`);

const detectPortInUseAndPrompt = require(`../utils/detect-port-in-use-and-prompt`);

const onExit = require(`signal-exit`); // const isInteractive = process.stdout.isTTY
// Watch the static directory and copy files to public as they're added or
// changed. Wait 10 seconds so copying doesn't interfere with the regular
// bootstrap.


setTimeout(() => {
  syncStaticDir();
}, 10000);
const rlInterface = rl.createInterface({
  input: process.stdin,
  output: process.stdout
}); // Quit immediately on hearing ctrl-c

rlInterface.on(`SIGINT`, () => {
  process.exit();
});

function startQueryListener() {
  const processing = new Set();
  const waiting = new Map();
  const betterQueueOptions = {
    priority: (job, cb) => {
      const activePaths = Array.from(websocketManager.activePaths.values());

      if (job.id && activePaths.includes(job.id)) {
        cb(null, 10);
      } else {
        cb(null, 1);
      }
    },
    merge: (oldTask, newTask, cb) => {
      cb(null, newTask);
    },
    filter: (job, cb) => {
      if (processing.has(job.id)) {
        waiting.set(job.id, job);
        cb(`already running`);
      } else {
        cb(null, job);
      }
    }
  };

  const postHandler =
  /*#__PURE__*/
  function () {
    var _ref = (0, _asyncToGenerator2.default)(function* ({
      queryJob,
      result
    }) {
      if (queryJob.isPage) {
        websocketManager.emitPageData(Object.assign({}, result, {
          id: queryJob.id
        }));
      } else {
        websocketManager.emitStaticQueryData(Object.assign({}, result, {
          id: queryJob.id
        }));
      }

      processing.delete(queryJob.id);

      if (waiting.has(queryJob.id)) {
        queue.push(waiting.get(queryJob.id));
        waiting.delete(queryJob.id);
      }
    });

    return function postHandler(_x) {
      return _ref.apply(this, arguments);
    };
  }();

  const queue = queryRunner.createQueue({
    postHandler,
    betterQueueOptions
  });
  queryRunner.startListener(queue);
}

const runPageQueries =
/*#__PURE__*/
function () {
  var _ref2 = (0, _asyncToGenerator2.default)(function* (queryIds) {
    let activity = report.activityTimer(`run page queries`);
    activity.start();
    yield queryRunner.processPageQueries(queryIds, {
      activity
    });
    activity.end();

    require(`../redux/actions`).boundActionCreators.setProgramStatus(`BOOTSTRAP_QUERY_RUNNING_FINISHED`);
  });

  return function runPageQueries(_x2) {
    return _ref2.apply(this, arguments);
  };
}();

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

onExit(() => {
  telemetry.trackCli(`DEVELOP_STOP`);
});

function startServer(_x3) {
  return _startServer.apply(this, arguments);
}

function _startServer() {
  _startServer = (0, _asyncToGenerator2.default)(function* (program) {
    const directory = program.directory;
    const directoryPath = withBasePath(directory);

    const createIndexHtml =
    /*#__PURE__*/
    function () {
      var _ref6 = (0, _asyncToGenerator2.default)(function* () {
        try {
          yield buildHTML.buildRenderer(program, `develop-html`);
          yield buildHTML.buildPages({
            program,
            pagePaths: [`/`]
          });
        } catch (err) {
          if (err.name !== `WebpackError`) {
            report.panic(err);
            return;
          }

          report.panic(report.stripIndent`
          There was an error compiling the html.js component for the development server.

          See our docs page on debugging HTML builds for help https://gatsby.dev/debug-html
        `, err);
        }
      });

      return function createIndexHtml() {
        return _ref6.apply(this, arguments);
      };
    }();

    yield createIndexHtml();
    const devConfig = yield webpackConfig(program, directory, `develop`, program.port);
    const compiler = webpack(devConfig);
    /**
     * Set up the express app.
     **/

    const app = express();
    app.use(telemetry.expressMiddleware(`DEVELOP`));
    app.use(require(`webpack-hot-middleware`)(compiler, {
      log: false,
      path: `/__webpack_hmr`,
      heartbeat: 10 * 1000
    }));

    if (process.env.GATSBY_GRAPHQL_IDE === `playground`) {
      app.get(`/___graphql`, graphqlPlayground({
        endpoint: `/___graphql`
      }), () => {});
    }

    app.use(`/___graphql`, graphqlHTTP(() => {
      const schema = store.getState().schema;
      return {
        schema,
        graphiql: process.env.GATSBY_GRAPHQL_IDE === `playground` ? false : true,
        context: withResolverContext({}, schema),

        formatError(err) {
          return Object.assign({}, formatError(err), {
            stack: err.stack ? err.stack.split(`\n`) : []
          });
        }

      };
    }));

    const mapToObject = map => {
      const obj = {};

      for (var _iterator = map, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
        var _ref7;

        if (_isArray) {
          if (_i >= _iterator.length) break;
          _ref7 = _iterator[_i++];
        } else {
          _i = _iterator.next();
          if (_i.done) break;
          _ref7 = _i.value;
        }

        let _ref8 = _ref7,
            key = _ref8[0],
            value = _ref8[1];
        obj[key] = value;
      }

      return obj;
    };

    app.get(`/___pages`, (req, res) => {
      res.json(mapToObject(store.getState().pages));
    }); // Allow requests from any origin. Avoids CORS issues when using the `--host` flag.

    app.use((req, res, next) => {
      res.header(`Access-Control-Allow-Origin`, `*`);
      res.header(`Access-Control-Allow-Headers`, `Origin, X-Requested-With, Content-Type, Accept`);
      next();
    });
    /**
     * Refresh external data sources.
     * This behavior is disabled by default, but the ENABLE_REFRESH_ENDPOINT env var enables it
     * If no GATSBY_REFRESH_TOKEN env var is available, then no Authorization header is required
     **/

    app.post(`/__refresh`, (req, res) => {
      const enableRefresh = process.env.ENABLE_GATSBY_REFRESH_ENDPOINT;
      const refreshToken = process.env.GATSBY_REFRESH_TOKEN;
      const authorizedRefresh = !refreshToken || req.headers.authorization === refreshToken;

      if (enableRefresh && authorizedRefresh) {
        console.log(`Refreshing source data`);
        sourceNodes();
      }

      res.end();
    });
    app.get(`/__open-stack-frame-in-editor`, (req, res) => {
      launchEditor(req.query.fileName, req.query.lineNumber);
      res.end();
    }); // Disable directory indexing i.e. serving index.html from a directory.
    // This can lead to serving stale html files during development.
    //
    // We serve by default an empty index.html that sets up the dev environment.

    app.use(require(`./develop-static`)(`public`, {
      index: false
    }));
    app.use(require(`webpack-dev-middleware`)(compiler, {
      logLevel: `trace`,
      publicPath: devConfig.output.publicPath,
      stats: `errors-only`
    })); // Expose access to app for advanced use cases

    const developMiddleware = store.getState().config.developMiddleware;

    if (developMiddleware) {
      developMiddleware(app);
    } // Set up API proxy.


    const proxy = store.getState().config.proxy;

    if (proxy) {
      const prefix = proxy.prefix,
            url = proxy.url;
      app.use(`${prefix}/*`, (req, res) => {
        const proxiedUrl = url + req.originalUrl;
        req.pipe(request(proxiedUrl).on(`error`, err => {
          const message = `Error when trying to proxy request "${req.originalUrl}" to "${proxiedUrl}"`;
          report.error(message, err);
          res.status(500).end();
        })).pipe(res);
      });
    }

    yield apiRunnerNode(`onCreateDevServer`, {
      app
    }); // Render an HTML page and serve it.

    app.use((req, res, next) => {
      res.sendFile(directoryPath(`public/index.html`), err => {
        if (err) {
          res.status(500).end();
        }
      });
    });
    /**
     * Set up the HTTP server and socket.io.
     **/

    let server = require(`http`).Server(app); // If a SSL cert exists in program, use it with `createServer`.


    if (program.ssl) {
      server = require(`https`).createServer(program.ssl, app);
    }

    websocketManager.init({
      server,
      directory: program.directory
    });
    const socket = websocketManager.getSocket();
    const listener = server.listen(program.port, program.host, err => {
      if (err) {
        if (err.code === `EADDRINUSE`) {
          // eslint-disable-next-line max-len
          report.panic(`Unable to start Gatsby on port ${program.port} as there's already a process listening on that port.`);
          return;
        }

        report.panic(`There was a problem starting the development server`, err);
      }
    }); // Register watcher that rebuilds index.html every time html.js changes.

    const watchGlobs = [`src/html.js`, `plugins/**/gatsby-ssr.js`].map(path => slash(directoryPath(path)));
    chokidar.watch(watchGlobs).on(`change`,
    /*#__PURE__*/
    (0, _asyncToGenerator2.default)(function* () {
      yield createIndexHtml();
      socket.to(`clients`).emit(`reload`);
    }));
    return [compiler, listener];
  });
  return _startServer.apply(this, arguments);
}

module.exports =
/*#__PURE__*/
function () {
  var _ref3 = (0, _asyncToGenerator2.default)(function* (program) {
    initTracer(program.openTracingConfigFile);
    telemetry.trackCli(`DEVELOP_START`);
    telemetry.startBackgroundUpdate();
    const port = typeof program.port === `string` ? parseInt(program.port, 10) : program.port; // In order to enable custom ssl, --cert-file --key-file and -https flags must all be
    // used together

    if ((program[`cert-file`] || program[`key-file`]) && !program.https) {
      report.panic(`for custom ssl --https, --cert-file, and --key-file must be used together`);
    } // Check if https is enabled, then create or get SSL cert.
    // Certs are named after `name` inside the project's package.json.
    // Scoped names are converted from @npm/package-name to npm--package-name


    if (program.https) {
      program.ssl = yield getSslCert({
        name: program.sitePackageJson.name.replace(`@`, ``).replace(`/`, `--`),
        certFile: program[`cert-file`],
        keyFile: program[`key-file`],
        directory: program.directory
      });
    }

    program.port = yield new Promise(resolve => {
      detectPortInUseAndPrompt(port, rlInterface, newPort => {
        resolve(newPort);
      });
    });

    function prepareUrls(protocol, host, port) {
      const formatUrl = hostname => url.format({
        protocol,
        hostname,
        port,
        pathname: `/`
      });

      const prettyPrintUrl = hostname => url.format({
        protocol,
        hostname,
        port: chalk.bold(port),
        pathname: `/`
      });

      const isUnspecifiedHost = host === `0.0.0.0` || host === `::`;
      let lanUrlForConfig, lanUrlForTerminal;

      if (isUnspecifiedHost) {
        try {
          // This can only return an IPv4 address
          lanUrlForConfig = address.ip();

          if (lanUrlForConfig) {
            // Check if the address is a private ip
            // https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
            if (/^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(lanUrlForConfig)) {
              // Address is private, format it for later use
              lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig);
            } else {
              // Address is not private, so we will discard it
              lanUrlForConfig = undefined;
            }
          }
        } catch (_e) {// ignored
        }
      } // TODO collect errors (GraphQL + Webpack) in Redux so we
      // can clear terminal and print them out on every compile.
      // Borrow pretty printing code from webpack plugin.


      const localUrlForTerminal = prettyPrintUrl(host);
      const localUrlForBrowser = formatUrl(host);
      return {
        lanUrlForConfig,
        lanUrlForTerminal,
        localUrlForTerminal,
        localUrlForBrowser
      };
    }

    function printInstructions(appName, urls, useYarn) {
      console.log();
      console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
      console.log();

      if (urls.lanUrlForTerminal) {
        console.log(`  ${chalk.bold(`Local:`)}            ${urls.localUrlForTerminal}`);
        console.log(`  ${chalk.bold(`On Your Network:`)}  ${urls.lanUrlForTerminal}`);
      } else {
        console.log(`  ${urls.localUrlForTerminal}`);
      }

      console.log();
      console.log(`View ${process.env.GATSBY_GRAPHQL_IDE === `playground` ? `the GraphQL Playground` : `GraphiQL`}, an in-browser IDE, to explore your site's data and schema`);
      console.log();
      console.log(`  ${urls.localUrlForTerminal}___graphql`);
      console.log();
      console.log(`Note that the development build is not optimized.`);
      console.log(`To create a production build, use ` + `${chalk.cyan(`npm run build`)}`);
      console.log();
    }

    function printDeprecationWarnings() {
      const deprecatedApis = [`boundActionCreators`, `pathContext`];
      const fixMap = {
        boundActionCreators: {
          newName: `actions`,
          docsLink: `https://gatsby.dev/boundActionCreators`
        },
        pathContext: {
          newName: `pageContext`,
          docsLink: `https://gatsby.dev/pathContext`
        }
      };
      const deprecatedLocations = {};
      deprecatedApis.forEach(api => deprecatedLocations[api] = []);
      glob.sync(`{,!(node_modules|public)/**/}*.js`, {
        nodir: true
      }).forEach(file => {
        const fileText = fs.readFileSync(file);
        const matchingApis = deprecatedApis.filter(api => fileText.indexOf(api) !== -1);
        matchingApis.forEach(api => deprecatedLocations[api].push(file));
      });
      deprecatedApis.forEach(api => {
        if (deprecatedLocations[api].length) {
          console.log(`%s %s %s %s`, chalk.cyan(api), chalk.yellow(`is deprecated. Please use`), chalk.cyan(fixMap[api].newName), chalk.yellow(`instead. For migration instructions, see ${fixMap[api].docsLink}\nCheck the following files:`));
          console.log();
          deprecatedLocations[api].forEach(file => console.log(file));
          console.log();
        }
      });
    } // Start bootstrap process.


    const _ref4 = yield bootstrap(program),
          graphqlRunner = _ref4.graphqlRunner; // Start the createPages hot reloader.


    require(`../bootstrap/page-hot-reloader`)(graphqlRunner);

    const queryIds = queryRunner.calcBootstrapDirtyQueryIds(store.getState());

    const _queryRunner$groupQue = queryRunner.groupQueryIds(queryIds),
          staticQueryIds = _queryRunner$groupQue.staticQueryIds,
          pageQueryIds = _queryRunner$groupQue.pageQueryIds;

    let activity = report.activityTimer(`run static queries`);
    activity.start();
    yield queryRunner.processStaticQueries(staticQueryIds, {
      activity
    });
    activity.end();
    yield runPageQueries(pageQueryIds);
    yield waitJobsFinished();
    yield writeJsRequires.startPageListener();
    yield db.saveState();
    db.startAutosave();
    startQueryListener();
    queryWatcher.startWatchDeletePage();

    const _ref5 = yield startServer(program),
          compiler = _ref5[0];

    let isFirstCompile = true; // "done" event fires when Webpack has finished recompiling the bundle.
    // Whether or not you have warnings or errors, you will get this event.

    compiler.hooks.done.tapAsync(`print getsby instructions`, (stats, done) => {
      // We have switched off the default Webpack output in WebpackDevServer
      // options so we are going to "massage" the warnings and errors and present
      // them in a readable focused way.
      const messages = formatWebpackMessages(stats.toJson({}, true));
      const urls = prepareUrls(program.ssl ? `https` : `http`, program.host, program.port);
      const isSuccessful = !messages.errors.length; // if (isSuccessful) {
      // console.log(chalk.green(`Compiled successfully!`))
      // }
      // if (isSuccessful && (isInteractive || isFirstCompile)) {

      if (isSuccessful && isFirstCompile) {
        printInstructions(program.sitePackageJson.name, urls, program.useYarn);
        printDeprecationWarnings();

        if (program.open) {
          Promise.resolve(openurl(urls.localUrlForBrowser)).catch(err => console.log(`${chalk.yellow(`warn`)} Browser not opened because no browser was found`));
        }
      }

      isFirstCompile = false; // If errors exist, only show errors.
      // if (messages.errors.length) {
      // // Only keep the first error. Others are often indicative
      // // of the same problem, but confuse the reader with noise.
      // if (messages.errors.length > 1) {
      // messages.errors.length = 1
      // }
      // console.log(chalk.red("Failed to compile.\n"))
      // console.log(messages.errors.join("\n\n"))
      // return
      // }
      // Show warnings if no errors were found.
      // if (messages.warnings.length) {
      // console.log(chalk.yellow("Compiled with warnings.\n"))
      // console.log(messages.warnings.join("\n\n"))
      // // Teach some ESLint tricks.
      // console.log(
      // "\nSearch for the " +
      // chalk.underline(chalk.yellow("keywords")) +
      // " to learn more about each warning."
      // )
      // console.log(
      // "To ignore, add " +
      // chalk.cyan("// eslint-disable-next-line") +
      // " to the line before.\n"
      // )
      // }

      done();
    });
  });

  return function (_x4) {
    return _ref3.apply(this, arguments);
  };
}();
//# sourceMappingURL=develop.js.map