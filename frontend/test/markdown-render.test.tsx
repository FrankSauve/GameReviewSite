// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Markdown } from "../src/components/Markdown";

/**
 * @testing-library/react only registers its own cleanup when the runner exposes
 * globals, and this project runs vitest without them. Most assertions here are
 * scoped to their own render's container and so survive without it, but the two
 * that use `screen` would start matching earlier renders.
 */
afterEach(cleanup);

/**
 * jsdom is selected per file rather than globally: the rest of the suite tests
 * pure functions and gains nothing from a DOM.
 *
 * The point of these tests is the security property. Reviews are public,
 * user-submitted text rendered into other people's browsers, and the reason there
 * is no sanitiser in the pipeline is that `rehype-raw` is absent — so what needs
 * pinning is that raw HTML stays inert. If someone adds `rehype-raw` for a
 * legitimate reason, these fail.
 */
describe("Markdown formatting", () => {
  it("renders paragraphs separately", () => {
    const { container } = render(
      <Markdown>{"First para.\n\nSecond para."}</Markdown>,
    );
    const paras = container.querySelectorAll("p");
    expect(paras).toHaveLength(2);
    expect(paras[0]?.textContent).toBe("First para.");
    expect(paras[1]?.textContent).toBe("Second para.");
  });

  it("renders bold and italic", () => {
    const { container } = render(
      <Markdown>{"**bold** and *italic*"}</Markdown>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
  });

  it("renders lists", () => {
    const { container } = render(
      <Markdown>{"- one\n- two\n- three"}</Markdown>,
    );
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });

  it("renders blockquotes and inline code", () => {
    const { container } = render(<Markdown>{"> quoted\n\n`code`"}</Markdown>);
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  /** GFM, so strikethrough and tables work without extra configuration. */
  it("renders GFM strikethrough", () => {
    const { container } = render(<Markdown>{"~~struck~~"}</Markdown>);
    expect(container.querySelector("del")?.textContent).toBe("struck");
  });

  /**
   * The reason remark-breaks is in the pipeline. Reviews imported from text files
   * separate lines with single newlines; strict Markdown would run them together
   * into one line of prose.
   */
  it("keeps a single newline as a line break", () => {
    const { container } = render(<Markdown>{"line one\nline two"}</Markdown>);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});

describe("Markdown is not an HTML injection point", () => {
  it("does not execute or parse a script tag", () => {
    const { container } = render(
      <Markdown>{"<script>window.pwned = 1</script>"}</Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
    expect(container.textContent).toContain("window.pwned = 1");
  });

  it("does not create an element from an onerror payload", () => {
    const { container } = render(
      <Markdown>{'<img src=x onerror="window.pwned = 1">'}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it("does not parse inline event handlers on allowed tags", () => {
    const { container } = render(
      <Markdown>{'<b onmouseover="window.pwned = 1">hover</b>'}</Markdown>,
    );
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("hover");
  });

  /** react-markdown's default urlTransform drops unsafe schemes. */
  it("neutralises a javascript: link", () => {
    render(<Markdown>{"[click](javascript:window.pwned=1)"}</Markdown>);
    const link = screen.getByText("click").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("keeps an ordinary link, but not as a same-tab bare link", () => {
    render(<Markdown>{"[hltb](https://howlongtobeat.com/)"}</Markdown>);
    const link = screen.getByText("hltb").closest("a");
    expect(link?.getAttribute("href")).toBe("https://howlongtobeat.com/");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(link?.getAttribute("target")).toBe("_blank");
  });
});

describe("Markdown element allow-list", () => {
  /** Demoted two ranks, so neither can outrank the page's own heading. */
  it("renders # and ## as headings, but never as an h1 or h2", () => {
    const { container } = render(<Markdown>{"# Huge\n\n## Large"}</Markdown>);
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Huge");
    expect(container.querySelector("h4")?.textContent).toBe("Large");
  });

  it("keeps the deeper headings distinct and clamped at h6", () => {
    const { container } = render(
      <Markdown>{"### Verdict\n\n#### Detail\n\n###### Aside"}</Markdown>,
    );
    expect(container.querySelector("h5")?.textContent).toBe("Verdict");
    const sixes = [...container.querySelectorAll("h6")].map(
      (h) => h.textContent,
    );
    expect(sixes).toEqual(["Detail", "Aside"]);
  });

  /**
   * The CSP names media.rawg.io as the only remote image source, so a real <img>
   * would be blocked and show broken. Excluding `img` from the allow-list instead
   * lost the alt text too, because `unwrapDisallowed` keeps children and alt text
   * is an attribute — so an image became a silent gap.
   */
  it("renders an image as its alt text and never as an img element", () => {
    const { container } = render(
      <Markdown>{"![a screenshot](https://example.com/s.png)"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("a screenshot");
  });

  it("still says something for an image with no alt text", () => {
    const { container } = render(
      <Markdown>{"![](https://example.com/s.png)"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("[image]");
  });
});
