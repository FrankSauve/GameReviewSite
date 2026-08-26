import { GraphQLError } from "graphql";

/**
 * A per-request ceiling on how many list rows one GraphQL operation may return.
 *
 * Clamping each list field individually is not sufficient on its own, because
 * the clamps multiply: 50 reviews, each with a user, each with 50 reviews, each
 * with 50 comments is four bounded lists and several million rows. graphql-armor
 * cannot catch this either — it scores the *shape* of a query before any row is
 * read, and the shape here is small.
 *
 * So the resolvers share a budget. Every list field draws its rows from it, and
 * the operation fails once it is exhausted rather than quietly returning a
 * truncated result, because a silent truncation is indistinguishable from real
 * data to the client.
 *
 * The default is roughly ten times the heaviest page the SPA legitimately asks
 * for (a game with fifty reviews, each fully commented).
 */
export const DEFAULT_ROW_BUDGET = 3000;

export class RowBudget {
  private remaining: number;

  constructor(total: number = DEFAULT_ROW_BUDGET) {
    this.remaining = total;
  }

  /**
   * Charges `rows` against the budget and returns them unchanged.
   *
   * Throws rather than truncating. The message names the paging arguments so a
   * caller that genuinely wants this much data knows how to ask for it.
   */
  charge<T>(rows: T[]): T[] {
    this.remaining -= rows.length;
    if (this.remaining < 0) {
      throw new GraphQLError(
        `This query would return more than ${DEFAULT_ROW_BUDGET} records. ` +
          "Narrow it with the limit and offset arguments.",
        { extensions: { code: "QUERY_TOO_LARGE" } }
      );
    }
    return rows;
  }
}
