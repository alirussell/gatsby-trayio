"use strict";

/** *
 * Jobs of this module
 * - Maintain the list of components in the Redux store. So monitor new components
 *   and add/remove components.
 * - Watch components for query changes and extract these and update the store.
 * - Ensure all page queries are run as part of bootstrap and report back when
 *   this is done
 * - Whenever a query changes, re-run all pages that rely on this query.
 ***/
const _ = require(`lodash`);

const chokidar = require(`chokidar`);

const path = require(`path`);

const slash = require(`slash`);

const _require = require(`../redux/`),
      store = _require.store,
      emitter = _require.emitter;

const _require2 = require(`../redux/actions`),
      boundActionCreators = _require2.boundActionCreators;

const queryCompiler = require(`./query-compiler`).default;

const report = require(`gatsby-cli/lib/reporter`);

const queryRunner = require(`./index`);

const debug = require(`debug`)(`gatsby:query-watcher`);

const getQueriesSnapshot = () => {
  const state = store.getState();
  const snapshot = {
    components: new Map(state.components),
    staticQueryComponents: new Map(state.staticQueryComponents)
  };
  return snapshot;
};

const handleComponentsWithRemovedQueries = ({
  components,
  staticQueryComponents
}, queries) => {
  // If a component had static query and it doesn't have it
  // anymore - update the store
  staticQueryComponents.forEach(c => {
    if (c.query !== `` && !queries.has(c.componentPath)) {
      debug(`Static query was removed from ${c.componentPath}`);
      store.dispatch({
        type: `REMOVE_STATIC_QUERY`,
        payload: c.id
      });
      boundActionCreators.deleteComponentsDependencies([c.id]);
    }
  });
};

const handleQuery = ({
  components,
  staticQueryComponents
}, query, component) => {
  // If this is a static query
  // Add action / reducer + watch staticquery files
  if (query.isStaticQuery) {
    const oldQuery = staticQueryComponents.get(query.id);
    const isNewQuery = !oldQuery; // Compare query text because text is compiled query with any attached
    // fragments and we want to rerun queries if fragments are edited.
    // Compare hash because hash is used for identyfing query and
    // passing data to component in development. Hash can change if user will
    // format query text, but it doesn't mean that compiled text will change.

    if (isNewQuery || oldQuery.hash !== query.hash || oldQuery.text !== query.text) {
      boundActionCreators.replaceStaticQuery({
        id: query.id,
        name: query.name,
        componentPath: query.path,
        query: query.text,
        hash: query.hash
      });
      debug(`Static query in ${component} ${isNewQuery ? `was added` : `has changed`}.`);
      boundActionCreators.deleteComponentsDependencies([query.id]);
      queryRunner.enqueueExtractedQueryId(query.id);
    }

    return true;
  }

  return false;
};

const updateStateAndRunQueries = isFirstRun => {
  const snapshot = getQueriesSnapshot();
  return queryCompiler().then(queries => {
    // If there's an error while extracting queries, the queryCompiler returns false
    // or zero results.
    // Yeah, should probably be an error but don't feel like threading the error
    // all the way here.
    if (!queries || queries.size === 0) {
      return null;
    }

    handleComponentsWithRemovedQueries(snapshot, queries); // Run action for each component

    const components = snapshot.components;
    components.forEach(c => {
      var _queries$get;

      return boundActionCreators.queryExtracted({
        componentPath: c.componentPath,
        query: ((_queries$get = queries.get(c.componentPath)) === null || _queries$get === void 0 ? void 0 : _queries$get.text) || ``
      });
    });
    let queriesWillNotRun = false;
    queries.forEach((query, component) => {
      const queryWillRun = handleQuery(snapshot, query, component);

      if (queryWillRun) {
        watchComponent(component); // Check if this is a page component.
        // If it is and this is our first run during bootstrap,
        // show a warning about having a query in a non-page component.
      } else if (isFirstRun && !snapshot.components.has(component)) {
        report.warn(`The GraphQL query in the non-page component "${component}" will not be run.`);
        queriesWillNotRun = true;
      }
    });

    if (queriesWillNotRun) {
      report.log(report.stripIndent`

        Exported queries are only executed for Page components. It's possible you're
        trying to create pages in your gatsby-node.js and that's failing for some
        reason.

        If the failing component(s) is a regular component and not intended to be a page
        component, you generally want to use a <StaticQuery> (https://gatsbyjs.org/docs/static-query)
        instead of exporting a page query.

        If you're more experienced with GraphQL, you can also export GraphQL
        fragments from components and compose the fragments in the Page component
        query and pass data down into the child component — http://graphql.org/learn/queries/#fragments

      `);
    }

    queryRunner.runQueries();
    return null;
  });
};
/**
 * Removes components templates that aren't used by any page from redux store.
 */


