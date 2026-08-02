// lib/quizScoring.ts
//
// Scoring multi-axes (Véronique, 30 juillet 2026). Un quiz en mode
// "scoring" peut définir 1 à 6 axes (sommeil, alimentation, émotions...).
// Chaque question pèse sur un ou plusieurs axes, avec un poids par axe
// (config JSONB de la question : `axes: {"<axisId>": <poids>}`). Une
// question "tu dors mal" peut compter sur le sommeil (poids 2) ET le
// stress (poids 1).
//
// Tout score est un triplet {points, min, max}, jamais un nombre nu :
// c'est ce qui rend le pourcentage calculable même avec des points
// négatifs, l'export CSV lisible, et les barres dessinables plus tard.
//
// Le calcul du score GLOBAL réplique exactement computeResult (mode
// scoring) de PublicQuizClient : même somme, même max atteignable. Le
// résultat par tranches min_score/max_score continue de matcher sur les
// POINTS BRUTS globaux, comme avant. Les axes sont une vue additionnelle.
//
// Zéro dépendance, utilisable côté viewer (client), éditeur et serveur.

export type ScoringAxis = { id: string; label: string };

export type AxisScore = { points: number; min: number; max: number };

export type ScoresSnapshot = {
  global: AxisScore;
  axes?: Record<string, AxisScore>;
};

export type ScoreTranche = "low" | "mid" | "high";

export type ScoreLabels = { low: string; mid: string; high: string };

// 3 à 6 axes d'après le brief ; on borne à 6 pour garder la page de
// résultat lisible (un radar/barres à 10 axes est illisible sur mobile).
export const MAX_SCORING_AXES = 6;

// Seuils fixes des tranches (lot 2 ; le paramétrage fin est un lot 3).
// pct <= 39 → low, 40-69 → mid, 70+ → high.
export function scoreTranche(pct: number): ScoreTranche {
  if (pct <= 39) return "low";
  if (pct <= 69) return "mid";
  return "high";
}

// Libellés par défaut des tranches, par locale du quiz. Le créateur
// peut les personnaliser via quizzes.score_labels.
export const DEFAULT_SCORE_LABELS: Record<string, ScoreLabels> = {
  fr: { low: "bas", mid: "moyen", high: "élevé" },
  en: { low: "low", mid: "medium", high: "high" },
  es: { low: "bajo", mid: "medio", high: "alto" },
  de: { low: "niedrig", mid: "mittel", high: "hoch" },
  pt: { low: "baixo", mid: "médio", high: "alto" },
  it: { low: "basso", mid: "medio", high: "alto" },
  ar: { low: "منخفض", mid: "متوسط", high: "مرتفع" },
};

export function resolveScoreLabels(
  raw: unknown,
  locale: string | null | undefined,
): ScoreLabels {
  const base = DEFAULT_SCORE_LABELS[(locale ?? "fr").split("-")[0]] ?? DEFAULT_SCORE_LABELS.fr;
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const pick = (k: keyof ScoreLabels) =>
    typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : base[k];
  return { low: pick("low"), mid: pick("mid"), high: pick("high") };
}

// Slug d'axe pour les placeholders ({score_sommeil}) et les tags SIO
// (sommeil-bas). Uniquement [a-z0-9_] pour rester inoffensif dans une
// regex, une URL ou un nom de tag.
export function slugifyAxisLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Normalise le JSONB quizzes.scoring_axes en liste sûre. Ids manquants
// régénérés depuis le label, doublons de slug dédupliqués par suffixe.
export function normalizeScoringAxes(raw: unknown): ScoringAxis[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoringAxis[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_SCORING_AXES) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    let id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : slugifyAxisLabel(label);
    if (!id) id = `axe${out.length + 1}`;
    while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

// Slug utilisé dans les placeholders ({score_sommeil}) et les tags SIO
// (sommeil-bas) : basé sur l'ID de l'axe, PAS sur le label courant.
// L'id est figé à la création (slug du premier label), donc renommer
// "Sommeil" en "Repos" ne casse ni les placeholders déjà écrits dans
// les textes de résultat, ni les automatisations SIO existantes.
export function axisSlug(axis: ScoringAxis): string {
  return slugifyAxisLabel(axis.id) || slugifyAxisLabel(axis.label) || "axe";
}

// ── Calcul ──────────────────────────────────────────────────────────

// Formes minimales, structurellement compatibles avec les types du
// viewer (SurveyAnswer / QuizQuestion) sans les importer.
export type ScoringAnswer =
  | { kind: "option"; optionIndex: number }
  | { kind: "options"; optionIndices: number[] }
  | { kind: "rating"; value: number }
  | { kind: "star"; value: number }
  | { kind: "text"; value: string };

export type ScoringQuestion = {
  question_type?: string | null;
  options?: { points?: number | null }[] | null;
  config?: Record<string, unknown> | null;
};

// Poids par axe d'une question, depuis son config JSONB. Poids > 0
// uniquement (un poids nul ou négatif = question non rattachée).
export function questionAxisWeights(
  config: Record<string, unknown> | null | undefined,
): Record<string, number> {
  const raw = config?.axes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const w = typeof v === "number" && Number.isFinite(v) ? v : 0;
    if (w > 0) out[k] = w;
  }
  return out;
}

