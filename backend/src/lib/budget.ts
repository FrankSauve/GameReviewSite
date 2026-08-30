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

/**
 * A per-request ceiling on how many characters of long-form body one operation
 * may return — review bodies, and the texts in resolvers/article.ts.
 *
 * The row budget alone stopped being sufficient when review bodies grew from 5000
 * characters to 20000. Rows are the wrong unit once one row can be large: the
 * shape `reviews(limit: 30) { content user { reviews(limit: 30) { content } } }`
 * is 930 rows, comfortably inside the 3000-row budget, and was measured returning
 * **18.66 MB** — worse than the 2.6 MB that motivated these guards in the first
 * place.
 *
 * Two million characters is roughly twice the heaviest page the SPA legitimately
 * asks for (a game with fifty maximal reviews is about one million), and about a
 * tenth of what the row budget alone would have permitted.
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
   * Charged once per body actually returned, from the `Review.content` and
   * `Article.content` field resolvers — one place per type that every query shape
   * has to go through, rather than a call to remember at each of the six
   * resolvers that return review rows.
   *
   * `noun` names what filled the budget up, because the two types share it and a
   * message that says "review text" when it was a manifesto sends the reader
   * looking in the wrong place.
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
