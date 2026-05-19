// lib/metaReview.ts
//
// TEMPORAIRE — annotations UI dédiées à la review Meta App Review pour
// les permissions instagram_business_content_publish + manage_comments.
//
// Les annotations rendent visible aux reviewers Meta :
//   - quelles permissions ont été accordées (bandeau Granted)
//   - quel appel Graph API est déclenché par chaque action UI
//   - le permalink IG du post publié après succès
//
// Après que Meta ait approuvé les permissions, **changer ce flag à
// false** (les annotations disparaissent partout) puis supprimer le
// fichier + les usages quand tu auras le temps :
//
//   grep -rn "META_REVIEW_VISIBLE" .
//
// Mise en place : 19 mai 2026, suite aux refus consécutifs Meta.

export const META_REVIEW_VISIBLE = true;

// App ID Meta Instagram — utilisé dans le bandeau pour que la review
// puisse cross-checker que l'app dans le dashboard correspond.
// Lis NEXT_PUBLIC_META_INSTAGRAM_APP_ID si défini, sinon fallback.
export const META_INSTAGRAM_APP_ID =
  process.env.NEXT_PUBLIC_META_INSTAGRAM_APP_ID || "2408789919563484";

export const META_IG_GRANTED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
] as const;
