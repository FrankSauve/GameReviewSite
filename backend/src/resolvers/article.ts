import { GraphQLError } from "graphql";
import type { Article } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import { LIST_BOUNDS, clampWindow, type PageArgs } from "../lib/pagination.js";
import { requireAuth, type Context } from "../context.js";
import { byIdOrSlug, slugify, uniqueSlug } from "../lib/slug.js";
import { validateString } from "../lib/validate.js";

/** Texts: manifestos, essays, anything that is not a review. */

interface CreateArticleInput {
  title: string;
  content: string;
  published?: boolean | null;
}

interface UpdateArticleInput {
  title?: string | null;
  content?: string | null;
  published?: boolean | null;
}

/** Longer than a review's 20000; still charged against the text budget. */
export const ARTICLE_CONTENT_MAX = 50000;
export const ARTICLE_TITLE_MAX = 200;

/**
 * A draft is visible to its author and to nobody else. A filter, not a check
 * after the read, so the count and the page agree.
 */
function visibleTo(userId: string | undefined) {
  const published = { publishedAt: { not: null } };
  return userId ? { OR: [published, { authorId: userId }] } : published;
}

/**
 * `serializeDates` knows only createdAt and updatedAt. Left to itself, graphql-js
 * coerces a Date for a String field through `valueOf()` and the field arrives as
 * epoch milliseconds rather than the ISO-8601 every other timestamp here uses.
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
        // By publication, not by creation. `id` breaks the remaining ties, or
        // offset paging repeats a row on one page and drops another.
        orderBy: [
          { publishedAt: { sort: "desc", nulls: "first" } },
          { createdAt: "desc" },
          { id: "desc" },
        ],
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
          slug: await slugFor(title),
          title,
          content: validateString(input.content, "content", ARTICLE_CONTENT_MAX),
          // Published unless the author asked for a draft.
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

      const data: Partial<Pick<Article, "title" | "slug" | "content" | "publishedAt">> = {};
      if (input.title !== undefined) {
        data.title = validateString(input.title, "title", ARTICLE_TITLE_MAX);
        // The URL follows the title. A text is its title in a way a game or a
        // review is not, so a renamed one whose link still reads
        // /texts/first-draft is worse than a link that stops resolving.
        if (data.title !== existing.title)
          data.slug = await slugFor(data.title, existing.id);
      }
      if (input.content !== undefined)
        data.content = validateString(input.content, "content", ARTICLE_CONTENT_MAX);
      if (input.published !== undefined && input.published !== null) {
        // Re-publishing does not move the date: a typo fixed a year later
        // should not send the text back to the top of the index.
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
    /** Charged against the same text budget as review bodies; see lib/budget.ts. */
    content: (parent: Article, _args: unknown, { budget }: Context) =>
      budget.chargeText(parent.content, "text"),

    author: async (parent: Article, _args: unknown, { loaders }: Context) => {
      const user = await loaders.userById.load(parent.authorId);
      return user ? serializeDates(user) : null;
    },
  },
};

/**
 * The first free slug for a title. `exclude` is the row being renamed, which
 * would otherwise count as holding the slug it already has and push a text that
 * kept its title onto a "-2" suffix.
 */
async function slugFor(title: string, exclude?: string): Promise<string> {
  return uniqueSlug(
    slugify(title, "text"),
    async (candidate) =>
      (await prisma.article.count({
        where: exclude ? { slug: candidate, NOT: { id: exclude } } : { slug: candidate },
      })) > 0
  );
}

/** Accepts a slug as well as a UUID, so the edit form can use whatever the URL gave it. */
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
