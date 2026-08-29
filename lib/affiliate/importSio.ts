// lib/affiliate/importSio.ts
//
// UN AFFILIÉ, UNE IDENTITÉ, DEUX PORTES D'ENTRÉE (Béné, 29 août 2026).
//
// "Les affiliés Systeme.io se voient AUSSI attribuer notre tracking
// `ref=`, pour que s'ils envoient du monde par un lien `?ref=` et pas
// `?sa=`, la commission leur soit bien attribuée sur notre système,
// même s'ils ont envoyé du monde via une page Systeme.io."
//
// -- POURQUOI CE FICHIER EXISTE ---------------------------------------
//
// La table est DÉJÀ faite pour ça : `affiliates.sa` est la clé, et pour
// un affilié historique cette clé EST son identifiant Systeme.io.
// `assurerRefAffiliee` lui fabrique ensuite son code public.
//
// Ce qui manquait, c'est que personne n'y a jamais inséré ses affiliés
// Systeme.io. Vérifié le 29 août sur son compte : une conversion écrite
// avec `sa0134…` ne trouvait aucune ligne, donc aucune commission
// possible, ni par `?sa=` ni par `?ref=`.
//
// -- POURQUOI UN COLLER, ET PAS UN APPEL D'API ------------------------
//
// L'API de Systeme.io N'EXPOSE PAS l'affiliation. Vérifié deux fois :
// ni la liste des affiliés, ni l'affilié d'un contact (l'objet contact
// ne porte aucun champ de ce genre, alors que leur interface l'affiche).
// La liste ne peut donc venir que d'un export de leur tableau de bord.
//
// -- CE QU'ON REFUSE, ET POURQUOI --------------------------------------
//
// Chaque ligne crée un affilié qui pourra être PAYÉ. Une ligne douteuse
// ne se devine pas, elle se refuse et se dit : mieux vaut dix lignes à
// recopier qu'un versement au mauvais destinataire.

import { SA_RE } from "@/lib/affiliate/saFormat";

/** Une ligne comprise, prête à être écrite. */
export interface AffilieAImporter {
  sa: string;
  email: string;
  nom: string | null;
}

/** Une ligne refusée, avec de quoi la corriger. */
export interface LigneRefusee {
  ligne: number;
  contenu: string;
  raison: "sa-invalide" | "email-invalide" | "colonnes-manquantes" | "doublon";
}

export interface LectureImport {
  affilies: AffilieAImporter[];
  refusees: LigneRefusee[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Découpe une ligne collée depuis un tableur.
 *
 * On accepte la tabulation, le point-virgule et la virgule : un export
 * ouvert dans Excel puis recopié arrive dans n'importe laquelle des
 * trois, et exiger un séparateur précis ferait échouer l'import sur un
 * détail que personne ne voit à l'oeil.
 */
function colonnes(ligne: string): string[] {
  return ligne
    .split(/\t|;|,/)
    .map((c) => c.trim().replace(/^"|"$/g, "").trim())
    .filter((c, i, tout) => i < tout.length);
}

/**
 * Lit une liste collée : une ligne par affilié, `sa` et email dans
 * n'importe quel ordre, nom facultatif.
 *
 * PURE. L'ordre des colonnes n'est pas imposé parce qu'un export
 * n'obéit à personne : on RECONNAÎT le `sa` à sa forme et l'email à la
 * sienne. Imposer un ordre, c'est se condamner à un import qui échoue
 * en entier sur une colonne déplacée.
 */
export function lireImportSio(brut: string): LectureImport {
  const affilies: AffilieAImporter[] = [];
  const refusees: LigneRefusee[] = [];
  const vus = new Set<string>();

  const lignes = String(brut ?? "").split(/\r?\n/);
  lignes.forEach((contenu, i) => {
    const numero = i + 1;
    if (!contenu.trim()) return;

    const cells = colonnes(contenu);
    const sa = cells.find((c) => SA_RE.test(c)) ?? null;
    const email = cells.find((c) => EMAIL_RE.test(c))?.toLowerCase() ?? null;

    if (!sa && !email) {
      // Probablement la ligne d'en-têtes de son export : on l'ignore
      // sans la compter comme une erreur, sinon chaque import
      // commencerait par un refus qui n'en est pas un.
      if (/\b(sa|email|affili)/i.test(contenu)) return;
      refusees.push({ ligne: numero, contenu, raison: "colonnes-manquantes" });
      return;
    }
    if (!sa) {
      refusees.push({ ligne: numero, contenu, raison: "sa-invalide" });
      return;
    }
    if (!email) {
      refusees.push({ ligne: numero, contenu, raison: "email-invalide" });
      return;
    }
    if (vus.has(sa)) {
      refusees.push({ ligne: numero, contenu, raison: "doublon" });
      return;
    }
    vus.add(sa);

    // Le nom : ce qui reste, s'il reste quelque chose de lisible. Jamais
    // deviné depuis l'adresse : un affilié qui voit un nom qu'il n'a
    // pas donné se demande d'où on le sort.
    const nom =
      cells.find((c) => c !== sa && c.toLowerCase() !== email && c.length > 1 && !EMAIL_RE.test(c)) ??
      null;

    affilies.push({ sa, email, nom: nom || null });
  });

  return { affilies, refusees };
}
