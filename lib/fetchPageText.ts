/**
 * Fetch the text content of a web page (sales page, landing page…).
 * Used by the offer improvement feature to provide the AI with the full page content.
 *
 * Returns plain text (HTML tags stripped) or null on failure.
 * Timeout: 10 seconds. Max body: 200 KB of text.
 */

const MAX_TEXT_LENGTH = 200_000; // ~200 KB of text
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Strip HTML tags and collapse whitespace to produce readable text.
 * Keeps paragraph/block separation as double newlines.
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove <script>, <style>, <noscript> blocks entirely
  text = text.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // Replace block-level elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|blockquote)>/gi, "\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(ul|ol)>/gi, "\n");

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Fetch a page URL and return its text content.
 * Returns null if the URL is invalid, unreachable, or times out.
 */
export async function fetchPageText(url: string): Promise<string | null> {
  if (!url || typeof url !== "string") return null;

  let parsed: URL;
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return null;
  }

  // Only allow http(s)
  if (!parsed.protocol.startsWith("http")) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Tipote/1.0; +https://tipote.com)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const html = await res.text();
    const text = htmlToText(html);

    if (!text || text.length < 50) return null;

    return text.slice(0, MAX_TEXT_LENGTH);
  } catch {
    return null;
  }
}
