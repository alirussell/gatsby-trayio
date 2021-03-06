"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

const path = require(`path`);

const debug = require(`debug`)(`gatsby:component-shadowing`);

const fs = require(`fs`);

const _ = require(`lodash`);

module.exports = class GatsbyThemeComponentShadowingResolverPlugin {
  constructor({
    projectRoot,
    themes
  }) {
    (0, _defineProperty2.default)(this, "cache", {});
    debug(`themes list`, themes);
    this.themes = themes;
    this.projectRoot = projectRoot;
  }

  apply(resolver) {
    resolver.plugin(`relative`, (request, callback) => {
      // find out which theme's src/components dir we're requiring from
      const allMatchingThemes = this.themes.filter(name => request.path.includes(path.join(name, `src`))); // The same theme can be included twice in the themes list causing multiple
      // matches. This case should only be counted as a single match for that theme.

      const matchingThemes = _.uniq(allMatchingThemes); // 0 matching themes happens a lot for paths we don't want to handle
      // > 1 matching theme means we have a path like
      //   `gatsby-theme-blog/src/components/gatsby-theme-something/src/components`


      if (matchingThemes.length > 1) {
        throw new Error(`Gatsby can't differentiate between themes ${matchingThemes.join(` and `)} for path ${request.path}`);
      }

      if (matchingThemes.length !== 1) {
        return callback();
      } // theme is the theme package from which we're requiring the relative component


      const theme = matchingThemes[0]; // get the location of the component relative to src/

      const _request$path$split = request.path.split(path.join(theme, `src`)),
            component = _request$path$split[1];
      /**
       * if someone adds
       * ```
       * modules: [path.resolve(__dirname, 'src'), 'node_modules'],
       * ```
       * to the webpack config, `issuer` is `null`, so we skip this check.
       * note that it's probably a bad idea in general to set `modules`
       * like this in a theme, but we also shouldn't artificially break
       * people that do.
       */


      if (request.context.issuer) {
        const issuerExtension = path.extname(request.context.issuer);

        if (request.context.issuer.slice(0, -issuerExtension.length).endsWith(component)) {
          return resolver.doResolve(`describedRelative`, request, null, {}, callback);
        }
      }

      const builtComponentPath = this.resolveComponentPath({
        matchingTheme: theme,
        themes: this.themes,
        component,
        projectRoot: this.projectRoot
      });
      return resolver.doResolve(`describedRelative`, Object.assign({}, request, {
        path: builtComponentPath || request.path
      }), null, {}, callback);
    });
  } // check the cache, the user's project, and finally the theme files


  resolveComponentPath({
    matchingTheme: theme,
    themes: ogThemes,
    component,
    projectRoot
  }) {
    // don't include matching theme in possible shadowing paths
    const themes = ogThemes.filter(t => t !== theme);

    if (!this.cache[`${theme}-${component}`]) {
      this.cache[`${theme}-${component}`] = [path.join(path.resolve(`.`), `src`, theme)].concat(Array.from(themes).reverse().map(aTheme => path.join(path.dirname(require.resolve(aTheme)), `src`, theme))).map(dir => path.join(dir, component)).find(possibleComponentPath => {
        debug(`possibleComponentPath`, possibleComponentPath);
        let dir;

        try {
          // we use fs/path instead of require.resolve to work with
          // TypeScript and alternate syntaxes
          dir = fs.readdirSync(path.dirname(possibleComponentPath));
        } catch (e) {
          return false;
        }

        const exists = dir.map(filepath => {
          const ext = path.extname(filepath);
          const filenameWithoutExtension = path.basename(filepath, ext);
          return filenameWithoutExtension;
        }).includes(path.basename(possibleComponentPath, path.extname(possibleComponentPath)));
        return exists;
      });
    }

    return this.cache[`${theme}-${component}`];
  }

};
//# sourceMappingURL=index.js.map