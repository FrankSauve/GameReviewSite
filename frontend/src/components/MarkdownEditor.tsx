import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { REVIEW_CONTENT_MAX } from "../lib/markdown";
import { applyCommand, type CommandName } from "../lib/markdownCommands";

/**
 * Preview renders through the same `Markdown` component the published review
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
  {
    name: "italic",
    label: "I",
    title: "Italic",
    className: "italic font-serif",
  },
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
  // Write and Preview share a height so switching tabs does not resize the form.
  // The full-size editor is tall at every width — a review runs long, and a
  // narrow window is no reason to write it through a slot. Short fields (a bio)
  // keep the height their `rows` asked for.
  const bodyHeight =
    rows >= 6 ? "min-h-[18rem] md:min-h-[26rem]" : "min-h-[6.5rem]";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Applied in an effect rather than straight after `onChange`: the textarea
  // still holds the old text at that point.
  const [pendingSelection, setPendingSelection] = useState<
    [number, number] | null
  >(null);

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
    // The textarea's own maxLength does not cover an insertion, and the backend
    // rejects the whole review rather than truncating it.
    if (next.text.length > maxLength) return;
    onChange(next.text);
    setPendingSelection([next.start, next.end]);
  };

  // .btn-quiet draws its own selected state from aria-selected.
  const TAB_CLASS = "btn-quiet text-sm px-3 py-1.5";

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
            className={TAB_CLASS}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={previewing}
            onClick={() => setPreviewing(true)}
            disabled={!value.trim()}
            className={TAB_CLASS}
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
                className={`btn-quiet w-8 h-8 px-0 text-sm ${tool.className ?? ""}`}
              >
                {tool.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {previewing ? (
        <div
          className={`input-field ${bodyHeight} text-base text-content-body leading-relaxed overflow-y-auto`}
        >
          <Markdown>{value}</Markdown>
        </div>
      ) : (
        <textarea
          id={id}
          ref={textareaRef}
          className={`input-field w-full resize-none text-base ${bodyHeight}`}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          required={required}
        />
      )}

      <div className="flex items-baseline justify-between mt-1">
        <p className="text-sm text-content-faint">
          Markdown supported, including ||spoilers||
        </p>
        <p className="text-sm text-content-faint">
          {value.length}/{maxLength}
        </p>
      </div>
    </div>
  );
}
