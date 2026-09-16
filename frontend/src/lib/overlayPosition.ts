/** The gap an overlay keeps from its anchor, and the one it keeps from the viewport edge. */
const GAP = 8;
const EDGE = 8;

export interface Size {
  width: number;
  height: number;
}

export interface AnchorRect extends Size {
  top: number;
  left: number;
}

export interface Position {
  top: number;
  left: number;
}

/** Which edge of the overlay lines up with the anchor. */
export type Align = "start" | "center";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where to pin an overlay that opens below `anchor`, in viewport coordinates.
 *
 * It flips above only when below overflows *and* above has room: an overlay
 * taller than the viewport would otherwise flip into a worse position than the
 * one it started in.
 */
export function positionBelow(
  anchor: AnchorRect,
  overlay: Size,
  viewport: Size,
  align: Align = "start",
): Position {
  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - overlay.height - GAP;
  const lowest = viewport.height - overlay.height - EDGE;
  const flip = below > lowest && above >= EDGE;
  const left =
    align === "center"
      ? anchor.left + anchor.width / 2 - overlay.width / 2
      : anchor.left;
  return {
    top: flip ? above : clamp(below, EDGE, lowest),
    left: clamp(left, EDGE, viewport.width - overlay.width - EDGE),
  };
}
