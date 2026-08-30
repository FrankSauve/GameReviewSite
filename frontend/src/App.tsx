import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ApolloProvider } from "@apollo/client";
import { client } from "./apollo";
import { AuthProvider } from "./contexts/AuthContext";
import { Navbar } from "./components/Navbar";
import { HomePage } from "./pages/HomePage";
import { GameLibraryPage } from "./pages/GameLibraryPage";
import { GameDetailPage } from "./pages/GameDetailPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { ReviewDetailPage } from "./pages/ReviewDetailPage";
import { ReviewersPage } from "./pages/ReviewersPage";
import { TextsPage } from "./pages/TextsPage";
import { TextDetailPage } from "./pages/TextDetailPage";
import { TextEditorPage } from "./pages/TextEditorPage";

function App() {
  return (
    <ApolloProvider client={client}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-950 text-gray-100">
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/games" element={<GameLibraryPage />} />
                <Route path="/games/:id" element={<GameDetailPage />} />
                {/* By year is the default view: a profile reads as a playing
                    history rather than a posting log. */}
                <Route path="/users/:id" element={<UserProfilePage grouping="year" />} />
                <Route
                  path="/users/:id/by-score"
                  element={<UserProfilePage grouping="score" />}
                />
                <Route
                  path="/users/:id/recent"
                  element={<UserProfilePage grouping="recent" />}
                />
                {/* The by-year view is reachable at its own path too, so a link
                    to it survives the default changing. */}
                <Route
                  path="/users/:id/by-year"
                  element={<UserProfilePage grouping="year" />}
                />
                {/* A splat, because a review is at /reviews/<user>/<game>. */}
                <Route path="/reviews/*" element={<ReviewDetailPage />} />
                <Route path="/reviewers" element={<ReviewersPage />} />
                {/* Manifestos and other prose. `new` before `:id` for the
                    reader's benefit; the router ranks the static segment higher
                    either way. */}
                <Route path="/texts" element={<TextsPage />} />
                <Route path="/texts/new" element={<TextEditorPage />} />
                <Route path="/texts/:id" element={<TextDetailPage />} />
                <Route path="/texts/:id/edit" element={<TextEditorPage />} />
                {/* Login and registration are handled by authentik, not by
                    this app, so /login and /register no longer exist. */}
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/register" element={<Navigate to="/" replace />} />
                {/* Redirect old add-game route to home */}
                <Route path="/add-game" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ApolloProvider>
  );
}

export default App;
