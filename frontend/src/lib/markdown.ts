/**
 * Kept in step with `REVIEW_CONTENT_MAX` in `backend/src/resolvers/review.ts`,
 * which is the side that enforces it. This one only stops the textarea accepting
 * a body the API would refuse.
 */
export const REVIEW_CONTENT_MAX = 20000;

/**
 * `toPlainText` and `excerpt` live in @gamereviews/shared, because the backend
 * renders `og:description` from the same rule and a spoiler that leaks in one
 * leaks in both. Re-exported here so callers keep importing from `lib/markdown`.
 */
export { toPlainText, excerpt } from "@gamereviews/shared";
