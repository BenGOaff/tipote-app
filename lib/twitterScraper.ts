// lib/twitterScraper.ts
// Lightweight Twitter/X scraper using internal API endpoints.
// Uses cookie-based auth (auth_token + ct0) for reading replies and sending DMs.
// Uses official API v2 (OAuth bearer) for posting replies (Free tier compatible).
//
// Required env vars:
//   TWITTER_AUTH_TOKEN  – auth_token cookie from x.com
//   TWITTER_CT0         – ct0 cookie from x.com (CSRF token)

// Twitter web app public bearer token (embedded in twitter.com JS bundle, not a secret)
const WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

function getCookies(): { authToken: string; ct0: string } {
  const authToken = process.env.TWITTER_AUTH_TOKEN ?? "";
  const ct0 = process.env.TWITTER_CT0 ?? "";
  if (!authToken || !ct0) {
    throw new Error("Missing TWITTER_AUTH_TOKEN or TWITTER_CT0 env vars");
  }
  return { authToken, ct0 };
}

function internalHeaders(): Record<string, string> {
  const { authToken, ct0 } = getCookies();
  return {
    Authorization: `Bearer ${decodeURIComponent(WEB_BEARER)}`,
    Cookie: `auth_token=${authToken}; ct0=${ct0}`,
    "X-Csrf-Token": ct0,
    "X-Twitter-Auth-Type": "OAuth2Session",
    "X-Twitter-Active-User": "yes",
    "X-Twitter-Client-Language": "en",
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
}

// ─── Types ───────────────────────────────────────────────────────

export interface TweetReply {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  createdAt: string; // ISO string
  conversationId: string;
}

// ─── Get replies to a tweet ──────────────────────────────────────

/**
 * Fetches replies to a specific tweet using Twitter's internal search API.
 * Uses conversation_id search to find all replies in the thread.
 */
export async function getTweetReplies(
  tweetId: string,
  count = 50,
): Promise<TweetReply[]> {
  const params = new URLSearchParams({
    q: `conversation_id:${tweetId}`,
    tweet_search_mode: "live",
    count: String(count),
    query_source: "typed_query",
    pc: "1",
    spelling_corrections: "1",
  });

  const url = `https://x.com/i/api/2/search/adaptive.json?${params}`;

  const res = await fetch(url, {
    headers: internalHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitter search replies failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  return parseAdaptiveSearchResults(json, tweetId);
}

function parseAdaptiveSearchResults(json: any, originalTweetId: string): TweetReply[] {
  const tweets = json?.globalObjects?.tweets ?? {};
  const users = json?.globalObjects?.users ?? {};
  const replies: TweetReply[] = [];

  for (const [id, tweet] of Object.entries<any>(tweets)) {
    // Skip the original tweet itself
    if (id === originalTweetId) continue;
    // Only include direct replies to the original tweet
    if (tweet.in_reply_to_status_id_str !== originalTweetId) continue;

    const userId = tweet.user_id_str;
    const user = users[userId] ?? {};

    replies.push({
      id,
      text: tweet.full_text ?? tweet.text ?? "",
      authorId: userId,
      authorUsername: user.screen_name ?? "",
      authorName: user.name ?? "",
      createdAt: tweet.created_at
        ? new Date(tweet.created_at).toISOString()
        : new Date().toISOString(),
      conversationId: tweet.conversation_id_str ?? originalTweetId,
    });
  }

  return replies;
}

// ─── Send a DM ───────────────────────────────────────────────────

/**
 * Sends a Direct Message using Twitter's internal DM API.
 * @param recipientId - The Twitter user ID of the recipient
 * @param text - The message text
 */
export async function sendTwitterDM(
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const requestId = crypto.randomUUID();
    const url = "https://x.com/i/api/1.1/dm/new2.json";

    const res = await fetch(url, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        recipient_ids: false,
        request_id: requestId,
        text,
        cards_platform: "Web-12",
        include_cards: 1,
        include_quote_count: true,
        dm_users: false,
        conversation_id: recipientId, // Twitter creates/finds the conversation
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `DM failed (${res.status}): ${errText.slice(0, 300)}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Alternative DM method using the modern event-based endpoint.
 * Tries this if the legacy endpoint fails.
 */
export async function sendTwitterDMv2(
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = "https://x.com/i/api/1.1/dm/conversation/create.json";

    // First, we need to try sending via the dm/new2.json endpoint with proper params
    const newDmUrl = "https://x.com/i/api/1.1/dm/new2.json";
    const payload = {
      conversation_id: `${recipientId}`,
      recipient_ids: `${recipientId}`,
      text,
      cards_platform: "Web-12",
      include_cards: 1,
      include_quote_count: true,
      request_id: crypto.randomUUID(),
    };

    const res = await fetch(newDmUrl, {
      method: "POST",
      headers: {
        ...internalHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(
        Object.entries(payload).map(([k, v]) => [k, String(v)]),
      ).toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `DMv2 failed (${res.status}): ${errText.slice(0, 300)}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Reply to a tweet (official API v2) ──────────────────────────

/**
 * Replies to a tweet using the official Twitter API v2.
 * Uses the user's OAuth bearer token (Free tier compatible).
 * @param accessToken - OAuth 2.0 bearer token from social_connections
 * @param tweetId - The tweet to reply to
 * @param text - The reply text
 */
export async function replyToTweet(
  accessToken: string,
  tweetId: string,
  text: string,
): Promise<{ ok: boolean; replyId?: string; error?: string }> {
  try {
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        reply: { in_reply_to_tweet_id: tweetId },
      }),
    });

    if (res.status === 201 || res.status === 200) {
      const json = await res.json();
      return { ok: true, replyId: json.data?.id };
    }

    const errText = await res.text();
    return { ok: false, error: `Reply failed (${res.status}): ${errText.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Extract tweet ID from URL ───────────────────────────────────

/**
 * Extracts the tweet ID from a Twitter/X URL.
 * Supports formats:
 *   https://twitter.com/user/status/123456789
 *   https://x.com/user/status/123456789
 *   123456789 (raw ID)
 */
export function extractTweetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();

  // Raw ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  // URL format
  const match = trimmed.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match?.[1] ?? null;
}
