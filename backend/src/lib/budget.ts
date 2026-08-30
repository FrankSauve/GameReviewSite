import { GraphQLError } from "graphql";

/**
 * A per-request ceiling on list rows, shared by every list field in one
 * operation. Roughly ten times the heaviest page the SPA legitimately asks for.
 */
export const DEFAULT_ROW_BUDGET = 3000;

/**
 * A per-request ceiling on characters of long-form body — review and article
 * content. Rows are the wrong unit once one row can be 20000 characters: a
 * 930-row query sits inside the row budget and still returns megabytes.
 *
 * Roughly twice the heaviest page the SPA legitimately asks for.
 */
export const DEFAULT_TEXT_BUDGET = 2_000_000;

export class RowBudget {
  private remaining: number;
  private remainingText: number;

  constructor(
    total: number = DEFAULT_ROW_BUDGET,
    totalText: number = DEFAULT_TEXT_BUDGET
  ) {
    this.remaining = total;
    this.remainingText = totalText;
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

  /**
   * Charged from the `Review.content` and `Article.content` field resolvers:
   * one choke point per type that every query shape must pass through.
   */
  chargeText(text: string, noun = "review text"): string {
    this.remainingText -= text.length;
    if (this.remainingText < 0) {
      throw new GraphQLError(
        `This query would return more than ${DEFAULT_TEXT_BUDGET} characters of ` +
          `${noun}. Narrow it with the limit and offset arguments, or ask for ` +
          "fewer bodies.",
        { extensions: { code: "QUERY_TOO_LARGE" } }
      );
    }
    return text;
  }
}
