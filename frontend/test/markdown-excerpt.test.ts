import { describe, expect, it } from "vitest";
import { excerpt, toPlainText } from "../src/lib/markdown";

/**
 * Card excerpts are plain text, not rendered Markdown: an excerpt sits inside a
 * link to the review, and nesting real markup there would put a link inside a
 * link. Before this existed the cards sliced the raw source, so the day reviews
 * became Markdown was the day every card showed its syntax.
 */
describe("toPlainText", () => {
  it("strips bold and italic markers", () => {
    expect(toPlainText("**Superb** and *odd*")).toBe("Superb and odd");
    expect(toPlainText("__Superb__ and _odd_")).toBe("Superb and odd");
  });

  it("strips strikethrough", () => {
    expect(toPlainText("~~not really~~ good")).toBe("not really good");
  });

  /**
   * Spoilers are the one construct that must not be unwrapped.
   *
   * An excerpt appears on the home feed and the profile views, linking to the
   * review. Hiding the twist behind a click on the review page achieves nothing
   * if the card pointing at it prints the twist underneath.
   */
  describe("spoilers", () => {
    it("redacts the hidden text rather than revealing it", () => {
      expect(toPlainText("The killer is ||the butler||.")).toBe(
        "The killer is [spoiler].",
      );
    });

    it("redacts formatting inside a spoiler too", () => {
      const out = toPlainText("It turns out ||she was **dead** all along||");
      expect(out).toBe("It turns out [spoiler]");
      expect(out).not.toContain("dead");
    });

    it("redacts each of several spoilers", () => {
      expect(toPlainText("||one|| then ||two||")).toBe(
        "[spoiler] then [spoiler]",
      );
    });

    it("does not redact across two separate spoilers", () => {
      const out = toPlainText("||a|| keep this ||b||");
      expect(out).toContain("keep this");
    });

    it("leaves an unclosed marker alone", () => {
      expect(toPlainText("a || b")).toBe("a || b");
    });

    /**
     * The renderer never pairs a marker inside code, nor one across a blank
     * line, with a real one. Where this function did, a stray `||` earlier in
     * the body shifted the pairing and printed the spoiler on the card.
     */
    it("does not pair a marker inside inline code with a real one", () => {
      const out = toPlainText("`a || b` and then ||the butler did it||");
      expect(out).toBe("a || b and then [spoiler]");
    });

    it("does not pair a marker inside a fenced block with a real one", () => {
      const out = toPlainText(
        "```\nx || y\n```\n\nEnding: ||the butler did it||",
      );
      expect(out).toBe("x || y Ending: [spoiler]");
    });

    it("does not pair markers across a blank line", () => {
      const out = toPlainText(
        "Stats: 3 || 4.\n\nThe ending: ||the butler did it||",
      );
      expect(out).toBe("Stats: 3 || 4. The ending: [spoiler]");
    });

    it("leaves a marker pair spanning two paragraphs literal, as the renderer does", () => {
      expect(toPlainText("||one\n\ntwo||")).toBe("||one two||");
    });
  });

  it("keeps link text and drops the target", () => {
    expect(toPlainText("see [the wiki](https://example.com/x)")).toBe(
      "see the wiki",
    );
  });

  it("keeps image alt text and drops the target", () => {
    expect(toPlainText("![a shot](https://example.com/s.png)")).toBe("a shot");
  });

  it("strips heading, quote and bullet markers", () => {
    expect(toPlainText("## Verdict\n\n> quoted\n\n- one\n- two")).toBe(
      "Verdict quoted one two",
    );
  });

  it("strips numbered list markers", () => {
    expect(toPlainText("1. first\n2. second")).toBe("first second");
  });

  it("keeps code content without its fences or backticks", () => {
    expect(toPlainText("run `npm test` now")).toBe("run npm test now");
    expect(toPlainText("```sh\nnpm test\n```")).toBe("npm test");
  });

  it("removes a horizontal rule rather than leaving dashes", () => {
    expect(toPlainText("above\n\n---\n\nbelow")).toBe("above below");
  });

  it("collapses all whitespace to single spaces", () => {
    expect(toPlainText("one\n\n\ntwo   three\tfour")).toBe(
      "one two three four",
    );
  });

  it("leaves plain prose untouched", () => {
    expect(toPlainText("Just an ordinary sentence.")).toBe(
      "Just an ordinary sentence.",
    );
  });
});

describe("excerpt", () => {
  it("returns short text whole, with no ellipsis", () => {
    expect(excerpt("Short one.", 180)).toBe("Short one.");
  });

  it("truncates on a word boundary and marks the cut", () => {
    const long = "word ".repeat(60).trim();
    const out = excerpt(long, 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toContain("wor…");
  });

  /**
   * A long first word cannot be broken on a space without throwing away most of
   * the budget, so it is cut mid-word instead of returning almost nothing.
   */
  it("still cuts when there is no usable space to break on", () => {
    const out = excerpt("a".repeat(200), 20);
    expect(out).toHaveLength(21);
    expect(out.endsWith("…")).toBe(true);
  });

  /** The excerpt is measured after the syntax is gone, not before. */
  it("counts visible characters, not Markdown source", () => {
    const source = "**" + "x".repeat(40) + "**";
    expect(excerpt(source, 40)).toBe("x".repeat(40));
  });
});
