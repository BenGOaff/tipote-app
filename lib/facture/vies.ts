// lib/facture/vies.ts
//
// LE NUMÉRO DE TVA EXISTE-T-IL VRAIMENT ? (Béné, 27 août 2026)
//
// "Les numéros de TVA sont validés sur leur FORME, jamais auprès de
// VIES. Un numéro bien formé mais inexistant produit une autoliquidation
// injustifiée, donc de la TVA à ta charge. On peut corriger ça ?"
//
// Oui, et l'enjeu est chiffrable : sur une vente à 290 € en
// autoliquidation injustifiée, ce sont 48 € de TVA qu'elle paie de sa
// poche, découverts au contrôle, plusieurs années plus tard, avec des
// pénalités. La forme d'un numéro ne prouve rien : `BE0123456789` est
// parfaitement bien formé et n'appartient peut-être à personne.
//
// VIES est le service de la Commission européenne qui répond à cette
// question, et lui seul fait foi.
//
// -- TROIS RÉPONSES, ET LA TROISIÈME EST LA PLUS IMPORTANTE ------------
//
//   valide      -> autoliquidation, et on ne remet plus le sujet sur la
//                  table : la vérification a eu lieu.
//   invalide    -> PAS d'autoliquidation. On facture au taux du pays du
//                  preneur, comme s'il n'avait donné aucun numéro.
//                  Facturer la TVA est réparable (une facture
//                  rectificative), l'oublier ne l'est pas.
//   injoignable -> on garde le comportement d'avant : autoliquidation,
//                  et la facture sort MARQUÉE à vérifier.
//
// Le troisième cas n'est pas une commodité, c'est le plus fréquent.
// VIES interroge les administrations de chaque État en direct : il est
// lent, il tombe régulièrement, et certains pays ferment la nuit. **Une
// facture ne doit JAMAIS attendre après lui.** C'est la règle du 7 août,
// "il a payé le client, il doit recevoir ses accès, point barre",
// appliquée à la pièce comptable.
//
// -- ON NE DEVINE PAS UNE RÉPONSE QU'ON N'A PAS -------------------------
//
// Le piège serait de traiter "injoignable" comme "invalide" : on
// facturerait 21 % de TVA belge à une entreprise qui a parfaitement le
// droit à l'autoliquidation, parce qu'un serveur de la Commission était
// en maintenance. Et l'inverse (injoignable = valide) est ce qu'on fait
// déjà, en le DISANT, ce qui est le moins mauvais des deux.

/** Ce que VIES a répondu, ou n'a pas répondu. */
export type VerdictVies = "valide" | "invalide" | "injoignable";

/**
 * L'IDENTITÉ QUE VIES RENVOIE AVEC UN NUMÉRO VALIDE.
 *
 * Béné, 27 août 2026 : "on peut faire que l'user rentre son numéro de
 * tva et hop les données sont récupérées et tout ce qui doit être rempli
 * l'est pour la facturation ?"
 *
 * Oui : VIES renvoie la raison sociale et l'adresse déclarées auprès de
 * l'administration du pays. C'est mieux qu'une saisie à la main, parce
 * que c'est exactement ce que le fisc a dans ses fichiers.
 *
 * **Mais certains États refusent de les publier.** L'Allemagne et
 * l'Espagne, notamment, répondent "valide" sans le nom ni l'adresse (ou
 * avec `---`). Ce n'est pas une panne, c'est leur politique. Le
 * formulaire doit donc marcher exactement pareil quand ces deux champs
 * sont vides : sinon, un client allemand verrait un écran qui a l'air
 * cassé au moment de payer.
 */
export interface IdentiteVies {
  /** La raison sociale, ou `null` si l'État ne la publie pas. */
  nom: string | null;
  /**
   * L'adresse, telle qu'elle vient, sur une ou plusieurs lignes.
   *
   * On ne la DÉCOUPE PAS en rue / code postal / ville : le format change
   * d'un pays à l'autre, et un découpage qui marche pour la Belgique se
   * trompe pour l'Irlande. On la donne entière, la personne corrige si
   * besoin. Une adresse juste dans un seul champ vaut mieux qu'une
   * adresse fausse dans trois.
   */
  adresse: string | null;
}

/**
 * Ce que l'appelant transmet à la règle de TVA.
 *
 * `non-verifie` existe à part de `injoignable` : le premier veut dire
 * "on n'a pas demandé", le second "on a demandé et personne n'a
 * répondu". Les deux produisent la même facture aujourd'hui, mais les
 * confondre empêcherait de distinguer un chemin qui a oublié d'appeler
 * VIES d'un jour où la Commission était en panne.
 */
export type ControleVies = VerdictVies | "non-verifie";

