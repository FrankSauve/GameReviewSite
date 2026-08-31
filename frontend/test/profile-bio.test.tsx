// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { ProfileBio } from "../src/components/ProfileBio";
import { UPDATE_PROFILE } from "../src/graphql/mutations";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

function updateMock(bio: string, result = bio) {
  return {
    request: { query: UPDATE_PROFILE, variables: { input: { bio } } },
    result: {
      data: {
        updateProfile: { __typename: "User", id: "u1", bio: result },
      },
    },
  };
}

function renderBio(
  props: { bio?: string | null; isOwnProfile: boolean },
  mocks: readonly MockedResponse[] = [],
) {
  return render(
    <MockedProvider mocks={mocks}>
      <ProfileBio {...props} />
    </MockedProvider>,
  );
}

describe("ProfileBio", () => {
  describe("reading", () => {
    it("renders the bio as Markdown", () => {
      renderBio({ bio: "I score on a **curve**.", isOwnProfile: false });
      expect(screen.getByText("curve").tagName).toBe("STRONG");
    });

    /**
     * A visitor looking at a profile with no bio should see a profile, not a
     * gap where somebody else's writing would go.
     */
    it("renders nothing for a visitor when there is no bio", () => {
      const { container } = renderBio({ bio: null, isOwnProfile: false });
      expect(container.textContent).toBe("");
    });

    it("offers no edit control to a visitor", () => {
      renderBio({ bio: "something", isOwnProfile: false });
      expect(screen.queryByRole("button", { name: /bio/i })).toBeNull();
    });

    it("invites the owner to write one when it is empty", () => {
      renderBio({ bio: null, isOwnProfile: true });
      expect(screen.getByRole("button", { name: "Add a bio" })).toBeTruthy();
    });

    it("offers the owner an edit control when there is one", () => {
      renderBio({ bio: "something", isOwnProfile: true });
      expect(screen.getByRole("button", { name: "Edit bio" })).toBeTruthy();
    });
  });

  describe("editing", () => {
    it("opens the editor loaded with the current bio", () => {
      renderBio({ bio: "current text", isOwnProfile: true });
      fireEvent.click(screen.getByRole("button", { name: "Edit bio" }));
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
        "current text",
      );
    });

    it("opens an empty editor when there is no bio yet", () => {
      renderBio({ bio: null, isOwnProfile: true });
      fireEvent.click(screen.getByRole("button", { name: "Add a bio" }));
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
        "",
      );
    });

    it("saves what was typed and closes", async () => {
      renderBio({ bio: null, isOwnProfile: true }, [updateMock("a new bio")]);
      fireEvent.click(screen.getByRole("button", { name: "Add a bio" }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "a new bio" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    });

    /** Cancelling leaves the stored bio showing, not the abandoned draft. */
    it("discards the draft on cancel", () => {
      renderBio({ bio: "original", isOwnProfile: true });
      fireEvent.click(screen.getByRole("button", { name: "Edit bio" }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "abandoned" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByText("original")).toBeTruthy();
    });

    it("reopens the editor with the stored bio, not the abandoned draft", () => {
      renderBio({ bio: "original", isOwnProfile: true });
      fireEvent.click(screen.getByRole("button", { name: "Edit bio" }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "abandoned" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit bio" }));

      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
        "original",
      );
    });

    /** A failed save's message describes that attempt, not the next one. */
    it("does not carry a failed save's error into the next edit", async () => {
      renderBio({ bio: "original", isOwnProfile: true }, [
        {
          request: {
            query: UPDATE_PROFILE,
            variables: { input: { bio: "nope" } },
          },
          error: new Error("something went wrong"),
        },
      ]);
      fireEvent.click(screen.getByRole("button", { name: "Edit bio" }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "nope" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByText("something went wrong");

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit bio" }));
      expect(screen.queryByText("something went wrong")).toBeNull();
    });

    it("gives the editor the bio limit rather than the review one", () => {
      renderBio({ bio: "x", isOwnProfile: true });
      fireEvent.click(screen.getByRole("button", { name: "Edit bio" }));
      expect(screen.getByText("1/3000")).toBeTruthy();
    });
  });
});
