import { Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_USERS } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import { formatRating, ratingColor } from "../lib/rating";

interface ReviewerUser {
  id: string;
  username: string;
  reviewCount: number;
  averageRating?: number | null;
}

function avatarGradient(username: string): string {
  const gradients = [
    "from-violet-600 to-indigo-700",
    "from-rose-600 to-pink-700",
    "from-emerald-600 to-teal-700",
    "from-blue-600 to-cyan-700",
    "from-amber-600 to-orange-700",
    "from-fuchsia-600 to-purple-700",
  ];
  const idx = [...username].reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

export function ReviewersPage() {
  const { user: me } = useAuth();
  const { data, loading } = useQuery<{ users: ReviewerUser[] }>(GET_USERS);

  const users = [...(data?.users ?? [])].sort(
    (a, b) => b.reviewCount - a.reviewCount
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
          <span className="w-1 h-6 bg-violet-500 rounded-full inline-block" />
          Reviewers
        </h1>
        {!loading && (
          <span className="text-xs text-gray-600">{users.length} {users.length === 1 ? "member" : "members"}</span>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-gray-800 shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-gray-800 rounded w-2/3" />
                <div className="h-3 bg-gray-800 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && users.length === 0 && (
        <div className="card p-12 text-center space-y-2">
          <p className="text-3xl">👥</p>
          <p className="text-gray-400">No users yet.</p>
        </div>
      )}

      {!loading && users.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {users.map((u) => {
            const reviewCount = u.reviewCount;
            const avgRating = u.averageRating ?? null;
            const isMe = me?.id === u.id;

            return (
              <Link key={u.id} to={`/users/${u.id}`} className="group block">
                <div className="card p-5 flex items-center gap-4 hover:border-violet-700 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200">
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarGradient(u.username)} flex items-center justify-center text-base font-black text-white shrink-0`}>
                    {u.username[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-100 group-hover:text-violet-300 transition-colors truncate text-sm">
                        {u.username}
                      </span>
                      {isMe && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-900/60 text-violet-300 border border-violet-800 shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                      </span>
                      {avgRating !== null && (
                        <>
                          <span className="text-gray-700 text-xs">·</span>
                          <span className={`text-xs font-semibold ${ratingColor(avgRating)}`}>
                            avg {formatRating(avgRating)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
