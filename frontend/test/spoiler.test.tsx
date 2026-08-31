// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Markdown } from "../src/components/Markdown";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

function renderMarkdown(source: string) {
  return render(<Markdown>{source}</Markdown>);
}

const spoiler = () => screen.getByRole("button");

describe("spoilers", () => {
  it("hides the text behind a control", () => {
    renderMarkdown("The killer is ||the butler||.");
    expect(spoiler()).toBeTruthy();
    expect(spoiler().textContent).toBe("the butler");
    expect(spoiler().getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves the surrounding sentence alone", () => {
    const { container } = renderMarkdown("The killer is ||the butler||.");
    expect(container.textContent).toBe("The killer is the butler.");
  });

  it("reveals on click and hides again", () => {
    renderMarkdown("||boo||");
    fireEvent.click(spoiler());
    expect(spoiler().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(spoiler());
    expect(spoiler().getAttribute("aria-expanded")).toBe("false");
  });

  it("reveals from the keyboard", () => {
    renderMarkdown("||boo||");
    expect(spoiler().getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(spoiler(), { key: "Enter" });
    expect(spoiler().getAttribute("aria-expanded")).toBe("true");
  });

  /**
   * A spoiler that is only visually covered is not a spoiler for everyone, so
   * the hidden text is out of the accessibility tree until it is revealed.
   */
  it("keeps the hidden text out of the accessibility tree", () => {
    const { container } = renderMarkdown("||boo||");
    const inner = container.querySelector("[aria-hidden]");
    expect(inner?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(spoiler());
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("hides formatting rather than showing its syntax", () => {
    renderMarkdown("||the **twist**||");
    expect(spoiler().textContent).toBe("the twist");
    expect(spoiler().querySelector("strong")?.textContent).toBe("twist");
  });

  it("handles more than one spoiler in a paragraph", () => {
    renderMarkdown("||one|| and ||two||");
    const spoilers = screen.getAllByRole("button");
    expect(spoilers).toHaveLength(2);
    expect(spoilers.map((s) => s.textContent)).toEqual(["one", "two"]);
  });

  it("reveals each spoiler independently", () => {
    renderMarkdown("||one|| and ||two||");
    const [first, second] = screen.getAllByRole("button");
    if (!first || !second) throw new Error("expected two spoiler buttons");
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("false");
  });

  it("works inside a list item", () => {
    renderMarkdown("- the ending is ||sad||");
    expect(spoiler().textContent).toBe("sad");
    expect(spoiler().closest("li")).toBeTruthy();
  });

  /** `||` inside backticks is two pipes somebody typed, not a marker. */
  it("does not treat pipes inside inline code as markers", () => {
    const { container } = renderMarkdown("Use `a || b` for that.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("a || b");
  });

  it("does not treat pipes inside a fenced block as markers", () => {
    const { container } = renderMarkdown("```\nif (a || b) {}\n```");
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("pre")?.textContent).toContain("a || b");
  });

  it("wraps a spoiler around inline code when asked to", () => {
    renderMarkdown("||`rosebud`||");
    expect(spoiler().querySelector("code")?.textContent).toBe("rosebud");
  });

  /** Somebody writing about pipes should get their pipes back. */
  it("leaves an unclosed marker as literal text", () => {
    const { container } = renderMarkdown("a || b");
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("a || b");
  });

  it("leaves an empty spoiler as literal text", () => {
    const { container } = renderMarkdown("nothing ||||");
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("nothing ||||");
  });

  it("does not render raw HTML inside a spoiler", () => {
    const { container } = renderMarkdown("||<script>alert(1)</script>||");
    expect(container.querySelector("script")).toBeNull();
    expect(spoiler().textContent).toContain("alert(1)");
  });
});
