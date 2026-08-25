// lib/quiz/editorSnapshot.ts
//
// Porte de Tiquiz le 5 aout 2026. Les listes de cles sont celles de CE
// repo : Tipote n'a pas `seo_noindex`, et porte en plus
// `toast_widget_id` et `share_widget_id`. Les comparer a la main entre
// les deux apps serait exactement le defaut que ce fichier corrige.
//
// L'instantané de l'éditeur de quiz : la liste EXACTE des champs qui
// composent "l'état éditable", écrite UNE seule fois.
//
// -- POURQUOI CE FICHIER EXISTE (drame Jocelyne, 4 août 2026) ----------
//
// "À chaque fois que je ferme et que je reviens, il me redemande si je
// veux garder la dernière sauvegarde automatique ou la dernière
// sauvegarde que j'ai faite moi. Je sauvegarde toujours avant de sortir.
// C'est bizarre, ça ne faisait pas ça au départ."
//
// Elle avait raison sur les deux points : ça n'aurait jamais dû lui être
// proposé, et ça n'arrivait pas avant.
//
// L'éditeur ne propose la restauration QUE si le brouillon diffère
// vraiment du quiz sauvegardé. Ce contrôle existait, et il comparait
// deux objets écrits À LA MAIN à deux endroits différents :
// `autosaveSnapshot` (l'état de l'éditeur) et `canonical` (reconstruit
// depuis les colonnes). Il suffisait qu'un champ manque d'un côté pour
// que la comparaison soit FAUSSE À TOUS LES COUPS.
//
// Onze champs manquaient côté `canonical` : `tie_break`,
// `capture_enabled`, les quatre `*_required`, les quatre identifiants de
// pixels, et `og_image_url`. Chacun avait été ajouté à l'instantané sans
// être ajouté à la copie, à des mois d'intervalle et par des chantiers
// sans rapport. Le contrôle ne pouvait donc plus jamais dire "identique".
//
// Ce que ça donne, écrit une bonne fois : **deux objets qu'on doit
// maintenir identiques à la main finissent toujours par diverger.** Le
// seul remède est de rendre l'oubli IMPOSSIBLE, pas improbable.
//
// D'où `QuizEditorSnapshotInput` : un type dont TOUTES les clés sont
// obligatoires. Les deux appelants passent par `buildQuizEditorSnapshot`,
// donc le typecheck refuse de compiler si l'un des deux oublie un champ,
// et l'objet produit a les mêmes clés dans le même ordre des deux côtés.
// Ajouter un réglage à l'éditeur, c'est ajouter une ligne ici, et le
// compilateur réclame les deux autres.

/**
 * Les champs de l'instantané, dans l'ordre. Ajouter un réglage éditable
 * = ajouter sa clé ICI, et le typecheck exigera qu'elle soit fournie des
 * deux côtés (état de l'éditeur ET reconstruction depuis les colonnes).
 */
export const QUIZ_SNAPSHOT_KEYS = [
  "title",
  "introduction",
  "cta_text",
  "cta_url",
  "start_button_text",
  "intro_start_mode",
  "privacy_url",
  "consent_text",
  "capture_heading",
  "capture_subtitle",
  "capture_submit_text",
  "result_insight_heading",
  "result_bridge_heading",
  "show_result_bridge",
  "result_layout",
  "tie_break",
  "brand_logo_align",
  "brand_logo_width",
  "intro_text_width",
  "result_projection_heading",
  "capture_enabled",
  "capture_first_name",
  "capture_last_name",
  "capture_phone",
  "capture_country",
  "first_name_required",
  "last_name_required",
  "phone_required",
  "country_required",
  "show_consent_checkbox",
  "show_results_breakdown",
  "scoring_axes",
  "show_score_gauge",
  "score_display_mode",
  "score_labels",
  "sio_score_tags",
  "show_other_results",
  "other_results_position",
  "hide_response_counts",
  "notify_responses",
  "meta_pixel_id",
  "ga4_measurement_id",
  "google_ads_conversion_id",
  "google_ads_conversion_label",
  "ask_first_name",
  "ask_gender",
  "virality_enabled",
  "bonus_description",
  "bonus_heading",
  "bonus_intro_text",
  "bonus_unlocked_message",
  "bonus_image_url",
  "bonus_image_position",
  "bonus_image_width",
  "intro_image_url",
  "intro_image_position",
  "intro_image_width",
  "background_style",
  "background_gradient",
  "background_image_url",
  "intro_layout",
  "button_shape",
  "theme_id",
  "question_layout",
  "split_image_url",
  "split_side",
  "panel_media",
  "answer_layout",
  "show_result_insight",
  "show_result_projection",
  "show_result_share",
  "share_result_page",
  "close_enabled",
  "close_action",
  "close_redirect_url",
  "close_message",
  "close_cta_text",
  "close_cta_url",
  "share_message",
  "locale",
  "sio_share_tag_name",
  "status",
  "brand_font",
  "brand_color_primary",
  "brand_color_background",
  "brand_color_text",
  "brand_logo_url",
  "hide_brand_logo",
  "slug",
  "og_description",
  "og_image_url",
  "custom_footer_text",
  "custom_footer_url",
  "hide_branding",
  "share_networks",
  "toast_widget_id",
  "share_widget_id",
  "questions",
  "results",
] as const;

/**
 * Même liste pour l'éditeur de SONDAGE, qui avait le défaut à l'état
 * pur : il ne comparait RIEN du tout, et proposait la restauration dès
 * que le brouillon était plus récent, identique ou pas.
 */
