"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

const systemPath = require(`path`);

const normalize = require(`normalize-path`);

const _ = require(`lodash`);

const _require = require(`graphql`),
      GraphQLList = _require.GraphQLList,
      getNullableType = _require.getNullableType,
      getNamedType = _require.getNamedType;

const _require2 = require(`./utils/get-value-at`),
      getValueAt = _require2.getValueAt;

const findMany = typeName => ({
  args,
  context,
  info
}) => context.nodeModel.runQuery({
  query: args,
  firstOnly: false,
  type: info.schema.getType(typeName)
}, {
  path: context.path,
  connectionType: typeName
});

const findOne = typeName => ({
  args,
  context,
  info
}) => context.nodeModel.runQuery({
  query: {
    filter: args
  },
  firstOnly: true,
  type: info.schema.getType(typeName)
}, {
  path: context.path
});

const findManyPaginated = typeName =>
/*#__PURE__*/
function () {
  var _ref = (0, _asyncToGenerator2.default)(function* (rp) {
    const result = yield findMany(typeName)(rp);
    return paginate(result, {
      skip: rp.args.skip,
      limit: rp.args.limit
    });
  });

  return function (_x) {
    return _ref.apply(this, arguments);
  };
}();

const distinct = (source, args, context, info) => {
  const field = args.field;
  const edges = source.edges;
  const values = edges.reduce((acc, {
    node
  }) => {
    const value = getValueAt(node, field);
    return value != null ? acc.concat(value instanceof Date ? value.toISOString() : value) : acc;
  }, []);
  return Array.from(new Set(values)).sort();
};

const group = (source, args, context, info) => {
  const field = args.field;
  const edges = source.edges;
  const groupedResults = edges.reduce((acc, {
    node
  }) => {
    const value = getValueAt(node, field);
    const values = Array.isArray(value) ? value : [value];
    values.filter(value => value != null).forEach(value => {
      const key = value instanceof Date ? value.toISOString() : value;
      acc[key] = (acc[key] || []).concat(node);
    });
    return acc;
  }, {});
  return Object.keys(groupedResults).sort().reduce((acc, fieldValue) => {
    acc.push(Object.assign({}, paginate(groupedResults[fieldValue], args), {
      field,
      fieldValue
    }));
    return acc;
  }, []);
};

const paginate = (results = [], {
  skip = 0,
  limit
}) => {
  if (results === null) {
    results = [];
  }

  const count = results.length;
  const items = results.slice(skip, limit && skip + limit);
  const hasNextPage = skip + limit < count;
  return {
    totalCount: items.length,
    edges: items.map((item, i, arr) => {
      return {
        node: item,
        next: arr[i + 1],
        previous: arr[i - 1]
      };
    }),
    nodes: items,
    pageInfo: {
      hasNextPage
    }
  };
};

const link = ({
  by,
  from
}) =>
/*#__PURE__*/
function () {
  var _ref2 = (0, _asyncToGenerator2.default)(function* (source, args, context, info) {
    const fieldValue = source && source[from || info.fieldName];
    if (fieldValue == null || _.isPlainObject(fieldValue)) return fieldValue;

    if (Array.isArray(fieldValue) && (fieldValue[0] == null || _.isPlainObject(fieldValue[0]))) {
      return fieldValue;
    }

    const returnType = getNullableType(info.returnType);
    const type = getNamedType(returnType);

    if (by === `id`) {
      if (Array.isArray(fieldValue)) {
        return context.nodeModel.getNodesByIds({
          ids: fieldValue,
          type: type
        }, {
          path: context.path
        });
      } else {
        return context.nodeModel.getNodeById({
          id: fieldValue,
          type: type
        }, {
          path: context.path
        });
      }
    }

    const equals = value => {
      return {
        eq: value
      };
    };

    const oneOf = value => {
      return {
        in: value
      };
    };

    const operator = Array.isArray(fieldValue) ? oneOf : equals;
    args.filter = by.split(`.`).reduceRight((acc, key, i, {
      length
    }) => {
      return {
        [key]: i === length - 1 ? operator(acc) : acc
      };
    }, fieldValue);
    return context.nodeModel.runQuery({
      query: args,
      firstOnly: !(returnType instanceof GraphQLList),
      type
    }, {
      path: context.path
    });
  });

  return function (_x2, _x3, _x4, _x5) {
    return _ref2.apply(this, arguments);
  };
}();

const fileByPath = (source, args, context, info) => {
  const fieldValue = source && source[info.fieldName];
  if (fieldValue == null || _.isPlainObject(fieldValue)) return fieldValue;

  if (Array.isArray(fieldValue) && (fieldValue[0] == null || _.isPlainObject(fieldValue[0]))) {
    return fieldValue;
  }

  const isArray = getNullableType(info.returnType) instanceof GraphQLList;

  const findLinkedFileNode =
  /*#__PURE__*/
  function () {
    var _ref3 = (0, _asyncToGenerator2.default)(function* (relativePath) {
      // Use the parent File node to create the absolute path to
      // the linked file.
      const fileLinkPath = normalize(systemPath.resolve(parentFileNode.dir, relativePath)); // Use that path to find the linked File node.

      const linkedFileNode = _.find((yield context.nodeModel.getAllNodes({
        type: `File`
      })), n => n.absolutePath === fileLinkPath);

      return linkedFileNode;
    });

    return function findLinkedFileNode(_x6) {
      return _ref3.apply(this, arguments);
    };
  }(); // Find the File node for this node (we assume the node is something
  // like markdown which would be a child node of a File node).


  const parentFileNode = context.nodeModel.findRootNodeAncestor(source); // Find the linked File node(s)

  if (isArray) {
    return Promise.all(fieldValue.map(findLinkedFileNode));
  } else {
    return findLinkedFileNode(fieldValue);
  }
};

module.exports = {
  findManyPaginated,
  findOne,
  fileByPath,
  link,
  distinct,
  group
};
//# sourceMappingURL=resolvers.js.map