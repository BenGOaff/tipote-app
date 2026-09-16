// lib/quiz/champsCapture.ts
//
// TOUT LE FORMULAIRE DE CAPTURE EST ÉDITABLE (Béné, 16 septembre 2026).
//
// « TOUT doit être éditable donc si je clique sur "Prénom" dans le quiz,
// je dois pouvoir écrire "Entre ton prénom" par exemple, avec l'éditeur
// de texte, pour mettre en gras, changer la taille etc ... et il faut
// mettre un placeholder, qu'on peut aussi personnaliser !! Par exemple :
// "Ex : Jean" ou "Ex : jeandupont@gmail.com" ou "Youtube" si c'est un
// réseau préféré demandé en champ personnalisé. »
//
// Jusque là, les cinq champs intégrés (prénom, nom, email, téléphone,
// pays) portaient un libellé FIXE venu des traductions du viewer, sans
// placeholder, et seuls les champs personnalisés avaient les deux, tapés
// dans une colonne de réglages. Ce module décide, pour CHAQUE champ du
// formulaire, ce que le visiteur lit au dessus (le libellé, en texte
// riche) et dedans (le placeholder), et dans quel ordre les champs
// s'affichent. Le viewer public ET l'aperçu des deux éditeurs l'appellent :
// un aperçu qui recalcule une décision au lieu d'appeler la fonction du
// viewer finit toujours par mentir (sorti six fois dans ces dépôts).
//
// CE MODULE EST PUR : aucune base, aucun réseau, aucun composant, aucun
// DOMPurify. Le HTML d'un libellé est BORNÉ ici et SANITISÉ au rendu
// (`sanitizeRichText`), comme `capture_heading` et tous les autres champs
// riches du quiz. Identique à l'octet près dans les deux dépôts :
//
//   cmp lib/quiz/champsCapture.ts ../tipote-app/lib/quiz/champsCapture.ts
//
// OÙ VIT QUOI, ET POURQUOI CE N'EST PAS UNIFORME :
//
// - `quizzes.capture_labels` (JSONB, {cle: {label, placeholder}}) porte
//   le libellé RICHE de tous les champs, intégrés ET personnalisés, et le
//   placeholder des champs INTÉGRÉS. Vide = le défaut d'avant, donc aucun
//   quiz en ligne ne bouge.
// - un champ personnalisé garde son NOM en texte nu dans
//   `custom_fields[].label` (c'est lui qui nomme la colonne du CSV, le
//   champ de contact chez Systeme.io / GoHighLevel, la ligne des
//   statistiques et du prompt d'analyse : du HTML n'a rien à faire là) et
//   son placeholder dans `custom_fields[].placeholder`, où il vivait déjà.
//   Quand la créatrice réécrit le libellé riche d'un champ personnalisé,
//   `appliquerLibelle` met à jour LES DEUX : le HTML dans capture_labels,
//   le texte nu dans le champ. Deux écritures séparées finiraient par ne
//   plus dire la même chose, et c'est le nom du CSV qui mentirait.
//
// LA MÉCANIQUE EST UN PARAMÈTRE. `mode: "visiteur" | "apercu"` décide si
// un champ personnalisé SANS NOM s'affiche : jamais chez le visiteur (règle
// du 16 septembre, un champ sans libellé est gardé en base et jamais
// montré), toujours dans l'aperçu (sinon la créatrice ne peut pas lui
// donner son nom en cliquant dessus, et le champ qu'elle vient d'ajouter
// n'apparaît nulle part).

import { stripHtml } from "@/lib/texteBrut";
import {
  MAX_LIBELLE_CHAMP,
  MAX_PLACEHOLDER_CHAMP,
  champsVisibles,
  sanitizeChampsPersonnalises,
  type ChampPersonnalise,
} from "./champsPersonnalises";

/** Les cinq champs intégrés, dans l'ordre où le formulaire les affiche. */
export const CLES_CHAMPS_INTEGRES = ["first_name", "last_name", "email", "phone", "country"] as const;
export type CleChampIntegre = (typeof CLES_CHAMPS_INTEGRES)[number];

