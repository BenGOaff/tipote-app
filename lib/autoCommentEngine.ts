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
- TOUJOURS écrire en français, quelle que soit la langue du post cible
- INTERDICTION ABSOLUE d'exprimer une hésitation, une difficulté ou un doute dans le commentaire : ne jamais écrire "j'ai du mal à", "je ne sais pas si", "pas de point de connexion", "hors sujet", "difficile de commenter", ni aucune formule équivalente — si le post est éloigné de ta niche, connecte-le à ta niche de façon créative
${opts.styleTon ? `- Ton/style : ${opts.styleTon}` : ""}
${opts.niche ? `- Tu es dans la niche : ${opts.niche}` : ""}
${opts.brandTone ? `- Ton de voix de l'utilisateur : ${opts.brandTone}` : ""}
${opts.langage && Object.keys(opts.langage).length > 0 ? `- Éléments de langage : ${JSON.stringify(opts.langage)}` : ""}

Réponds UNIQUEMENT avec le texte du commentaire final prêt à être publié, sans guillemets, sans explications, sans méta-commentaire.`;

  const user = `Post à commenter :
"""
${opts.targetPostText.slice(0, 1500)}
"""

Angle du commentaire : ${angleObj.instruction}

Écris directement le commentaire (en français) :`;

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

  // Reject meta-commentary / hesitation leaks (e.g. "J'ai du mal à trouver un angle...")
  const hesitationPatterns = [
    /j['\u2019]ai du mal/i,
    /je ne (sais|trouve|vois|peux)/i,
    /pas de point de connexion/i,
    /hors (de ma |)niche/i,
    /difficile (de|d['\u2019])/i,
    /pas pertinent/i,
    /n['\u2019]est pas (dans|lié|relié)/i,
    /angle pertinent/i,
  ];
  if (hesitationPatterns.some((re) => re.test(text))) {
    return ""; // Caller will skip this post
  }

  return text.slice(0, maxChars);
}

// ─── Twitter API Functions ───────────────────────────────────────────────────

export async function twitterSearchTweets(
  accessToken: string,
  query: string,
  maxResults = 10,
  lang?: string,
): Promise<Array<{ id: string; text: string; authorId: string }>> {
  const keywords = query.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  const langFilter = lang ? ` lang:${lang}` : "";
  const twitterQuery = keywords.length > 1
    ? `(${keywords.join(" OR ")}) -is:retweet -is:reply${langFilter}`
    : `${query} -is:retweet -is:reply${langFilter}`;

  const params = new URLSearchParams({
    query: twitterQuery,
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    "tweet.fields": "author_id,text,public_metrics",
  });

  const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Twitter search error (${res.status}): ${t.slice(0, 300)}`);
  }

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
  // LinkedIn's public API does not expose a feed search endpoint to standard apps.
  // We attempt two known endpoints in order:
  //   1. REST v1  : GET /rest/posts?q=memberNetworkFeed  (new API, requires MDP)
  //   2. v2 API   : GET /v2/shares?q=memberNetworkFeed   (older API, may work)
  // Both require r_member_social scope or Marketing Developer Program access.
  // If either returns data, we filter client-side by keyword.

  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  async function tryFetch(url: string, headers: Record<string, string>) {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    return json;
  }

  function extractElements(json: any): any[] {
    // REST v1 format: { elements: [...] }
    // v2 format: { elements: [...] } with slightly different post shape
    return json?.elements ?? [];
  }

  function extractText(post: any): string {
    return (
      post.commentary ??
      post.text?.text ??
      post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text ??
      ""
    );
  }

  // Attempt 1: REST v1 API
  const restUrl = "https://api.linkedin.com/rest/posts?q=memberNetworkFeed&count=50";
  const restHeaders = {
    "Authorization": `Bearer ${accessToken}`,
    "LinkedIn-Version": "202602",
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const restJson = await tryFetch(restUrl, restHeaders);

  // Attempt 2: v2 API fallback if REST returned nothing/404
  const v2Json = restJson
    ? null
    : await tryFetch(
        "https://api.linkedin.com/v2/shares?q=memberNetworkFeed&count=50",
        { "Authorization": `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
      );

  const elements = extractElements(restJson ?? v2Json ?? {});

  if (!elements.length) {
    throw new Error(
      "LinkedIn feed inaccessible (HTTP 404 sur les deux endpoints) : " +
      "la recherche de posts requiert le programme partenaire LinkedIn (MDP) " +
      "ou le scope r_member_social. " +
      "Les auto-commentaires LinkedIn ne sont pas disponibles sans cet accès."
    );
  }

  return elements
    .filter((post: any) => {
      const text = extractText(post).toLowerCase();
      return keywords.length === 0 || keywords.some((kw) => text.includes(kw));
    })
    .slice(0, maxResults)
    .map((post: any) => ({
      urn: post.id ?? "",
      text: extractText(post),
      authorUrn: post.author ?? "",
    }))
    .filter((p) => p.urn && p.text);
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

// ─── Threads API Functions ───────────────────────────────────────────────────

const THREADS_BASE = "https://graph.threads.net/v1.0";

/**
 * Search public Threads posts matching a keyword query.
 * Endpoint added by Meta in December 2024.
 * Correct path: GET /v1.0/search?q=... (NOT /v1.0/threads/search)
 * Required scope: threads_keyword_search (+ threads_basic)
 * Rate limit: 500 queries per 7-day rolling window.
 */
export async function threadsSearchPosts(
  accessToken: string,
  query: string,
  maxResults = 10,
): Promise<Array<{ id: string; text: string; username: string }>> {
  const params = new URLSearchParams({
    q: query,
    fields: "id,text,username,timestamp,media_type",
    access_token: accessToken,
  });

  // Correct endpoint as of Dec 2024: /keyword_search (not /search which returns 400)
  const res = await fetch(`${THREADS_BASE}/keyword_search?${params}`);

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Threads search error (${res.status}): ${t.slice(0, 300)}`);
  }

  const json = (await res.json()) as any;
  const data: any[] = json?.data ?? [];

  return data
    .filter((post: any) => post.text && post.text.trim().length > 0)
    .slice(0, maxResults)
    .map((post: any) => ({
      id: String(post.id ?? ""),
      text: String(post.text ?? ""),
      username: String(post.username ?? ""),
    }))
    .filter((p) => p.id && p.text);
}

