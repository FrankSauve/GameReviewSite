import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { REVIEW_CONTENT_MAX } from "../lib/markdown";
import { applyCommand, type CommandName } from "../lib/markdownCommands";

/**
 * The review body editor: a toolbar, a Write/Preview switch, and a counter.
 *
 * One component used by both the write and the edit form, which previously had
 * different affordances for the same field — the write form had a preview
 * toggle and the edit form on the review page had a bare textarea, so correcting
 * a review offered less than writing one.
 *
 * The preview renders through the same `Markdown` component the published review
 * uses, so what it shows and what gets posted cannot drift.
 */

interface Tool {
  name: CommandName;
  label: string;
  title: string;
  className?: string;
}

const TOOLS: Tool[] = [
  { name: "bold", label: "B", title: "Bold", className: "font-bold" },
  { name: "italic", label: "I", title: "Italic", className: "italic font-serif" },
  {
    name: "strikethrough",
    label: "S",
    title: "Strikethrough",
    className: "line-through",
  },
  { name: "heading", label: "H", title: "Heading" },
  { name: "quote", label: "❝", title: "Quote" },
  { name: "bullet", label: "•", title: "Bulleted list" },
  { name: "code", label: "‹›", title: "Code" },
  { name: "link", label: "🔗", title: "Link" },
  { name: "spoiler", label: "▮", title: "Spoiler" },
];

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}

export function MarkdownEditor({
  value,
  onChange,
  id,
  rows = 6,
  placeholder,
  required,
  maxLength = REVIEW_CONTENT_MAX,
}: MarkdownEditorProps) {
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Where the selection should land once React has written the new value.
   *
   * Set during the click and applied in an effect rather than straight after
   * `onChange`, because the textarea still holds the old text at that point —
   * setting the range there would place it against the wrong string and the
   * re-render would drop it anyway.
   */
  const [pendingSelection, setPendingSelection] = useState<[number, number] | null>(
    null
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!pendingSelection || !el) return;
    el.focus();
    el.setSelectionRange(pendingSelection[0], pendingSelection[1]);
    setPendingSelection(null);
  }, [pendingSelection]);

  const run = (name: CommandName) => {
    const el = textareaRef.current;
    if (!el) return;
    const next = applyCommand(name, {
      text: value,
      start: el.selectionStart,
      end: el.selectionEnd,
    });
    onChange(next.text);
    setPendingSelection([next.start, next.end]);
  };

  const tab = (active: boolean) =>
    `px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
      active
        ? "bg-gray-800 text-gray-200"
        : "text-gray-500 hover:text-gray-300"
    }`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        {/* Write / Preview */}
        <div className="flex items-center gap-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!previewing}
            onClick={() => setPreviewing(false)}
            className={tab(!previewing)}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={previewing}
            onClick={() => setPreviewing(true)}
            disabled={!value.trim()}
            className={`${tab(previewing)} disabled:text-gray-700 disabled:cursor-not-allowed`}
          >
            Preview
          </button>
        </div>

        {/* Formatting. Hidden in preview, where there is no selection to act on. */}
        {!previewing && (
          <div className="flex items-center gap-0.5">
            {TOOLS.map((tool) => (
              <button
                key={tool.name}
                type="button"
                title={tool.title}
                aria-label={tool.title}
                // The textarea loses focus on mousedown otherwise, taking the
                // selection the command is about to act on with it.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(tool.name)}
                className={`w-7 h-7 rounded-md text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors ${tool.className ?? ""}`}
              >
                {tool.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {previewing ? (
        <div className="input-field min-h-[6.5rem] text-sm text-gray-300 leading-relaxed overflow-y-auto">
          <Markdown>{value}</Markdown>
        </div>
      ) : (
        <textarea
          id={id}
          ref={textareaRef}
          className="input-field w-full resize-none text-sm"
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          required={required}
        />
      )}

      <div className="flex items-baseline justify-between mt-1">
        <p className="text-xs text-gray-600">
          Markdown supported, including ||spoilers||
        </p>
        <p className="text-xs text-gray-600">
          {value.length}/{maxLength}
        </p>
      </div>
    </div>
  );
}
