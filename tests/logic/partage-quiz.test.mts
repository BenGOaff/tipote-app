// tests/logic/partage-quiz.test.mts
//
// PARTAGER UN QUIZ : ce qui voyage, ce qui reste, et qui peut installer.
//
// Béné, 25 août 2026 : "un clic et le quiz est installé chez moi, avec
// les textes, les images, les points. Il devra juste personnaliser et
// charger ses tags."
//
// Ce que ces tests protègent, dans l'ordre de ce que ça coûterait :
//   1. un tag Systeme.io de Béné qui part chez un client, donc SES leads
//      qui déclenchent LES automatisations de quelqu'un d'autre ;
//   2. un lien légal ou un bouton qui envoie les visiteurs du client sur
//      le site de Béné ;
//   3. un champ vidé sans un mot, donc un quiz publié dont le bouton ne
//      mène nulle part.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  aPersonnaliser,
  etatPartage,
  genererJetonPartage,
  jetonValide,
  nettoyerPourPartage,
  QUIZ_COLONNES_PRIVEES,
  RESULT_COLONNES_PRIVEES,
} from "@/lib/quiz/partage";
import {
  cheminDepuisUrl,
  cheminPourInstallateur,
  collecterImages,
  reecrireImages,
} from "@/lib/quiz/partageImages";

// ── LE JETON ─────────────────────────────────────────────────────────

test("le jeton fait 32 caracteres hexadecimaux, et deux tirages different", () => {
  const a = genererJetonPartage();
  const b = genererJetonPartage();
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.notEqual(a, b);
  assert.equal(jetonValide(a), a);
});

test("un jeton mal forme n'atteint jamais la base", () => {
  for (const brut of ["", "  ", "abc", "../../etc", "'; drop table", null, undefined, 42]) {
    assert.equal(jetonValide(brut), null, String(brut));
  }
  // Trente et un caractères, ou trente trois : la longueur compte.
  assert.equal(jetonValide("a".repeat(31)), null);
  assert.equal(jetonValide("a".repeat(33)), null);
  // Une lettre hors de l'alphabet hexadécimal ferme la porte.
  assert.equal(jetonValide("g".repeat(32)), null);
  // La casse, elle, est tolérée et ramenée en minuscules : un lien
  // recopié à la main depuis un email peut arriver en majuscules, et
  // refuser là serait un cul-de-sac pour rien.
  assert.equal(jetonValide("AB".repeat(16)), "ab".repeat(16));
  // Les espaces autour d'un copier-coller ne comptent pas non plus.
  assert.equal(jetonValide(`  ${"c".repeat(32)}  `), "c".repeat(32));
});

// ── CE QUI NE TRAVERSE PAS ───────────────────────────────────────────

test("aucun identifiant Systeme.io, pixel ou destination ne part dans la copie", () => {
  const source = {
    title: "Mon quiz",
    intro_text: "<p>Bonjour</p>",
    primary_color: "#123456",
    sio_api_key_id: "cle-de-bene",
    sio_capture_tag: "lead-tiquiz",
    sio_share_tag_name: "partage",
    sio_score_tags: [{ axe: "a", tag: "t" }],
    meta_pixel_id: "111",
    ga4_measurement_id: "G-XXX",
    google_ads_conversion_id: "AW-1",
    google_ads_conversion_label: "abc",
    cta_url: "https://tipote.fr/offre",
    privacy_url: "https://tipote.fr/privacy",
    custom_footer_url: "https://tipote.fr",
    custom_footer_text: "Ethilife",
    close_redirect_url: "https://tipote.fr/merci",
    close_cta_url: "https://tipote.fr/vente",
    hide_branding: true,
    user_id: "bene",
    slug: "mon-quiz",
    views_count: 4211,
  };
  const copie = nettoyerPourPartage(source, QUIZ_COLONNES_PRIVEES);

  // Le contenu, lui, voyage : c'est tout l'intérêt.
  assert.equal(copie.title, "Mon quiz");
  assert.equal(copie.intro_text, "<p>Bonjour</p>");
  assert.equal(copie.primary_color, "#123456");

  for (const interdit of [
    "sio_api_key_id",
    "sio_capture_tag",
    "sio_share_tag_name",
    "sio_score_tags",
    "meta_pixel_id",
    "ga4_measurement_id",
    "google_ads_conversion_id",
    "google_ads_conversion_label",
    "cta_url",
    "privacy_url",
    "custom_footer_url",
    "custom_footer_text",
    "close_redirect_url",
    "close_cta_url",
    "hide_branding",
    "user_id",
    "slug",
    "views_count",
  ]) {
    assert.equal(interdit in copie, false, `${interdit} ne doit pas traverser`);
  }
});

