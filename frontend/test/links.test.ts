import { describe, it, expect } from "vitest";
import { gamePath, reviewPath, userPath } from "../src/lib/links";

/**
 * These helpers exist because the fallback is easy to get wrong in twenty
 * places, so the fallback is what most of this file is about.
 */
describe("link helpers", () => {
  describe("gamePath", () => {
    it("uses the slug when there is one", () => {
      expect(gamePath({ id: "uuid-1", slug: "elden-ring" })).toBe("/games/elden-ring");
    });

    it("falls back to the id, which the API also accepts", () => {
      expect(gamePath({ id: "uuid-1" })).toBe("/games/uuid-1");
      expect(gamePath({ id: "uuid-1", slug: null })).toBe("/games/uuid-1");
    });

    it("points at the home page when there is no game", () => {
      expect(gamePath(null)).toBe("/");
      expect(gamePath(undefined)).toBe("/");
    });
  });

  describe("reviewPath", () => {
    it("uses the slug when there is one", () => {
      expect(reviewPath({ id: "uuid-2", slug: "elden-ring-by-alice" })).toBe(
        "/reviews/elden-ring-by-alice"
      );
    });

    it("falls back to the id", () => {
      expect(reviewPath({ id: "uuid-2" })).toBe("/reviews/uuid-2");
    });
  });

  describe("userPath", () => {
    it("uses the username, which is the readable identifier", () => {
      expect(userPath({ id: "uuid-3", username: "alice" })).toBe("/users/alice");
    });

    it("falls back to the id", () => {
      expect(userPath({ id: "uuid-3" })).toBe("/users/uuid-3");
    });

    it("appends a profile view tab", () => {
      expect(userPath({ id: "uuid-3", username: "alice" }, "by-score")).toBe(
        "/users/alice/by-score"
      );
    });

    it("leaves the path bare for the default tab", () => {
      expect(userPath({ id: "uuid-3", username: "alice" }, "")).toBe("/users/alice");
    });

    /**
     * A review whose author deleted their account still renders, and its byline
     * must not navigate anywhere — which is what the call sites did by hand
     * before these helpers existed.
     */
    it("does not link anywhere for a missing user", () => {
      expect(userPath(null)).toBe("#");
      expect(userPath(undefined)).toBe("#");
    });
  });
});
