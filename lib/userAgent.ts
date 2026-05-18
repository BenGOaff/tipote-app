// Bot detection pour le tracking analytics (Adeline, 19 mai 2026 :
// "il faut mettre un bon système de tracking, qui reflète les vrais
// visiteurs").
//
// Approche : regex case-insensitive sur les motifs UA des principaux
// crawlers (Google, Bing, Apple, Facebook, LinkedIn, Twitter, Yandex,
// Baidu, Ahrefs, Semrush) + les agents IA (ChatGPT, Claude, Anthropic,
// Perplexity). Conservative — on préfère laisser passer un faux bot
// qu'exclure un vrai visiteur.
//
// On NE filtre PAS sur "Headless" (les vrais utilisateurs Puppeteer
// pour debug existent). On ne filtre PAS non plus sur "Mobile" (évident).
//
// Si un nouveau bot apparaît, ajouter son motif ici et la prochaine
// vue ne sera pas comptée. Pas de DB / pas de cache : c'est juste
// une string match en O(n).

const BOT_PATTERNS = [
  // Search engines
  "googlebot", "google-inspectiontool", "bingbot", "slurp", "duckduckbot",
  "baiduspider", "yandexbot", "yandeximages", "sogou", "exabot",
  // Generic crawlers
  "bot/", "crawl", "spider", "scrape", "fetch",
  // SEO tools
  "ahrefsbot", "semrushbot", "mj12bot", "dotbot", "rogerbot",
  "screaming frog", "siteauditbot",
  // Social media preview / link unfurlers
  "facebookexternalhit", "facebookbot", "twitterbot", "linkedinbot",
  "pinterestbot", "applebot", "whatsapp", "telegrambot", "discordbot",
  "slackbot",
  // AI agents
  "chatgpt-user", "gptbot", "oai-searchbot", "claudebot", "anthropic-ai",
  "perplexitybot", "ccbot", "google-extended",
  // Uptime / monitoring
  "pingdom", "uptimerobot", "statuscake", "newrelicpinger",
  // Generic
  "headlesschrome",
];

const BOT_REGEX = new RegExp(BOT_PATTERNS.join("|"), "i");

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // Pas de UA = probablement un bot mal configuré
  return BOT_REGEX.test(userAgent);
}
