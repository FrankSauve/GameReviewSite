import { prisma } from "./prisma.js";
import { imagePalette, type ImagePalette } from "./awardsImagePalettes.js";
import {
  awardsImageVersion,
  type AwardsImageSource,
} from "./awardsImageRender.js";

const GAME = { select: { title: true, coverUrl: true } } as const;

export interface AwardsImage {
  source: AwardsImageSource;
  palette: ImagePalette;
  version: string;
}

/** Null for a year with nothing in it: an empty year has no image. */
export async function loadAwardsImage(
  user: { id: string; username: string; slug: string; palette: string | null },
  year: number,
  site: string,
): Promise<AwardsImage | null> {
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
  const source: AwardsImageSource = {
    username: user.username,
    slug: user.slug,
    year,
    site,
    ranking,
    categories,
  };
  const palette = imagePalette(user.palette);
  return { source, palette, version: awardsImageVersion(source, palette) };
}
