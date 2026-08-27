import { GraphQLError } from "graphql";

/**
 * A per-request ceiling on how many list rows one GraphQL operation may return.
 *
 * The resolvers share a budget. Every list field draws its rows from it, and
 * the operation fails once it is exhausted.
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
