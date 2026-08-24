// tests/logic/image-budgets.test.mts
//
// Jumeau du fichier de Tiquiz. Le service des images (`/img`) n'existe
// que la-bas pour l'instant : ici on fige la moitie qui existe, la
// compression a l'envoi.
//
// Béné, 6 août 2026, sur l'alerte de dépassement Supabase : "Comment
// éviter ça ? Et comment éviter ça à l'avenir sur tous les projets ?
// J'ai un super serveur autant l'utiliser." Puis, en donnant son accord :
// "ok mais SANS PERDRE LA QUALITÉ".
//
// La mesure qui a déclenché tout ça, sur son quiz `clients-perdus` :
// 19 images, 30 Mo au total, 1,76 Mo de moyenne. Une image de réponse
// fait 1536 x 1024 pixels pour 1,8 Mo, et elle est affichée dans une
// carte de 300 points de large. Son pic de 1,7 Go du 21 juillet, c'est
// environ 57 personnes qui ont fait le quiz en entier.
//
// Ce fichier fige les trois promesses faites en échange de son accord :
// on ne dégrade RIEN de ce qu'elle voit, on n'agrandit jamais, et on
// rend l'original à la moindre incertitude.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_EDGE,
  WEBP_QUALITY,
  keepEncoded,
  kindForPath,
  passThrough,
  targetSize,
} from "@/lib/images/budgets";

const lire = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

// ── "Sans perdre la qualité" ─────────────────────────────────────────

test("les bornes laissent de la marge meme sur un ecran haute densite", () => {
  // Un ecran a 2 pixels d'image par point de mise en page. Le besoin
  // REEL le plus large est l'image de contenu pleine largeur : 672
  // points, donc 1344 pixels. La borne est au dessus.
  assert.ok(MAX_EDGE.content >= 1344, `contenu ${MAX_EDGE.content} < besoin 1344`);
  // Un fond plein ecran sur un grand moniteur : 1200 points, 2400 pixels.
  assert.ok(MAX_EDGE.cover >= 2400, `couverture ${MAX_EDGE.cover} < besoin 2400`);
  // L'apercu des reseaux sociaux : la specification est 1200 x 630.
  assert.ok(MAX_EDGE.og >= 1200);
  // Un logo est affiche en 64 points de haut, donc 128 pixels.
  assert.ok(MAX_EDGE.logo >= 128 * 2);
});

test("la qualite WebP reste dans la zone visuellement sans perte", () => {
  // En dessous de 85, les degrades de marque commencent a se marbrer et
  // une creatrice le voit. Au dessus de 95, le poids grimpe pour rien.
  assert.ok(WEBP_QUALITY >= 88 && WEBP_QUALITY <= 95, `qualite ${WEBP_QUALITY}`);
});

test("l'image de Bene passe de 1536 a 1600 maximum, donc elle n'est PAS redimensionnee", () => {
  // Son image de reponse mesure 1536 x 1024. Sous la borne "contenu" :
  // aucun pixel n'est retire, seul le format change. C'est exactement
  // ce que "sans perdre la qualite" veut dire.
  assert.equal(targetSize(1536, 1024, MAX_EDGE.content), null);
});

// ── On n'agrandit jamais ─────────────────────────────────────────────

test("une petite image reste petite", () => {
  // La gonfler ne rajouterait aucun detail, seulement du poids et du flou.
  assert.equal(targetSize(400, 300, 1600), null);
  assert.equal(targetSize(1600, 1200, 1600), null);
});

test("le rapport largeur / hauteur est conserve", () => {
  const r = targetSize(4000, 3000, 1600);
  assert.deepEqual(r, { width: 1600, height: 1200 });
  const portrait = targetSize(3000, 4000, 1600);
  assert.deepEqual(portrait, { width: 1200, height: 1600 });
});

test("une dimension absurde ne fait rien", () => {
  for (const [w, h] of [[0, 100], [100, 0], [-5, 5], [Number.NaN, 10]]) {
    assert.equal(targetSize(w, h, 1600), null, `${w}x${h}`);
  }
  assert.equal(targetSize(4000, 3000, 0), null);
});

// ── Ce qu'on ne touche jamais ────────────────────────────────────────

test("un GIF anime n'est jamais re-encode", () => {
  // Le re-encodage perdrait l'animation, et les GIF sont une
  // fonctionnalite annoncee des quiz.
  assert.equal(passThrough("image/gif"), true);
});

test("un SVG n'est jamais rasterise", () => {
  // C'est du vectoriel : le passer en pixels SERAIT une perte de
  // qualite, exactement ce qu'on s'interdit.
  assert.equal(passThrough("image/svg+xml"), true);
  assert.equal(passThrough("image/svg+xml; charset=utf-8"), true);
});

test("ce qui n'est pas une image n'est pas touche", () => {
  for (const t of ["application/pdf", "text/html", "", "video/mp4"]) {
    assert.equal(passThrough(t), true, t);
  }
});

