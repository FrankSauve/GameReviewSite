import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Express } from "express";
import {
  ALICE,
  PLAYTIME_INPUT,
  authedQuery,
  resetDatabase,
  seedGame,
  startApp,
} from "./helpers.js";

/**
 * A posted review is announced on the configured Discord webhook. `fetch` is
 * stubbed: what matters is whether the call is made, and that a failing one
 * never costs the reviewer their review.
 */

const WEBHOOK = "https://discord.com/api/webhooks/1/token";

interface Call {
  url: string;
  body: unknown;
}

function stubFetch(respond: () => Promise<Response>) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(typeof init?.body === "string" ? init.body : "null"),
      });
      return respond();
    },
  ) as unknown as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const ok = () => Promise.resolve(new Response(null, { status: 204 }));

function createReview(gameId: string) {
  return authedQuery<{ createReview: { id: string; slug: string } }>(
    app,
    `mutation { createReview(input: { gameId: "${gameId}", rating: 8, content: "Good.", ${PLAYTIME_INPUT} }) { id slug } }`,
    ALICE,
  );
}

let app: Express;
let stop: () => Promise<void>;
let stub: ReturnType<typeof stubFetch> | undefined;

beforeAll(async () => {
  ({ app, stop } = await startApp());
});
afterAll(async () => {
  await stop();
});

beforeEach(async () => {
  await resetDatabase();
  process.env["DISCORD_WEBHOOK_URL"] = WEBHOOK;
  process.env["PUBLIC_ORIGIN"] = "https://reviews.example.com";
});

afterEach(() => {
  stub?.restore();
  stub = undefined;
  vi.restoreAllMocks();
  delete process.env["DISCORD_WEBHOOK_URL"];
  delete process.env["PUBLIC_ORIGIN"];
});

describe("Discord notification for a posted review", () => {
  it("posts the review card to the webhook", async () => {
    stub = stubFetch(ok);
    const res = await createReview(await seedGame("Elden Ring"));
    expect(res.errors).toBeUndefined();

    await vi.waitFor(() => expect(stub?.calls).toHaveLength(1));
    const [call] = stub.calls;
    expect(call?.url).toBe(WEBHOOK);
    expect(call?.body).toMatchObject({
      embeds: [
        {
          title: "Elden Ring — 8/10 by alice",
          url: `https://reviews.example.com/reviews/${res.data?.createReview.slug}`,
        },
      ],
    });
  });

  it("posts nothing when no webhook is configured", async () => {
    delete process.env["DISCORD_WEBHOOK_URL"];
    stub = stubFetch(ok);
    const res = await createReview(await seedGame());
    expect(res.errors).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stub.calls).toHaveLength(0);
  });

  it("still creates the review when Discord answers with an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stub = stubFetch(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    const res = await createReview(await seedGame());
    expect(res.errors).toBeUndefined();
    expect(res.data?.createReview.id).toBeTruthy();
  });

  it("still creates the review when Discord is unreachable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stub = stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    const res = await createReview(await seedGame());
    expect(res.errors).toBeUndefined();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    // The URL carries the webhook's token.
    expect(JSON.stringify(error.mock.calls)).not.toContain("token");
  });

  it("does not post again when the review is edited", async () => {
    stub = stubFetch(ok);
    const created = await createReview(await seedGame());
    await vi.waitFor(() => expect(stub?.calls).toHaveLength(1));

    const res = await authedQuery(
      app,
      `mutation { updateReview(id: "${created.data?.createReview.id}", input: { rating: 9 }) { id } }`,
      ALICE,
    );
    expect(res.errors).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stub.calls).toHaveLength(1);
  });
});