export const SURVEY_SNAPSHOT_KEYS = [
  "title",
  "introduction",
  "cta_text",
  "cta_url",
  "start_button_text",
  "privacy_url",
  "consent_text",
  "capture_heading",
  "capture_subtitle",
  "capture_submit_text",
  "capture_before_questions",
  "hide_response_counts",
  "notify_responses",
  "survey_thanks_heading",
  "survey_thanks_body",
  "result_insight_heading",
  "result_projection_heading",
  "capture_first_name",
  "capture_last_name",
  "capture_phone",
  "capture_country",
  "first_name_required",
  "last_name_required",
  "phone_required",
  "country_required",
  "show_consent_checkbox",
  "ask_first_name",
  "ask_gender",
  "share_message",
  "locale",
  "sio_share_tag_name",
  "sio_capture_tag",
  "status",
  "brand_font",
  "brand_color_primary",
  "brand_color_background",
  "brand_color_text",
  "slug",
  "og_description",
  "og_image_url",
  "intro_image_url",
  "intro_image_position",
  "intro_image_width",
  "custom_footer_text",
  "custom_footer_url",
  // Partage du sondage (Adeline, 5 aout 2026) : meme colonne que le
  // quiz, meme decision (un bouton de partage a la fin, ou pas).
  "show_result_share",
  "share_networks",
  "toast_widget_id",
  "share_widget_id",
  "questions",
] as const;

export type QuizSnapshotKey = (typeof QUIZ_SNAPSHOT_KEYS)[number];
export type SurveySnapshotKey = (typeof SURVEY_SNAPSHOT_KEYS)[number];
export type SurveyEditorSnapshotInput = { [K in SurveySnapshotKey]: unknown };
export type SurveyEditorSnapshot = Record<SurveySnapshotKey, unknown>;

/** Construit l'instantané d'un SONDAGE. Mêmes garanties. */
export function buildSurveyEditorSnapshot(v: SurveyEditorSnapshotInput): SurveyEditorSnapshot {
  const out = {} as SurveyEditorSnapshot;
  for (const key of SURVEY_SNAPSHOT_KEYS) out[key] = v[key];
  return out;
}

/**
 * Toutes les clés sont OBLIGATOIRES : c'est tout l'intérêt du fichier.
 * Les valeurs sont en `unknown` parce que la forme de chaque champ vit
 * déjà dans le composant ; ce qu'on veut garantir ici, c'est la PARITÉ
 * des clés entre les deux appelants, pas leur type.
 */
export type QuizEditorSnapshotInput = { [K in QuizSnapshotKey]: unknown };

export type QuizEditorSnapshot = Record<QuizSnapshotKey, unknown>;

/** Construit l'instantané : mêmes clés, même ordre, des deux côtés. */
export function buildQuizEditorSnapshot(v: QuizEditorSnapshotInput): QuizEditorSnapshot {
  const out = {} as QuizEditorSnapshot;
  for (const key of QUIZ_SNAPSHOT_KEYS) out[key] = v[key];
  return out;
}

/**
 * Sérialisation à clés TRIÉES, en profondeur.
 *
 * `JSON.stringify` dépend de l'ordre d'insertion : deux objets de même
 * contenu écrits dans un ordre différent donnent deux chaînes
 * différentes. Le builder ci-dessus garantit l'ordre pour les
 * instantanés d'aujourd'hui, mais pas pour les brouillons DÉJÀ en base,
 * écrits par les versions précédentes. Sans tri, chacun d'eux
 * continuerait de déclencher le dialogue une dernière fois.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortDeep(src[key]);
    return out;
  }
  return value;
}

/**
 * Le brouillon mérite-t-il d'être proposé à la créatrice ?
 *
 * Non s'il dit exactement la même chose que le quiz sauvegardé. C'est le
 * seul critère : un brouillon plus RÉCENT mais identique n'apporte rien,
 * et le proposer quand même donne le sentiment que la sauvegarde n'a pas
 * marché.
 */
export function draftDiffersFromSaved(
  draft: unknown,
  canonical: QuizEditorSnapshot | SurveyEditorSnapshot,
): boolean {
  return stableStringify(draft) !== stableStringify(canonical);
}

/**
 * QUELS champs diffèrent. Pour le savoir au lieu de le supposer.
 *
 * Le 4 août 2026, Jocelyne signale que le dialogue de restauration
 * revient. On corrige une cause, elle confirme ("c'est bon !"), et ça
 * recommence vingt-sept minutes plus tard. On formule alors une deuxième
 * hypothèse... qu'on ne peut pas vérifier, parce qu'au moment où on
 * regarde en base, le brouillon a déjà été effacé. Une journée de
 * théories sur un écran qu'on n'a jamais vu.
 *
 * Cette fonction rend la prochaine fois triviale : l'éditeur écrit dans
 * la console le nom des champs qui ont fait pencher la décision. Il n'y a
 * plus à deviner, il suffit de demander.
 *
 * On ne renvoie QUE des noms de champs, jamais leur contenu : ces
 * snapshots portent le texte du quiz d'une créatrice, ça n'a rien à faire
 * dans un journal.
 */
export function diffEditorSnapshot(
  draft: unknown,
  canonical: QuizEditorSnapshot | SurveyEditorSnapshot,
): string[] {
  const d = (draft && typeof draft === "object" ? draft : {}) as Record<string, unknown>;
  const c = canonical as Record<string, unknown>;
  const keys = new Set([...Object.keys(d), ...Object.keys(c)]);
  const out: string[] = [];
  for (const key of keys) {
    if (stableStringify(d[key]) !== stableStringify(c[key])) out.push(key);
  }
  return out.sort();
}
