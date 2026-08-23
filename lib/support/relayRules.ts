// lib/support/relayRules.ts
//
// LES DÉCISIONS DU RELAIS, SANS AUCUNE ENTRÉE / SORTIE.
//
// Elles vivent à part parce que `relayTicket.ts` importe `supabaseAdmin`,
// qui exige les variables d'environnement AU CHARGEMENT du module : un
// test qui l'importerait planterait avant d'exécuter une seule
// assertion. C'est la règle du dépôt, écrite le 1er août : une logique
// qu'on ne peut pas importer n'est pas testée, donc c'est exactement là
// que les bugs s'installent.

/** L'app qui porte la file. Surchargeable, validée, jamais locale. */
export function tiquizBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const brut = String(env.TIQUIZ_APP_URL ?? "").trim().replace(/\/+$/, "");
  // Même garde-fou que `resolveAppUrl` (drame Véronique, 2 août) : une
  // variable présente et absurde traverse un `??`. Une adresse locale
  // dans un appel serveur à serveur de production ne peut rien joindre.
  if (/^https:\/\/[^/]+$/.test(brut) && !/localhost|127\.|::1|\.local/.test(brut)) return brut;
  return "https://quiz.tipote.com";
}

/**
 * Ce que Béné lira : le message écrit, ou l'échange avec le robot.
 *
 * Sans cette reprise, un ticket venu du chat arriverait avec un corps
 * VIDE dans la file : elle verrait une adresse email et rien d'autre,
 * et devrait répondre à une question qu'elle n'a pas lue.
 */
export function messageLisible(
  message: string | null | undefined,
  conversation: readonly { role: string; content: string }[] | null | undefined,
): string {
  const ecrit = String(message ?? "").trim();
  if (ecrit) return ecrit;
  return (conversation ?? [])
    .map((m) => `${m.role === "assistant" ? "Robot" : "Elle"} : ${m.content}`)
    .join("\n\n")
    .trim();
}