/**
 * Reply to a Threads post (2-step: create container → publish).
 */
export async function threadsReplyToPost(
  accessToken: string,
  userId: string,
  postId: string,
  text: string,
): Promise<{ ok: boolean; replyId?: string; error?: string }> {
  // Step 1 — Create the reply media container
  const createParams = new URLSearchParams({
    media_type: "TEXT",
    text,
    reply_to_id: postId,
    access_token: accessToken,
  });

  const createRes = await fetch(`${THREADS_BASE}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createParams,
  });

  if (!createRes.ok) {
    const t = await createRes.text().catch(() => "");
    return { ok: false, error: `Threads create reply error (${createRes.status}): ${t.slice(0, 300)}` };
  }

  const createJson = (await createRes.json()) as any;
  const creationId = createJson?.id as string | undefined;
  if (!creationId) {
    return { ok: false, error: "Threads create reply: no creation_id returned" };
  }

  // Step 2 — Publish the reply
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  const publishRes = await fetch(`${THREADS_BASE}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishParams,
  });

  if (!publishRes.ok) {
    const t = await publishRes.text().catch(() => "");
    return { ok: false, error: `Threads publish reply error (${publishRes.status}): ${t.slice(0, 300)}` };
  }

  const publishJson = (await publishRes.json()) as any;
  return { ok: true, replyId: publishJson?.id as string | undefined };
}

// ─── Instagram API Functions ─────────────────────────────────────────────────

