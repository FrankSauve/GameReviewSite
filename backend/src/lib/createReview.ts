import { GraphQLError } from "graphql";
import type { Game, Prisma, Review } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { badInput } from "./badInput.js";
import { getRawgGame } from "./rawg.js";
import { gameFieldsFromRawg, type RawgGameFields } from "./rawgGame.js";
import { reviewSlugBase, slugify, uniqueSlug } from "./slug.js";
import { violatesUniqueOn } from "./uniqueViolation.js";

export type ReviewFields = Pick<
  Review,
  "rating" | "content" | "yearPlayed" | "hoursPlayed" | "platform" | "genre"
>;

/** A game in the library, or a RAWG title whose first review this is. */
export type ReviewTarget = { gameId: string } | { rawgId: string };

type Resolved =
  { game: Game } | { create: RawgGameFields & { rawgId: string } };

/** What RAWG has under `rawgId`, or null when it has no such game. */
export async function rawgGameFields(
  rawgId: string,
): Promise<RawgGameFields | null> {
  const detail = await getRawgGame(parseInt(rawgId, 10));
  return detail && gameFieldsFromRawg(detail);
}

/**
 * Writes a review, and with a RAWG title not yet in the library, the game too.
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
    if (!("create" in resolved) || !violatesUniqueOn(err, "rawgId")) throw err;
    return write(
      { game: await existingGame({ rawgId: resolved.create.rawgId }) },
      fields,
      author,
    );
  }
}

async function resolve(target: ReviewTarget): Promise<Resolved> {
  if ("gameId" in target)
    return { game: await existingGame({ id: target.gameId }) };

  const game = await prisma.game.findUnique({
    where: { rawgId: target.rawgId },
  });
  if (game) return { game };
  const fields = await rawgGameFields(target.rawgId);
  if (!fields) throw notFound();
  return { create: { ...fields, rawgId: target.rawgId } };
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