// Contribution d'UNE question : points obtenus + bornes atteignables.
// Réplique la logique globale existante de computeResult (mode scoring)
// pour que global.points/max match l'affichage "X / Y" actuel, et
// ajoute la borne basse (points négatifs possibles, question sautée = 0).
function questionContribution(
  q: ScoringQuestion,
  ans: ScoringAnswer | null | undefined,
): { points: number; min: number; max: number } {
  const qType = q.question_type ?? "multiple_choice";
  if (qType === "rating_scale" || qType === "star_rating") {
    const cfg = (q.config ?? {}) as Record<string, unknown>;
    const qMax = typeof cfg.max === "number" ? cfg.max : qType === "star_rating" ? 5 : 10;
    const points = ans && (ans.kind === "rating" || ans.kind === "star") ? ans.value : 0;
    // Question sautée = 0 → la borne basse reste 0 même si l'échelle
    // démarre à 1.
    return { points, min: 0, max: qMax > 0 ? qMax : 0 };
  }
  if (qType === "free_text") return { points: 0, min: 0, max: 0 };
  const opts = q.options ?? [];
  const pts = opts.map((o) => (typeof o.points === "number" ? o.points : 0));
  const isMulti = ans?.kind === "options";
  const qMax = isMulti
    ? pts.reduce((a, p) => a + (p > 0 ? p : 0), 0)
    : pts.reduce((a, p) => Math.max(a, p), 0);
  const qMin = isMulti
    ? pts.reduce((a, p) => a + (p < 0 ? p : 0), 0)
    : Math.min(0, ...pts, 0);
  let points = 0;
  if (ans) {
    const picked: number[] =
      ans.kind === "option" ? [ans.optionIndex] : ans.kind === "options" ? ans.optionIndices : [];
    for (const oi of picked) points += pts[oi] ?? 0;
  }
  return { points, min: qMin, max: qMax > 0 ? qMax : 0 };
}

/**
 * Snapshot complet des scores d'un répondant. `global` réplique le
 * calcul existant (points bruts, comparés aux tranches min_score /
 * max_score des résultats). `axes` n'existe que si le quiz a des axes.
 */
export function computeScoresSnapshot(
  questions: ScoringQuestion[],
  answers: (ScoringAnswer | null | undefined)[],
  axes: ScoringAxis[],
): ScoresSnapshot {
  const global: AxisScore = { points: 0, min: 0, max: 0 };
  const perAxis: Record<string, AxisScore> = {};
  for (const a of axes) perAxis[a.id] = { points: 0, min: 0, max: 0 };

  questions.forEach((q, qIdx) => {
    const c = questionContribution(q, answers[qIdx]);
    global.points += c.points;
    global.min += c.min;
    // Parité stricte avec computeResult : une question dont le max est
    // nul (ex. toutes options à 0 point) ne gonfle pas le dénominateur.
    if (c.max > 0) global.max += c.max;
    const weights = questionAxisWeights(q.config);
    for (const [axisId, w] of Object.entries(weights)) {
      const bucket = perAxis[axisId];
      if (!bucket) continue; // axe supprimé depuis → contribution ignorée
      bucket.points += w * c.points;
      bucket.min += w * c.min;
      if (c.max > 0) bucket.max += w * c.max;
    }
  });

  return axes.length > 0 ? { global, axes: perAxis } : { global };
}