test("les photos, elles, sont bien traitees", () => {
  for (const t of ["image/jpeg", "image/png", "image/webp", "IMAGE/JPEG"]) {
    assert.equal(passThrough(t), false, t);
  }
});

// ── L'original gagne quand le resultat ne rapporte rien ──────────────

test("un resultat plus lourd que l'original est jete", () => {
  assert.equal(keepEncoded(100_000, 120_000), false);
  assert.equal(keepEncoded(100_000, 100_000), false);
});

test("un gain derisoire ne justifie pas de remplacer le fichier", () => {
  // Chaque conversion est un risque (couleurs, transparence). Elle doit
  // rapporter quelque chose.
  assert.equal(keepEncoded(100_000, 99_000), false);
  assert.equal(keepEncoded(100_000, 90_000), true);
});

test("une taille inconnue ne declenche rien", () => {
  assert.equal(keepEncoded(0, 5_000), false);
  assert.equal(keepEncoded(5_000, 0), false);
});

// ── Le dossier decide du contexte ────────────────────────────────────

test("chaque dossier de stockage tombe sur la bonne borne", () => {
  assert.equal(kindForPath("quiz-options/u1/photo.png"), "content");
  assert.equal(kindForPath("rich-content/u1/photo.png"), "content");
  assert.equal(kindForPath("quiz-backgrounds/u1/fond.jpg"), "cover");
  assert.equal(kindForPath("quiz-panel/u1/fond.jpg"), "cover");
  assert.equal(kindForPath("og/u1/apercu.png"), "og");
  assert.equal(kindForPath("logos/u1/logo-123.png"), "logo");
});

test("un dossier inconnu prend la borne prudente", () => {
  // Un dossier ajoute demain ne doit pas se retrouver sans regle.
  assert.equal(kindForPath("dossier-de-demain/u1/x.png"), "content");
  assert.equal(kindForPath(""), "content");
});

test("le nom du dossier seul suffit", () => {
  // C'est ce que passent les points d'envoi : ils ne connaissent pas
  // encore le chemin complet, l'extension depend justement du resultat.
  assert.equal(kindForPath("og"), "og");
  assert.equal(kindForPath("quiz-options"), "content");
});

// ── Les deux moities appellent la MEME regle ─────────────────────────

test("l'envoi et le service partagent les bornes, ils ne les recopient pas", () => {
  // Sinon une image compressee a l'envoi serait recompressee au
  // service, ou l'inverse. C'est le defaut qui revient en boucle dans ce
  // repo : deux endroits qui recalculent au lieu d'appeler.
  for (const f of ["lib/images/compress.ts"]) {
    const src = lire(f);
    assert.match(src, /from "\.\/budgets"/, f);
    assert.doesNotMatch(src, /const MAX_EDGE|quality: 9\d(?!\d)/, `${f} redefinit une borne`);
  }
});

test("tous les points d'envoi passent par prepareUpload", () => {
  // Un seul oubli, et une creatrice continue de televerser 1,8 Mo par
  // image sans que personne ne s'en apercoive avant la facture.
  for (const f of [
    "components/quiz/QuizDetailClient.tsx",
    "components/quiz/SurveyDetailClient.tsx",
  ]) {
    const src = lire(f);
    // Depuis le 26 aout les composants ne televersent plus en direct :
    // ils passent par `televerserAsset`, qui decide entre notre serveur
    // et Supabase. Le garde-fou, lui, ne change pas : ce qui part doit
    // toujours etre le fichier COMPRESSE.
    const envois = [...src.matchAll(/televerserAsset\(supabase, path, ([\w.]+)\)/g)].map((m) => m[1]);
    assert.ok(envois.length > 0, `${f} : aucun envoi trouve`);
    for (const quoi of envois) {
      assert.equal(quoi, "prepared.blob", `${f} envoie \`${quoi}\` au lieu du fichier prepare`);
    }
  }
});

test("l'extension ecrite dans le chemin est celle du fichier reellement envoye", () => {
  // Sinon on stocke du WebP sous un nom en .png, et le type servi ne
  // correspond plus au contenu.
  for (const f of [
    "components/quiz/QuizDetailClient.tsx",
    "components/quiz/SurveyDetailClient.tsx",
  ]) {
    const src = lire(f);
    assert.doesNotMatch(
      src,
      /const ext = file\.name\.split/,
      `${f} calcule encore l'extension sur le nom d'origine`,
    );
    assert.match(src, /const ext = prepared\.ext;/, f);
  }
});

// ── Fail-open, partout ───────────────────────────────────────────────

test("la compression a l'envoi rend le fichier d'origine en cas de pepin", () => {
  const src = lire("lib/images/compress.ts");
  assert.match(src, /catch \{\s*return original;\s*\}/);
  assert.match(src, /if \(passThrough\(file\.type\)\) return original;/);
});

test("l'orientation EXIF est appliquee", () => {
  // Sans ca, toutes les photos verticales prises au telephone
  // repartiraient couchees.
  const src = lire("lib/images/compress.ts");
  assert.match(src, /imageOrientation: "from-image"/);
});
