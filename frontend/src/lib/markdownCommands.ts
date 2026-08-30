/**
 * The text edits behind the editor toolbar.
 *
 * Pure functions over `{ text, start, end }` rather than reaching into a
 * textarea, because the interesting behaviour is where the selection ends up.
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

// `h3`, not `h1`: the renderer drops `h1` and `h2`, so a button inserting one
// would offer something that never renders.
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

/** How many of `char` run from `from`, stepping by `step`. */
function runLength(text: string, from: number, step: number, char: string): number {
  let n = 0;
  for (let i = from; i >= 0 && i < text.length && text[i] === char; i += step) n++;
  return n;
}

/**
 * Can a layer come off a run of markers this long?
 *
 * Every marker here is one character repeated, so the run is what says which
 * layers are present. A one-character marker comes off an odd run only: `*` next
 * to `**word**` is bold, and taking one from each side would demote it rather
 * than remove an italic. Three is `***word***`, which does have one to remove.
 */
function canUnwrap(run: number, marker: string): boolean {
  if (run < marker.length) return false;
  return marker.length > 1 || run % 2 === 1;
}

/** Is this selection already wrapped in this marker, markers included? */
function isWrapped(selected: string, marker: string): boolean {
  if (selected.length < marker.length * 2) return false;
  const char = marker[0];
  const lead = runLength(selected, 0, 1, char);
  const trail = runLength(selected, selected.length - 1, -1, char);
  // All markers and no body: one run, counted twice.
  if (lead + trail > selected.length) return false;
  return canUnwrap(lead, marker) && canUnwrap(trail, marker);
}

/** Do this command's markers sit immediately outside the selection? */
function isSurrounded(before: string, after: string, marker: string): boolean {
  const char = marker[0];
  return (
    canUnwrap(runLength(before, before.length - 1, -1, char), marker) &&
    canUnwrap(runLength(after, 0, 1, char), marker)
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
 * Removes only when all of them already have it, so a partly quoted block
 * becomes fully quoted rather than half of it being unquoted. Blank lines are
 * left alone in both directions: they are separators, not list items.
 */
function prefixLines(selection: Selection, prefix: string): Selection {
  const { text, start, end } = selection;

  const blockStart = text.lastIndexOf("\n", start - 1) + 1;
  // A selection ending on a newline stops at that line; the next one is not in it.
  const lastLine = end > blockStart && text[end - 1] === "\n" ? end - 1 : end;
  const newlineAfter = text.indexOf("\n", lastLine);
  const blockEnd = newlineAfter === -1 ? text.length : newlineAfter;

  const lines = text.slice(blockStart, blockEnd).split("\n");
  const filled = lines.filter((line) => line !== "");
  const removing = filled.length > 0 && filled.every((line) => line.startsWith(prefix));
  const change = (line: string) =>
    line === "" ? line : removing ? line.slice(prefix.length) : prefix + line;

  const updated = lines.map(change).join("\n");
  const shift = change(lines[0]).length - lines[0].length;
  const delta = updated.length - (blockEnd - blockStart);

  return {
    text: text.slice(0, blockStart) + updated + text.slice(blockEnd),
    start: Math.max(blockStart, start + shift),
    end: Math.max(blockStart, end + delta),
  };
}

/**
 * Selects whichever half still has to be written: the URL when there was a
 * selection to use as the label, otherwise the label.
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