const clearInactiveComponents = () => {
  const _store$getState = store.getState(),
        components = _store$getState.components,
        pages = _store$getState.pages;

  const activeTemplates = new Set();
  pages.forEach(page => {
    // Set will guarantee uniqeness of entires
    activeTemplates.add(slash(page.component));
  });
  components.forEach(component => {
    if (!activeTemplates.has(component.componentPath)) {
      debug(`${component.componentPath} component was removed because it isn't used by any page`);
      store.dispatch({
        type: `REMOVE_TEMPLATE_COMPONENT`,
        payload: component
      });
    }
  });
};

exports.extractQueries = () => {
  // Remove template components that point to not existing page templates.
  // We need to do this, because components data is cached and there might
  // be changes applied when development server isn't running. This is needed
  // only in initial run, because during development state will be adjusted.
  clearInactiveComponents();
  return updateStateAndRunQueries(true).then(() => {
    // During development start watching files to recompile & run
    // queries on the fly.
    if (process.env.NODE_ENV !== `production`) {
      watch(store.getState().program.directory);
    }
  });
};

const queueQueriesForPageComponent = componentPath => {
  const pages = getPagesForComponent(componentPath); // Remove page data dependencies before re-running queries because
  // the changing of the query could have changed the data dependencies.
  // Re-running the queries will add back data dependencies.

  boundActionCreators.deleteComponentsDependencies(pages.map(p => p.path || p.id));
  pages.forEach(page => queryRunner.enqueueExtractedQueryId(page.path));
  queryRunner.runQueries();
};

const runQueryForPage = path => {
  queryRunner.enqueueExtractedQueryId(path);
  queryRunner.runQueries();
};

exports.queueQueriesForPageComponent = queueQueriesForPageComponent;
exports.runQueryForPage = runQueryForPage;

const getPagesForComponent = componentPath => {
  const state = store.getState();
  return [...state.pages.values()].filter(p => p.componentPath === componentPath);
};

const filesToWatch = new Set();
let watcher;

const watchComponent = componentPath => {
  // We don't start watching until mid-way through the bootstrap so ignore
  // new components being added until then. This doesn't affect anything as
  // when extractQueries is called from bootstrap, we make sure that all
  // components are being watched.
  if (process.env.NODE_ENV !== `production` && !filesToWatch.has(componentPath)) {
    filesToWatch.add(componentPath);

    if (watcher) {
      watcher.add(componentPath);
    }
  }
};

const debounceCompile = _.debounce(() => {
  updateStateAndRunQueries();
}, 100);

exports.watchComponent = watchComponent;
exports.debounceCompile = debounceCompile;

const watch = rootDir => {
  if (watcher) return;
  watcher = chokidar.watch(slash(path.join(rootDir, `/src/**/*.{js,jsx,ts,tsx}`))).on(`change`, path => {
    debounceCompile();
  });
  filesToWatch.forEach(filePath => watcher.add(filePath));
};

exports.startWatchDeletePage = () => {
  emitter.on(`DELETE_PAGE`, action => {
    const componentPath = slash(action.payload.component);

    const _store$getState2 = store.getState(),
          pages = _store$getState2.pages;

    let otherPageWithTemplateExists = false;

    for (var _iterator = pages.values(), _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
      var _ref;

      if (_isArray) {
        if (_i >= _iterator.length) break;
        _ref = _iterator[_i++];
      } else {
        _i = _iterator.next();
        if (_i.done) break;
        _ref = _i.value;
      }

      let page = _ref;

      if (slash(page.component) === componentPath) {
        otherPageWithTemplateExists = true;
        break;
      }
    }

    if (!otherPageWithTemplateExists) {
      store.dispatch({
        type: `REMOVE_TEMPLATE_COMPONENT`,
        payload: {
          componentPath
        }
      });
    }
  });
};
//# sourceMappingURL=query-watcher.js.map