/** Ce qu'une créatrice a écrit pour UN champ. Les deux sont facultatifs. */
export type LibelleCapture = {
  /** Le libellé au dessus du champ, en HTML riche (borné, sanitisé au rendu). */
  label?: string;
  /** Le texte dans le champ vide. Texte nu. */
  placeholder?: string;
};

/** `quizzes.capture_labels` : par clé de champ (intégré ou `cf_...`). */
export type LibellesCapture = Record<string, LibelleCapture>;

/** Un libellé riche court : une ligne de formulaire, pas un paragraphe. */
export const MAX_LIBELLE_RICHE = 400;

const ID_CHAMP_PERSO = /^cf_[a-z0-9]{6,16}$/;

function cleConnue(cle: string): boolean {
  return (CLES_CHAMPS_INTEGRES as readonly string[]).includes(cle) || ID_CHAMP_PERSO.test(cle);
}

/**
 * Le texte d'un HTML, sans ses balises ni ses entités : pour savoir s'il DIT
 * quelque chose.
 *
 * DELEGUE, ne recopie pas (16 septembre 2026). Ce fichier portait sa propre
 * liste d'entites, ecrite a la main, donc une de plus et il divergeait de la
 * porte commune. `lib/texteBrut.ts` est PUR : l'importer ne charge rien.
 */
export function texteNu(html: string | null | undefined): string {
  if (!html) return "";
  return stripHtml(html);
}

/** Un texte nu rendu dans un `dangerouslySetInnerHTML` : on l'échappe. */
export function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function borneRiche(v: unknown): string {
  if (typeof v !== "string") return "";
  // Un libellé de champ tient sur une ligne : les retours et tabulations
  // deviennent des espaces, comme pour les champs personnalisés.
  const s = v.replace(/[\r\n\t]+/g, " ").trim();
  return s.length > MAX_LIBELLE_RICHE ? s.slice(0, MAX_LIBELLE_RICHE) : s;
}

function bornePlaceholder(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\r\n\t]+/g, " ").trim().slice(0, MAX_PLACEHOLDER_CHAMP);
}

/**
 * Nettoie `capture_labels` tel qu'il arrive de l'éditeur ou tel qu'il est
 * lu en base. Ne lève JAMAIS : une valeur illisible rend un objet vide,
 * c'est à dire les défauts d'avant. Une clé inconnue est ignorée, une
 * entrée sans libellé ni placeholder est retirée (elle ne dirait rien).
 */
export function sanitizeLibellesCapture(raw: unknown): LibellesCapture {
  const out: LibellesCapture = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [cle, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!cleConnue(cle) || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const label = borneRiche(o.label);
    const placeholder = bornePlaceholder(o.placeholder);
    const entree: LibelleCapture = {};
    // Un libellé riche qui ne DIT rien (`<p></p>`, `<br>`) est un libellé
    // absent : on retombe sur le défaut, pas sur une ligne vide.
    if (label && texteNu(label)) entree.label = label;
    if (placeholder) entree.placeholder = placeholder;
    if (entree.label !== undefined || entree.placeholder !== undefined) out[cle] = entree;
  }
  return out;
}

/** Ce que la source du quiz doit porter pour décider du formulaire. */
export type SourceChampsCapture = {
  capture_last_name?: boolean | null;
  capture_phone?: boolean | null;
  capture_country?: boolean | null;
  last_name_required?: boolean | null;
  phone_required?: boolean | null;
  country_required?: boolean | null;
  custom_fields?: unknown;
  capture_labels?: unknown;
};

/** Les libellés PAR DÉFAUT, dans la langue du quiz : ce qu'on lisait avant. */
export type DefautsCapture = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  /** Le seul champ intégré qui avait déjà un placeholder : l'adresse email. */
  emailPlaceholder: string;
};

