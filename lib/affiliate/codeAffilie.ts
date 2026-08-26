// lib/affiliate/codeAffilie.ts
//
// LE CODE PUBLIC D'UNE PERSONNE, DEMANDÉ PAR UNE AUTRE APP.
//
// Béné, 26 août 2026, en montrant l'onglet Affiliation de l'Atelier :
// "t'as pas oublié un truc ?" Il demandait encore un identifiant
// Systeme.io et fabriquait `tipote.fr/atelier-du-quiz?sa=...`, alors
// que depuis la veille l'Atelier est vendu par NOTRE bon de commande et
// commissionné par NOTRE registre.
//
// -- POURQUOI CETTE PORTE EXISTE ---------------------------------------
//
// La table `affiliates` vit ICI. L'Atelier ne peut donc pas fabriquer le
// lien d'un élève sans demander son code public, exactement comme Tiquiz
// demande déjà à qui appartient un lien (`/api/affiliate/proprietaire`).
// La copier là-bas donnerait DEUX registres, donc deux réponses
// différentes le jour où l'un prend du retard. C'est la faute qu'on
// vient de payer : l'Atelier avait le sien, et il ne parlait à personne.
//
// -- CE QUI SE DÉCIDE ICI, ET RIEN D'AUTRE -----------------------------
//
// Ce module ne touche pas la base : il dit ce qu'il FAUT faire, et la
// route l'exécute. `codeAffilie.ts` est donc importable par un test,
// contrairement à tout ce qui tire `supabaseAdmin`. C'est très
// exactement là que les bugs se sont installés jusqu'ici (le verrou des
// webhooks, la fenêtre d'attribution).

/** Ce que la base sait déjà de cette adresse, ou rien. */
export type LigneAffiliee = {
  sa: string;
  status?: string | null;
} | null;

export type DecisionCode =
  | { action: "reprendre"; sa: string }
  | { action: "creer" }
  | { action: "refuser"; raison: "email_deja_affiliee" | "exclu" };

/**
 * Faut-il rendre le code de cette personne, lui en créer un, ou refuser ?
 *
 * `saPropose` est l'identifiant Systeme.io que l'élève a collé, quand il
 * en a un. Il ne sert QU'À rattacher ses ventes arrivées par les anciens
 * tunnels : il n'est jamais obligatoire, et il ne peut jamais remplacer
 * un identifiant déjà posé.
 */
export function decisionCodePourEmail(args: {
  ligne: LigneAffiliee;
  saPropose?: string | null;
}): DecisionCode {
  const { ligne } = args;
  const saPropose = (args.saPropose ?? "").trim() || null;

  if (!ligne) return { action: "creer" };

  // UN AFFILIÉ EXCLU N'A PAS DE LIEN. Béné, 26 août : "affilié viré =
  // pas payé. Point barre." Lui rendre un lien le laisserait promouvoir
  // pour rien, donc mentir à son audience sans le savoir. Une PAUSE
  // n'est pas une exclusion : il ne gagne plus, il garde son lien et ce
  // qu'il a déjà gagné.
  if ((ligne.status ?? "active").toLowerCase() === "banned") {
    return { action: "refuser", raison: "exclu" };
  }

  // Cette adresse est déjà affiliée sous un AUTRE identifiant, et on
  // nous en propose un nouveau. `sa` est la clé primaire : tout
  // l'historique (clics, conversions, commissions, versements) y est
  // accroché. Le changer en silence orphelinerait de l'argent déjà
  // gagné. C'est un cas pour un humain, et on le DIT.
  if (saPropose && ligne.sa !== saPropose) {
    return { action: "refuser", raison: "email_deja_affiliee" };
  }

  return { action: "reprendre", sa: ligne.sa };
}
