import { GraphQLError } from "graphql";
import type { Game, Prisma, Review } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { badInput } from "./badInput.js";
import {
  SOURCE_COLUMN,
  gameDetail,
  gameIdentity,
  type GameIdentity,
  type GameSourceId,
} from "./gameSources/index.js";
import type { GameFields } from "./gameSources/types.js";
import { reviewSlugBase, slugify, uniqueSlug } from "./slug.js";
import { violatesUniqueOn } from "./uniqueViolation.js";

export type ReviewFields = Pick<
  Review,
  | "rating"
  | "content"
  | "yearPlayed"
  | "hoursPlayed"
  | "platform"
  | "genre"
  | "secondaryGenres"
>;

/** A game in the library, or a source's title whose first review this is. */
export type ReviewTarget =
  { gameId: string } | { source: GameSourceId; externalId: string };

type Resolved =
  | { game: Game }
  | {
      create: GameFields & GameIdentity;
      column: string;
      identity: GameIdentity;
    };

/**
 * Writes a review, and with a source's title not yet in the library, the game too.
 * A game exists only while it has a review, so the two share a transaction.
 */
export async function createReview(
  target: ReviewTarget,
  fields: ReviewFields,
  author: { id: string; slug: string },
): Promise<{ game: Game; review: Review }> {
  const resolved = await resolve(target);
  try {
    return await write(resolved, fields, author);
  } catch (err) {
    // Someone else's first review created the game since we looked; review theirs.
    if (!("create" in resolved) || !violatesUniqueOn(err, resolved.column))
      throw err;
    return write(
      { game: await existingGame(resolved.identity) },
      fields,
      author,
    );
  }
}

async function resolve(target: ReviewTarget): Promise<Resolved> {
  if ("gameId" in target)
    return { game: await existingGame({ id: target.gameId }) };

  const identity = gameIdentity(target.source, target.externalId);
  const game = await prisma.game.findUnique({ where: identity });
  if (game) return { game };
  const fields = await gameDetail(target.source, target.externalId);
  if (!fields) throw notFound();
  return {
    create: { ...fields, ...identity },
    column: SOURCE_COLUMN[target.source],
    identity,
  };
}

async function existingGame(where: Prisma.GameWhereUniqueInput): Promise<Game> {
  const game = await prisma.game.findUnique({ where });
  if (!game) throw notFound();
  return game;
}

function notFound(): GraphQLError {
  return new GraphQLError("Game not found.", {
    extensions: { code: "NOT_FOUND" },
  });
}

function write(
  target: Resolved,
  fields: ReviewFields,
  author: { id: string; slug: string },
): Promise<{ game: Game; review: Review }> {
  return prisma.$transaction(async (tx) => {
    const game =
      "game" in target
        ? target.game
        : await tx.game.create({
            data: {
              ...target.create,
              slug: await uniqueSlug(
                slugify(target.create.title, "game"),
                async (candidate) =>
                  (await tx.game.count({ where: { slug: candidate } })) > 0,
              ),
              createdById: author.id,
            },
          });

    const existing = await tx.review.findFirst({
      where: { userId: author.id, gameId: game.id },
    });
    if (existing) throw badInput("You have already reviewed this game.");

    const review = await tx.review.create({
      data: {
        ...fields,
        slug: await uniqueSlug(
          reviewSlugBase(game.slug, author.slug),
          async (candidate) =>
            (await tx.review.count({ where: { slug: candidate } })) > 0,
        ),
        userId: author.id,
        gameId: game.id,
      },
    });
    return { game, review };
  });
}
