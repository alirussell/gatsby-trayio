"use strict";

const path = require(`path`);

const slash = require(`slash`);

const mime = require(`mime`);

const isRelative = require(`is-relative`);

const isRelativeUrl = require(`is-relative-url`);

const _require = require(`../utils/get-value-at`),
      getValueAt = _require.getValueAt;

const isFile = (nodeStore, field, relativePath) => {
  const filePath = getFilePath(nodeStore, field, relativePath);
  if (!filePath) return false;
  const filePathExists = nodeStore.getNodesByType(`File`).some(node => node.absolutePath === filePath);
  return filePathExists;
};

module.exports = {
  isFile
};

const getFirstValueAt = (node, selector) => {
  let value = getValueAt(node, selector);

  while (Array.isArray(value)) {
    value = value[0];
  }

  return value;
};

const getFilePath = (nodeStore, field, relativePath) => {
  const _field$split = field.split(`.`),
        typeName = _field$split[0],
        selector = _field$split.slice(1);

  if (typeName === `File`) return null;
  const looksLikeFile = !path.isAbsolute(relativePath) && mime.getType(relativePath) !== null && // FIXME: Do we need all of this?
  mime.getType(relativePath) !== `application/x-msdownload` && isRelative(relativePath) && isRelativeUrl(relativePath);
  if (!looksLikeFile) return null;
  const normalizedPath = slash(relativePath);
  const node = nodeStore.getNodesByType(typeName).find(node => getFirstValueAt(node, selector) === normalizedPath);
  return node ? getAbsolutePath(nodeStore, node, normalizedPath) : null;
};

const getAbsolutePath = (nodeStore, node, relativePath) => {
  const dir = getBaseDir(nodeStore, node);
  const withDir = withBaseDir(dir);
  return dir ? Array.isArray(relativePath) ? relativePath.map(withDir) : withDir(relativePath) : null;
};

const getBaseDir = (nodeStore, node) => {
  if (node) {
    const _ref = findAncestorNode(nodeStore, node, node => node.internal.type === `File`) || {},
          dir = _ref.dir;

    return dir;
  }

  return null;
};

const withBaseDir = dir => p => path.posix.join(dir, slash(p));

const findAncestorNode = (nodeStore, childNode, predicate) => {
  let node = childNode;

  do {
    if (predicate(node)) {
      return node;
    }
  } while (node = node.parent && nodeStore.getNode(node.parent));

  return null;
};
//# sourceMappingURL=is-file.js.map