test("un profil de resultat laisse son bouton et ses tags chez l'expediteur", () => {
  const copie = nettoyerPourPartage(
    {
      title: "Le pressé",
      description: "<p>Tu cours.</p>",
      bridge: "<p>La suite logique.</p>",
      cta_text: "Je veux la méthode",
      cta_url: "https://tipote.fr/atelier",
      sio_tag_name: "profil-presse",
      sio_tag_names: ["a", "b"],
      sio_course_id: "42",
      sio_community_id: "7",
      quiz_id: "ancien",
    },
    RESULT_COLONNES_PRIVEES,
  );
  // Le LIBELLÉ du bouton voyage (c'est du texte), pas sa DESTINATION.
  assert.equal(copie.cta_text, "Je veux la méthode");
  assert.equal(copie.bridge, "<p>La suite logique.</p>");
  for (const interdit of [
    "cta_url",
    "sio_tag_name",
    "sio_tag_names",
    "sio_course_id",
    "sio_community_id",
    "quiz_id",
  ]) {
    assert.equal(interdit in copie, false, interdit);
  }
});

// ── CE QU'ON DIT APRÈS ───────────────────────────────────────────────

test("on ne liste QUE ce que l'expediteur avait vraiment rempli", () => {
  const rien = aPersonnaliser({ quiz: { title: "x" }, resultats: [{ title: "y" }] });
  assert.deepEqual(rien, []);

  const tout = aPersonnaliser({
    quiz: {
      sio_capture_tag: "lead",
      cta_url: "https://x.fr",
      privacy_url: "https://x.fr/p",
      meta_pixel_id: "1",
      custom_footer_text: "Ethilife",
    },
    resultats: [],
  });
  assert.deepEqual(tout, [
    "tags-systeme-io",
    "url-bouton",
    "politique-confidentialite",
    "tracking",
    "pied-de-page",
  ]);
});

test("un tag pose sur un PROFIL compte aussi, meme si le quiz n'en a pas", () => {
  const liste = aPersonnaliser({
    quiz: { title: "x" },
    resultats: [{ sio_tag_names: ["profil-a"] }],
  });
  assert.deepEqual(liste, ["tags-systeme-io"]);
});

// ── L'ÉTAT D'UN LIEN ─────────────────────────────────────────────────

const T0 = new Date("2026-08-25T10:00:00Z");

test("un lien inconnu, revoque, expire ou epuise dit LEQUEL", () => {
  assert.deepEqual(etatPartage(null, T0), { ouvert: false, raison: "inconnu" });
  assert.deepEqual(etatPartage({ enabled: false }, T0), {
    ouvert: false,
    raison: "revoque",
  });
  assert.deepEqual(etatPartage({ expires_at: "2026-08-24T10:00:00Z" }, T0), {
    ouvert: false,
    raison: "expire",
  });
  assert.deepEqual(etatPartage({ max_installs: 1, installs_count: 1 }, T0), {
    ouvert: false,
    raison: "epuise",
  });
  assert.deepEqual(etatPartage({ max_installs: 1, installs_count: 0 }, T0), {
    ouvert: true,
  });
});

