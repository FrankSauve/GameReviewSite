import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";

/**
 * Read at call time rather than module load so that a test can construct an
 * app under a different configuration without reimporting the module graph.
 */
export function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * Number of reverse proxies in front of this app.
 *
 * SWAG proxies straight to this service, so 1. Getting it wrong means every
 * rate limiter keys on the proxy's IP instead of the client's, so a single
 * abusive client would lock out everybody.
 */
export function trustProxyHops(): number {
  const parsed = parseInt(process.env["TRUST_PROXY_HOPS"] ?? "0", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

/**
 * Allowed browser origins.
 *
 * In the target deployment the SPA and the API share one hostname, so no
 * cross-origin access is needed and the default of `false` sends no CORS
 * headers at all.
 */
export function allowedOrigins(): string[] | false {
  const configured = (process.env["CORS_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  return isProduction() ? false : DEV_ORIGINS;
}

/** Field names that cause an outbound call to the RAWG API. */
const RAWG_FIELDS = ["searchGamesExternal", "importGame"];

function isRawgOperation(req: Request): boolean {
  const query = (req.body as { query?: unknown } | undefined)?.query;
  if (typeof query !== "string") return false;
  return RAWG_FIELDS.some((field) => query.includes(field));
}

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export interface Limiters {
  general: RequestHandler;
  rawg: RequestHandler;
}

/**
 * Built per app instance: express-rate-limit keeps its counters inside the
 * handler, so sharing one across app instances would leak state between them.
 */
export function createLimiters(): Limiters {
  return {
    // Generous enough for normal SPA page loads.
    general: rateLimit({
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
      limit: envInt("RATE_LIMIT_MAX", 300),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { errors: [{ message: "Too many requests." }] },
    }),
    // Tighter, to keep the RAWG API quota from being burned by a bot.
    rawg: rateLimit({
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
      limit: envInt("RAWG_RATE_LIMIT_MAX", 30),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (req) => !isRawgOperation(req),
      message: { errors: [{ message: "Too many game searches, slow down." }] },
    }),
  };
}
