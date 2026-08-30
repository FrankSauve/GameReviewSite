import { describe, expect, it, vi } from "vitest";
import { loginUrl, signOutTarget } from "../src/lib/auth";

/**
 * The endpoint-routing test this file replaces existed because which of two
 * GraphQL endpoints an operation went to was a security boundary. There is one
 * endpoint now, so what is left worth pinning is the sign-in URL and how sign-out
 * behaves when the server does not cooperate.
 */
describe("loginUrl", () => {
  it("carries returnTo so the flow comes back where it started", () => {
    expect(loginUrl("/games/42")).toBe("/auth/login?returnTo=%2Fgames%2F42");
  });

  /**
   * Encoding is not cosmetic: an unencoded returnTo lets a crafted link inject
   * extra query parameters into the sign-in request. The backend validates the
   * value as well, so this is the outer of two guards.
   */
  it("encodes a returnTo that contains query characters", () => {
    expect(loginUrl("/search?q=a&b=c#top")).toBe(
      "/auth/login?returnTo=%2Fsearch%3Fq%3Da%26b%3Dc%23top",
    );
  });

  it("encodes an attempt to smuggle another origin", () => {
    expect(loginUrl("//evil.example.com")).toBe(
      "/auth/login?returnTo=%2F%2Fevil.example.com",
    );
  });
});

describe("signOutTarget", () => {
  const jsonResponse = (body: unknown) =>
    ({ json: async () => body }) as unknown as Response;

  it("sends the browser to authentik so its session ends too", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        endSessionUrl: "https://authentik.example.com/end-session",
      }),
    );
    await expect(
      signOutTarget(fetchImpl as unknown as typeof fetch),
    ).resolves.toBe("https://authentik.example.com/end-session");
  });

  it("posts, and preflights, rather than issuing a bare GET", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ endSessionUrl: null }));
    await signOutTarget(fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
  });

  it("falls back to the site root when there was no session to end", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ endSessionUrl: null }));
    await expect(
      signOutTarget(fetchImpl as unknown as typeof fetch),
    ).resolves.toBe("/");
  });

  it("still goes somewhere when the request fails outright", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      signOutTarget(fetchImpl as unknown as typeof fetch),
    ).resolves.toBe("/");
  });

  it("still goes somewhere when the response is not JSON", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          json: async () => {
            throw new Error("not json");
          },
        }) as unknown as Response,
    );
    await expect(
      signOutTarget(fetchImpl as unknown as typeof fetch),
    ).resolves.toBe("/");
  });
});
