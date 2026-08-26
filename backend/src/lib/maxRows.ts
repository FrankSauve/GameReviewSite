import {
  GraphQLError,
  type ASTVisitor,
  type FieldNode,
  type ValidationContext,
} from "graphql";
import { LIST_BOUNDS, type Bounds } from "./pagination";
import { DEFAULT_ROW_BUDGET } from "./budget";

/**
 * Rejects a query whose shape could return more rows than the budget allows,
 * before a single row is read.
 *
 * graphql-armor's cost limit does not cover this. It scores a query by counting
 * nodes and depth, which says nothing about how many rows each list field will
 * return — and the abuse here is entirely in the cardinality. `reviews` nested
 * inside `user` nested inside `reviews` is a small, shallow, cheap-looking query
 * that multiplies out to hundreds of thousands of rows.
 *
 * The runtime budget in lib/budget.ts still applies. This rule is the better of
 * the two when it fires (one clear error, no database work at all), but it reads
 * the query shape, so a caller who buries list fields in fragment spreads can
 * slip past it. The runtime budget cannot be dodged that way, and catches
 * whatever this misses.
 */

/** Bounds keyed by "ParentType.field", falling back to the nested bounds. */
const EXPLICIT_BOUNDS: Record<string, Bounds> = {
  "Query.reviews": LIST_BOUNDS.reviews,
  "Query.recentReviews": LIST_BOUNDS.recentReviews,
  "Query.reviewsByGame": LIST_BOUNDS.reviews,
  "Query.reviewsByUser": LIST_BOUNDS.reviews,
  "Query.users": LIST_BOUNDS.users,
  "Query.games": LIST_BOUNDS.games,
  "Query.comments": LIST_BOUNDS.nested,
  // RAWG caps its own page size, and the result never touches our database.
  "Query.searchGamesExternal": { def: 12, max: 12 },
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

          // A list type always renders with brackets ("[Review!]", "[Review!]!")
          // and a non-list never does. Deliberately not isListType(): that is an
          // instanceof check, and it throws "Cannot use GraphQLList from another
          // module or realm" whenever two copies of graphql are resolvable,
          // which a validation rule has no business being sensitive to.
          const isList = String(fieldDef.type).includes("[");

          if (!isList) {
            stack.push(parent);
            return;
          }

          const width = widthOf(node, boundsFor(parentType.name, node.name.value));
          const rows = parent * width;
          total += rows;
          stack.push(rows);

          if (total > maxRows && !reported) {
            reported = true;
            context.reportError(
              new GraphQLError(
                `This query could return up to ${total} records, above the limit of ` +
                  `${maxRows}. Narrow it with the limit and offset arguments.`,
                { nodes: [node], extensions: { code: "QUERY_TOO_LARGE" } }
              )
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
