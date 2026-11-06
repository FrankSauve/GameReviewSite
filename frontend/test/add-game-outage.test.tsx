// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GraphQLError } from "graphql";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import { SEARCH_GAMES_EXTERNAL } from "../src/graphql/queries";
import { AddGameButton } from "../src/components/AddGameButton";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
afterEach(cleanup);

const OUTAGE = "RAWG is unavailable right now. Try again shortly.";

function searchFor(
  mock: { result: object } | { error: Error },
  query = "halo",
) {
  render(
    <MockedProvider
      mocks={[
        {
          request: { query: SEARCH_GAMES_EXTERNAL, variables: { query } },
          ...mock,
        },
      ]}
    >
      <MemoryRouter>
        <AddGameButton />
      </MemoryRouter>
    </MockedProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /add game/i }));
  fireEvent.change(screen.getByPlaceholderText(/find a game/i), {
    target: { value: query },
  });
}

describe("the Add game search", () => {
  it("says RAWG is down rather than that the game does not exist", async () => {
    searchFor({ result: { errors: [new GraphQLError(OUTAGE)] } });
    expect(await screen.findByText(OUTAGE)).toBeTruthy();
    expect(screen.queryByText(/no games found/i)).toBeNull();
  });

  it("says no games found when a search really finds nothing", async () => {
    searchFor({ result: { data: { searchGamesExternal: [] } } });
    expect(await screen.findByText(/no games found/i)).toBeTruthy();
  });
});
