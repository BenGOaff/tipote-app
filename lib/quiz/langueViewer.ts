// lib/quiz/langueViewer.ts
//
// LA LANGUE DU VIEWER PUBLIC, ET LE REPLI QUAND ON NE L'A PAS.
//
// Retour d'un client anglophone, 7 septembre 2026 : "some parts of the
// quiz UI were in French (eg. the message that your answers are saved)
// - I did set the language to English - this should be fixed."
//
// Il avait raison, et QUATRE chemins distincts servaient du francais a
// un quiz regle en anglais. Les quatre ont la meme cause : le repli de
// langue etait ecrit a la main, differemment, a chaque endroit.
//
//   1. RESUME_COPY (le bandeau "tu reprends la ou tu t'etais arrete")
//      n'avait AUCUN repli BCP-47 : un quiz en `pt-BR` y prenait
//      RESUME_COPY.fr, donc UNE phrase francaise au milieu d'un quiz
//      portugais. Mesure : `pt-BR` n'est pas une cle de la table, et
//      `pt-BR` EST proposee dans le selecteur de l'editeur.
//   2. le bandeau "Mode apercu, rien n'est enregistre" etait ecrit en
//      dur, en francais, dans le composant ;
//   3. le toast "Apercu de ton brouillon" aussi ;
//   4. les DEUX ecrans d'erreur du viewer appellent `getT(null)` ou
//      `getT(undefined)`, donc le francais, POUR TOUT LE MONDE. C'est
//      l'ecran qu'on voit quand ca a l'air casse : celui ou une phrase
//      dans la mauvaise langue coute le plus cher.
//
// REGLE : le repli de langue vit ICI, en UNE fonction, et tout le monde
// l'appelle. Trois copies d'une meme regle finissent toujours par ne
// plus dire la meme chose, et c'est exactement ce qui vient d'arriver.

/** Repli BCP-47 : la cle exacte, sinon sa base (`pt-BR` -> `pt`), sinon
 *  le defaut. C'est la SEULE regle de repli du viewer public. */
export function repliLangue<T>(
  locale: string | null | undefined,
  table: Record<string, T>,
  defaut: string,
): T {
  const code = (locale ?? "").trim();
  if (code && table[code]) return table[code];
  const base = code.split("-")[0];
  if (base && table[base]) return table[base];
  return table[defaut];
}

/** La langue du NAVIGATEUR, quand on n'a pas celle du quiz.
 *
 *  Les deux ecrans d'erreur du viewer parlent avant d'avoir charge le
 *  quiz : sa langue est donc inconnue, et retomber sur le francais
 *  faisait lire "Impossible de charger le quiz." a un visiteur
 *  anglophone. Le navigateur, lui, dit toujours quelque chose.
 *
 *  Rend `null` cote serveur : l'appelant garde alors son propre defaut. */
export function langueDuNavigateur(): string | null {
  if (typeof navigator === "undefined") return null;
  const brut = navigator.language || (navigator.languages ?? [])[0];
  const code = String(brut ?? "").trim();
  return code || null;
}

export type MessagesApercu = {
  /** Bandeau orange colle en haut, visible par le seul createur. */
  banniere: (nom: string | null) => string;
  /** Toast affiche quand le brouillon est servi a son createur. */
  brouillonTitre: string;
  brouillonCorps: string;
};

