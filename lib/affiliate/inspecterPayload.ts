// lib/affiliate/inspecterPayload.ts
//
// CE QU'IL Y A VRAIMENT DANS UN WEBHOOK SYSTEME.IO (27 août 2026).
//
// -- POURQUOI CE FICHIER EXISTE ---------------------------------------
//
// `extractSaFromPayload` cherche le `sa` dans une quinzaine de chemins
// DEVINÉS ("contact.source_url", "data.contact.fields.sa"...). Personne
// n'a jamais regardé ce que Systeme.io envoie réellement, ni ici, ni
// dans l'Atelier qui a la même liste.
//
// Et on a la preuve que ces chemins ne suffisent pas : l'API contacts
// rend `sourceURL: "https://www.blagardette.com/trafficize"`, sans
// `?sa=`, alors que la fiche du même contact affiche "Identifiant
// affilié : sa0218...". L'identifiant existe, il n'est simplement pas
// là où on le cherche.
//
// C'est la faute du 7 août (drame Ivan), mot pour mot : raisonner sur
// la forme SUPPOSÉE d'un payload au lieu de la regarder. Un journal se
// LIT, il ne se déduit pas.
//
// -- CE QU'ON JOURNALISE, ET CE QU'ON NE JOURNALISE PAS ----------------
//
// Les CHEMINS, pas les valeurs. Un payload de vente contient l'email,
// le nom, l'adresse et le montant : les déverser dans `pm2 logs` les
// enverrait dans un fichier, un historique et probablement un
// copier-coller. On n'a pas besoin de ça pour répondre à la question.
//
// Deux exceptions, et elles sont sans risque :
//   - les chemins dont la valeur RESSEMBLE à un identifiant Systeme.io
//     (`sa` + hexadécimal) : c'est précisément ce qu'on cherche, et ce
//     n'est pas une donnée personnelle ;
//   - le nom d'hôte des valeurs qui sont des URL, pour reconnaître une
//     page sans en révéler la query.

// La forme du `sa` vit dans lib/affiliate/saFormat.ts, et nulle part
// ailleurs : un test du dépôt interdit d'en recopier la regex, parce
// que le jour où Systeme.io allonge ses identifiants, quatre endroits
// l'acceptent et le cinquième le refuse.
import { SA_RE } from "@/lib/affiliate/saFormat";

/** Un chemin du payload, et ce qu'on peut en dire sans risque. */
export interface CheminObserve {
  /** `data.contact.fields.sa`, tel qu'on l'écrirait dans le code. */
  chemin: string;
  /** Le type lu, pour distinguer un objet vide d'une chaîne vide. */
  type: "string" | "number" | "boolean" | "null" | "array" | "object";
  /** La valeur, UNIQUEMENT quand elle a la forme d'un identifiant. */
  identifiant?: string;
  /** L'hôte, quand la valeur est une URL. Jamais la query. */
  hote?: string;
}

const PROFONDEUR_MAX = 6;
const CHEMINS_MAX = 400;

function typeDe(v: unknown): CheminObserve["type"] {
  // `undefined` compte comme absent : sans ça il tombait dans la
  // branche "objet" et faisait lever le WeakSet, donc la fonction qui
  // doit aider à diagnostiquer cassait la route qu'elle observe.
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return t;
  return "object";
}

function hoteDe(valeur: string): string | undefined {
  try {
    return new URL(valeur).host;
  } catch {
    return undefined;
  }
}

/**
 * La carte d'un payload : tous ses chemins, avec le type de chacun.
 *
 * PURE. Ne jette jamais : elle est appelée sur ce qu'un tiers nous
 * envoie, donc sur n'importe quoi (profondeur inattendue, cycles,
 * tableaux de dix mille lignes).
 */
export function cheminsDuPayload(body: unknown): CheminObserve[] {
  const sortie: CheminObserve[] = [];
  const vus = new WeakSet<object>();

  const parcourir = (valeur: unknown, chemin: string, profondeur: number) => {
    if (sortie.length >= CHEMINS_MAX) return;
    const type = typeDe(valeur);

    if (type === "object" || type === "array") {
      const obj = valeur as object;
      // Un payload peut contenir un cycle : sans ce garde, la fonction
      // qui doit nous AIDER à diagnostiquer serait celle qui tue le
      // processus.
      if (vus.has(obj)) return;
      vus.add(obj);
      if (chemin) sortie.push({ chemin, type });
      if (profondeur >= PROFONDEUR_MAX) return;
      const entrees = Array.isArray(valeur)
        ? // Un tableau de 500 lignes n'apprend rien de plus que sa
          // première : on décrit la FORME, pas le contenu.
          valeur.slice(0, 3).map((v, i) => [String(i), v] as const)
        : Object.entries(valeur as Record<string, unknown>);
      for (const [cle, v] of entrees) {
        parcourir(v, chemin ? `${chemin}.${cle}` : cle, profondeur + 1);
      }
      return;
    }

    const ligne: CheminObserve = { chemin, type };
    if (type === "string") {
      const s = String(valeur);
      if (SA_RE.test(s.trim())) ligne.identifiant = s.trim();
      const hote = hoteDe(s);
      if (hote) ligne.hote = hote;
    }
    sortie.push(ligne);
  };

  parcourir(body, "", 0);
  return sortie;
}

/**
 * Le résumé à écrire dans le journal, en une ligne par chemin.
 *
 * Les chemins qui portent un identifiant sont mis EN TÊTE : c'est la
 * réponse à la question, et elle ne doit pas se perdre au milieu de
 * trois cents lignes.
 */
export function resumerPayload(body: unknown): string {
  const chemins = cheminsDuPayload(body);
  const avecId = chemins.filter((c) => c.identifiant);
  const reste = chemins.filter((c) => !c.identifiant);
  const ligne = (c: CheminObserve) =>
    `  ${c.chemin} : ${c.type}` +
    (c.identifiant ? `  <= IDENTIFIANT ${c.identifiant}` : "") +
    (c.hote ? `  (url sur ${c.hote})` : "");
  return [
    avecId.length > 0
      ? `IDENTIFIANT TROUVE dans ${avecId.length} chemin(s) :`
      : "AUCUN chemin ne porte un identifiant Systeme.io.",
    ...avecId.map(ligne),
    `Forme complete (${chemins.length} chemins) :`,
    ...reste.map(ligne),
  ].join("\n");
}
