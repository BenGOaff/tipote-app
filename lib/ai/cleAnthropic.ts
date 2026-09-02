// lib/ai/cleAnthropic.ts
//
// LA CLÉ ANTHROPIC SE LIT À UN SEUL ENDROIT.
//
// Béné, 2 septembre 2026, côté Tiquiz : "le générateur de bonus ne
// fonctionne pas j'ai un message d'erreur c'est relou". L'écran disait
// "L'écriture n'est pas disponible pour le moment", c'est à dire
// `not_configured`, c'est à dire "aucune clé". Il y en avait une, et
// toutes les autres fonctions IA la trouvaient : la route des
// générateurs était la seule à ne lire QU'UN des noms possibles.
//
// CE DÉPÔT EST PIRE QUE L'AUTRE, et c'est ce qui rend le module
// indispensable ici : trois noms de variable circulent, et deux fichiers
// ne les lisent même pas dans le même ordre.
//
//   lib/claude.ts        CLAUDE_API_KEY_OWNER puis ANTHROPIC_API_KEY_OWNER
//   lib/quiz/insights.ts ANTHROPIC_API_KEY    puis CLAUDE_API_KEY_OWNER
//   lib/autoCommentEngine.ts  CLAUDE_API_KEY_OWNER puis ANTHROPIC_API_KEY_OWNER
//   app/api/generateurs  ANTHROPIC_API_KEY, et rien d'autre
//
// Un garde-fou qui ne protège qu'un des jumeaux ne protège personne :
// le même trou vivait des deux côtés, il se bouche des deux côtés.
//
// -- ON LES ESSAIE TOUTES, ET ON NE CHOISIT PAS À LA PLACE DE BÉNÉ ----
//
// Les quatre noms sont lus. Tant qu'un seul porte une valeur, l'ordre ne
// décide de rien, et c'est le cas normal. Si DEUX portent des valeurs
// DIFFÉRENTES, l'ordre déciderait silencieusement laquelle est facturée :
// on prend la première et on CRIE dans le journal, parce que c'est une
// question pour un humain, pas pour du code (règle des versements du
// 25 août : "la méthode est un CHOIX, jamais une déduction").

const NOMS = [
  "CLAUDE_API_KEY_OWNER",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_API_KEY_OWNER",
] as const;

let dejaCrie = false;

/** La clé Anthropic du compte, ou "" quand aucune n'est posée. */
export function cleAnthropic(): string {
  const posees = NOMS.map((n) => ({ nom: n, valeur: (process.env[n] ?? "").trim() })).filter(
    (v) => v.valeur.length > 0,
  );
  if (posees.length === 0) return "";

  const distinctes = new Set(posees.map((v) => v.valeur));
  if (distinctes.size > 1 && !dejaCrie) {
    dejaCrie = true;
    // Jamais la valeur, jamais un fragment : ces journaux se recopient.
    console.error(
      `[cleAnthropic] ${posees.length} variables portent des cles DIFFERENTES (${posees
        .map((v) => v.nom)
        .join(", ")}). On utilise ${posees[0].nom}. A trancher sur le serveur.`,
    );
  }
  return posees[0].valeur;
}

export default cleAnthropic;