export type ChampCaptureAffiche = {
  /** `first_name` ... `country`, ou l'id `cf_...` d'un champ personnalisé. */
  cle: string;
  type: "text" | "email" | "tel";
  /** HTML prêt pour `sanitizeRichText` : le libellé riche, ou le défaut échappé. */
  labelHtml: string;
  /** Vrai quand le libellé vient de la créatrice, faux quand c'est le défaut. */
  labelPersonnalise: boolean;
  placeholder: string;
  required: boolean;
  /** Prénom et nom se partagent une ligne sur grand écran. */
  demiLargeur: boolean;
  personnalise: boolean;
  /** Aperçu seulement : un champ personnalisé que le visiteur ne verra pas tant qu'il n'a pas de nom. */
  sansNom: boolean;
};

export type OptionsChampsCapture = {
  /** QUI regarde. Décide si un champ personnalisé sans nom s'affiche. */
  mode: "visiteur" | "apercu";
  /** Le prénom se demande à UN seul moment (lib/quiz/firstNameAsk.ts décide, l'appelant passe le verdict). */
  prenomSurCapture: boolean;
  prenomObligatoire: boolean;
  defauts: DefautsCapture;
};

function libelleDe(libelles: LibellesCapture, cle: string, defaut: string): { html: string; perso: boolean } {
  const riche = libelles[cle]?.label;
  if (riche && texteNu(riche)) return { html: riche, perso: true };
  return { html: echapperHtml(defaut), perso: false };
}

/**
 * LA décision : quels champs, dans quel ordre, avec quel libellé et quel
 * placeholder. Le viewer et les deux aperçus l'appellent, personne ne
 * recompose la liste à la main.
 */
export function resoudreChampsCapture(quiz: SourceChampsCapture, opts: OptionsChampsCapture): ChampCaptureAffiche[] {
  const libelles = sanitizeLibellesCapture(quiz.capture_labels);
  const d = opts.defauts;
  const out: ChampCaptureAffiche[] = [];

  const integre = (
    cle: CleChampIntegre,
    type: ChampCaptureAffiche["type"],
    defaut: string,
    required: boolean,
    demiLargeur: boolean,
    placeholderDefaut = "",
  ) => {
    const l = libelleDe(libelles, cle, defaut);
    out.push({
      cle,
      type,
      labelHtml: l.html,
      labelPersonnalise: l.perso,
      placeholder: libelles[cle]?.placeholder ?? placeholderDefaut,
      required,
      demiLargeur,
      personnalise: false,
      sansNom: false,
    });
  };

  if (opts.prenomSurCapture) integre("first_name", "text", d.first_name, opts.prenomObligatoire, true);
  if (quiz.capture_last_name) integre("last_name", "text", d.last_name, quiz.last_name_required === true, true);
  // L'email est toujours là, toujours obligatoire : c'est le formulaire de capture.
  integre("email", "email", d.email, true, false, d.emailPlaceholder);
  if (quiz.capture_phone) integre("phone", "tel", d.phone, quiz.phone_required === true, false);
  if (quiz.capture_country) integre("country", "text", d.country, quiz.country_required === true, false);

  // Les champs personnalisés : la liste vient de champsPersonnalises.ts,
  // la sanitisation aussi. Le placeholder vit sur le champ (voir en tête).
  const champs = sanitizeChampsPersonnalises(quiz.custom_fields);
  const affiches = opts.mode === "visiteur" ? champsVisibles(champs) : champs;
  for (const c of affiches) {
    const nom = c.label.trim();
    const l = libelleDe(libelles, c.id, nom);
    out.push({
      cle: c.id,
      type: "text",
      labelHtml: l.html,
      labelPersonnalise: l.perso,
      placeholder: c.placeholder,
      required: c.required,
      demiLargeur: false,
      personnalise: true,
      sansNom: nom.length === 0,
    });
  }
  return out;
}

/**
 * Les champs, groupés en LIGNES : les demi-largeurs voisins se partagent
 * une ligne, chaque autre champ a la sienne.
 *
 * C'est une décision d'affichage, donc elle vit ICI et pas dans le JSX :
 * le viewer et l'aperçu de l'éditeur doivent grouper pareil, sinon
 * l'aperçu ment sur la largeur des champs (sorti six fois dans ces
 * dépôts, la dernière sur la disposition des réponses).
 */