test("une date d'expiration illisible FERME le lien", () => {
  // Un doute sur un droit d'accès se tranche en faveur du refus.
  assert.deepEqual(etatPartage({ expires_at: "pas une date" }, T0), {
    ouvert: false,
    raison: "expire",
  });
});

test("sans limite ni date, le lien reste ouvert quel que soit le compteur", () => {
  assert.deepEqual(etatPartage({ installs_count: 812 }, T0), { ouvert: true });
  assert.deepEqual(etatPartage({ max_installs: 0, installs_count: 812 }, T0), {
    ouvert: true,
  });
});

// ── LES IMAGES ───────────────────────────────────────────────────────

const URL_BENE =
  "https://abc.supabase.co/storage/v1/object/public/public-assets/quiz-intro/bene-uid/photo.png";

test("on reconnait NOS images, et on laisse les autres tranquilles", () => {
  assert.equal(cheminDepuisUrl(URL_BENE), "quiz-intro/bene-uid/photo.png");
  assert.equal(cheminDepuisUrl("https://images.unsplash.com/photo-1.jpg"), null);
  assert.equal(cheminDepuisUrl("https://media.giphy.com/x.gif"), null);
  assert.equal(cheminDepuisUrl(null), null);
});

test("la query n'entre pas dans le chemin de l'objet", () => {
  assert.equal(cheminDepuisUrl(`${URL_BENE}?t=1712`), "quiz-intro/bene-uid/photo.png");
});

test("la destination remplace le 2e segment, celui que la RLS verifie", () => {
  assert.equal(
    cheminPourInstallateur("quiz-intro/bene-uid/photo.png", "client-uid"),
    "quiz-intro/client-uid/photo.png",
  );
  // Une forme inattendue est REFUSÉE plutôt que bricolée : la RLS
  // rejetterait l'écriture, et l'appelant garde alors l'URL d'origine,
  // qui s'affiche encore (le bucket est en lecture publique).
  assert.equal(cheminPourInstallateur("photo.png", "client-uid"), null);
  assert.equal(cheminPourInstallateur("a/b/c.png", ""), null);
});

test("on trouve les images meme au fond d'un JSONB, sans doublon", () => {
  const autre = URL_BENE.replace("photo.png", "autre.png");
  const chemins = collecterImages({
    cover_image_url: URL_BENE,
    beat_media: { cause: { url: autre, mode: "with" } },
    options: [{ label: "a", image_url: URL_BENE }, { label: "b" }],
    externe: "https://images.unsplash.com/x.jpg",
  });
  assert.deepEqual(
    [...chemins].sort(),
    ["quiz-intro/bene-uid/autre.png", "quiz-intro/bene-uid/photo.png"],
  );
});

test("la reecriture suit les images recopiees et laisse les autres", () => {
  const map = new Map([["quiz-intro/bene-uid/photo.png", "quiz-intro/client-uid/photo.png"]]);
  const sortie = reecrireImages(
    {
      cover_image_url: URL_BENE,
      options: [{ image_url: `${URL_BENE}?t=9` }],
      externe: "https://images.unsplash.com/x.jpg",
      pas_copiee: URL_BENE.replace("photo.png", "jamais.png"),
    },
    map,
  ) as Record<string, any>;

  assert.equal(sortie.cover_image_url.includes("/client-uid/photo.png"), true);
  assert.equal(sortie.cover_image_url.includes("bene-uid"), false);
  // La query survit au remplacement.
  assert.equal(sortie.options[0].image_url.endsWith("?t=9"), true);
  assert.equal(sortie.externe, "https://images.unsplash.com/x.jpg");
  // Une image dont la copie a échoué garde SON adresse : elle s'affiche
  // encore, et un carré vide serait pire.
  assert.equal(sortie.pas_copiee.includes("bene-uid"), true);
});

test("sans aucune copie reussie, rien n'est reecrit", () => {
  const entree = { cover_image_url: URL_BENE };
  assert.equal(reecrireImages(entree, new Map()), entree);
});