// ── Affichage du score au visiteur ──────────────────────────────────
//
// DEUX réglages se combinent, et leur combinaison décidait du rendu à
// trois endroits différents dans le viewer. Résultat : la page de
// résultat affichait un pourcentage alors que la créatrice avait tout
// décoché, et que le panneau lui promettait "le simple texte X / Y"
// (retour Véronique, 1er août 2026). La décision vit ici, une seule
// fois, et elle est testée.
//
//   score_display_mode = "percent" | "label" | "hidden"
//   show_score_gauge   = grande jauge visuelle, ou pas
export type ScoreDisplayMode = "percent" | "label" | "hidden";

export type ScoreDisplay =
  /** Rien du tout : la créatrice ne veut pas montrer le score. */
  | { kind: "none" }
  /** Grande valeur + barre de progression. */
  | { kind: "gauge"; asLabel: boolean }
  /** Le texte historique "12 / 20", et RIEN d'autre. */
  | { kind: "ratio" };

/** `quizzes.score_display_mode` -> valeur sûre. Inconnu = pourcentage. */
export function scoreDisplayMode(raw: string | null | undefined): ScoreDisplayMode {
  return raw === "label" || raw === "hidden" ? raw : "percent";
}

export function resolveScoreDisplay(
  rawMode: string | null | undefined,
  showGauge: boolean | null | undefined,
): ScoreDisplay {
  const mode = scoreDisplayMode(rawMode);
  if (mode === "hidden") return { kind: "none" };
  if (showGauge === true) return { kind: "gauge", asLabel: mode === "label" };
  // Pas de jauge : on affiche EXACTEMENT ce que le panneau annonce, le
  // ratio brut. Pas de pourcentage en prime.
  return { kind: "ratio" };
}

/**
 * Barres par axe. "Ne pas afficher" vaut pour TOUS les scores, axes
 * compris : une barre sans sa valeur ne dit plus rien (la couleur seule
 * ne porte jamais l'information), donc on retire le bloc entier.
 */
export function resolveAxisScoreDisplay(
  rawMode: string | null | undefined,
): { kind: "none" } | { kind: "value"; asLabel: boolean } {
  const mode = scoreDisplayMode(rawMode);
  if (mode === "hidden") return { kind: "none" };
  return { kind: "value", asLabel: mode === "label" };
}

// Pourcentage 0-100 d'un triplet, robuste aux points négatifs (la
// position dans [min, max], pas points/max).
export function scorePercent(s: AxisScore): number {
  const range = s.max - s.min;
  if (range <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, ((s.points - s.min) / range) * 100)));
}

// ── Validation serveur (POST /public) ───────────────────────────────

function isAxisScore(v: unknown): v is AxisScore {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (["points", "min", "max"] as const).every(
    (k) => typeof o[k] === "number" && Number.isFinite(o[k] as number),
  );
}

/**
 * Valide et nettoie un snapshot venu du client avant stockage. Retourne
 * null si la forme est invalide. Borne à MAX_SCORING_AXES entrées et
 * arrondit à 2 décimales (les poids peuvent produire des flottants).
 */
export function sanitizeScoresSnapshot(v: unknown): ScoresSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isAxisScore(o.global)) return null;
  const round = (s: AxisScore): AxisScore => ({
    points: Math.round(s.points * 100) / 100,
    min: Math.round(s.min * 100) / 100,
    max: Math.round(s.max * 100) / 100,
  });
  const out: ScoresSnapshot = { global: round(o.global) };
  if (o.axes && typeof o.axes === "object" && !Array.isArray(o.axes)) {
    const axes: Record<string, AxisScore> = {};
    let n = 0;
    for (const [k, val] of Object.entries(o.axes as Record<string, unknown>)) {
      if (n >= MAX_SCORING_AXES) break;
      if (typeof k !== "string" || k.length > 60 || !isAxisScore(val)) continue;
      axes[k] = round(val);
      n += 1;
    }
    if (n > 0) out.axes = axes;
  }
  return out;
}

// ── Placeholders {score} / {label} / {score_<axe>} / {label_<axe>} ──

export type ScorePlaceholderContext = {
  snapshot: ScoresSnapshot;
  axes: ScoringAxis[];
  labels: ScoreLabels;
};