/** L'adresse du service. Publique, sans clé. */
const VIES_BASE = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

/**
 * VIES est lent par nature : il relaie la question à l'administration du
 * pays concerné. Au delà de cette durée, on préfère une facture émise et
 * marquée à une facture qui attend.
 */
const DELAI_MAX_MS = 6000;

/**
 * Lit la réponse du service.
 *
 * PURE, et c'est ici que vit toute la subtilité : une réponse qu'on ne
 * comprend pas n'est PAS une réponse négative. Un champ manquant, un
 * format qui change, un message d'erreur de leur côté : tout ça donne
 * `injoignable`, jamais `invalide`. Traiter un silence comme un refus
 * ferait facturer de la TVA à des entreprises qui n'en doivent pas.
 */
/**
 * Ce que VIES dit de l'entreprise, quand il le dit.
 *
 * PURE. `---` est la façon dont plusieurs États écrivent "je ne publie
 * pas cette information" : le rendre tel quel remplirait le formulaire
 * avec trois tirets.
 */
export function lireIdentiteVies(charge: unknown): IdentiteVies {
  const vide: IdentiteVies = { nom: null, adresse: null };
  if (!charge || typeof charge !== "object") return vide;
  const o = charge as Record<string, unknown>;
  const propre = (v: unknown): string | null => {
    const t = String(v ?? "").replace(/\r/g, "").trim();
    if (!t) return null;
    // `---`, `-`, `.` : des façons de dire "non communiqué".
    if (/^[-.\s]+$/.test(t)) return null;
    return t;
  };
  return { nom: propre(o.name), adresse: propre(o.address) };
}

export function lireReponseVies(charge: unknown): VerdictVies {
  if (!charge || typeof charge !== "object") return "injoignable";
  const o = charge as Record<string, unknown>;
  // Leur API rend `userError: "VALID"` quand tout va bien, et un code
  // d'erreur sinon (`MS_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `TIMEOUT`,
  // `INVALID_INPUT`...). On ne conclut QUE sur `VALID`.
  const erreur = typeof o.userError === "string" ? o.userError.toUpperCase() : null;
  if (erreur && erreur !== "VALID") return "injoignable";
  if (typeof o.valid === "boolean") return o.valid ? "valide" : "invalide";
  return "injoignable";
}

/**
 * Découpe `BE0123456789` en `BE` + `0123456789`.
 *
 * PURE. Rend `null` sur tout ce qui n'a pas la forme minimale, ce qui
 * évite d'aller déranger la Commission pour une saisie vide.
 */
export function decouperNumeroTva(
  numero: string | null | undefined,
): { pays: string; numero: string } | null {
  const propre = String(numero ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = propre.match(/^([A-Z]{2})([A-Z0-9]{2,14})$/);
  if (!m) return null;
  return { pays: m[1], numero: m[2] };
}

/**
 * Demande à VIES. Ne lève JAMAIS, n'attend jamais longtemps.
 *
 * `fetchImpl` est un paramètre pour que le test puisse répondre à la
 * place du réseau : un test qui appelle vraiment la Commission serait
 * lent, dépendrait d'internet, et clignoterait. Un test qui clignote est
 * pire que pas de test.
 */
export async function verifierVies(
  numeroComplet: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<VerdictVies> {
  return (await interrogerVies(numeroComplet, fetchImpl)).verdict;
}

/**
 * La même question, avec l'identité en plus.
 *
 * Deux fonctions plutôt qu'une parce que les deux appelants ne veulent
 * pas la même chose : l'émission d'une facture ne veut QUE le verdict
 * (l'identité y est figée depuis longtemps), le formulaire veut les deux.
 */
export async function interrogerVies(
  numeroComplet: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<{ verdict: VerdictVies; identite: IdentiteVies }> {
  const rien = { verdict: "injoignable" as const, identite: { nom: null, adresse: null } };
  const decoupe = decouperNumeroTva(numeroComplet);
  if (!decoupe) return rien;
  try {
    const res = await fetchImpl(VIES_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode: decoupe.pays, vatNumber: decoupe.numero }),
      signal: AbortSignal.timeout(DELAI_MAX_MS),
    });
    if (!res.ok) return rien;
    const charge = await res.json();
    const verdict = lireReponseVies(charge);
    // L'identité n'a de sens que sur un numéro valide : celle qui
    // accompagne un refus ne désigne personne.
    return {
      verdict,
      identite: verdict === "valide" ? lireIdentiteVies(charge) : { nom: null, adresse: null },
    };
  } catch {
    // Réseau coupé, délai dépassé, réponse illisible : on n'a pas de
    // réponse, et on ne va pas en inventer une.
    return rien;
  }
}
