import { prisma } from "./prisma.js";
import type { ImageOwner } from "./shareImage.js";
import { imagePalette, type ImagePalette } from "./shareImagePalettes.js";
import {
  inGridOrder,
  isFavoriteCategory,
  labelFor,
} from "./favoriteCategories.js";
import {
  favoritesImageVersion,
  type FavoritesImageSource,
} from "./favoritesImageRender.js";

export interface FavoritesImage {
  source: FavoritesImageSource;
  palette: ImagePalette;
  version: string;
}

/** Null for an empty grid: nothing should be drawn to show there is nothing. */
export async function loadFavoritesImage(
  user: ImageOwner,
  site: string,
): Promise<FavoritesImage | null> {
  const rows = await prisma.favoriteGame.findMany({
    where: { userId: user.id },
    select: {
      category: true,
      game: { select: { title: true, coverUrl: true } },
    },
  });
  // Only what the grid draws: a retired category's pick is stored but unseen.
  const picks = inGridOrder(
    rows.filter((r) => isFavoriteCategory(r.category)),
  ).map((r) => ({ ...r, label: labelFor(r.category) }));
  if (picks.length === 0) return null;
  const source: FavoritesImageSource = {
    username: user.username,
    slug: user.slug,
    site,
    picks,
  };
  const palette = imagePalette(user.palette);
  return { source, palette, version: favoritesImageVersion(source, palette) };
}
