/**
 * Validates a redirect URL to prevent Open Redirect attacks.
 * Only allows relative paths (e.g., /dashboard, /settings).
 * Blocks absolute URLs, protocol-relative URLs, and other dangerous patterns.
 */
export function getSafeRedirectUrl(url: string | null, fallback = "/"): string {
  if (!url) return fallback;

  // Must start with a single "/" and not "//" (protocol-relative URL)
  if (!url.startsWith("/") || url.startsWith("//")) {
    return fallback;
  }

  // Block URLs with backslashes (can be used to bypass checks in some browsers)
  if (url.includes("\\")) {
    return fallback;
  }

  // Block URLs with @ (can indicate user info in URL)
  if (url.includes("@")) {
    return fallback;
  }

  return url;
}
