"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

const _ = require(`lodash`);

const slash = require(`slash`);

const fs = require(`fs-extra`);

const md5File = require(`md5-file/promise`);

const crypto = require(`crypto`);

const del = require(`del`);

const path = require(`path`);

const Promise = require(`bluebird`);

const telemetry = require(`gatsby-telemetry`);

const apiRunnerNode = require(`../utils/api-runner-node`);

const getBrowserslist = require(`../utils/browserslist`);

const _require = require(`graphql`),
      graphql = _require.graphql;

const _require2 = require(`../redux`),
      store = _require2.store,
      emitter = _require2.emitter;

const loadPlugins = require(`./load-plugins`);

const loadThemes = require(`./load-themes`);

const report = require(`gatsby-cli/lib/reporter`);

const getConfigFile = require(`./get-config-file`);

const tracer = require(`opentracing`).globalTracer();

const preferDefault = require(`./prefer-default`);

const nodeTracking = require(`../db/node-tracking`);

const withResolverContext = require(`../schema/context`);

require(`../db`).startAutosave(); // Show stack trace on unhandled promises.


process.on(`unhandledRejection`, (reason, p) => {
  report.panic(reason);
});

const _require3 = require(`../query/query-watcher`),
      extractQueries = _require3.extractQueries;

const writeJsRequires = require(`./write-js-requires`);

const _require4 = require(`./redirects-writer`),
      writeRedirects = _require4.writeRedirects; // Override console.log to add the source file + line number.
// Useful for debugging if you lose a console.log somewhere.
// Otherwise leave commented out.
// require(`./log-line-function`)


