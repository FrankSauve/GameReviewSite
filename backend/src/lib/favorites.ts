import { prisma } from "./prisma.js";
import { badInput } from "./badInput.js";

/**
 * A favorite may only name a game the account has reviewed.
 *
 * Checked on the write and never again: retracting the review later leaves the
 * tile standing, because dropping someone's pick out from under them is worse
 * than the inconsistency.
 */
export async function assertReviewedByUser(
  userId: string,
  gameId: string,
): Promise<void> {
  const review = await prisma.review.findFirst({
    where: { userId, gameId },
    select: { id: true },
  });
  // One message for both "no such game" and "never reviewed it", so the field
  // cannot be used to probe which games exist.
  if (!review)
    throw badInput("You can only favorite a game you have reviewed.");
}
