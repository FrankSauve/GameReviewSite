import {
  favoritesImageTree,
  type FavoritesImageData,
} from "./favoritesImage.js";
import { labelFor } from "./favoriteCategories.js";
import type { ImageKind } from "./shareImage.js";
import type { ImagePalette } from "./shareImagePalettes.js";
import {
  imageVersion,
  renderImage,
  type RenderedImage,
} from "./shareImageRender.js";

/** Bump when the layout changes, so a cached image or ETag is not reused. */
const LAYOUT_VERSION = 1;

export type FavoritesImageSource = Omit<FavoritesImageData, "picks"> & {
  picks: {
    category: string;
    game: { title: string; coverUrl: string | null };
  }[];
};

export function favoritesImageVersion(
  source: FavoritesImageSource,
  palette: ImagePalette,
): string {
  return imageVersion(LAYOUT_VERSION, palette, source);
}

export function renderFavoritesImage(
  kind: ImageKind,
  source: FavoritesImageSource,
  palette: ImagePalette,
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedImage> {
  return renderImage(
    `favorites:${version}:${kind}`,
    kind,
    source.picks.map((p) => p.game.coverUrl),
    (covers) =>
      favoritesImageTree(
        kind,
        {
          ...source,
          picks: source.picks.map((p) => ({
            label: labelFor(p.category),
            game: { title: p.game.title, cover: covers(p.game.coverUrl) },
          })),
        },
        palette,
      ),
    fetchImpl,
  );
}
