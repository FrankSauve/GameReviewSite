/**
 * The text edits behind the editor toolbar.
 *
 * Kept as pure functions over `{ text, start, end }` rather than reaching into a
 * textarea, because the interesting behaviour is entirely about where the
 * selection ends up: wrapping a word has to leave that word selected so a second
 * button applies to it, and toggling a bullet on three lines has to keep all
 * three selected. That is fiddly enough to be worth testing directly, and none
 * of it needs a DOM to be true.
 */

export interface Selection {
  text: string;
  start: number;
  end: number;
}

export type CommandName =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "spoiler"
  | "heading"
  | "quote"
  | "bullet"
  | "link";

/** Text inserted when a command is used with nothing selected. */
const PLACEHOLDER: Record<string, string> = {
  bold: "bold text",
  italic: "italic text",
  strikethrough: "struck text",
  code: "code",
  spoiler: "spoiler",
};

const WRAPPERS: Partial<Record<CommandName, string>> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  code: "`",
  spoiler: "||",
};

/**
 * `h3`, not `h1`. The renderer drops `h1` and `h2` so a review cannot outrank
 * the page's own heading — a toolbar that inserted one would be offering
 * something that silently does not render.
 */
const PREFIXES: Partial<Record<CommandName, string>> = {
  heading: "### ",
  quote: "> ",
  bullet: "- ",
};

export function applyCommand(name: CommandName, selection: Selection): Selection {
  const wrapper = WRAPPERS[name];
  if (wrapper) return wrap(selection, wrapper, PLACEHOLDER[name] ?? "");

  const prefix = PREFIXES[name];
  if (prefix) return prefixLines(selection, prefix);

  return link(selection);
}

/**
 * Is this selection already wrapped in exactly this marker?
 *
 * The length guard is what stops italic reading `**bold**` as an italic wrap
 * around `*bold*` and quietly demoting it. A run longer than the marker means
 * the marker is part of something else, so the command adds a layer instead of
 * removing one.
 */
function isWrapped(selected: string, marker: string): boolean {
  if (selected.length < marker.length * 2) return false;
  if (!selected.startsWith(marker) || !selected.endsWith(marker)) return false;
  if (marker.length > 1) return true;
  const inner = selected.slice(marker.length, -marker.length);
  return !inner.startsWith(marker) && !inner.endsWith(marker);
}

/**
 * Do this command's markers sit immediately outside the selection?
 *
 * Same trap as `isWrapped`, from the other side. After bolding a word the
 * selection is the word itself and `**` sits either side of it, so an italic
 * command asking only "is there a `*` next to me?" would answer yes and strip
 * one from each side — turning bold into italic instead of adding it.
 */
function isSurrounded(before: string, after: string, marker: string): boolean {
  if (!before.endsWith(marker) || !after.startsWith(marker)) return false;
  if (marker.length > 1) return true;
  return (
    !before.slice(0, -marker.length).endsWith(marker) &&
    !after.slice(marker.length).startsWith(marker)
  );
}

function wrap(selection: Selection, marker: string, placeholder: string): Selection {
  const { text, start, end } = selection;
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  // Selected including the markers: unwrap.
  if (isWrapped(selected, marker)) {
    const inner = selected.slice(marker.length, -marker.length);
    return { text: before + inner + after, start, end: start + inner.length };
  }

  // Selected inside the markers: unwrap those instead, so pressing the same
  // button twice is a round trip rather than `****bold****`.
  if (isSurrounded(before, after, marker)) {
    return {
      text: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }

  const body = selected || placeholder;
  const at = start + marker.length;
  return {
    text: before + marker + body + marker + after,
    start: at,
    end: at + body.length,
  };
}

/**
 * Adds or removes a line prefix across every line the selection touches.
 *
 * Removes only when *all* of them already have it, so a partly quoted block
 * becomes fully quoted rather than half of it being unquoted.
 */
function prefixLines(selection: Selection, prefix: string): Selection {
  const { text, start, end } = selection;

  const blockStart = text.lastIndexOf("\n", start - 1) + 1;
  const newlineAfter = text.indexOf("\n", end);
  const blockEnd = newlineAfter === -1 ? text.length : newlineAfter;

  const lines = text.slice(blockStart, blockEnd).split("\n");
  const removing = lines.every((line) => line.startsWith(prefix));
  const updated = lines
    .map((line) => (removing ? line.slice(prefix.length) : prefix + line))
    .join("\n");

  const shift = removing ? -prefix.length : prefix.length;
  const delta = updated.length - (blockEnd - blockStart);

  return {
    text: text.slice(0, blockStart) + updated + text.slice(blockEnd),
    start: Math.max(blockStart, start + shift),
    end: Math.max(blockStart, end + delta),
  };
}

/**
 * Selects whichever half still has to be written, so the click is followed by
 * typing rather than by re-aiming the cursor.
 *
 * With text selected that is the URL: the label is already what the writer
 * highlighted. With nothing selected both halves are placeholders, and the label
 * comes first — reading and writing order agree.
 */
function link(selection: Selection): Selection {
  const { text, start, end } = selection;
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  const label = selected || "text";
  const result = `${before}[${label}](url)${after}`;

  if (!selected) {
    return { text: result, start: start + 1, end: start + 1 + label.length };
  }

  const urlStart = start + label.length + 3;
  return { text: result, start: urlStart, end: urlStart + 3 };
}
