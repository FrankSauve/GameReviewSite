import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { REGISTER } from "../graphql/mutations";
import { useAuth } from "../contexts/AuthContext";
import type { AuthUser } from "../contexts/AuthContext";

interface RegisterResult {
  register: { token: string; user: AuthUser };
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState("");

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientError("");
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const [register, { loading, error }] = useMutation<RegisterResult>(REGISTER, {
    onCompleted: ({ register: payload }) => {
      login(payload.token, payload.user);
      navigate("/", { replace: true });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setClientError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setClientError("Password must be at least 8 characters.");
      return;
    }
    void register({
      variables: {
        input: {
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
        },
      },
    });
  };

  const displayError =
    clientError || error?.graphQLErrors[0]?.message || error?.message;

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="text-5xl mb-3">🎮</div>
          <h1 className="text-2xl font-extrabold text-gray-100">Create an account</h1>
          <p className="text-gray-500 text-sm">Join GameReviews and share your thoughts</p>
        </div>

        <div className="card p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Username
              </label>
              <input
                className="input-field"
                placeholder="gamer123"
                value={form.username}
                onChange={set("username")}
                autoComplete="username"
                minLength={2}
                maxLength={50}
                required
              />
              <p className="text-xs text-gray-600 mt-1">
                Letters, numbers, underscores and hyphens only
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Email
              </label>
              <input
                className="input-field"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  className="input-field pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Confirm Password
              </label>
              <input
                className="input-field"
                type={showPassword ? "text" : "password"}
                placeholder="Repeat password"
                value={form.confirm}
                onChange={set("confirm")}
                autoComplete="new-password"
                required
              />
            </div>

            {displayError && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {displayError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner /> Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
