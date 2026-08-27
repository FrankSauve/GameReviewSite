// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { print } from "graphql";
import { SET_REVIEW_GROUPING } from "../src/graphql/mutations";
import { DefaultViewPicker } from "../src/components/DefaultViewPicker";
import { GROUPING_LABELS, toGrouping } from "../src/lib/grouping";

afterEach(cleanup);

const USER_ID = "u1";

function mutationMock(grouping: string, onCalled?: () => void) {
  return {
    request: { query: SET_REVIEW_GROUPING, variables: { grouping } },
    result: () => {
      onCalled?.();
      return {
        data: {
          setReviewGrouping: {
            __typename: "User",
            id: USER_ID,
            defaultReviewGrouping: grouping,
          },
        },
      };
    },
  };
}

function renderPicker(current: "year" | "score" | "recent", mocks: unknown[] = []) {
  return render(
    <MockedProvider mocks={mocks as never[]}>
      <DefaultViewPicker current={current} />
    </MockedProvider>
  );
}

describe("DefaultViewPicker", () => {
  it("offers all three views", () => {
    renderPicker("year");
    for (const label of Object.values(GROUPING_LABELS)) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("marks the current choice as pressed", () => {
    renderPicker("score");
    expect(
      screen.getByRole("button", { name: "By score" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "By year" }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  /** Clicking the view already in force would be a write that changes nothing. */
  it("disables the current choice", () => {
    renderPicker("year");
    expect(
      (screen.getByRole("button", { name: "By year" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "By score" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("sends the chosen view to the server", async () => {
    const called = vi.fn();
    renderPicker("year", [mutationMock("SCORE", called)]);
    screen.getByRole("button", { name: "By score" }).click();
    await waitFor(() => expect(called).toHaveBeenCalled());
  });

  it("surfaces a refusal rather than looking like it saved", async () => {
    renderPicker("year", [
      {
        request: { query: SET_REVIEW_GROUPING, variables: { grouping: "SCORE" } },
        error: new Error("nope"),
      },
    ]);
    screen.getByRole("button", { name: "By score" }).click();
    await waitFor(() => expect(screen.getByText(/could not save/i)).toBeTruthy());
  });
});

describe("the mutation itself", () => {
  /**
   * The security property, asserted against the document rather than a render: the
   * server derives the row from the session, so a user id in this mutation would be
   * the first way one account could name another. If one is ever added, this fails.
   */
  it("takes no user id", () => {
    const text = print(SET_REVIEW_GROUPING);
    expect(text).toContain("$grouping: ReviewGrouping!");
    expect(text).not.toMatch(/\$(userId|id)\b/);
    expect(text).not.toMatch(/userId:/);
  });

  it("declares exactly one variable", () => {
    const definition = SET_REVIEW_GROUPING.definitions[0];
    if (definition.kind !== "OperationDefinition") {
      throw new Error(`expected an operation, got ${definition.kind}`);
    }
    expect(definition.variableDefinitions).toHaveLength(1);
  });

  /** Uppercase on the wire, lowercase in the routes; kept as an explicit mapping. */
  it("maps route names onto the enum the server expects", () => {
    expect(toGrouping("year")).toBe("YEAR");
    expect(toGrouping("score")).toBe("SCORE");
    expect(toGrouping("recent")).toBe("RECENT");
  });
});
