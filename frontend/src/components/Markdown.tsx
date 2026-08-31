import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { remarkSpoiler } from "../lib/remarkSpoiler";
import { Spoiler } from "./Spoiler";

/**
 * Renders a review body as Markdown.
 *
 * No `rehype-raw`, deliberately: raw HTML is escaped and shown as text, so
 * there is no injection to sanitise. Adding it later would need
 * `rehype-sanitize` alongside.
 *
 * `remarkBreaks` is required, not cosmetic — imported reviews separate lines
 * with single newlines, which strict Markdown collapses into one paragraph.
 * `remarkSpoiler` emits its own node type rather than raw HTML, so `||hidden||`
 * survives the allow-list.
 */

/**
 * The elements a review may produce. `img` is listed but renders no `<img>` —
 * see the `img` component below.
 */
const ALLOWED = [
  "p",
  "br",
  "hr",
  // Only ever produced by remarkSpoiler; nothing else in this renderer emits one.
  "span",
  "strong",
  "em",
  "del",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "a",
  "img",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

/**
 * Turns the plugin's `spoiler` node into a `span` carrying a marker attribute.
 * The cast is the price of a custom node type: `handlers` is keyed on mdast's
 * known node types, and `spoiler` is by definition not one.
 */
type RemarkRehypeOptions = ComponentProps<
  typeof ReactMarkdown
>["remarkRehypeOptions"];

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

/**
 * Demoted two ranks and clamped at `h6`, so a review's `#` can never outrank
 * the page's own title. Size still tracks the Markdown level.
 */
function heading(tag: "h3" | "h4" | "h5" | "h6", className: string) {
  const Tag = tag;
  return function Heading({ children }: { children?: ReactNode }) {
    return <Tag className={className}>{children}</Tag>;
  };
}

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="line-through text-gray-500">{children}</del>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-5 mb-3 space-y-1 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-5 mb-3 space-y-1 last:mb-0">
      {children}
    </ol>
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
  h1: heading("h3", "font-bold text-gray-100 text-xl mt-5 mb-2 first:mt-0"),
  h2: heading("h4", "font-bold text-gray-100 text-lg mt-4 mb-2 first:mt-0"),
  h3: heading("h5", "font-bold text-gray-100 text-base mt-4 mb-2 first:mt-0"),
  h4: heading("h6", "font-semibold text-gray-200 mt-3 mb-1.5 first:mt-0"),
  h5: heading("h6", "font-semibold text-gray-300 mt-3 mb-1.5 first:mt-0"),
  h6: heading("h6", "font-semibold text-gray-400 mt-3 mb-1.5 first:mt-0"),
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
   * Renders the alt text, never an `<img>`: the CSP names `media.rawg.io` as
   * the only remote image source (see frontend/security-headers.conf), so a
   * real `<img>` elsewhere would show as broken.
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
   * `nofollow` because a review body is user-submitted text on a public page.
   * react-markdown's `urlTransform` drops unsafe schemes before this runs.
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
