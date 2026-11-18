import {
  awardsImageTree,
  drawnEntries,
  type AwardsImageData,
} from "./awardsImage.js";
import type { ImageKind } from "./shareImage.js";
import type { ImagePalette } from "./shareImagePalettes.js";
import {
  imageVersion,
  renderImage,
  type RenderedImage,
} from "./shareImageRender.js";

/** Bump when the layout changes, so a cached image or ETag is not reused. */
const LAYOUT_VERSION = 2;

type SourceGame = { title: string; coverUrl: string | null };

export type AwardsImageSource = Omit<
  AwardsImageData,
  "ranking" | "categories"
> & {
  ranking: { rank: number; game: SourceGame }[];
  categories: { name: string; game: SourceGame }[];
};

export function awardsImageVersion(
  source: AwardsImageSource,
  palette: ImagePalette,
): string {
  return imageVersion(LAYOUT_VERSION, palette, source);
}

export function renderAwardsImage(
  kind: ImageKind,
  source: AwardsImageSource,
  palette: ImagePalette,
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedImage> {
  const drawn = drawnEntries(kind, source);
  const entries = [...drawn.ranking, ...drawn.categories];
  return renderImage(
    `awards:${version}:${kind}`,
    kind,
    entries.map((e) => e.game.coverUrl),
    (covers) => {
      const game = (g: SourceGame) => ({
        title: g.title,
        cover: covers(g.coverUrl),
      });
      const data: AwardsImageData = {
        ...source,
        ranking: source.ranking.map((r) => ({
          rank: r.rank,
          game: game(r.game),
        })),
        categories: source.categories.map((c) => ({
          name: c.name,
          game: game(c.game),
        })),
      };
      return awardsImageTree(kind, data, palette);
    },
    fetchImpl,
  );
}
