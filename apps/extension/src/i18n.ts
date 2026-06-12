// i18n minimaliste pour l'extension. Pas de framework (overkill pour
// ~30 strings) — une table FR/EN avec fallback EN par défaut.
//
// Détection de la langue, dans cet ordre :
//   1. cookie LinkedIn `li_lang` (si on est sur linkedin.com, c'est la
//      meilleure source — c'est ce que l'user a choisi côté LinkedIn)
//   2. `navigator.language` (ex: "fr-FR", "en-US") — utile pour le popup
//      qui n'a pas accès aux cookies LinkedIn
//   3. fallback "en" — CWS = international, on cible majorité anglophone
//      par défaut, FR vient en bonus pour les users francophones.

type Locale = "fr" | "en";

const STRINGS: Record<string, { fr: string; en: string }> = {
  // ─── Popup ───────────────────────────────────────────────────────
  "popup.tagline": {
    fr: "Boost organique collaboratif pour LinkedIn",
    en: "Collaborative organic boost for LinkedIn",
  },
  "popup.loading": {
    fr: "Chargement…",
    en: "Loading…",
  },
  "popup.connected": {
    fr: "Connecté",
    en: "Connected",
  },
  "popup.karmaGiven": {
    fr: "donnés",
    en: "given",
  },
  "popup.karmaReceived": {
    fr: "reçus",
    en: "received",
  },
  "popup.noTasksTitle": {
    fr: "Aucune tâche en attente",
    en: "No pending tasks",
  },
  "popup.noTasksDesc": {
    fr: "Tu es à jour. Les nouvelles publications du pod apparaîtront ici.",
    en: "You're all caught up. New pod publications will show up here.",
  },
  "popup.taskCountSingular": {
    fr: "tâche en attente",
    en: "pending task",
  },
  "popup.taskCountPlural": {
    fr: "tâches en attente",
    en: "pending tasks",
  },
  "popup.viewPost": {
    fr: "→ Voir le post",
    en: "→ Open post",
  },
  "popup.postFallback": {
    fr: "Post à booster",
    en: "Post to boost",
  },
  "popup.dashboard": {
    fr: "Mon dashboard",
    en: "My dashboard",
  },
  "popup.notConnectedDesc": {
    fr: "Pour activer le boost, connecte-toi à Tipote puis ouvre LinkedIn.",
    en: "To activate boost, sign in to Tipote then open LinkedIn.",
  },
  "popup.haveAccount": {
    fr: "J'ai un compte Tipote →",
    en: "I have a Tipote account →",
  },
  "popup.discover": {
    fr: "Découvrir Tipote",
    en: "Discover Tipote",
  },
  // ─── Réglages popup (Béné 12 juin 2026) ─────────────────────────
  "settings.open": { fr: "Réglages", en: "Settings" },
  "settings.back": { fr: "Retour", en: "Back" },
  "settings.title": {
    fr: "Réglages des commentaires",
    en: "Comment settings",
  },
  "settings.tone": { fr: "Ton des commentaires", en: "Comment tone" },
  "settings.replyLang": { fr: "Langue des réponses", en: "Reply language" },
  "settings.replyLangPost": {
    fr: "Langue du post (automatique)",
    en: "Post language (automatic)",
  },
  "settings.replyLangUser": {
    fr: "Toujours ma langue",
    en: "Always my language",
  },
  "settings.addressForm": { fr: "Tutoiement", en: "Form of address" },
  "settings.addressAuto": {
    fr: "Automatique (suit le post)",
    en: "Automatic (follows the post)",
  },
  "settings.addressTu": { fr: "Tutoyer", en: "Informal (tu)" },
  "settings.addressVous": { fr: "Vouvoyer", en: "Formal (vous)" },
  "settings.domain": {
    fr: "Ton domaine d'expertise",
    en: "Your domain of expertise",
  },
  "settings.domainPlaceholder": {
    fr: "ex. marketing digital",
    en: "e.g. digital marketing",
  },
  "settings.save": { fr: "Enregistrer", en: "Save" },
  "settings.saved": { fr: "Enregistré", en: "Saved" },
  "settings.error": {
    fr: "Erreur de sauvegarde, réessaie.",
    en: "Save failed, try again.",
  },
  "settings.needLogin": {
    fr: "Connecte-toi à Tipote dans Chrome (app.tipote.com) pour gérer tes réglages.",
    en: "Sign in to Tipote in Chrome (app.tipote.com) to manage your settings.",
  },
  "settings.needPlan": {
    fr: "Les réglages du commentateur IA sont disponibles avec les plans PRO et ELITE.",
    en: "AI commenter settings are available on PRO and ELITE plans.",
  },
  "settings.moreLink": {
    fr: "Plus d'options (mots-clés, expressions, emojis) sur Tipote",
    en: "More options (keywords, expressions, emojis) on Tipote",
  },
  "popup.privacy": {
    fr: "Politique de confidentialité",
    en: "Privacy policy",
  },
  // ─── Inline dropdown LinkedIn (feedInjector) ─────────────────────
  "tone.agree": {
    fr: "Je suis d'accord",
    en: "I agree",
  },
  "tone.disagree": {
    fr: "Je ne suis pas d'accord",
    en: "I disagree",
  },
  "tone.add_value": {
    fr: "Ajouter de la valeur",
    en: "Add value",
  },
  "tone.ask_question": {
    fr: "Poser une question",
    en: "Ask a question",
  },
  "dropdown.aria": {
    fr: "Générer un commentaire avec Tipote",
    en: "Generate a comment with Tipote",
  },
  "dropdown.generating": {
    fr: "Génération…",
    en: "Generating…",
  },
  "dropdown.inserted": {
    fr: "Inséré ✓",
    en: "Inserted ✓",
  },
  "dropdown.copied": {
    fr: "Copié — collez (Ctrl+V)",
    en: "Copied — paste (Ctrl+V)",
  },
  "dropdown.reloadLinkedIn": {
    fr: "↻ Recharger la page",
    en: "↻ Reload the page",
  },
};

let _cachedLocale: Locale | null = null;

/** Force-reset le cache (utile en test). Pas exposé en prod. */
export function _resetLocaleCache(): void {
  _cachedLocale = null;
}

/** Détecte la locale. Cache pour la durée du context (popup, content
 *  script, SW). Re-évalué si l'user change sa langue browser et reload. */
export function detectLocale(): Locale {
  if (_cachedLocale) return _cachedLocale;

  // 1. Cookie LinkedIn (uniquement si on est sur linkedin.com — sinon
  //    document.cookie est vide pour ce domaine, donc no-op).
  try {
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/li_lang=([^;]+)/);
      if (m) {
        const v = decodeURIComponent(m[1]).slice(0, 2).toLowerCase();
        if (v === "fr") return (_cachedLocale = "fr");
        if (v === "en") return (_cachedLocale = "en");
      }
    }
  } catch {
    // ignore
  }

  // 2. navigator.language
  try {
    if (typeof navigator !== "undefined" && navigator.language) {
      const v = navigator.language.slice(0, 2).toLowerCase();
      if (v === "fr") return (_cachedLocale = "fr");
    }
  } catch {
    // ignore
  }

  // 3. fallback EN
  return (_cachedLocale = "en");
}

/** Lookup d'une string traduite. Si la clé est inconnue, on retourne
 *  la clé elle-même — facile à repérer en dev. */
export function t(key: keyof typeof STRINGS): string {
  const loc = detectLocale();
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[loc];
}
