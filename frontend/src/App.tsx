import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ApolloProvider } from "@apollo/client";
import { client } from "./apollo";
import { AuthProvider } from "./contexts/AuthContext";
import { Navbar } from "./components/Navbar";
import { GamesPage } from "./pages/GamesPage";
import { GameDetailPage } from "./pages/GameDetailPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { ReviewDetailPage } from "./pages/ReviewDetailPage";
import { ReviewersPage } from "./pages/ReviewersPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";

function App() {
  return (
    <ApolloProvider client={client}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-950 text-gray-100">
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Routes>
                <Route path="/" element={<GamesPage />} />
                <Route path="/games/:id" element={<GameDetailPage />} />
                <Route path="/users/:id" element={<UserProfilePage />} />
                <Route path="/reviews/:id" element={<ReviewDetailPage />} />
                <Route path="/reviewers" element={<ReviewersPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
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
