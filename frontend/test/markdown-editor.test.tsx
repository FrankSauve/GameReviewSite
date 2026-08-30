// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarkdownEditor } from "../src/components/MarkdownEditor";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

/**
 * Controlled, like both real call sites, so a toolbar click actually round-trips
 * through a parent's state rather than being swallowed by a stub.
 */
function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MarkdownEditor value={value} onChange={setValue} />;
}

const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const tool = (name: string) => screen.getByRole("button", { name });

function select(from: number, to: number) {
  const el = textarea();
  el.focus();
  el.setSelectionRange(from, to);
}

describe("MarkdownEditor", () => {
  describe("toolbar", () => {
    it("wraps the selected text", () => {
      render(<Harness initial="a word here" />);
      select(2, 6);
      fireEvent.click(tool("Bold"));
      expect(textarea().value).toBe("a **word** here");
    });

    it("leaves the formatted text selected, so a second click compounds", () => {
      render(<Harness initial="a word here" />);
      select(2, 6);
      fireEvent.click(tool("Bold"));
      fireEvent.click(tool("Italic"));
      expect(textarea().value).toBe("a ***word*** here");
    });

    /**
     * `maxLength` stops typing past the cap but not an insertion, and the
     * backend rejects an over-long review outright.
     */
    it("refuses a command that would push the body past the cap", () => {
      render(<Harness initial={"x".repeat(20000)} />);
      select(0, 20000);
      fireEvent.click(tool("Bold"));
      expect(textarea().value).toBe("x".repeat(20000));
    });

    it("inserts a spoiler", () => {
      render(<Harness initial="the butler" />);
      select(4, 10);
      fireEvent.click(tool("Spoiler"));
      expect(textarea().value).toBe("the ||butler||");
    });

    it("prefixes a line for quotes and lists", () => {
      render(<Harness initial="hello" />);
      select(0, 0);
      fireEvent.click(tool("Quote"));
      expect(textarea().value).toBe("> hello");
    });

    /**
     * mousedown on a toolbar button would blur the textarea and take the
     * selection with it, so the command would act on an empty range.
     */
    it("keeps the selection when the button takes a mousedown", () => {
      render(<Harness initial="a word here" />);
      select(2, 6);
      const bold = tool("Bold");
      fireEvent.mouseDown(bold);
      fireEvent.click(bold);
      expect(textarea().value).toBe("a **word** here");
    });

    it("returns focus to the textarea", () => {
      render(<Harness initial="a word here" />);
      select(2, 6);
      fireEvent.click(tool("Bold"));
      expect(document.activeElement).toBe(textarea());
    });
  });

  describe("write and preview", () => {
    it("starts on the write tab", () => {
      render(<Harness initial="hello" />);
      expect(
        screen
          .getByRole("tab", { name: "Write" })
          .getAttribute("aria-selected"),
      ).toBe("true");
      expect(textarea()).toBeTruthy();
    });

    it("renders the markdown when previewing", () => {
      render(<Harness initial="**bold** and ||hidden||" />);
      fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByText("bold").tagName).toBe("STRONG");
      // Rendered through the same component the published review uses, so the
      // spoiler is a real spoiler in the preview too.
      expect(
        screen.getByRole("button", { name: "Reveal spoiler" }),
      ).toBeTruthy();
    });

    it("goes back to the text on the write tab", () => {
      render(<Harness initial="**bold**" />);
      fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
      fireEvent.click(screen.getByRole("tab", { name: "Write" }));
      expect(textarea().value).toBe("**bold**");
    });

    it("cannot preview an empty review", () => {
      render(<Harness />);
      expect(screen.getByRole("tab", { name: "Preview" })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("hides the toolbar while previewing, there being no selection to act on", () => {
      render(<Harness initial="hello" />);
      expect(screen.queryByRole("button", { name: "Bold" })).toBeTruthy();
      fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
      expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
    });
  });

  it("reports what the writer typed", () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} />);
    fireEvent.change(textarea(), { target: { value: "typed" } });
    expect(onChange).toHaveBeenCalledWith("typed");
  });

  it("counts characters against the limit", () => {
    render(<Harness initial="abc" />);
    expect(screen.getByText("3/20000")).toBeTruthy();
  });
});
