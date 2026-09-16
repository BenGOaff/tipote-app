// lib/quiz/champsPersonnalises.ts
//
// LES CHAMPS PERSONNALISÉS DU FORMULAIRE DE CAPTURE (retour client,
// 16 septembre 2026).
//
// Une créatrice ajoute un champ à son formulaire de capture (quiz ou
// sondage), lui donne un libellé et un placeholder, le rend obligatoire
// ou non. La valeur saisie par le visiteur est stockée sur le lead,
// exportée, montrée dans les statistiques et donnée à l'analyse IA.
//
// CE MODULE EST PUR : aucune base, aucun réseau, aucun composant. Il est
// appelé par le serveur (PATCH du quiz, capture d'un lead), par les deux
// éditeurs, par le viewer public, par les exports et par les prompts.
// Une règle recopiée dans chacun de ces endroits finirait par en
// oublier un (leçon des réseaux de partage, des images de réponse, du
// mx-auto du sous-titre : sortie six fois dans ces dépôts).
//
// LES TROIS DÉCISIONS À NE PAS DÉFAIRE :
//
// 1. UN CHAMP A UNE IDENTITÉ STABLE (`id`), la valeur du lead est rangée
//    sous cet id, JAMAIS sous le libellé. Renommer "Ta ville" en "Ville"
//    ne perd donc aucune donnée, exactement comme `quiz_questions.id`
//    depuis le 1er août 2026. Un lead dont l'id ne désigne plus aucun
//    champ vivant garde sa valeur en base, et l'affichage l'ignore.
//
// 2. SANITIZE NE LÈVE JAMAIS. Ce qui arrive du navigateur (l'éditeur
//    comme le visiteur) est nettoyé et borné ; ce qui est illisible est
//    ignoré, pas refusé. Une capture ne doit jamais échouer à cause d'un
//    champ optionnel (règle du 7 août : « il a payé, il doit recevoir »
//    vaut aussi pour « il a répondu, on garde son adresse »).
//
// 3. UN CHAMP SANS LIBELLÉ EST GARDÉ EN BASE MAIS JAMAIS AFFICHÉ.
//    L'éditeur autosave à chaque frappe : jeter un champ que la
//    créatrice n'a pas encore nommé le ferait disparaître sous ses yeux.
//    Le viewer, lui, ne montre que `champsVisibles()`.

export type ChampPersonnalise = {
  /** Identité stable, forme `cf_` + 6 à 16 caractères [a-z0-9]. */
  id: string;
  /** Ce que le visiteur lit au dessus du champ. */
  label: string;
  /** Ce qu'il lit DANS le champ tant qu'il n'a rien tapé. */
  placeholder: string;
  required: boolean;
};

/** Ce qu'un lead porte : la valeur saisie, rangée par id de champ. */
export type ValeursChamps = Record<string, string>;

export const MAX_CHAMPS_PERSONNALISES = 5;
export const MAX_LIBELLE_CHAMP = 60;
export const MAX_PLACEHOLDER_CHAMP = 100;
export const MAX_VALEUR_CHAMP = 300;

const ID_CHAMP = /^cf_[a-z0-9]{6,16}$/;

/**
 * Fabrique un id de champ depuis une graine aléatoire fournie par
 * l'appelant (le module ne tire pas lui même au sort : un test qui
 * dépend du hasard clignote).
 */
export function nouvelIdChamp(graine: string): string {
  const propre = String(graine).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  const complete = (propre + "000000").slice(0, Math.max(6, propre.length));
  return `cf_${complete}`;
}

function texteBorne(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Une valeur saisie ne porte ni retour à la ligne ni tabulation : elle
  // finit dans une cellule de CSV et dans une ligne de tableau.
  return v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

/**
 * Nettoie la liste des champs telle qu'elle arrive de l'éditeur (ou telle
 * qu'elle est lue en base). Ne lève jamais : une valeur illisible rend
 * une liste vide, jamais une erreur.
 */
export function sanitizeChampsPersonnalises(raw: unknown): ChampPersonnalise[] {
  if (!Array.isArray(raw)) return [];
  const vus = new Set<string>();
  const out: ChampPersonnalise[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!ID_CHAMP.test(id) || vus.has(id)) continue;
    vus.add(id);
    out.push({
      id,
      label: texteBorne(o.label, MAX_LIBELLE_CHAMP),
      placeholder: texteBorne(o.placeholder, MAX_PLACEHOLDER_CHAMP),
      required: o.required === true,
    });
    if (out.length >= MAX_CHAMPS_PERSONNALISES) break;
  }
  return out;
}