const IG_GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * Search Instagram posts via the Hashtag Search API.
 * Flow: keyword → hashtag ID → recent_media (filtered by caption keywords).
 * Required permissions: instagram_manage_hashtags, instagram_basic
 * Rate limit: 30 unique hashtags per 7-day rolling window per IG user.
 */
export async function instagramHashtagSearchPosts(
  accessToken: string,
  igUserId: string,
  keywords: string[],
  maxResults = 10,
): Promise<Array<{ id: string; text: string; url: string }>> {
  const results: Array<{ id: string; text: string; url: string }> = [];

  // Use top 2 keywords as hashtags (avoid burning the 30-hashtag rate limit)
  const hashtags = keywords
    .slice(0, 2)
    .map((kw) => kw.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "").toLowerCase())
    .filter((h) => h.length >= 3);

  if (!hashtags.length) return results;

  for (const hashtag of hashtags) {
    if (results.length >= maxResults) break;

    // Step 1: get the hashtag ID
    const searchParams = new URLSearchParams({
      user_id: igUserId,
      q: hashtag,
      access_token: accessToken,
    });
    const hashtagRes = await fetch(`${IG_GRAPH_BASE}/ig_hashtag_search?${searchParams}`);
    if (!hashtagRes.ok) {
      const t = await hashtagRes.text().catch(() => "");
      throw new Error(`Instagram hashtag search error (${hashtagRes.status}): ${t.slice(0, 300)}`);
    }
    const hashtagJson = (await hashtagRes.json()) as any;
    const hashtagId = hashtagJson?.data?.[0]?.id as string | undefined;
    if (!hashtagId) continue;

    // Step 2: get recent media for that hashtag
    const mediaParams = new URLSearchParams({
      user_id: igUserId,
      fields: "id,caption,permalink,timestamp,media_type",
      access_token: accessToken,
    });
    const mediaRes = await fetch(`${IG_GRAPH_BASE}/${hashtagId}/recent_media?${mediaParams}`);
    if (!mediaRes.ok) continue;
    const mediaJson = (await mediaRes.json()) as any;
    const posts: any[] = mediaJson?.data ?? [];

    // Filter posts that have a caption mentioning at least one keyword
    const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
    for (const post of posts) {
      if (results.length >= maxResults) break;
      const caption: string = post.caption ?? "";
      if (!caption.trim()) continue;
      const captionLower = caption.toLowerCase();
      const matches = keywords.some((kw) => captionLower.includes(kw.toLowerCase()));
      if (!matches && keywordSet.size > 0) continue;
      results.push({
        id: String(post.id ?? ""),
        text: caption.slice(0, 1000),
        url: String(post.permalink ?? `https://www.instagram.com/p/${post.id}/`),
      });
    }
  }

  return results;
}

/**
 * Comment on a public Instagram post.
 * Required permission: instagram_manage_comments
 */
