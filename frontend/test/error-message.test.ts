import { describe, expect, it } from "vitest";
import { CombinedGraphQLErrors } from "@apollo/client";
import { errorMessage } from "../src/lib/errorMessage";

describe("errorMessage", () => {
  it("shows only the first of several GraphQL errors", () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        { message: "Rating must be between 0 and 10" },
        { message: "Title is required" },
      ],
    });
    expect(errorMessage(error)).toBe("Rating must be between 0 and 10");
  });

  it("falls back to the message of a network error", () => {
    expect(errorMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });
});
