// lib/autoCommentEngine.ts
// Core engine for auto-commenting: AI comment generation + platform API calls.
// Searches for relevant posts, generates varied comments, and posts them.

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function getClaudeApiKey(): string {
  return process.env.CLAUDE_API_KEY_OWNER || process.env.ANTHROPIC_API_KEY_OWNER || "";
}

function getClaudeModel(): string {
  return (
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929"
  );
}

// ─── AI Comment Generation ───────────────────────────────────────────────────

const ANGLES = [
  { id: "question", instruction: "Pose une question pertinente et curieuse en lien avec le sujet du post." },
  { id: "agree", instruction: "Exprime ton accord et ajoute un argument ou une perspective complémentaire." },
  { id: "congrats", instruction: "Félicite l'auteur et explique ce qui t'a marqué dans son post." },
  { id: "deeper", instruction: "Va plus loin sur un point précis du post, apporte une réflexion approfondie." },
  { id: "experience", instruction: "Partage une expérience personnelle en lien avec le sujet du post." },
] as const;

export type CommentAngleId = (typeof ANGLES)[number]["id"];

/**
 * Generate an AI comment for a social media post.
 */
export async function generateComment(opts: {
  targetPostText: string;
  angle: CommentAngleId;
  styleTon: string;
  niche: string;
  brandTone: string;
  platform: string;
  langage?: Record<string, unknown>;
}): Promise<string> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new Error("Missing Claude API key");

  const angleObj = ANGLES.find((a) => a.id === opts.angle) ?? ANGLES[0];

  const charLimits: Record<string, number> = {
    linkedin: 250,
    twitter: 240,
    threads: 400,
    facebook: 300,
    reddit: 500,
  };
  const maxChars = charLimits[opts.platform] ?? 280;

  const system = `Tu es un expert en engagement sur les réseaux sociaux. Tu génères des commentaires authentiques et humains pour ${opts.platform}.

RÈGLES ABSOLUES :
- Maximum ${maxChars} caractères
- AUCUNE promotion, AUCUN lien, AUCUNE mention de produit ou service
- Ton naturel et conversationnel, comme un vrai humain
- Pas de hashtags sauf si c'est naturel dans la conversation
- Pas de formules génériques type "Super post !" ou "Très intéressant"
- Apporte de la VALEUR dans le commentaire
- Adapte le registre à ${opts.platform}
${opts.styleTon ? `- Ton/style : ${opts.styleTon}` : ""}
${opts.niche ? `- Tu es dans la niche : ${opts.niche}` : ""}
${opts.brandTone ? `- Ton de voix de l'utilisateur : ${opts.brandTone}` : ""}
${opts.langage && Object.keys(opts.langage).length > 0 ? `- Éléments de langage : ${JSON.stringify(opts.langage)}` : ""}

Réponds UNIQUEMENT avec le texte du commentaire, sans guillemets, sans explications.`;

  const user = `Post à commenter :
"""
${opts.targetPostText.slice(0, 1500)}
"""

Angle du commentaire : ${angleObj.instruction}

Génère le commentaire :`;

  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: getClaudeModel(),
      max_tokens: 300,
      temperature: 0.85,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${t}`);
  }

  const json = (await res.json()) as any;
  const parts = Array.isArray(json?.content) ? json.content : [];
  const text = parts
    .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
    .filter(Boolean)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, ""); // Remove wrapping quotes

  return text.slice(0, maxChars);
}

// ─── Twitter API Functions ───────────────────────────────────────────────────

export async function twitterSearchTweets(
  accessToken: string,
  query: string,
  maxResults = 10,
): Promise<Array<{ id: string; text: string; authorId: string }>> {
  const params = new URLSearchParams({
    query: `${query} -is:retweet -is:reply lang:fr`,
    max_results: String(Math.min(maxResults, 100)),
    "tweet.fields": "author_id,text,public_metrics",
  });

  const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return [];

  const json = (await res.json()) as any;
  return (json.data ?? []).map((t: any) => ({
    id: t.id,
    text: t.text ?? "",
    authorId: t.author_id ?? "",
  }));
}

export async function twitterReplyToTweet(
  accessToken: string,
  tweetId: string,
  text: string,
): Promise<{ ok: boolean; replyId?: string; error?: string }> {
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

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Twitter reply error (${res.status}): ${t}` };
  }

  const json = (await res.json()) as any;
  return { ok: true, replyId: json.data?.id };
}

export async function twitterLikeTweet(
  accessToken: string,
  userId: string,
  tweetId: string,
): Promise<boolean> {
  const res = await fetch(`https://api.twitter.com/2/users/${userId}/likes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tweet_id: tweetId }),
  });
  return res.ok;
}

