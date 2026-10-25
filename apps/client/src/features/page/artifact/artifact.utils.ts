/**
 * Accepts either a bare https URL or a pasted Claude "embed code" snippet
 * (`<iframe src="…">`) and returns the https URL to embed, or null if invalid.
 */
export function parseArtifactUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const srcMatch = trimmed.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  const candidate = (srcMatch ? srcMatch[1] : trimmed).replace(/&amp;/g, "&");

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
