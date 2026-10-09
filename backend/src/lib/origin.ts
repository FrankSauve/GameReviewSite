/** Public origin for a link back to the site. Derived from the forwarded
 *  headers SWAG sets; PUBLIC_ORIGIN pins it where they are absent or not trusted. */
export function publicOrigin(
  configured: string | undefined,
  protocol: string,
  host: string | undefined,
): string {
  if (configured) return configured.replace(/\/+$/, "");
  return `${protocol}://${host ?? "localhost"}`;
}