export function grouperEnLignes(champs: ChampCaptureAffiche[]): ChampCaptureAffiche[][] {
  const lignes: ChampCaptureAffiche[][] = [];
  for (const c of champs) {
    const derniere = lignes[lignes.length - 1];
    if (c.demiLargeur && derniere && derniere.length === 1 && derniere[0].demiLargeur) derniere.push(c);
    else lignes.push([c]);
  }
  return lignes;
}

/** L'état que l'éditeur tient, et que les deux fonctions ci dessous font évoluer d'un bloc. */
export type EtatCapture = {
  champs: ChampPersonnalise[];
  libelles: LibellesCapture;
};

/**
 * La créatrice a réécrit le libellé d'un champ dans l'aperçu. Pour un
 * champ personnalisé, le NOM en texte nu suit (c'est lui que lisent le
 * CSV, le CRM, les statistiques et l'IA) ; pour tous, le HTML est rangé
 * dans `libelles`. Un libellé vidé retire l'entrée : on retombe sur le
 * défaut, jamais sur une ligne vide.
 */
export function appliquerLibelle(etat: EtatCapture, cle: string, html: string): EtatCapture {
  const riche = borneRiche(html);
  const dit = texteNu(riche);
  const libelles: LibellesCapture = { ...etat.libelles };
  const entree: LibelleCapture = { ...(libelles[cle] ?? {}) };
  if (dit) entree.label = riche;
  else delete entree.label;
  if (entree.label === undefined && entree.placeholder === undefined) delete libelles[cle];
  else libelles[cle] = entree;

  let champs = etat.champs;
  if (ID_CHAMP_PERSO.test(cle)) {
    const nom = dit.slice(0, MAX_LIBELLE_CHAMP);
    champs = etat.champs.map((c) => (c.id === cle ? { ...c, label: nom } : c));
  }
  return { champs, libelles };
}

/**
 * La créatrice a réécrit le placeholder d'un champ. Il vit sur le champ
 * personnalisé quand c'en est un, dans `libelles` sinon : ce module est
 * le seul à le savoir, l'écran ne choisit pas.
 */
export function appliquerPlaceholder(etat: EtatCapture, cle: string, texte: string): EtatCapture {
  const ph = bornePlaceholder(texte);
  if (ID_CHAMP_PERSO.test(cle)) {
    return { ...etat, champs: etat.champs.map((c) => (c.id === cle ? { ...c, placeholder: ph } : c)) };
  }
  const libelles: LibellesCapture = { ...etat.libelles };
  const entree: LibelleCapture = { ...(libelles[cle] ?? {}) };
  if (ph) entree.placeholder = ph;
  else delete entree.placeholder;
  if (entree.label === undefined && entree.placeholder === undefined) delete libelles[cle];
  else libelles[cle] = entree;
  return { ...etat, libelles };
}

/**
 * Les libellés, élagués des champs personnalisés qui n'existent plus.
 *
 * L'éditeur de champs rend un TABLEAU entier (il n'émet pas d'événement
 * "supprimé"), donc c'est là qu'on rattrape : sans ça, `capture_labels`
 * garde pour toujours l'entrée d'un champ retiré. Les clés intégrées ne
 * sont jamais touchées, elles n'appartiennent à aucun champ de la liste.
 */
export function elaguerLibelles(champs: ChampPersonnalise[], libelles: LibellesCapture): LibellesCapture {
  const vivants = new Set(champs.map((c) => c.id));
  const out: LibellesCapture = {};
  for (const [cle, v] of Object.entries(libelles)) {
    if (ID_CHAMP_PERSO.test(cle) && !vivants.has(cle)) continue;
    out[cle] = v;
  }
  return out;
}

/**
 * Un champ personnalisé est retiré : son libellé riche part avec lui,
 * sinon `capture_labels` garde une entrée pour un champ qui n'existe plus.
 */
export function retirerChampPersonnalise(etat: EtatCapture, cle: string): EtatCapture {
  const libelles: LibellesCapture = { ...etat.libelles };
  delete libelles[cle];
  return { champs: etat.champs.filter((c) => c.id !== cle), libelles };
}
