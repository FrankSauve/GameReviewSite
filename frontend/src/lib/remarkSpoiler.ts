/**
 * Discord-style spoilers: `||hidden text||`.
 *
 * A remark plugin rather than a pass over the rendered output, because the
 * markers have to be understood at the same time as the rest of the Markdown.
 * Doing it afterwards would hide `||` inside a code block, and doing it before
 * parsing would mean writing a second Markdown parser to know where code blocks
 * are.
 *
 * Spoilers may contain formatting: `||the **twist**||` hides an emphasised word,
 * not the literal asterisks. That is why this works over a parent's whole child
 * list rather than one text node at a time — by the time this runs, `**twist**`
 * is already its own node, so the opening and closing markers sit in two
 * different text nodes with a `strong` between them.
 *
 * Inline code is safe for free. Its content lives on an `inlineCode` node's
 * `value` rather than in a `text` child, so a `||` typed inside backticks is
 * never a marker — while a spoiler wrapped *around* some inline code still
 * hides it, which is the behaviour people expect.
 *
 * No dependency on `unist-util-visit`: it is not a declared dependency of this
 * package, only a transitive one, and the walk this needs is a dozen lines.
 */

const MARKER = "||";

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

/** A marker position, kept out of band so an empty text node cannot mimic one. */
const MARKER_TOKEN = Symbol("spoiler-marker");
type Token = MdastNode | typeof MARKER_TOKEN;

export function remarkSpoiler() {
  return (tree: MdastNode): void => {
    transform(tree);
  };
}

function transform(node: MdastNode): void {
  if (!node.children) return;
  // Depth first, so a spoiler inside a list item is handled before the list.
  for (const child of node.children) transform(child);
  if (!node.children.some(hasMarker)) return;
  node.children = wrap(split(node.children));
}

function hasMarker(node: MdastNode): boolean {
  return node.type === "text" && (node.value ?? "").includes(MARKER);
}

/** Text nodes become their `||`-separated pieces, with the markers set aside. */
function split(children: MdastNode[]): Token[] {
  const tokens: Token[] = [];
  for (const child of children) {
    if (!hasMarker(child)) {
      tokens.push(child);
      continue;
    }
    const pieces = (child.value ?? "").split(MARKER);
    pieces.forEach((piece, i) => {
      if (i > 0) tokens.push(MARKER_TOKEN);
      if (piece) tokens.push({ type: "text", value: piece });
    });
  }
  return tokens;
}

function wrap(tokens: Token[]): MdastNode[] {
  const out: MdastNode[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token !== MARKER_TOKEN) {
      out.push(token);
      continue;
    }

    const close = tokens.indexOf(MARKER_TOKEN, i + 1);

    // An opening marker with nothing closing it was never a spoiler. Put the
    // characters back rather than swallowing them: somebody writing about a
    // table of stats should see their pipes.
    if (close === -1) {
      out.push({ type: "text", value: MARKER });
      continue;
    }

    const inner = tokens.slice(i + 1, close).filter(isNode);
    // `||||` hides nothing, so it is four characters rather than an empty box.
    out.push(
      inner.length > 0
        ? { type: "spoiler", children: inner }
        : { type: "text", value: MARKER + MARKER }
    );
    i = close;
  }

  return out;
}

function isNode(token: Token): token is MdastNode {
  return token !== MARKER_TOKEN;
}
