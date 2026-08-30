import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { provisionUser } from "../src/lib/identity.js";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers.js";

/**
 * Articles: manifestos and anything else that is not a review.
 *
 * The part worth testing hard is visibility. A draft is a piece of writing its
 * author has explicitly not published, so it leaking into the index — or into
 * the count under it, which is a subtler version of the same leak — is the
 * failure that matters here.
 */

const CREATE = `
  mutation Create($input: CreateArticleInput!) {
    createArticle(input: $input) { id slug title content publishedAt author { username } }
  }
`;

const LIST = `
  query List($limit: Int, $offset: Int) {
    articles(limit: $limit, offset: $offset) { id slug title publishedAt }
    articlesCount
  }
`;

const ONE = `query One($id: ID!) { article(id: $id) { id slug title content } }`;

const RETITLE = `
  mutation Retitle($id: ID!, $title: String!) {
    updateArticle(id: $id, input: { title: $title }) { id slug title }
  }
`;

async function seedArticle(
  username: string,
  fields: { title: string; slug?: string; publishedAt?: Date | null }
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  const article = await prisma.article.create({
    data: {
      title: fields.title,
      slug: fields.slug ?? fields.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      content: "Body.",
      publishedAt: fields.publishedAt === undefined ? new Date() : fields.publishedAt,
      authorId: user.id,
    },
  });
  return article.id;
}

