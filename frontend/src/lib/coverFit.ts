/** Below this share of the art kept, a crop loses what makes it recognisable. */
const MIN_KEPT = 0.6;

/**
 * Whether art cropped to fill its slot keeps enough of itself. Anything not
 * yet measured is cropped, as every cover was before.
 */
export function cropsWell(
  art: { width: number; height: number },
  slot: { width: number; height: number },
): boolean {
  if (art.width <= 0 || art.height <= 0 || slot.width <= 0 || slot.height <= 0)
    return true;
  const artRatio = art.width / art.height;
  const slotRatio = slot.width / slot.height;
  return (
    Math.min(artRatio, slotRatio) / Math.max(artRatio, slotRatio) >= MIN_KEPT
  );
}
