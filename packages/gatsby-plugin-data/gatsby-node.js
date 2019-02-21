const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { parse } = require("graphql/language");
const { flow, camelCase, upperFirst } = require("lodash");
const { graphql, buildSchema, ...etc } = require("gatsby/graphql");

const pascalCase = flow(camelCase, upperFirst);

const typeMap = new Map();

exports.onPreBootstrap = ({ store }, opts) => {
  // check for files in src/data
  const dataDir = path.join(store.getState().program.directory, "src", "data");
  const schemas = fs
    .readdirSync(dataDir)
    .filter(filename => filename.endsWith(".schema"))
    .map(filename => ({
      name: pascalCase(filename.slice(0, filename.length - ".schema".length)),
      sdl: fs.readFileSync(path.join(dataDir, filename), "utf-8")
    }))
    .map(({ sdl, ...etc }) => ({ ...etc, sdl, schema: parse(sdl) }))
    .map(({ schema, name }) => {
      console.log(schema);
      if (!schema.kind === "Document") {
        throw new `gatsby-plugin-data can not handle ${schema.kind} types`();
      } else {
        schema.definitions.forEach(
          type =>
            console.log(type.name.value) || typeMap.set(type.name.value, type)
        );
      }
    });
};

const markdownFieldMap = {
  body: "rawMarkdownBody",
  excerpt: "excerpt"
};

const fromMarkdownRemark = node => {
  const generatedNode = {};
  Object.entries(markdownFieldMap).forEach(([key, val]) => {
    if (node[key] != undefined) {
      generatedNode[key] = node[key];
    } else if (node.frontmatter[key]) {
      generatedNode[key] = node.frontmatter[key];
    } else {
      // do nothing because this may be a generated field we can only
      // access in graphql-landia
    }
  });
  return generatedNode;
};

exports.onCreateNode = ({ node, createNodeId, actions }) => {
  const { createNode, createParentChildLink } = actions;

  if (node.internal.type === `MarkdownRemark`) {
    console.log("should trasnform");
    typeMap.forEach((type, name) => {
      const childNode = {
        children: [],
        parent: node.id,
        internal: {
          content: node.internal.content || "",
          type: name
        },
        id: createNodeId(`${node.id} >> ${name}`),
        ...fromMarkdownRemark(node)
      };
      childNode.internal.contentDigest = crypto
        .createHash(`md5`)
        .update(JSON.stringify(childNode))
        .digest(`hex`);
      // attach our new type to the desired type it infers from
      createNode(childNode);
      createParentChildLink({ parent: node, child: childNode });
    });
  }
};

exports.setFieldsOnGraphQLNodeType = ({ type }) => {
  if (typeMap.has(type.name)) {
    console.log("process", type.name);

    return {};
    return {
      newField: {
        type: GraphQLString,
        args: {
          myArgument: {
            type: GraphQLString
          }
        },
        resolve: (source, fieldArgs) => {
          return `Id of this node is ${source.id}.
                  Field was called with argument: ${fieldArgs.myArgument}`;
        }
      }
    };
  }

  // by default return empty object
  return {};
};
