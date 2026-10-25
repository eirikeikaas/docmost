const IFRAME_SRC_RE = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i;

/**
 * If the input is a pasted `<iframe src="…">` snippet, returns its src;
 * otherwise returns the trimmed input unchanged.
 */
export function extractEmbedSrc(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(IFRAME_SRC_RE);
  return (match ? match[1] : trimmed).replace(/&amp;/g, "&");
}

/**
 * Accepts either a bare https URL or a pasted Claude "embed code" snippet
 * (`<iframe src="…">`) and returns the https URL to embed, or null if invalid.
 */
export function parseArtifactUrl(input: string): string | null {
  const candidate = extractEmbedSrc(input);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isClaudeHost(hostname: string): boolean {
  return (
    hostname === "claude.ai" ||
    hostname.endsWith(".claude.ai") ||
    hostname === "claudeusercontent.com" ||
    hostname.endsWith(".claudeusercontent.com")
  );
}

/**
 * Returns the embed URL when `text` is a single Claude artifact link or embed
 * snippet (used for paste-to-embed), otherwise null.
 */
export function parseClaudeArtifactPaste(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || (!IFRAME_SRC_RE.test(trimmed) && /\s/.test(trimmed))) {
    return null;
  }
  const url = parseArtifactUrl(trimmed);
  if (!url) return null;
  const parsed = new URL(url);
  if (!isClaudeHost(parsed.hostname)) return null;
  // Plain claude.ai links (chats, projects, ...) must stay normal links; only
  // artifact/embed paths, embed snippets and the content host are embedded.
  const isSnippet = IFRAME_SRC_RE.test(trimmed);
  const isArtifactPath = /^\/(public\/artifacts|artifacts|embed)\//.test(
    parsed.pathname,
  );
  const isContentHost = parsed.hostname.endsWith("claudeusercontent.com");
  return isSnippet || isArtifactPath || isContentHost ? url : null;
}
