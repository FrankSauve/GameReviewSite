const STEAM_APP_PATH = /^\/store_item_assets\/steam\/apps\/(\d+)\//;

/**
 * Steam's 1920×620 library hero for a cover that is a Steam header, or null.
 * It is not in appdetails, and not every app has one, so a caller falls back.
 */
export function steamBannerUrl(coverUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(coverUrl);
  } catch {
    return null;
  }
  if (!url.hostname.endsWith(".steamstatic.com")) return null;
  const appId = STEAM_APP_PATH.exec(url.pathname)?.[1];
  return appId
    ? `${url.origin}/store_item_assets/steam/apps/${appId}/library_hero.jpg`
    : null;
}
