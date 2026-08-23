import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";

export const isProduction = process.env["NODE_ENV"] === "production";

/**
 * Number of reverse proxies in front of this app.
 *
 * Behind SWAG → frontend nginx → backend this is 2. Getting it wrong means
 * every rate limiter keys on the proxy's IP instead of the client's, so a
 * single abusive client would lock out everybody.
 */
const TRUST_PROXY_HOPS = parseInt(process.env["TRUST_PROXY_HOPS"] ?? "0", 10);

export function trustProxyHops(): number {
  return Number.isNaN(TRUST_PROXY_HOPS) ? 0 : TRUST_PROXY_HOPS;
}

const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

/**
 * Allowed browser origins.
 *
 * In the target deployment the SPA and the API share one hostname (nginx
 * proxies /graphql to this service), so no cross-origin access is needed and
 * the default of `false` sends no CORS headers at all.
 */
export function allowedOrigins(): string[] | false {
  const configured = (process.env["CORS_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  return isProduction ? false : DEV_ORIGINS;
}

/** Field names that cause an outbound call to the RAWG API. */
const RAWG_FIELDS = ["searchGamesExternal", "importGame"];

function isRawgOperation(req: Request): boolean {
  const query = (req.body as { query?: unknown } | undefined)?.query;
  if (typeof query !== "string") return false;
  return RAWG_FIELDS.some((field) => query.includes(field));
}

/** Broad limiter: generous enough for normal SPA page loads. */
export const generalLimiter: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { errors: [{ message: "Too many requests." }] },
});

/** Tight limiter to keep the RAWG API quota from being burned by a bot. */
export const rawgLimiter: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => !isRawgOperation(req),
  message: { errors: [{ message: "Too many game searches, slow down." }] },
});