// Le createur voit ces phrases dans la langue de SON quiz : c'est la
// seule langue dont cette page dispose (le viewer public n'a pas de
// session, donc pas de langue d'interface). Un createur anglophone qui
// teste son quiz anglais lit donc de l'anglais, ce qu'il demandait.
export const MESSAGES_APERCU: Record<string, MessagesApercu> = {
  fr: {
    banniere: (nom) => `\u{1F441}️ Mode aperçu${nom ? `, bonjour ${nom}` : ""} · rien n'est enregistré`,
    brouillonTitre: "\u{1F441}️ Aperçu de ton brouillon",
    brouillonCorps:
      "Ce quiz n'est pas encore publié. Personne ne peut y accéder via ce lien, publie-le depuis l'éditeur pour le partager.",
  },
  fr_vous: {
    banniere: (nom) => `\u{1F441}️ Mode aperçu${nom ? `, bonjour ${nom}` : ""} · rien n'est enregistré`,
    brouillonTitre: "\u{1F441}️ Aperçu de votre brouillon",
    brouillonCorps:
      "Ce quiz n'est pas encore publié. Personne ne peut y accéder via ce lien, publiez-le depuis l'éditeur pour le partager.",
  },
  en: {
    banniere: (nom) => `\u{1F441}️ Preview mode${nom ? `, hello ${nom}` : ""} · nothing is saved`,
    brouillonTitre: "\u{1F441}️ Preview of your draft",
    brouillonCorps:
      "This quiz is not published yet. Nobody can open it with this link. Publish it from the editor to share it.",
  },
  es: {
    banniere: (nom) => `\u{1F441}️ Modo vista previa${nom ? `, hola ${nom}` : ""} · no se guarda nada`,
    brouillonTitre: "\u{1F441}️ Vista previa de tu borrador",
    brouillonCorps:
      "Este quiz aún no está publicado. Nadie puede abrirlo con este enlace. Publícalo desde el editor para compartirlo.",
  },
  it: {
    banniere: (nom) => `\u{1F441}️ Anteprima${nom ? `, ciao ${nom}` : ""} · non viene salvato nulla`,
    brouillonTitre: "\u{1F441}️ Anteprima della tua bozza",
    brouillonCorps:
      "Questo quiz non è ancora pubblicato. Nessuno può aprirlo con questo link. Pubblicalo dall'editor per condividerlo.",
  },
  de: {
    banniere: (nom) => `\u{1F441}️ Vorschaumodus${nom ? `, hallo ${nom}` : ""} · nichts wird gespeichert`,
    brouillonTitre: "\u{1F441}️ Vorschau deines Entwurfs",
    brouillonCorps:
      "Dieses Quiz ist noch nicht veröffentlicht. Über diesen Link kann es niemand öffnen. Veröffentliche es im Editor, um es zu teilen.",
  },
  pt: {
    banniere: (nom) => `\u{1F441}️ Pré-visualização${nom ? `, olá ${nom}` : ""} · nada é guardado`,
    brouillonTitre: "\u{1F441}️ Pré-visualização do teu rascunho",
    brouillonCorps:
      "Este quiz ainda não está publicado. Ninguém o consegue abrir com esta ligação. Publica-o no editor para o partilhares.",
  },
  "pt-BR": {
    banniere: (nom) => `\u{1F441}️ Prévia${nom ? `, olá ${nom}` : ""} · nada é salvo`,
    brouillonTitre: "\u{1F441}️ Prévia do seu rascunho",
    brouillonCorps:
      "Este quiz ainda não está publicado. Ninguém consegue abrir com este link. Publique no editor para compartilhar.",
  },
  ar: {
    banniere: (nom) => `\u{1F441}️ وضع المعاينة${nom ? `، مرحبًا ${nom}` : ""} · لا يُحفظ أي شيء`,
    brouillonTitre: "\u{1F441}️ معاينة مسودتك",
    brouillonCorps:
      "هذا الاختبار غير منشور بعد. لا يمكن لأحد فتحه عبر هذا الرابط. انشره من المحرّر لمشاركته.",
  },
};

/** Les phrases d'apercu, dans la langue du quiz. `addressForm` ne joue
 *  qu'en francais, comme partout ailleurs dans le viewer. */
export function messagesApercu(
  locale: string | null | undefined,
  addressForm?: string | null,
): MessagesApercu {
  if ((locale ?? "fr") === "fr" && addressForm === "vous") return MESSAGES_APERCU.fr_vous;
  return repliLangue(locale, MESSAGES_APERCU, "fr");
}