describe("articles", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("refuses to write one anonymously", async () => {
    const res = await publicQuery(app, CREATE, {}, {
      input: { title: "Our manifesto", content: "We believe things." },
    });
    expect(errorCodes(res)).toContain("UNAUTHENTICATED");
  });

  it("writes one, published, with a readable slug", async () => {
    const res = await authedQuery<{
      createArticle: { slug: string; publishedAt: string | null; author: { username: string } };
    }>(app, CREATE, ALICE, {}, {
      input: { title: "Our Manifesto", content: "We believe **things**." },
    });

    expect(res.errors).toBeUndefined();
    expect(res.data?.createArticle.slug).toBe("our-manifesto");
    // ISO-8601, like every other timestamp in this API. Left to graphql-js a
    // Date coerces through valueOf() and arrives as epoch milliseconds.
    expect(res.data?.createArticle.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.data?.createArticle.author.username).toBe("alice");
  });

  it("disambiguates a slug that is already taken", async () => {
    await authedQuery(app, CREATE, ALICE, {}, {
      input: { title: "Notes", content: "One." },
    });
    const res = await authedQuery<{ createArticle: { slug: string } }>(
      app, CREATE, BOB, {}, { input: { title: "Notes", content: "Two." } }
    );
    expect(res.data?.createArticle.slug).toBe("notes-2");
  });

  it("keeps a draft out of the index, and out of its count", async () => {
    await provisionUser(ALICE);
    await seedArticle("alice", { title: "Published" });
    await seedArticle("alice", { title: "Draft", publishedAt: null });

    const anon = await publicQuery<{ articles: { title: string }[]; articlesCount: number }>(
      app, LIST
    );

    expect(anon.data?.articles.map((a) => a.title)).toEqual(["Published"]);
    // The count is the subtler half of the same leak: a total that disagrees
    // with the list renders a page that is always empty.
    expect(anon.data?.articlesCount).toBe(1);
  });

  it("shows an author their own draft, and nobody else's", async () => {
    await provisionUser(ALICE);
    await provisionUser(BOB);
    await seedArticle("alice", { title: "Alice draft", publishedAt: null });
    await seedArticle("bob", { title: "Bob draft", publishedAt: null });

    const res = await authedQuery<{ articles: { title: string }[] }>(app, LIST, ALICE);

    expect(res.data?.articles.map((a) => a.title)).toEqual(["Alice draft"]);
  });

  it("fetches one by slug and by id", async () => {
    await provisionUser(ALICE);
    const id = await seedArticle("alice", { title: "Our Manifesto", slug: "our-manifesto" });

    const bySlug = await publicQuery<{ article: { id: string } | null }>(
      app, ONE, {}, { id: "our-manifesto" }
    );
    const byId = await publicQuery<{ article: { slug: string } | null }>(
      app, ONE, {}, { id }
    );

    expect(bySlug.data?.article?.id).toBe(id);
    expect(byId.data?.article?.slug).toBe("our-manifesto");
  });

  it("does not serve somebody else's draft by its slug", async () => {
    await provisionUser(ALICE);
    await seedArticle("alice", { title: "Secret", slug: "secret", publishedAt: null });

    const anon = await publicQuery<{ article: unknown }>(app, ONE, {}, { id: "secret" });
    const bob = await authedQuery<{ article: unknown }>(app, ONE, BOB, {}, { id: "secret" });

    expect(anon.data?.article).toBeNull();
    expect(bob.data?.article).toBeNull();
  });

  it("orders the index by publication, not by creation", async () => {
    await provisionUser(ALICE);
    await seedArticle("alice", {
      title: "Written first, published last",
      publishedAt: new Date("2026-06-01"),
    });
    await seedArticle("alice", {
      title: "Written last, published first",
      publishedAt: new Date("2026-01-01"),
    });

    const res = await publicQuery<{ articles: { title: string }[] }>(app, LIST);

    expect(res.data?.articles.map((a) => a.title)).toEqual([
      "Written first, published last",
      "Written last, published first",
    ]);
  });

  it("lets only the author edit or delete", async () => {
    await provisionUser(ALICE);
    const id = await seedArticle("alice", { title: "Ours" });

    const update = await authedQuery(app, `
      mutation ($id: ID!) { updateArticle(id: $id, input: { title: "Mine" }) { title } }
    `, BOB, {}, { id });
    const remove = await authedQuery(app, `
      mutation ($id: ID!) { deleteArticle(id: $id) }
    `, BOB, {}, { id });

    expect(errorCodes(update)).toContain("FORBIDDEN");
    expect(errorCodes(remove)).toContain("FORBIDDEN");
    expect(await prisma.article.count()).toBe(1);
  });

  it("publishes a draft without moving an already-published date", async () => {
    await provisionUser(ALICE);
    const published = new Date("2026-01-01T00:00:00.000Z");
    const id = await seedArticle("alice", { title: "Ours", publishedAt: published });

    await authedQuery(app, `
      mutation ($id: ID!) { updateArticle(id: $id, input: { published: true }) { id } }
    `, ALICE, {}, { id });

    // A typo fixed a year later should not send an article back to the top of the
    // index.
    expect((await prisma.article.findUniqueOrThrow({ where: { id } })).publishedAt)
      .toEqual(published);
  });

  it("unpublishes back to a draft", async () => {
    await provisionUser(ALICE);
    const id = await seedArticle("alice", { title: "Ours" });

    await authedQuery(app, `
      mutation ($id: ID!) { updateArticle(id: $id, input: { published: false }) { id } }
    `, ALICE, {}, { id });

    expect((await prisma.article.findUniqueOrThrow({ where: { id } })).publishedAt).toBeNull();
    const anon = await publicQuery<{ articlesCount: number }>(app, LIST);
    expect(anon.data?.articlesCount).toBe(0);
  });

  it("refuses an empty title and an over-long body", async () => {
    const empty = await authedQuery(app, CREATE, ALICE, {}, {
      input: { title: "   ", content: "Body." },
    });
    const huge = await authedQuery(app, CREATE, ALICE, {}, {
      input: { title: "Long", content: "x".repeat(50001) },
    });

    expect(empty.errors?.[0]?.message).toContain("title must not be empty");
    expect(huge.errors?.[0]?.message).toContain("at most 50000 characters");
  });

  it("clamps the page size a caller asks for", async () => {
    await provisionUser(ALICE);
    for (let n = 0; n < 3; n++) await seedArticle("alice", { title: `Text ${n}` });

    const res = await publicQuery<{ articles: unknown[] }>(app, LIST, {}, { limit: 500 });

    expect(res.data?.articles).toHaveLength(3);
  });

  /**
   * A hand-written text at a time cannot collide, but a seed or an import
   * inserts a batch inside one transaction and every row gets the same stamp.
   * Untiebroken, paging over 500 such rows lost three and repeated three;
   * over 5000, it lost 146.
   */
  it("pages over articles sharing a timestamp without losing or repeating one", async () => {
    await provisionUser(ALICE);
    const alice = await prisma.user.findUniqueOrThrow({ where: { username: "alice" } });
    const stamp = new Date("2026-01-01T00:00:00.000Z");
    await prisma.article.createMany({
      data: Array.from({ length: 500 }, (_, n) => ({
        title: `Text ${n}`,
        slug: `text-${n}`,
        content: "Body.",
        publishedAt: stamp,
        createdAt: stamp,
        authorId: alice.id,
      })),
    });

    const seen: string[] = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const res = await publicQuery<{ articles: { slug: string }[] }>(
        app,
        LIST,
        {},
        { limit: 50, offset }
      );
      for (const article of res.data?.articles ?? []) seen.push(article.slug);
    }

    expect(new Set(seen).size).toBe(500);
  });

  it("re-slugs an article that is renamed, and leaves one that is not", async () => {
    await provisionUser(ALICE);
    const id = await seedArticle("alice", { title: "First Draft", slug: "first-draft" });
    await seedArticle("alice", { title: "Second Thoughts", slug: "second-thoughts" });

    const renamed = await authedQuery<{ updateArticle: { slug: string } }>(
      app,
      RETITLE,
      ALICE,
      {},
      { id, title: "Our Manifesto" }
    );
    expect(renamed.data?.updateArticle.slug).toBe("our-manifesto");

    // Saving without changing the title must not walk the slug onto a suffix by
    // finding the row's own slug already taken.
    const again = await authedQuery<{ updateArticle: { slug: string } }>(
      app,
      RETITLE,
      ALICE,
      {},
      { id, title: "Our Manifesto" }
    );
    expect(again.data?.updateArticle.slug).toBe("our-manifesto");

    // And a rename onto a slug somebody else holds is suffixed, not refused.
    const collided = await authedQuery<{ updateArticle: { slug: string } }>(
      app,
      RETITLE,
      ALICE,
      {},
      { id, title: "Second Thoughts" }
    );
    expect(collided.data?.updateArticle.slug).toBe("second-thoughts-2");
  });

  /** `title` is nullable in the schema, so a client can send an explicit null. */
  it("refuses a null title rather than failing internally", async () => {
    await provisionUser(ALICE);
    const id = await seedArticle("alice", { title: "Manifesto" });

    const res = await authedQuery(
      app,
      `mutation ($id: ID!, $input: UpdateArticleInput!) {
        updateArticle(id: $id, input: $input) { title }
      }`,
      ALICE,
      {},
      { id, input: { title: null } }
    );

    expect(res.errors?.[0]?.message).toBe("title must not be empty.");
  });
});