function placeholderValues(ctx: ScorePlaceholderContext): Record<string, string> {
  const { snapshot, axes, labels } = ctx;
  const out: Record<string, string> = {};
  const gPct = scorePercent(snapshot.global);
  out.score = String(gPct);
  out.label = labels[scoreTranche(gPct)];
  for (const axis of axes) {
    const s = snapshot.axes?.[axis.id];
    if (!s) continue;
    const slug = axisSlug(axis);
    const pct = scorePercent(s);
    out[`score_${slug}`] = String(pct);
    out[`label_${slug}`] = labels[scoreTranche(pct)];
  }
  return out;
}

/**
 * Remplace les placeholders de score dans un texte de résultat. À
 * chaîner APRÈS interpolateText ({name} / genre) : {score} n'a ni
 * virgule ni pipe, il traverse interpolateText intact. Les placeholders
 * inconnus restent visibles (même philosophie que interpolateText).
 */
export function applyScorePlaceholders(
  text: string,
  ctx: ScorePlaceholderContext | null,
  opts?: { urlEncode?: boolean },
): string {
  if (!text || !ctx) return text ?? "";
  const values = placeholderValues(ctx);
  return text.replace(/\{([a-z0-9_]+)\}/g, (match, key: string) => {
    const v = values[key];
    if (v == null) return match;
    return opts?.urlEncode ? encodeURIComponent(v) : v;
  });
}

// Liste des placeholders disponibles (chips "insérer une variable" de
// l'éditeur + doc). Global d'abord, puis 2 par axe.
export function scorePlaceholderList(axes: ScoringAxis[]): string[] {
  const out = ["{score}", "{label}"];
  for (const axis of axes) {
    const slug = axisSlug(axis);
    out.push(`{score_${slug}}`, `{label_${slug}}`);
  }
  return out;
}

/**
 * Plage globale atteignable [min, max] d'un quiz scoring, côté ÉDITEUR
 * (pas de réponses : on se base sur config.multi_select pour savoir si
 * une question peut cumuler plusieurs options). Sert au check de
 * couverture des tranches min_score/max_score.
 */
export function computeReachableRange(questions: ScoringQuestion[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const q of questions) {
    const isMulti = Boolean((q.config as { multi_select?: boolean } | null | undefined)?.multi_select);
    // Réponse synthétique vide du bon "kind" pour que la contribution
    // calcule les bornes single vs multi comme le viewer.
    const c = questionContribution(q, isMulti ? { kind: "options", optionIndices: [] } : undefined);
    min += c.min;
    if (c.max > 0) max += c.max;
  }
  return { min, max };
}

/**
 * Résumé compact d'un snapshot pour l'export CSV : "score=62% ; sommeil=50%".
 * Les clés d'axes sont les ids (slugs lisibles). Retourne "" si pas de
 * snapshot (lead d'un quiz non scoring, ou capturé avant la feature).
 */
export function formatScoresSummary(raw: unknown): string {
  const snap = sanitizeScoresSnapshot(raw);
  if (!snap) return "";
  const parts: string[] = [];
  if (snap.global.max - snap.global.min > 0) parts.push(`score=${scorePercent(snap.global)}%`);
  for (const [id, s] of Object.entries(snap.axes ?? {})) {
    if (s.max - s.min <= 0) continue;
    parts.push(`${id}=${scorePercent(s)}%`);
  }
  return parts.join(" ; ");
}

// ── Finalisation d'un quiz scoré généré par l'IA ────────────────────
//
// Principe voie B (Béné, 30 juillet 2026) : l'IA fait la SÉMANTIQUE
// (textes, points 0-3 par option, rattachement aux axes, tranches
// ordonnées du plus bas au plus haut), le CODE fait l'ARITHMÉTIQUE.
// On ne demande JAMAIS de bornes chiffrées au modèle : on calcule ici
// la plage atteignable et on découpe les tranches en N segments
// contigus. Couverture garantie : zéro trou, zéro chevauchement.

/**
 * Découpe une plage de points en N tranches contiguës, de la plus basse
 * à la plus haute. Zéro trou, zéro chevauchement, par construction.
 *
 * Sert à DEUX endroits, et il est important qu'ils soient identiques :
 *   - la finalisation d'un quiz scoré généré par l'IA ;
 *   - le bouton "Répartir les tranches" de l'éditeur (retour Véronique,
 *     2 août 2026 : "je ne comprends pas la manière de scorer").
 *
 * Poser 4 tranches contiguës à la main est un calcul, pas une décision
 * de créatrice : c'est au logiciel de le faire.
 *
 * Le reliquat va aux tranches HAUTES : le meilleur diagnostic est un peu
 * plus dur à atteindre, jamais l'inverse.
 */
