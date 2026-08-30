// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
afterEach(cleanup);

import { AuthProvider } from "../src/contexts/AuthContext";
import { GET_ME } from "../src/graphql/mutations";
import { GET_ARTICLE, GET_ARTICLES } from "../src/graphql/queries";
import { ArticlesPage } from "../src/pages/ArticlesPage";
import { ArticleDetailPage } from "../src/pages/ArticleDetailPage";
import { ArticleEditorPage } from "../src/pages/ArticleEditorPage";
import { CREATE_ARTICLE } from "../src/graphql/mutations";

/**
 * The articles section.
 *
 * The server decides what a reader may see, so these are about what the page
 * does with the answer: a draft has to be labelled as one, and the edit and
 * delete controls have to be absent on somebody else's article — offering them
 * produces a failed mutation instead of a missing button, which is a worse way
 * to find out.
 */

const ME = { __typename: "User", id: "u1", slug: "simon", username: "simon", email: null };
const OTHER = { __typename: "User", id: "u2", username: "someone-else", email: null };

function meMock(user: typeof ME | null) {
  return { request: { query: GET_ME }, result: { data: { me: user } } };
}

const article = (over: Record<string, unknown> = {}) => ({
  __typename: "Article",
  id: "a1",
  slug: "our-manifesto",
  title: "Our Manifesto",
  publishedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  author: ME,
  ...over,
});

function indexMock(articles: Record<string, unknown>[]) {
  return {
    request: { query: GET_ARTICLES, variables: { limit: 20, offset: 0 } },
    result: { data: { articles, articlesCount: articles.length } },
  };
}

function detailMock(over: Record<string, unknown> = {}) {
  return {
    request: { query: GET_ARTICLE, variables: { id: "our-manifesto" } },
    result: {
      data: {
        article: {
          ...article(over),
          content: "We believe **things**.",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    },
  };
}

function renderPage(
  mocks: readonly unknown[],
  path: string,
  routePath: string,
  element: React.ReactElement
) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </MockedProvider>
  );
}

describe("the articles index", () => {
  it("lists what the server returned", async () => {
    renderPage(
      [meMock(null), indexMock([article(), article({ id: "a2", slug: "notes", title: "Notes" })])],
      "/articles",
      "/articles",
      <ArticlesPage />
    );

    await waitFor(() => expect(screen.getByText("Our Manifesto")).toBeTruthy());
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Our Manifesto/ }).getAttribute("href")).toBe(
      "/articles/our-manifesto"
    );
  });

  it("marks a draft as one", async () => {
    renderPage(
      [meMock(ME), indexMock([article({ publishedAt: null })])],
      "/articles",
      "/articles",
      <ArticlesPage />
    );

    await waitFor(() => expect(screen.getByText("Draft")).toBeTruthy());
  });

  it("offers writing only to someone signed in", async () => {
    renderPage([meMock(null), indexMock([article()])], "/articles", "/articles", <ArticlesPage />);
    await waitFor(() => expect(screen.getByText("Our Manifesto")).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Write an article" })).toBeNull();

    cleanup();

    renderPage([meMock(ME), indexMock([article()])], "/articles", "/articles", <ArticlesPage />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Write an article" })).toBeTruthy()
    );
  });

  it("says so when nothing has been written", async () => {
    renderPage([meMock(null), indexMock([])], "/articles", "/articles", <ArticlesPage />);
    await waitFor(() => expect(screen.getByText("Nothing written yet")).toBeTruthy());
  });
});

describe("one article", () => {
  it("renders the body as markdown", async () => {
    renderPage(
      [meMock(null), detailMock()],
      "/articles/our-manifesto",
      "/articles/:id",
      <ArticleDetailPage />
    );

    await waitFor(() => expect(screen.getByText("Our Manifesto")).toBeTruthy());
    // The ** markers are rendered, not shown.
    expect(screen.getByText("things").tagName).toBe("STRONG");
  });

  it("offers edit and delete to the author", async () => {
    renderPage(
      [meMock(ME), detailMock()],
      "/articles/our-manifesto",
      "/articles/:id",
      <ArticleDetailPage />
    );

    await waitFor(() => expect(screen.getByRole("link", { name: "Edit" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("offers neither to anybody else", async () => {
    renderPage(
      [meMock(ME), detailMock({ author: OTHER })],
      "/articles/our-manifesto",
      "/articles/:id",
      <ArticleDetailPage />
    );

    await waitFor(() => expect(screen.getByText("Our Manifesto")).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("says so when the article is not there", async () => {
    renderPage(
      [
        meMock(null),
        {
          request: { query: GET_ARTICLE, variables: { id: "gone" } },
          result: { data: { article: null } },
        },
      ],
      "/articles/gone",
      "/articles/:id",
      <ArticleDetailPage />
    );

    await waitFor(() => expect(screen.getByText("This article is not here")).toBeTruthy());
  });
});

describe("writing an article", () => {
  it("asks an anonymous visitor to sign in rather than showing the form", async () => {
    renderPage([meMock(null)], "/articles/new", "/articles/new", <ArticleEditorPage />);

    await waitFor(() => expect(screen.getByText("to write an article.")).toBeTruthy());
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("refuses to fill the form with somebody else's article", async () => {
    renderPage(
      [meMock(ME), detailMock({ author: OTHER })],
      "/articles/our-manifesto/edit",
      "/articles/:id/edit",
      <ArticleEditorPage />
    );

    await waitFor(() =>
      expect(screen.getByText("This article is not yours to edit")).toBeTruthy()
    );
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("sends what was typed, published by default", async () => {
    const create = {
      request: {
        query: CREATE_ARTICLE,
        variables: {
          input: { title: "Our Manifesto", content: "We believe things.", published: true },
        },
      },
      result: {
        data: {
          createArticle: {
            __typename: "Article",
            id: "a1",
            slug: "our-manifesto",
            title: "Our Manifesto",
            content: "We believe things.",
            publishedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    };

    render(
      <MockedProvider mocks={[meMock(ME), create] as never}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/articles/new"]}>
            <Routes>
              <Route path="/articles/new" element={<ArticleEditorPage />} />
              {/* Stands in for the detail page, so a successful save is visible
                  as the navigation it causes rather than as the absence of an
                  error. */}
              <Route path="/articles/:id" element={<p>saved and shown</p>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </MockedProvider>
    );

    await waitFor(() => expect(screen.getByLabelText("Title")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Our Manifesto" },
    });
    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: "We believe things." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    // The mocked mutation only matches if the variables are exactly those above,
    // so arriving at the detail route is the assertion that the right input was
    // sent as well as that the form works.
    await waitFor(() => expect(screen.getByText("saved and shown")).toBeTruthy());
  });

  it("previews the markdown before it is saved", async () => {
    renderPage([meMock(ME)], "/articles/new", "/articles/new", <ArticleEditorPage />);

    await waitFor(() => expect(screen.getByLabelText("Body")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: "We believe **things**." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByText("things").tagName).toBe("STRONG");
  });
});
