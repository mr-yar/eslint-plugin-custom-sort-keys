/**
 * @fileoverview Rule to require object keys to be sorted
 * @author Toru Nagashima
 */

"use strict";

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

const astUtils = require("../util/ast-utils");

const naturalCompare = require("natural-compare");

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Gets the property name of the given `Property` node.
 *
 * - If the property's key is an `Identifier` node, this returns the key's name
 *   whether it's a computed property or not.
 * - If the property has a static name, this returns the static name.
 * - Otherwise, this returns null.
 *
 * @param {ASTNode} node - The `Property` node to get.
 * @returns {string|null} The property name or null.
 * @private
 */
function getPropertyName(node) {
  const staticName = astUtils.getStaticPropertyName(node);

  if (staticName !== null) {
    return staticName;
  }

  return node.key.name || null;
}

/**
 * Functions which check that the given 2 names are in specific order.
 *
 * Postfix `I` is meant insensitive.
 * Postfix `N` is meant natual.
 *
 * @private
 */
const isValidOrders = {
  asc(a, b) {
    return a <= b;
  },
  ascI(a, b) {
    return a.toLowerCase() <= b.toLowerCase();
  },
  ascN(a, b) {
    return naturalCompare(a, b) <= 0;
  },
  ascIN(a, b) {
    return naturalCompare(a.toLowerCase(), b.toLowerCase()) <= 0;
  },
  desc(a, b) {
    return isValidOrders.asc(b, a);
  },
  descI(a, b) {
    return isValidOrders.ascI(b, a);
  },
  descN(a, b) {
    return isValidOrders.ascN(b, a);
  },
  descIN(a, b) {
    return isValidOrders.ascIN(b, a);
  },
};

module.exports = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description: "require object keys to be sorted",
      category: "Stylistic Issues",
      recommended: false,
      url: "https://github.com/mr-yar/eslint-plugin-custom-sort-keys",
    },

    schema: [
      {
        enum: ["asc", "desc"],
      },
      {
        type: "object",
        properties: {
          caseSensitive: {
            type: "boolean",
          },
          natural: {
            type: "boolean",
          },
          allowLineSeparatedGroups: {
            type: "boolean",
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    // Parse options.
    const order = context.options[0] || "asc";
    const options = context.options[1];
    const insensitive = (options && options.caseSensitive) === false;
    const natual = Boolean(options && options.natural);
    const allowLineSeparatedGroups = Boolean(
      options && options.allowLineSeparatedGroups,
    );
    const isValidOrder =
      isValidOrders[order + (insensitive ? "I" : "") + (natual ? "N" : "")];

    // The stack to save the previous property's name for each object literals.
    let stack = null;
    const sourceCode = context.sourceCode;

    const SpreadElement = (node) => {
      if (node.parent.type === "ObjectExpression") {
        stack.prevName = null;
      }
    };

    return {
      ExperimentalSpreadProperty: SpreadElement,

      ObjectExpression() {
        stack = {
          upper: stack,
          prevName: null,
          prevNode: null,
        };
      },

      "ObjectExpression:exit"() {
        stack = stack.upper;
      },

      SpreadElement,

      Property(node) {
        if (node.parent.type === "ObjectPattern") {
          return;
        }

        const prevName = stack.prevName;
        const prevNode = stack.prevNode;
        const thisName = getPropertyName(node);

        // Get tokens between current node and previous node
        const tokens =
          stack.prevNode &&
          sourceCode.getTokensBetween(stack.prevNode, node, {
            includeComments: true,
          });

        let isBlankLineBetweenNodes = stack.prevBlankLine;

        if (tokens) {
          // check blank line between tokens
          tokens.forEach((token, index) => {
            const previousToken = tokens[index - 1];

            if (
              previousToken &&
              token.loc.start.line - previousToken.loc.end.line > 1
            ) {
              isBlankLineBetweenNodes = true;
            }
          });

          // check blank line between the current node and the last token
          if (
            !isBlankLineBetweenNodes &&
            node.loc.start.line - tokens[tokens.length - 1].loc.end.line > 1
          ) {
            isBlankLineBetweenNodes = true;
          }

          // check blank line between the first token and the previous node
          if (
            !isBlankLineBetweenNodes &&
            tokens[0].loc.start.line - stack.prevNode.loc.end.line > 1
          ) {
            isBlankLineBetweenNodes = true;
          }
        }

        stack.prevNode = node;

        if (thisName !== null) {
          stack.prevName = thisName;
          stack.prevNode = node || prevNode;
        }

        if (prevName === null || thisName === null) {
          return;
        }

        if (allowLineSeparatedGroups && isBlankLineBetweenNodes) {
          stack.prevBlankLine = thisName === null;
          return;
        }

        if (!isValidOrder(prevName, thisName)) {
          context.report({
            node,
            loc: node.key.loc,
            message:
              "Expected object keys to be in {{natual}}{{insensitive}}{{order}}ending order. '{{thisName}}' should be before '{{prevName}}'.",
            data: {
              thisName,
              prevName,
              order,
              insensitive: insensitive ? "insensitive " : "",
              natual: natual ? "natural " : "",
            },
            fix(fixer) {
              const fixes = [];
              const sourceCode = context.getSourceCode();
              const moveProperty = (fromNode, toNode) => {
                const prevText = sourceCode.getText(fromNode);
                const thisComments = sourceCode.getCommentsBefore(fromNode);
                for (const thisComment of thisComments) {
                  fixes.push(
                    fixer.insertTextBefore(
                      toNode,
                      sourceCode.getText(thisComment) + "\n",
                    ),
                  );
                  fixes.push(fixer.remove(thisComment));
                }
                fixes.push(fixer.replaceText(toNode, prevText));
              };
              moveProperty(node, prevNode);
              moveProperty(prevNode, node);
              return fixes;
            },
          });
        }
      },
    };
  },
};
