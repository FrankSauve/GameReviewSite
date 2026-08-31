import { useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * A click-to-reveal spoiler. A `span` with `role="button"` rather than a real
 * `<button>`, because a spoiler may contain a link and a `<button>` wrapping an
 * `<a>` is invalid HTML — hence the hand-written keyboard handling.
 */
export function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  const toggle = () => setRevealed((v) => !v);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Space scrolls the page otherwise, which is a jarring way to read a review.
    event.preventDefault();
    toggle();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={revealed}
      aria-label={revealed ? undefined : "Reveal spoiler"}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className={
        "rounded px-1 transition-colors cursor-pointer " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 " +
        (revealed
          ? "bg-gray-800/60 text-gray-200"
          : "bg-gray-700 text-transparent select-none hover:bg-gray-600")
      }
    >
      <span aria-hidden={!revealed}>{children}</span>
    </span>
  );
}
