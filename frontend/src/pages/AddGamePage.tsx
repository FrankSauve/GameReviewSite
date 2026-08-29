import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { CREATE_GAME } from "../graphql/mutations";
import { GET_GAMES } from "../graphql/queries";
import type { Game } from "../types";
import { gamePath } from "../lib/links";

const GENRES = [
  "Action", "Action RPG", "Adventure", "Fighting", "Horror",
  "Platformer", "Puzzle", "Racing", "RPG", "Shooter",
  "Simulation", "Sports", "Strategy", "Survival",
];

const PLATFORMS = [
  "PC", "PlayStation 5", "PlayStation 4", "Xbox Series X|S",
  "Xbox One", "Nintendo Switch", "Mobile", "Multi-platform",
];

export function AddGamePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    genre: "",
    platform: "",
    description: "",
    releaseYear: "",
  });

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const [createGame, { loading, error }] = useMutation<{ createGame: Game }>(
    CREATE_GAME,
    {
      refetchQueries: [{ query: GET_GAMES }],
      onCompleted: (data) => navigate(gamePath(data.createGame)),
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void createGame({
      variables: {
        input: {
          title: form.title.trim(),
          genre: form.genre || undefined,
          platform: form.platform || undefined,
          description: form.description.trim() || undefined,
          releaseYear: form.releaseYear ? parseInt(form.releaseYear, 10) : undefined,
        },
      },
    });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <BackIcon />
        Back to Games
      </Link>

      <div className="card p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-100">Add a Game</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              className="input-field"
              placeholder="e.g. Elden Ring"
              value={form.title}
              onChange={set("title")}
              maxLength={200}
              required
            />
          </div>

          {/* Genre + Platform row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Genre</label>
              <select className="input-field" value={form.genre} onChange={set("genre")}>
                <option value="">Select…</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Platform</label>
              <select className="input-field" value={form.platform} onChange={set("platform")}>
                <option value="">Select…</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Release year */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Release Year
            </label>
            <input
              className="input-field"
              type="number"
              placeholder="e.g. 2022"
              min={1950}
              max={new Date().getFullYear() + 5}
              value={form.releaseYear}
              onChange={set("releaseYear")}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Description
            </label>
            <textarea
              className="input-field resize-none"
              rows={4}
              placeholder="A brief description of the game…"
              value={form.description}
              onChange={set("description")}
              maxLength={2000}
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error.message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.title.trim()}
            className="btn-primary w-full"
          >
            {loading ? "Adding…" : "Add Game"}
          </button>
        </form>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
