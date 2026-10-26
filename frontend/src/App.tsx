import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ApolloProvider } from "@apollo/client/react";
import { client } from "./apollo";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Navbar } from "./components/Navbar";
import { HomePage } from "./pages/HomePage";
import { GameLibraryPage } from "./pages/GameLibraryPage";
import { GameDetailPage } from "./pages/GameDetailPage";
import { NewGamePage } from "./pages/NewGamePage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { PROFILE_ROUTES } from "./lib/profileViews";
import { ReviewDetailPage } from "./pages/ReviewDetailPage";
import { ReviewersPage } from "./pages/ReviewersPage";
import { ArticlesPage } from "./pages/ArticlesPage";
import { ArticleDetailPage } from "./pages/ArticleDetailPage";
import { ArticleEditorPage } from "./pages/ArticleEditorPage";

function App() {
  return (
    <ApolloProvider client={client}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-bg text-content">
              <Navbar />
              <main className="max-w-6xl mx-auto px-4 py-page-y">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/games" element={<GameLibraryPage />} />
                  <Route path="/games/:id" element={<GameDetailPage />} />
                  <Route path="/games/new/:rawgId" element={<NewGamePage />} />
                  {PROFILE_ROUTES.map(({ path, tab }) => (
                    <Route
                      key={path}
                      path={path}
                      element={<UserProfilePage tab={tab} />}
                    />
                  ))}
                  {/* A splat, because a review is at /reviews/<user>/<game>. */}
                  <Route path="/reviews/*" element={<ReviewDetailPage />} />
                  <Route path="/reviewers" element={<ReviewersPage />} />
                  {/* Manifestos and other prose. `new` before `:id` for the
                    reader's benefit; the router ranks the static segment higher
                    either way. */}
                  <Route path="/articles" element={<ArticlesPage />} />
                  <Route path="/articles/new" element={<ArticleEditorPage />} />
                  <Route path="/articles/:id" element={<ArticleDetailPage />} />
                  <Route
                    path="/articles/:id/edit"
                    element={<ArticleEditorPage />}
                  />
                  {/* Login and registration are handled by authentik, not by
                    this app, so /login and /register no longer exist. */}
                  <Route path="/login" element={<Navigate to="/" replace />} />
                  <Route
                    path="/register"
                    element={<Navigate to="/" replace />}
                  />
                  {/* Redirect old add-game route to home */}
                  <Route
                    path="/add-game"
                    element={<Navigate to="/" replace />}
                  />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </ApolloProvider>
  );
}

export default App;
