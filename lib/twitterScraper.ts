// lib/twitterScraper.ts
// Twitter/X API v2 helpers for the comment automation system.
// Uses each user's OAuth 2.0 bearer token (from social_connections).
// Requires Basic tier ($200/month) for search/read endpoints.
// Reply + Like work on Free tier too.
//
// NO cookies, NO scraping — pure official API v2.

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

// ─── Search replies to a tweet (API v2 — Basic tier) ─────────────

/**
 * Fetches replies to a specific tweet using the official Twitter API v2.
 * Uses the search/recent endpoint with conversation_id filter.
 * Requires Basic tier or above.
 *
 * @param accessToken - User's OAuth 2.0 bearer token
 * @param tweetId - The tweet ID to find replies for
 * @param maxResults - Max results to return (10-100)
 */
export async function getTweetReplies(
  accessToken: string,
  tweetId: string,
  maxResults = 50,
): Promise<TweetReply[]> {
  const params = new URLSearchParams({
    query: `conversation_id:${tweetId} is:reply`,
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    "tweet.fields": "author_id,conversation_id,created_at,in_reply_to_user_id,text",
    expansions: "author_id",
    "user.fields": "id,name,username",
  });

  const url = `https://api.x.com/2/tweets/search/recent?${params}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitter search replies failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  return parseV2SearchResults(json, tweetId);
}

function parseV2SearchResults(json: any, originalTweetId: string): TweetReply[] {
  const tweets = json?.data ?? [];
  const users: Record<string, { id: string; name: string; username: string }> = {};

  // Build user lookup from includes
  for (const u of json?.includes?.users ?? []) {
    users[u.id] = { id: u.id, name: u.name, username: u.username };
  }

  const replies: TweetReply[] = [];

  for (const tweet of tweets) {
    // Skip the original tweet itself
    if (tweet.id === originalTweetId) continue;

    const author = users[tweet.author_id] ?? {
      id: tweet.author_id,
      name: "",
      username: "",
    };

    replies.push({
      id: tweet.id,
      text: tweet.text ?? "",
      authorId: tweet.author_id,
      authorUsername: author.username,
      authorName: author.name,
      createdAt: tweet.created_at ?? new Date().toISOString(),
      conversationId: tweet.conversation_id ?? originalTweetId,
    });
  }

  return replies;
}

// ─── Like a tweet (API v2) ───────────────────────────────────────

/**
 * Likes a tweet using the official Twitter API v2.
 * @param accessToken - User's OAuth 2.0 bearer token
 * @param userId - The authenticated user's Twitter user ID
 * @param tweetId - The tweet to like
 */
export async function likeTweet(
  accessToken: string,
  userId: string,
  tweetId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.x.com/2/users/${userId}/likes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tweet_id: tweetId }),
    });

    if (res.ok) {
      return { ok: true };
    }

    const errText = await res.text();
    // 403 = already liked or not allowed on Free tier — not a fatal error
    if (res.status === 403) {
      return { ok: false, error: `Like not available (${res.status}): ${errText.slice(0, 200)}` };
    }
    return { ok: false, error: `Like failed (${res.status}): ${errText.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Reply to a tweet (API v2 — Free tier compatible) ────────────

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
    const res = await fetch("https://api.x.com/2/tweets", {
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

// ─── Get user's recent tweets (API v2) ───────────────────────────

/**
 * Fetches the authenticated user's recent tweets (for the post picker).
 * Uses GET /2/users/:id/tweets.
 * @param accessToken - User's OAuth 2.0 bearer token
 * @param userId - The user's Twitter ID
 * @param maxResults - Max results (5-100)
 */
export async function getUserTweets(
  accessToken: string,
  userId: string,
  maxResults = 20,
): Promise<{ id: string; text: string; created_at: string }[]> {
  const params = new URLSearchParams({
    max_results: String(Math.min(Math.max(maxResults, 5), 100)),
    "tweet.fields": "created_at,text",
    exclude: "retweets,replies",
  });

  const res = await fetch(
    `https://api.x.com/2/users/${userId}/tweets?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitter get tweets failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  return (json.data ?? []).map((t: any) => ({
    id: t.id,
    text: t.text ?? "",
    created_at: t.created_at ?? "",
  }));
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