/** Les champs que le visiteur VOIT : ceux qui ont un libellé. */
export function champsVisibles(champs: ChampPersonnalise[]): ChampPersonnalise[] {
  return champs.filter((c) => c.label.trim().length > 0);
}

/**
 * Nettoie ce que le visiteur a saisi, contre la liste des champs du quiz :
 * seuls les ids connus sont gardés, les valeurs vides sont écartées.
 */
export function sanitizeValeursChamps(raw: unknown, champs: ChampPersonnalise[]): ValeursChamps {
  const out: ValeursChamps = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const connus = new Set(champs.map((c) => c.id));
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!connus.has(id)) continue;
    const valeur = texteBorne(v, MAX_VALEUR_CHAMP);
    if (valeur) out[id] = valeur;
  }
  return out;
}

/** Les champs obligatoires, visibles, que le visiteur n'a pas remplis. */
export function champsManquants(champs: ChampPersonnalise[], valeurs: ValeursChamps): ChampPersonnalise[] {
  return champsVisibles(champs).filter((c) => c.required && !(valeurs[c.id] ?? "").trim());
}

/** Lit la valeur d'un champ sur un lead, quelle que soit la forme stockée. */
export function valeurChamp(brut: unknown, id: string): string | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const v = (brut as Record<string, unknown>)[id];
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Les colonnes d'un export qui couvre PLUSIEURS quiz : l'union de leurs
 * champs, un par id, le premier libellé rencontré gagne. Deux quiz qui
 * partagent un id (une duplication de quiz) partagent donc une colonne,
 * ce qui est exactement ce qu'on veut : c'est le même champ.
 */
export function colonnesChampsPersonnalises(
  quizzes: Array<{ custom_fields?: unknown }>,
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const vus = new Set<string>();
  for (const q of quizzes) {
    for (const c of champsVisibles(sanitizeChampsPersonnalises(q?.custom_fields))) {
      if (vus.has(c.id)) continue;
      vus.add(c.id);
      out.push({ id: c.id, label: c.label });
    }
  }
  return out;
}

export type StatChamp = {
  id: string;
  label: string;
  /** Leads qui ont rempli ce champ. */
  remplis: number;
  /** Leads considérés (ceux qu'on a lus). */
  total: number;
  /** Les valeurs les plus fréquentes, pour repérer ce qui se répète. */
  top: Array<{ valeur: string; n: number }>;
};

/**
 * Le taux de remplissage et les valeurs fréquentes par champ. C'est ce
 * qu'affichent les statistiques ET ce que lit l'analyse IA : une seule
 * fonction, sinon l'écran et le prompt finissent par dire deux choses.
 */
export function statsChamps(
  champs: ChampPersonnalise[],
  leads: Array<{ custom_fields?: unknown }>,
  topN = 5,
): StatChamp[] {
  const total = leads.length;
  return champsVisibles(champs).map((c) => {
    const compte = new Map<string, { valeur: string; n: number }>();
    let remplis = 0;
    for (const l of leads) {
      const v = valeurChamp(l?.custom_fields, c.id);
      if (!v) continue;
      remplis += 1;
      const cle = v.trim().toLowerCase();
      const entree = compte.get(cle);
      if (entree) entree.n += 1;
      else compte.set(cle, { valeur: v.trim(), n: 1 });
    }
    const top = [...compte.values()].sort((a, b) => b.n - a.n).slice(0, topN);
    return { id: c.id, label: c.label, remplis, total, top };
  });
}

/**
 * Les lignes d'un prompt d'analyse. Vide quand il n'y a rien à dire, pour
 * qu'un quiz sans champ personnalisé n'ajoute pas un bloc au modèle.
 */
export function lignesPromptChamps(stats: StatChamp[]): string[] {
  const utiles = stats.filter((s) => s.total > 0);
  if (utiles.length === 0) return [];
  const lines = ["CHAMPS PERSONNALISES DU FORMULAIRE (saisis librement par les visiteurs) :"];
  for (const s of utiles) {
    const pct = Math.round((s.remplis / s.total) * 100);
    const exemples = s.top.map((t) => `"${t.valeur}"${t.n > 1 ? ` (x${t.n})` : ""}`).join(", ");
    lines.push(`- ${s.label} : rempli par ${s.remplis}/${s.total} (${pct}%)${exemples ? `. Valeurs frequentes : ${exemples}` : ""}`);
  }
  return lines;
}
