import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { remarkSpoiler } from "../lib/remarkSpoiler";
import { Spoiler } from "./Spoiler";

/**
 * Renders a review body as Markdown.
 *
 * Reviews are stored as the Markdown source and rendered on the way out, so the
 * text a person typed stays the durable artefact — which is the property that
 * matters for a backlog of reviews written over a decade in whatever editor was
 * to hand.
 *
 * There is no `rehype-raw` here, deliberately. Without it, raw HTML in a review
 * is escaped and displayed as text rather than parsed, so there is no injection
 * to sanitise: `<script>` in a review is four words and a pair of angle brackets.
 * Adding `rehype-raw` later would reintroduce that surface and would need
 * `rehype-sanitize` alongside it.
 *
 * `remarkBreaks` is not cosmetic. A review pasted from a text file separates its
 * lines with single newlines, which strict Markdown collapses into one paragraph;
 * every imported review would arrive as a wall of text without it.
 *
 * `remarkSpoiler` adds `||hidden||` as a node of its own type rather than raw
 * HTML, so it survives the element allow-list without `rehype-raw`.
 */

/**
 * The elements a review may produce.
 *
 * `h1` and `h2` are absent so a review cannot render a heading that outranks the
 * page's own. Anything not listed is dropped, keeping its children.
 *
 * `img` is listed but renders no `<img>` — see the `img` component below.
 */
const ALLOWED = [
  "p", "br", "hr",
  // Only ever produced by remarkSpoiler; nothing else in this renderer emits one.
  "span",
  "strong", "em", "del",
  "ul", "ol", "li",
  "blockquote",
  "code", "pre",
  "a", "img",
  "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
];

/**
 * Turns the plugin's `spoiler` node into a `span` carrying a marker attribute.
 * The cast is the price of a custom node type: `handlers` is keyed on mdast's
 * known node types, and `spoiler` is by definition not one.
 */
type RemarkRehypeOptions = ComponentProps<typeof ReactMarkdown>["remarkRehypeOptions"];

const remarkRehypeOptions = {
  handlers: {
    spoiler(state: { all: (node: unknown) => unknown[] }, node: unknown) {
      return {
        type: "element",
        tagName: "span",
        properties: { dataSpoiler: "true" },
        children: state.all(node),
      };
    },
  },
} as RemarkRehypeOptions;

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through text-gray-500">{children}</del>,
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-5 mb-3 space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-5 mb-3 space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-violet-800 pl-3 italic text-gray-400 mb-3 last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="bg-gray-800/80 text-amber-300 rounded px-1 py-0.5 text-[0.9em] font-mono">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-gray-900 border border-gray-800 rounded-lg p-3 mb-3 last:mb-0 overflow-x-auto text-xs font-mono">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-gray-800 my-4" />,
  h3: ({ children }) => (
    <h3 className="font-bold text-gray-100 text-base mt-4 mb-2 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-semibold text-gray-200 mt-3 mb-1.5 first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="font-semibold text-gray-300 mt-3 mb-1.5 first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="font-semibold text-gray-400 mt-3 mb-1.5 first:mt-0">{children}</h6>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3 last:mb-0">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-800 px-2 py-1 text-left font-semibold text-gray-300">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-800 px-2 py-1">{children}</td>
  ),
  /**
   * Renders the alt text, never an `<img>`.
   *
   * The CSP names `media.rawg.io` as the only remote image source (see
   * `frontend/security-headers.conf`), so a real `<img>` pointing anywhere else
   * would be blocked and show as a broken image. Simply excluding `img` from the
   * allow-list was the first attempt and was worse: `unwrapDisallowed` keeps an
   * element's children, and alt text is an attribute rather than a child, so the
   * image and its description both vanished and left a silent gap where the author
   * had written something.
   *
   * Widening `img-src` is a deliberate decision to take on its own; until then
   * this says what was there.
   */
  img: ({ alt }) => (
    <span className="text-xs text-gray-500 italic">
      {alt ? `[image: ${alt}]` : "[image]"}
    </span>
  ),
  // Checked rather than assumed: a future plugin emitting a `span` should not
  // silently become clickable.
  span: ({ node, children }) => {
    const isSpoiler = node?.properties?.["dataSpoiler"] !== undefined;
    return isSpoiler ? <Spoiler>{children}</Spoiler> : <span>{children}</span>;
  },
  /**
   * `noopener noreferrer` because these open in a new tab; `nofollow` because a
   * review body is user-submitted text on a public page, which is exactly what
   * link spam looks for. react-markdown's default `urlTransform` already drops
   * `javascript:` and other unsafe schemes before this runs.
   */
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className = "" }: MarkdownProps) {
  return (
    <div className={`break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkSpoiler]}
        remarkRehypeOptions={remarkRehypeOptions}
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