// ─── Reddit API Functions ────────────────────────────────────────────────────

export async function redditSearchPosts(
  accessToken: string,
  query: string,
  maxResults = 10,
): Promise<Array<{ id: string; title: string; selftext: string; subreddit: string; url: string }>> {
  const params = new URLSearchParams({
    q: query,
    sort: "hot",
    type: "link",
    limit: String(maxResults),
    t: "week",
  });

  const res = await fetch(`https://oauth.reddit.com/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "tipote-app/1.0" },
  });

  if (!res.ok) return [];

  const json = (await res.json()) as any;
  const children = json?.data?.children ?? [];
  return children.map((c: any) => ({
    id: c.data?.id ?? "",
    title: c.data?.title ?? "",
    selftext: c.data?.selftext ?? "",
    subreddit: c.data?.subreddit ?? "",
    url: `https://reddit.com${c.data?.permalink ?? ""}`,
  }));
}

export async function redditCommentOnPost(
  accessToken: string,
  postId: string,
  text: string,
): Promise<{ ok: boolean; commentId?: string; error?: string }> {
  const res = await fetch("https://oauth.reddit.com/api/comment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "tipote-app/1.0",
    },
    body: new URLSearchParams({
      thing_id: `t3_${postId}`,
      text,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Reddit comment error (${res.status}): ${t}` };
  }

  return { ok: true };
}

// ─── LinkedIn API Functions ──────────────────────────────────────────────────

export async function linkedinSearchPosts(
  accessToken: string,
  query: string,
  maxResults = 10,
): Promise<Array<{ urn: string; text: string; authorUrn: string }>> {
  // LinkedIn restricts post search to Marketing Developer Program partners.
  // With standard w_member_social scope, we can use the network feed endpoint
  // to fetch recent posts from the user's network and filter by keyword.
  try {
    const url = new URL("https://api.linkedin.com/rest/posts");
    url.searchParams.set("q", "memberNetworkFeed");
    url.searchParams.set("count", "50");

    const res = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "LinkedIn-Version": "202602",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(`[linkedinSearchPosts] API error ${res.status}: ${errorText.slice(0, 300)}`);
      // 403 = scope not granted (r_member_social or MDP required)
      // Return a sentinel error so the caller can log it
      throw new Error(`LinkedIn feed API error (${res.status}): scope insuffisant ou accès MDP requis`);
    }

    const data = (await res.json()) as any;
    const elements: any[] = data.elements ?? [];
    if (!elements.length) return [];

    const keywords = query.toLowerCase().split(" ").filter((w) => w.length > 3);

    const relevant = elements
      .filter((post: any) => {
        const text = (
          post.commentary ??
          post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text ??
          ""
        ).toLowerCase();
        return keywords.length === 0 || keywords.some((kw) => text.includes(kw));
      })
      .slice(0, maxResults)
      .map((post: any) => ({
        urn: post.id ?? "",
        text:
          post.commentary ??
          post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text ??
          "",
        authorUrn: post.author ?? "",
      }))
      .filter((p) => p.urn && p.text);

    return relevant;
  } catch (err) {
    // Re-throw so the caller can log the real reason to auto_comment_logs
    throw err;
  }
}

export async function linkedinCommentOnPost(
  accessToken: string,
  postUrn: string,
  personUrn: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.linkedin.com/rest/socialActions/" + encodeURIComponent(postUrn) + "/comments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202602",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      actor: personUrn,
      message: { text },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `LinkedIn comment error (${res.status}): ${t}` };
  }

  return { ok: true };
}

export async function linkedinReactToPost(
  accessToken: string,
  postUrn: string,
  personUrn: string,
): Promise<boolean> {
  const res = await fetch("https://api.linkedin.com/rest/socialActions/" + encodeURIComponent(postUrn) + "/reactions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202602",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      root: postUrn,
      reactionType: "LIKE",
    }),
  });

  return res.ok;
}

// ─── Search dispatcher ───────────────────────────────────────────────────────

export async function searchRelevantPosts(
  platform: string,
  accessToken: string,
  platformUserId: string,
  niche: string,
  postText: string,
  maxResults: number,
): Promise<Array<{ id: string; text: string; url?: string }>> {
  // Build search query from niche + post content keywords
  const keywords = extractKeywords(niche, postText);
  const query = keywords.slice(0, 5).join(" ");

  if (!query) return [];

  switch (platform) {
    case "twitter": {
      const tweets = await twitterSearchTweets(accessToken, query, maxResults * 2);
      return tweets.map((t) => ({
        id: t.id,
        text: t.text,
        url: `https://twitter.com/i/web/status/${t.id}`,
      }));
    }
    case "reddit": {
      const posts = await redditSearchPosts(accessToken, query, maxResults * 2);
      return posts.map((p) => ({
        id: p.id,
        text: `${p.title}\n${p.selftext}`.trim(),
        url: p.url,
      }));
    }
    case "linkedin": {
      const posts = await linkedinSearchPosts(accessToken, query, maxResults);
      return posts.map((p) => ({ id: p.urn, text: p.text }));
    }
    default:
      throw new Error(`Plateforme "${platform}" non supportée pour l'auto-commentaire (recherche de posts)`);
  }
}