export function splitRangeIntoTranches(
  range: { min: number; max: number },
  count: number,
): { min_score: number; max_score: number }[] {
  const n = Math.max(0, Math.trunc(count));
  if (n === 0) return [];
  const lo = Math.min(range.min, range.max);
  const hi = Math.max(range.min, range.max);
  const total = hi - lo + 1;
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const out: { min_score: number; max_score: number }[] = [];
  let cursor = lo;
  for (let i = 0; i < n; i++) {
    const width = Math.max(1, base + (i >= n - remainder ? 1 : 0));
    const min = Math.min(cursor, hi);
    const max = i === n - 1 ? hi : Math.min(cursor + width - 1, hi);
    out.push({ min_score: min, max_score: Math.max(min, max) });
    cursor = max + 1;
  }
  return out;
}

export function finalizeAiScoringQuiz(
  rawQuestions: Record<string, unknown>[],
  rawResults: Record<string, unknown>[],
  axisLabels: string[],
): {
  questions: Record<string, unknown>[];
  results: Record<string, unknown>[];
  axes: ScoringAxis[];
} {
  const axes = normalizeScoringAxes(axisLabels.map((label) => ({ label })));
  const axisIds = new Set(axes.map((a) => a.id));

  const questions = rawQuestions.map((q) => {
    const qType = typeof q.question_type === "string" ? q.question_type : "multiple_choice";
    const isChoice = qType === "multiple_choice" || qType === "image_choice" || qType === "yes_no";
    // Points : entiers 0-3, défaut 1 sur les choix. result_index forcé à
    // 0 (non utilisé en mode scoring, mais la colonne l'exige).
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => {
      const opt = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
      const rawPts = typeof opt.points === "number" && Number.isFinite(opt.points) ? opt.points : 1;
      return {
        ...opt,
        result_index: 0,
        points: isChoice ? Math.max(0, Math.min(3, Math.trunc(rawPts))) : undefined,
      };
    });
    // Axes : l'IA les écrit au niveau de la question ("axes": {id: poids}) ;
    // on ne garde que les ids connus, poids entiers 1-2, et on les range
    // dans config.axes (l'emplacement runtime).
    const cfg = { ...((q.config && typeof q.config === "object" && !Array.isArray(q.config) ? q.config : {}) as Record<string, unknown>) };
    const rawAxes = (q.axes ?? cfg.axes) as Record<string, unknown> | undefined;
    const cleanAxes: Record<string, number> = {};
    if (rawAxes && typeof rawAxes === "object" && !Array.isArray(rawAxes)) {
      for (const [k, v] of Object.entries(rawAxes)) {
        if (!axisIds.has(k)) continue;
        const w = typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(2, Math.trunc(v))) : 1;
        cleanAxes[k] = w;
      }
    }
    if (Object.keys(cleanAxes).length > 0) cfg.axes = cleanAxes;
    else delete cfg.axes;
    const out: Record<string, unknown> = { ...q, options, config: cfg };
    delete out.axes;
    return out;
  });

  // Plage atteignable calculée sur les questions NETTOYÉES, puis découpe
  // en N tranches contiguës aussi égales que possible. Le reliquat va
  // aux tranches HAUTES (le meilleur diagnostic est un peu plus dur à
  // atteindre, jamais l'inverse).
  const range = computeReachableRange(questions as ScoringQuestion[]);
  const tranches = splitRangeIntoTranches(range, rawResults.length);
  const results = rawResults.map((r, i) => ({ ...r, ...tranches[i] }));

  return { questions, results, axes };
}

// ── Choix du résultat en mode scoring ───────────────────────────────
//
// LE VISITEUR NE DOIT JAMAIS TOMBER SUR UNE PAGE VIDE.
//
// Le viewer faisait `ranges.find(...) ?? null`. Un score qui tombe dans
// un TROU entre deux tranches, ou un quiz dont aucun résultat n'a de
// tranche, donnait `profile = null` : le visiteur répondait à tout,
// laissait son email, et arrivait sur un écran sans titre, sans texte,
// sans bouton. La créatrice, elle, ne voyait rien du tout.
//
// La règle ci-dessous est totale : dès qu'il existe au moins un
// résultat, il y a un résultat affiché. Le contrôle de cohérence de
// l'éditeur (analyzeTrancheCoverage) reste là pour signaler le trou,
// mais il prévient la créatrice, il ne sauve pas le visiteur.

