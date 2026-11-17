import { prisma } from "./prisma.js";
import type { AwardsImageSource } from "./awardsImageRender.js";

const GAME = { select: { title: true, coverUrl: true } } as const;

/** Null for a year with nothing in it: an empty year has no image. */
export async function loadAwardsImageSource(
  user: { id: string; username: string; slug: string },
  year: number,
  site: string,
): Promise<AwardsImageSource | null> {
  const where = { userId: user.id, year };
  const [ranking, categories] = await Promise.all([
    prisma.awardRank.findMany({
      where,
      orderBy: { rank: "asc" },
      select: { rank: true, game: GAME },
    }),
    prisma.awardCategory.findMany({
      where,
      orderBy: { position: "asc" },
      select: { name: true, game: GAME },
    }),
  ]);
  if (ranking.length === 0 && categories.length === 0) return null;
  return {
    username: user.username,
    slug: user.slug,
    year,
    site,
    ranking,
    categories,
  };
}