// ─── Comment dispatcher ──────────────────────────────────────────────────────

export async function postCommentOnPost(
  platform: string,
  accessToken: string,
  platformUserId: string,
  postId: string,
  commentText: string,
): Promise<{ ok: boolean; error?: string }> {
  switch (platform) {
    case "twitter":
      return twitterReplyToTweet(accessToken, postId, commentText);
    case "reddit":
      return redditCommentOnPost(accessToken, postId, commentText);
    case "linkedin":
      return linkedinCommentOnPost(accessToken, postId, `urn:li:person:${platformUserId}`, commentText);
    default:
      return { ok: false, error: `Platform ${platform} not supported for auto-comments` };
  }
}

// ─── Like dispatcher ─────────────────────────────────────────────────────────

export async function likePost(
  platform: string,
  accessToken: string,
  platformUserId: string,
  postId: string,
): Promise<boolean> {
  switch (platform) {
    case "twitter":
      return twitterLikeTweet(accessToken, platformUserId, postId);
    case "linkedin":
      return linkedinReactToPost(accessToken, postId, `urn:li:person:${platformUserId}`);
    default:
      return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractKeywords(niche: string, postText: string): string[] {
  const stopWords = new Set([
    "le", "la", "les", "de", "du", "des", "un", "une", "et", "ou", "en", "à",
    "est", "sont", "pour", "par", "sur", "dans", "que", "qui", "ce", "cette",
    "il", "elle", "je", "tu", "nous", "vous", "ils", "elles", "mon", "ton",
    "son", "pas", "ne", "se", "au", "aux", "avec", "plus", "bien", "tout",
    "the", "a", "an", "is", "are", "for", "and", "or", "in", "on", "to",
    "of", "it", "you", "we", "they", "this", "that", "with", "from", "be",
  ]);

  const allText = `${niche} ${postText}`.toLowerCase();
  const words = allText
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  // Count word frequency
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // Return top keywords by frequency
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 8);
}

/** Random delay between min and max milliseconds */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── High-level batch runner ────────────────────────────────────────────────
// Single source of truth for the search → generate → like → comment loop.
// Used by activate (before), publish (after), publish-callback (after), and
// the n8n execute endpoint.

const BATCH_ANGLES: CommentAngleId[] = ["question", "agree", "congrats", "deeper", "experience"];
const DELAY_MIN = 30_000;  // 30s between comments
const DELAY_MAX = 120_000; // 2min between comments

export type AutoCommentResult = {
  success: boolean;
  targetPostId?: string;
  targetPostUrl?: string;
  commentText?: string;
  angle?: string;
  error?: string;
};

export type BatchResult = {
  commentsPosted: number;
  commentsFailed: number;
  postsFound: number;
  results: AutoCommentResult[];
};

/**
 * Run a full batch of auto-comments: search → generate → like → comment → log.
 * Updates auto_comments_status in DB when done.
 *
 * @param supabaseAdmin - Supabase admin client (passed to avoid circular imports)
 */
export async function runAutoCommentBatch(opts: {
  supabaseAdmin: any;
  contentId: string;
  userId: string;
  platform: string;
  accessToken: string;
  platformUserId: string;
  postText: string;
  commentType: "before" | "after";
  nbComments: number;
  styleTon?: string;
  niche?: string;
  brandTone?: string;
  langage?: Record<string, unknown>;
}): Promise<BatchResult> {
  const {
    supabaseAdmin: sb,
    contentId,
    userId,
    platform,
    accessToken,
    platformUserId,
    postText,
    commentType,
    nbComments,
    styleTon = "professionnel",
    niche = "",
    brandTone = "",
    langage,
  } = opts;

  const tag = `[auto-comments/${commentType}]`;
  const results: AutoCommentResult[] = [];

  try {
    console.log(`${tag} Starting: ${nbComments} comments for ${platform}, content ${contentId}`);

    // 1. Search for relevant posts
    let relevantPosts: Array<{ id: string; text: string; url?: string }> = [];
    try {
      relevantPosts = await searchRelevantPosts(platform, accessToken, platformUserId, niche, postText, nbComments + 5);
      console.log(`${tag} Found ${relevantPosts.length} relevant posts on ${platform}`);
    } catch (searchErr) {
      const searchErrMsg = searchErr instanceof Error ? searchErr.message : "Erreur de recherche inconnue";
      console.error(`${tag} Search failed on ${platform}:`, searchErrMsg);
      // Log the search failure so admin can see it in Supabase
      try {
        await sb.from("auto_comment_logs").insert({
          user_id: userId,
          post_tipote_id: contentId,
          platform,
          comment_text: "",
          comment_type: commentType,
          status: "failed",
          error_message: `Recherche de posts échouée sur ${platform}: ${searchErrMsg}`,
          published_at: null,
        });
      } catch { /* non-fatal */ }
      // Advance status and return
      const fallbackStatus = commentType === "before" ? "before_done" : "completed";
      await sb.from("content_item").update({ auto_comments_status: fallbackStatus }).eq("id", contentId);
      return { commentsPosted: 0, commentsFailed: 0, postsFound: 0, results: [] };
    }

    const postsToComment = relevantPosts.slice(0, nbComments);

    // Log if no posts found (so admin can see it in Supabase)
    if (postsToComment.length === 0) {
      const keywords = extractKeywords(niche, postText).slice(0, 5).join(", ");
      console.warn(`${tag} No posts found on ${platform} for keywords: ${keywords}`);
      try {
        await sb.from("auto_comment_logs").insert({
          user_id: userId,
          post_tipote_id: contentId,
          platform,
          comment_text: "",
          comment_type: commentType,
          status: "failed",
          error_message: `Aucun post trouvé sur ${platform} pour les mots-clés: ${keywords || "(vide — niche manquante ?)"}. Vérifiez votre connexion sociale et votre niche.`,
          published_at: null,
        });
      } catch { /* non-fatal */ }
    }

    // 2. For each: generate → like → comment → log
    for (let i = 0; i < postsToComment.length; i++) {
      const targetPost = postsToComment[i];
      const angle = BATCH_ANGLES[i % BATCH_ANGLES.length];

      try {
        // Human-like delay (skip first)
        if (i > 0) await randomDelay(DELAY_MIN, DELAY_MAX);

        const commentText = await generateComment({
          targetPostText: targetPost.text,
          angle,
          styleTon,
          niche,
          brandTone,
          platform,
          langage,
        });

        if (!commentText) {
          results.push({ success: false, targetPostId: targetPost.id, error: "Empty comment generated" });
          continue;
        }

        // Like first (natural behavior)
        await likePost(platform, accessToken, platformUserId, targetPost.id);
        await randomDelay(3_000, 8_000);

        // Comment
        const commentResult = await postCommentOnPost(platform, accessToken, platformUserId, targetPost.id, commentText);

        results.push({
          success: commentResult.ok,
          targetPostId: targetPost.id,
          targetPostUrl: targetPost.url,
          commentText,
          angle,
          error: commentResult.ok ? undefined : commentResult.error,
        });

        // Log to DB
        try {
          await sb.from("auto_comment_logs").insert({
            user_id: userId,
            post_tipote_id: contentId,
            target_post_id: targetPost.id || null,
            target_post_url: targetPost.url || null,
            platform,
            comment_text: commentText,
            comment_type: commentType,
            angle,
            status: commentResult.ok ? "published" : "failed",
            error_message: commentResult.ok ? null : (commentResult.error || "Unknown error"),
            published_at: commentResult.ok ? new Date().toISOString() : null,
          });
        } catch { /* log errors are non-fatal */ }

        console.log(`${tag} Comment ${i + 1}/${postsToComment.length} ${commentResult.ok ? "posted" : "FAILED"}`);
      } catch (err) {
        console.error(`${tag} Error on comment ${i + 1}:`, err);
        results.push({ success: false, targetPostId: targetPost.id, error: err instanceof Error ? err.message : "Unknown" });
      }
    }

    // 3. Advance status
    const newStatus = commentType === "before" ? "before_done" : "completed";
    await sb.from("content_item").update({ auto_comments_status: newStatus }).eq("id", contentId);
    console.log(`${tag} Complete for ${contentId}. Status → ${newStatus}`);
  } catch (err) {
    console.error(`${tag} Fatal error:`, err);
    // Still advance status so the flow isn't stuck
    try {
      const fallbackStatus = commentType === "before" ? "before_done" : "completed";
      await sb.from("content_item").update({ auto_comments_status: fallbackStatus }).eq("id", contentId);
    } catch { /* ignore */ }
  }

  return {
    commentsPosted: results.filter((r) => r.success).length,
    commentsFailed: results.filter((r) => !r.success).length,
    postsFound: results.length,
    results,
  };
}