export type ScoringResultRange = {
  min_score?: number | null;
  max_score?: number | null;
};

/**
 * Index du résultat à afficher pour un score donné.
 *
 * 1. la première tranche (par min croissant) qui CONTIENT le score ;
 * 2. sinon la tranche la plus PROCHE : en dessous de tout -> la plus
 *    basse, au dessus de tout -> la plus haute, dans un trou -> celle
 *    dont la borne est la plus proche, la basse en cas d'égalité ;
 * 3. aucune tranche définie nulle part -> le premier résultat.
 *
 * Retourne -1 seulement s'il n'y a AUCUN résultat, cas où il n'y a de
 * toute façon rien à afficher.
 */
export function pickScoringResultIndex(
  results: ScoringResultRange[],
  score: number,
): number {
  if (results.length === 0) return -1;

  const bounded = results
    .map((r, i) => ({ i, min: r.min_score, max: r.max_score }))
    .filter((r) => r.min != null || r.max != null)
    .map((r) => ({ i: r.i, min: r.min ?? -Infinity, max: r.max ?? Infinity }))
    .sort((a, b) => a.min - b.min);

  if (bounded.length === 0) return 0;

  const hit = bounded.find((r) => score >= r.min && score <= r.max);
  if (hit) return hit.i;

  // Distance à la tranche : 0 si dedans (déjà traité), sinon l'écart à
  // la borne franchie. `<` strict pour garder la plus basse à égalité.
  let best = bounded[0];
  let bestDistance = Infinity;
  for (const r of bounded) {
    const distance = score < r.min ? r.min - score : score - r.max;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = r;
    }
  }
  return best.i;
}

// ── Couverture des tranches (mode scoring) ──────────────────────────

export type TrancheIssue =
  | { kind: "gap"; from: number; to: number }
  | { kind: "overlap"; a: number; b: number; from: number; to: number }
  | { kind: "unbounded" };

/**
 * Vérifie que les tranches [min_score, max_score] des résultats couvrent
 * tout l'intervalle atteignable [reachMin, reachMax] sans trou ni
 * chevauchement. Les indices retournés dans `overlap` sont les positions
 * dans le tableau `ranges` FOURNI (l'appelant mappe vers ses résultats).
 */
export function analyzeTrancheCoverage(
  ranges: { min_score?: number | null; max_score?: number | null }[],
  reachMin: number,
  reachMax: number,
): TrancheIssue[] {
  const issues: TrancheIssue[] = [];
  const bounded = ranges
    .map((r, i) => ({ i, min: r.min_score ?? -Infinity, max: r.max_score ?? Infinity }))
    .filter((r) => r.min !== -Infinity || r.max !== Infinity);
  if (bounded.length === 0) {
    issues.push({ kind: "unbounded" });
    return issues;
  }
  const sorted = [...bounded].sort((a, b) => a.min - b.min);
  // Chevauchements entre tranches consécutives (bornes incluses : une
  // tranche 0-10 et une 10-20 se chevauchent sur 10).
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.min <= prev.max) {
      issues.push({
        kind: "overlap",
        a: prev.i,
        b: cur.i,
        from: cur.min === -Infinity ? reachMin : cur.min,
        to: Math.min(prev.max === Infinity ? reachMax : prev.max, cur.max === Infinity ? reachMax : cur.max),
      });
    }
  }
  // Trous dans [reachMin, reachMax]. Les scores sont entiers (points
  // entiers + échelles entières) → un trou existe si next.min > prev.max + 1.
  const firstMin = sorted[0].min === -Infinity ? reachMin : sorted[0].min;
  if (firstMin > reachMin) issues.push({ kind: "gap", from: reachMin, to: firstMin - 1 });
  let highest = sorted[0].max;
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (highest !== Infinity && cur.min > (highest as number) + 1) {
      issues.push({ kind: "gap", from: (highest as number) + 1, to: cur.min - 1 });
    }
    if (cur.max > highest) highest = cur.max;
  }
  if (highest !== Infinity && (highest as number) < reachMax) {
    issues.push({ kind: "gap", from: (highest as number) + 1, to: reachMax });
  }
  return issues;
}
