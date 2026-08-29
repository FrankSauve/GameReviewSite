import { GraphQLError } from "graphql";
import type { Article } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import { LIST_BOUNDS, clampWindow, type PageArgs } from "../lib/pagination.js";
import { requireAuth, type Context } from "../context.js";
import { byIdOrSlug, slugify, uniqueSlug } from "../lib/slug.js";

/**
 * Texts: manifestos, essays, anything that is not a review.
 *
 * Modelled separately rather than as a review with no game, because almost
 * nothing a review has applies — no score, no playtime, no year played, no game
 * — and a Review row with five null columns would make every one of those fields
 * nullable for the reviews too.
 */

interface CreateArticleInput {
  title: string;
  content: string;
  published?: boolean | null;
}

interface UpdateArticleInput {
  title?: string;
  content?: string;
  published?: boolean | null;
}

/**
 * Longer than a review's 20000, because a manifesto is the one thing here
 * written to be long. It is still bounded: the text budget in lib/budget.ts
 * counts these characters against the same per-request ceiling reviews draw
 * from, so an unbounded body would let one query return a book.
 */
export const ARTICLE_CONTENT_MAX = 50000;
export const ARTICLE_TITLE_MAX = 200;

function validateString(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new GraphQLError(`${field} must not be empty.`);
  if (trimmed.length > maxLength)
    throw new GraphQLError(`${field} must be at most ${maxLength} characters.`);
  return trimmed;
}

/**
 * What the caller is allowed to see.
 *
 * A draft is visible to its author and to nobody else. Written as a filter
 * rather than as a check after the read so that paging stays honest: filtering a
 * page after it has been fetched returns short pages and a total that disagrees
 * with them.
 */
function visibleTo(userId: string | undefined) {
  const published = { publishedAt: { not: null } };
  return userId ? { OR: [published, { authorId: userId }] } : published;
}

/**
 * `serializeDates` only knows about createdAt and updatedAt, and `publishedAt`
 * is a third one. Left to itself, graphql-js coerces a Date for a String field
 * through `valueOf()` and returns epoch milliseconds as a string — a different
 * shape from the ISO-8601 every other timestamp in this API uses, and one the
 * SPA would have to special-case.
 */
function serializeArticle(article: Article) {
  return {
    ...serializeDates(article),
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
  };
}

export const articleResolvers = {
  Query: {
    articles: async (_parent: unknown, args: PageArgs, context: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.articles);
      const articles = await prisma.article.findMany({
        where: visibleTo(context.user?.id),
        // By publication, not by creation: a draft written first and published
        // last belongs at the top of the index on the day it goes out.
        orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
        take,
        skip,
      });
      return context.budget.charge(articles).map(serializeArticle);
    },

    articlesCount: async (_parent: unknown, _args: unknown, context: Context) => {
      return prisma.article.count({ where: visibleTo(context.user?.id) });
    },

    article: async (_parent: unknown, { id }: { id: string }, context: Context) => {
      const article = await prisma.article.findFirst({
        where: { AND: [byIdOrSlug(id), visibleTo(context.user?.id)] },
      });
      return article ? serializeArticle(article) : null;
    },
  },

  Mutation: {
    createArticle: async (
      _parent: unknown,
      { input }: { input: CreateArticleInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      const title = validateString(input.title, "title", ARTICLE_TITLE_MAX);

      const article = await prisma.article.create({
        data: {
          slug: await uniqueSlug(
            slugify(title, "text"),
            async (candidate) =>
              (await prisma.article.count({ where: { slug: candidate } })) > 0
          ),
          title,
          content: validateString(input.content, "content", ARTICLE_CONTENT_MAX),
          // Published unless the author asked for a draft: writing something and
          // then wondering why nobody can see it is the worse default.
          publishedAt: input.published === false ? null : new Date(),
          authorId: authUser.id,
        },
      });
      return serializeArticle(article);
    },

    updateArticle: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateArticleInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      const existing = await requireAuthorship(id, authUser.id);

      const data: Partial<Pick<Article, "title" | "content" | "publishedAt">> = {};
      if (input.title !== undefined)
        data.title = validateString(input.title, "title", ARTICLE_TITLE_MAX);
      if (input.content !== undefined)
        data.content = validateString(input.content, "content", ARTICLE_CONTENT_MAX);
      if (input.published !== undefined && input.published !== null) {
        // Publishing an already-published text does not move its date: the index
        // is ordered by publication, and a typo fixed a year later should not
        // send it back to the top.
        if (input.published) data.publishedAt = existing.publishedAt ?? new Date();
        else data.publishedAt = null;
      }

      const article = await prisma.article.update({ where: { id: existing.id }, data });
      return serializeArticle(article);
    },

    deleteArticle: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      const existing = await requireAuthorship(id, authUser.id);
      await prisma.article.delete({ where: { id: existing.id } });
      return true;
    },
  },

  Article: {
    /** Charged against the same per-request text budget review bodies draw from;
     *  see lib/budget.ts. */
    content: (parent: Article, _args: unknown, { budget }: Context) =>
      budget.chargeText(parent.content, "text"),

    author: async (parent: Article, _args: unknown, { loaders }: Context) => {
      const user = await loaders.userById.load(parent.authorId);
      return user ? serializeDates(user) : null;
    },
  },
};

/**
 * Accepts a slug as well as a UUID, like every other single-entity lookup, so
 * the edit form can act on whatever the URL gave it.
 */
async function requireAuthorship(key: string, userId: string): Promise<Article> {
  const article = await prisma.article.findFirst({ where: byIdOrSlug(key) });
  if (!article)
    throw new GraphQLError("Text not found.", { extensions: { code: "NOT_FOUND" } });
  if (article.authorId !== userId)
    throw new GraphQLError("You can only modify your own texts.", {
      extensions: { code: "FORBIDDEN" },
    });
  return article;
}
