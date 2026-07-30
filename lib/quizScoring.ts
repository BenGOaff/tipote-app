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