export async function instagramCommentOnPost(
  accessToken: string,
  mediaId: string,
  text: string,
): Promise<{ ok: boolean; commentId?: string; error?: string }> {
  const res = await fetch(`${IG_GRAPH_BASE}/${mediaId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, access_token: accessToken }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Instagram comment error (${res.status}): ${t.slice(0, 300)}` };
  }

  const json = (await res.json()) as any;
  return { ok: true, commentId: json?.id as string | undefined };
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

  // Detect the language of the user's content to filter search results
  const userLang = detectContentLanguage(`${niche} ${postText}`);

  /**
   * Post-fetch relevance filter:
   * - If language detected, skip posts clearly in a different language
   * - Always ensure at least one keyword appears in the post text
   */
  function isRelevantPost(text: string): boolean {
    const lower = text.toLowerCase();
    const hasKeyword = keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (!hasKeyword) return false;
    if (userLang) {
      const postLang = detectContentLanguage(text);
      // Accept post if detected language matches OR if detection is uncertain (null)
      if (postLang && postLang !== userLang) return false;
    }
    return true;
  }

  switch (platform) {
    case "twitter": {
      const tweets = await twitterSearchTweets(accessToken, query, maxResults * 2, userLang ?? undefined);
      return tweets
        .filter((t) => isRelevantPost(t.text))
        .map((t) => ({
          id: t.id,
          text: t.text,
          url: `https://twitter.com/i/web/status/${t.id}`,
        }));
    }
    case "reddit": {
      const posts = await redditSearchPosts(accessToken, query, maxResults * 2);
      return posts
        .filter((p) => isRelevantPost(`${p.title} ${p.selftext}`))
        .map((p) => ({
          id: p.id,
          text: `${p.title}\n${p.selftext}`.trim(),
          url: p.url,
        }));
    }
    case "linkedin":
      throw new Error(
        "LinkedIn feed search requiert le programme partenaire LinkedIn (MDP) ou le scope r_member_social — " +
        "non disponible sans approbation LinkedIn. Les auto-commentaires LinkedIn sont désactivés."
      );
    case "threads": {
      const posts = await threadsSearchPosts(accessToken, query, maxResults * 2);
      return posts
        .filter((p) => isRelevantPost(p.text))
        .map((p) => ({
          id: p.id,
          text: p.text,
          url: `https://www.threads.net/@${p.username}/post/${p.id}`,
        }));
    }
    case "instagram": {
      const igKeywords = keywords.slice(0, 5);
      const posts = await instagramHashtagSearchPosts(accessToken, platformUserId, igKeywords, maxResults);
      return posts;
    }
    case "facebook":
      throw new Error(
        `Les auto-commentaires ne sont pas disponibles sur Facebook : ` +
        `l'API Meta ne permet pas la recherche de posts publics.`
      );
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
    case "threads":
      return threadsReplyToPost(accessToken, platformUserId, postId, commentText);
    case "instagram":
      return instagramCommentOnPost(accessToken, postId, commentText);
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
    case "threads":
    case "instagram":
      // No public like endpoint available — skip silently
      return false;
    default:
      return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detect the primary language of a text using simple heuristics.
 * Returns an ISO 639-1 code (e.g. "fr", "es", "de", "en") or null if unknown.
 */
function detectContentLanguage(text: string): string | null {
  const sample = text.slice(0, 600).toLowerCase();
  const words = sample.split(/\s+/);
  const total = words.length || 1;

  type LangProfile = { stopWords: string[]; accents: RegExp };
  const profiles: Record<string, LangProfile> = {
    fr: {
      stopWords: ["le", "la", "les", "de", "du", "des", "est", "sont", "pour", "avec", "dans", "sur", "que", "qui", "et", "ou", "une", "un", "je", "tu", "nous", "vous", "ils", "elles", "mon", "ton", "son", "pas", "ne", "se", "au", "aux"],
      accents: /[àâäéèêëîïôöùûüç]/g,
    },
    es: {
      stopWords: ["el", "los", "las", "del", "que", "es", "son", "para", "con", "una", "por", "como", "pero", "este", "esta", "esto", "también", "más", "muy"],
      accents: /[áéíóúñ¿¡]/g,
    },
    de: {
      stopWords: ["der", "die", "das", "den", "dem", "ein", "eine", "ist", "sind", "und", "oder", "mit", "für", "bei", "von", "zum", "zur", "auf", "nicht", "ich", "du", "wir"],
      accents: /[äöüß]/g,
    },
    pt: {
      stopWords: ["que", "para", "com", "uma", "são", "por", "como", "mas", "mais", "muito", "também", "isso", "este"],
      accents: /[ãõáéíóúâêôà]/g,
    },
  };

  const scores: Record<string, number> = {};
  for (const [lang, { stopWords, accents }] of Object.entries(profiles)) {
    const stopScore = words.filter((w) => stopWords.includes(w)).length / total;
    const accentScore = (sample.match(accents)?.length ?? 0) / total;
    scores[lang] = stopScore * 3 + accentScore * 2;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  // Only return a language if the signal is strong enough
  return best && best[1] > 0.05 ? best[0] : null;
}

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
