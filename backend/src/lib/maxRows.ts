import {
  GraphQLError,
  type ASTVisitor,
  type FieldNode,
  type ValidationContext,
} from "graphql";
import { LIST_BOUNDS, REACTION_BOUNDS, type Bounds } from "./pagination.js";
import { DEFAULT_ROW_BUDGET } from "./budget.js";

/**
 * Rejects a query whose shape could return more rows than the budget allows,
 * before a single row is read.
 *
 * graphql-armor's cost limit does not cover this: it scores query shape, and
 * the abuse is entirely in cardinality — `reviews` inside `user` inside
 * `reviews` is shallow and cheap-looking and multiplies out to hundreds of
 * thousands of rows.
 *
 * Reads the query shape, so fragment spreads can hide list fields from it. The
 * runtime budget in lib/budget.ts cannot be dodged that way and catches the
 * rest.
 */

/** Bounds keyed by "ParentType.field", falling back to the nested bounds. */
const EXPLICIT_BOUNDS: Record<string, Bounds> = {
  "Query.reviews": LIST_BOUNDS.reviews,
  "Query.recentReviews": LIST_BOUNDS.recentReviews,
  "Query.reviewsByGame": LIST_BOUNDS.reviews,
  "Query.reviewsByUser": LIST_BOUNDS.reviews,
  "Query.reviewSummariesByUser": LIST_BOUNDS.reviewSummaries,
  "Query.users": LIST_BOUNDS.users,
  "Query.games": LIST_BOUNDS.games,
  "Query.comments": LIST_BOUNDS.nested,
  "Query.articles": LIST_BOUNDS.articles,
  // RAWG caps its own page size, and the result never touches our database.
  "Query.searchGamesExternal": { def: 12, max: 12 },
  // Without these the nested bounds price them at 50 each, and the review page
  // asks for `review { comments { reactions } }` — 2500 rows, and refused.
  "Review.reactions": REACTION_BOUNDS,
  "Comment.reactions": REACTION_BOUNDS,
};

function boundsFor(parentType: string, fieldName: string): Bounds {
  return EXPLICIT_BOUNDS[`${parentType}.${fieldName}`] ?? LIST_BOUNDS.nested;
}

/** The largest number of rows this field could return, given its arguments. */
function widthOf(node: FieldNode, bounds: Bounds): number {
  const limitArg = node.arguments?.find((a) => a.name.value === "limit");
  if (limitArg?.value.kind === "IntValue") {
    const requested = parseInt(limitArg.value.value, 10);
    if (Number.isFinite(requested)) {
      return Math.min(Math.max(1, requested), bounds.max);
    }
  }
  // A variable could hold anything, so assume the worst the server would allow.
  if (limitArg && limitArg.value.kind !== "IntValue") return bounds.max;
  return bounds.def;
}

export function createMaxRowsRule(maxRows: number = DEFAULT_ROW_BUDGET) {
  return (context: ValidationContext): ASTVisitor => {
    // Multiplier of the enclosing list context; starts at one row (the root).
    const stack: number[] = [1];
    let total = 0;
    let reported = false;

    return {
      Field: {
        enter(node) {
          const parent = stack[stack.length - 1] ?? 1;
          const fieldDef = context.getFieldDef();
          const parentType = context.getParentType();

          if (!fieldDef || !parentType) {
            stack.push(parent);
            return;
          }

          // Read off the AST rather than the schema: graphql-js type predicates
          // are `instanceof` and this process holds more than one copy of the
          // module, so isCompositeType throws "from another module or realm".
          const isRowList =
            String(fieldDef.type).includes("[") && node.selectionSet != null;

          if (!isRowList) {
            stack.push(parent);
            return;
          }

          const width = widthOf(
            node,
            boundsFor(parentType.name, node.name.value),
          );
          const rows = parent * width;
          total += rows;
          stack.push(rows);

          if (total > maxRows && !reported) {
            reported = true;
            context.reportError(
              new GraphQLError(
                `This query could return up to ${total} records, above the limit of ` +
                  `${maxRows}. Narrow it with the limit and offset arguments.`,
                { nodes: [node], extensions: { code: "QUERY_TOO_LARGE" } },
              ),
            );
          }
        },
        leave() {
          stack.pop();
        },
      },
    };
  };
}