module.exports =
/*#__PURE__*/
function () {
  var _ref = (0, _asyncToGenerator2.default)(function* (args) {
    const spanArgs = args.parentSpan ? {
      childOf: args.parentSpan
    } : {};
    const bootstrapSpan = tracer.startSpan(`bootstrap`, spanArgs); // Start plugin runner which listens to the store
    // and invokes Gatsby API based on actions.

    require(`../redux/plugin-runner`);

    const directory = slash(args.directory);
    const program = Object.assign({}, args, {
      browserslist: getBrowserslist(directory),
      // Fix program directory path for windows env.
      directory
    });
    store.dispatch({
      type: `SET_PROGRAM`,
      payload: program
    }); // Try opening the site's gatsby-config.js file.

    let activity = report.activityTimer(`open and validate gatsby-configs`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    let config = yield preferDefault(getConfigFile(program.directory, `gatsby-config`)); // theme gatsby configs can be functions or objects

    if (config && config.__experimentalThemes) {
      const themes = yield loadThemes(config);
      config = themes.config;
      store.dispatch({
        type: `SET_RESOLVED_THEMES`,
        payload: themes.themes
      });
    }

    if (config && config.polyfill) {
      report.warn(`Support for custom Promise polyfills has been removed in Gatsby v2. We only support Babel 7's new automatic polyfilling behavior.`);
    }

    store.dispatch({
      type: `SET_SITE_CONFIG`,
      payload: config
    });
    activity.end();
    activity = report.activityTimer(`load plugins`);
    activity.start();
    const flattenedPlugins = yield loadPlugins(config, program.directory);
    activity.end();
    telemetry.decorateEvent(`BUILD_END`, {
      plugins: flattenedPlugins.map(p => `${p.name}@${p.version}`)
    }); // onPreInit

    activity = report.activityTimer(`onPreInit`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield apiRunnerNode(`onPreInit`, {
      parentSpan: activity.span
    });
    activity.end(); // During builds, delete html and css files from the public directory as we don't want
    // deleted pages and styles from previous builds to stick around.

    if (process.env.NODE_ENV === `production`) {
      activity = report.activityTimer(`delete html and css files from previous builds`, {
        parentSpan: bootstrapSpan
      });
      activity.start();
      yield del([`public/*.{html,css}`, `public/**/*.{html,css}`, `!public/static`, `!public/static/**/*.{html,css}`]);
      activity.end();
    }

    activity = report.activityTimer(`initialize cache`);
    activity.start(); // Check if any plugins have been updated since our last run. If so
    // we delete the cache is there's likely been changes
    // since the previous run.
    //
    // We do this by creating a hash of all the version numbers of installed
    // plugins, the site's package.json, gatsby-config.js, and gatsby-node.js.
    // The last, gatsby-node.js, is important as many gatsby sites put important
    // logic in there e.g. generating slugs for custom pages.

    const pluginVersions = flattenedPlugins.map(p => p.version);
    const hashes = yield Promise.all([md5File(`package.json`), Promise.resolve(md5File(`${program.directory}/gatsby-config.js`).catch(() => {})), // ignore as this file isn't required),
    Promise.resolve(md5File(`${program.directory}/gatsby-node.js`).catch(() => {}))]);
    const pluginsHash = crypto.createHash(`md5`).update(JSON.stringify(pluginVersions.concat(hashes))).digest(`hex`);

    const _store$getState = store.getState(),
          status = _store$getState.status;

    const oldPluginsHash = status ? status.PLUGINS_HASH : ``; // Check if anything has changed. If it has, delete the site's .cache
    // directory and tell reducers to empty themselves.
    //
    // Also if the hash isn't there, then delete things just in case something
    // is weird.

    if (oldPluginsHash && pluginsHash !== oldPluginsHash) {
      report.info(report.stripIndent`
      One or more of your plugins have changed since the last time you ran Gatsby. As
      a precaution, we're deleting your site's cache to ensure there's not any stale
      data
    `);
    }

    const cacheDirectory = `${program.directory}/.cache`;

    if (!oldPluginsHash || pluginsHash !== oldPluginsHash) {
      try {
        // Attempt to empty dir if remove fails,
        // like when directory is mount point
        yield fs.remove(cacheDirectory).catch(() => fs.emptyDir(cacheDirectory));
      } catch (e) {
        report.error(`Failed to remove .cache files.`, e);
      } // Tell reducers to delete their data (the store will already have
      // been loaded from the file system cache).


      store.dispatch({
        type: `DELETE_CACHE`
      });
    } // Update the store with the new plugins hash.


    store.dispatch({
      type: `UPDATE_PLUGINS_HASH`,
      payload: pluginsHash
    }); // Now that we know the .cache directory is safe, initialize the cache
    // directory.

    yield fs.ensureDir(cacheDirectory); // Ensure the public/static directory

    yield fs.ensureDir(`${program.directory}/public/static`);
    activity.end();

    if (process.env.GATSBY_DB_NODES === `loki`) {
      const loki = require(`../db/loki`); // Start the nodes database (in memory loki js with interval disk
      // saves). If data was saved from a previous build, it will be
      // loaded here


      activity = report.activityTimer(`start nodes db`, {
        parentSpan: bootstrapSpan
      });
      activity.start();
      const dbSaveFile = `${cacheDirectory}/loki/loki.db`;

      try {
        yield loki.start({
          saveFile: dbSaveFile
        });
      } catch (e) {
        report.error(`Error starting DB. Perhaps try deleting ${path.dirname(dbSaveFile)}`);
      }

      activity.end();
    } // By now, our nodes database has been loaded, so ensure that we
    // have tracked all inline objects


    nodeTracking.trackDbNodes(); // Copy our site files to the root of the site.

    activity = report.activityTimer(`copy gatsby files`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    const srcDir = `${__dirname}/../../cache-dir`;
    const siteDir = cacheDirectory;
    const tryRequire = `${__dirname}/../utils/test-require-error.js`;

    try {
      yield fs.copy(srcDir, siteDir, {
        clobber: true
      });
      yield fs.copy(tryRequire, `${siteDir}/test-require-error.js`, {
        clobber: true
      });
      yield fs.ensureDirSync(`${cacheDirectory}/json`); // Ensure .cache/fragments exists and is empty. We want fragments to be
      // added on every run in response to data as fragments can only be added if
      // the data used to create the schema they're dependent on is available.

      yield fs.emptyDir(`${cacheDirectory}/fragments`);
    } catch (err) {
      report.panic(`Unable to copy site files to .cache`, err);
    } // Find plugins which implement gatsby-browser and gatsby-ssr and write
    // out api-runners for them.


    const hasAPIFile = (env, plugin) => {
      // The plugin loader has disabled SSR APIs for this plugin. Usually due to
      // multiple implementations of an API that can only be implemented once
      if (env === `ssr` && plugin.skipSSR === true) return undefined;
      const envAPIs = plugin[`${env}APIs`]; // Always include gatsby-browser.js files if they exists as they're
      // a handy place to include global styles and other global imports.

      try {
        if (env === `browser`) {
          return slash(require.resolve(path.join(plugin.resolve, `gatsby-${env}`)));
        }
      } catch (e) {// ignore
      }

      if (envAPIs && Array.isArray(envAPIs) && envAPIs.length > 0) {
        return slash(path.join(plugin.resolve, `gatsby-${env}`));
      }

      return undefined;
    };

    const ssrPlugins = _.filter(flattenedPlugins.map(plugin => {
      return {
        resolve: hasAPIFile(`ssr`, plugin),
        options: plugin.pluginOptions
      };
    }), plugin => plugin.resolve);

    const browserPlugins = _.filter(flattenedPlugins.map(plugin => {
      return {
        resolve: hasAPIFile(`browser`, plugin),
        options: plugin.pluginOptions
      };
    }), plugin => plugin.resolve);

    const browserPluginsRequires = browserPlugins.map(plugin => `{
      plugin: require('${plugin.resolve}'),
      options: ${JSON.stringify(plugin.options)},
    }`).join(`,`);
    const browserAPIRunner = `module.exports = [${browserPluginsRequires}]\n`;
    let sSRAPIRunner = ``;

    try {
      sSRAPIRunner = fs.readFileSync(`${siteDir}/api-runner-ssr.js`, `utf-8`);
    } catch (err) {
      report.panic(`Failed to read ${siteDir}/api-runner-ssr.js`, err);
    }

    const ssrPluginsRequires = ssrPlugins.map(plugin => `{
      plugin: require('${plugin.resolve}'),
      options: ${JSON.stringify(plugin.options)},
    }`).join(`,`);
    sSRAPIRunner = `var plugins = [${ssrPluginsRequires}]\n${sSRAPIRunner}`;
    fs.writeFileSync(`${siteDir}/api-runner-browser-plugins.js`, browserAPIRunner, `utf-8`);
    fs.writeFileSync(`${siteDir}/api-runner-ssr.js`, sSRAPIRunner, `utf-8`);
    activity.end();
    /**
     * Start the main bootstrap processes.
     */
    // onPreBootstrap

    activity = report.activityTimer(`onPreBootstrap`);
    activity.start();
    yield apiRunnerNode(`onPreBootstrap`);
    activity.end(); // Source nodes

    activity = report.activityTimer(`source and transform nodes`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield require(`../utils/source-nodes`)({
      parentSpan: activity.span
    });
    activity.end(); // Create Schema.

    activity = report.activityTimer(`building schema`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield require(`../schema`).build({
      parentSpan: activity.span
    });
    activity.end(); // Collect resolvable extensions and attach to program.

    const extensions = [`.mjs`, `.js`, `.jsx`, `.wasm`, `.json`]; // Change to this being an action and plugins implement `onPreBootstrap`
    // for adding extensions.

    const apiResults = yield apiRunnerNode(`resolvableExtensions`, {
      traceId: `initial-resolvableExtensions`,
      parentSpan: bootstrapSpan
    });
    store.dispatch({
      type: `SET_PROGRAM_EXTENSIONS`,
      payload: _.flattenDeep([extensions, apiResults])
    });

    const graphqlRunner = (query, context = {}) => {
      const schema = store.getState().schema;
      return graphql(schema, query, context, withResolverContext(context, schema), context);
    }; // Collect pages.


    activity = report.activityTimer(`createPages`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield apiRunnerNode(`createPages`, {
      graphql: graphqlRunner,
      traceId: `initial-createPages`,
      waitForCascadingActions: true,
      parentSpan: activity.span
    });
    activity.end(); // A variant on createPages for plugins that want to
    // have full control over adding/removing pages. The normal
    // "createPages" API is called every time (during development)
    // that data changes.

    activity = report.activityTimer(`createPagesStatefully`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield apiRunnerNode(`createPagesStatefully`, {
      graphql: graphqlRunner,
      traceId: `initial-createPagesStatefully`,
      waitForCascadingActions: true,
      parentSpan: activity.span
    });
    activity.end();
    activity = report.activityTimer(`onPreExtractQueries`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield apiRunnerNode(`onPreExtractQueries`, {
      parentSpan: activity.span
    });
    activity.end(); // Update Schema for SitePage.

    activity = report.activityTimer(`update schema`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield require(`../schema`).rebuildWithSitePage({
      parentSpan: activity.span
    });
    activity.end(); // Extract queries

    activity = report.activityTimer(`extract queries from components`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield extractQueries();
    activity.end();

    try {
      yield writeJsRequires.writeAll(store.getState());
    } catch (err) {
      report.panic(`Failed to write out page data`, err);
    }

    yield writeRedirects(); // onPostBootstrap

    activity = report.activityTimer(`onPostBootstrap`, {
      parentSpan: bootstrapSpan
    });
    activity.start();
    yield apiRunnerNode(`onPostBootstrap`, {
      parentSpan: activity.span
    });
    activity.end();
    report.log(``);
    report.info(`bootstrap finished - ${process.uptime()} s`);
    report.log(``);
    emitter.emit(`BOOTSTRAP_FINISHED`);

    require(`../redux/actions`).boundActionCreators.setProgramStatus(`BOOTSTRAP_FINISHED`);

    bootstrapSpan.finish();
    return {
      graphqlRunner
    };
  });

  return function (_x) {
    return _ref.apply(this, arguments);
  };
}();
//# sourceMappingURL=index.js.map