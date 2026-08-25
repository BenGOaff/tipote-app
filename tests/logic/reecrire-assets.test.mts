// tests/logic/reecrire-assets.test.mts
//
// LE CODE QUI RÉÉCRIT LE CONTENU DES CLIENTES.
//
// Béné, 26 août 2026 : "on ne doit JAMAIS au GRAND JAMAIS supprimer ou
// abimer ou modifier les contenus créés par les users, JAMAIS."
//
// Ce script réécrit des adresses d'images DANS des quiz en ligne. Une
// erreur ici n'est pas un bug d'affichage : c'est l'image de couverture
// d'une cliente qui disparaît de son quiz public, et personne ne le voit
// avant elle. C'est le fichier de tests le plus important de la journée.

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  prefixesSupabase,
  reecrireTexte,
  reecrireValeur,
} from "../../scripts/lib/reecrireAssets.mjs";

const SUPA = "https://mmwyfqfbfkvcnrkyvagv.supabase.co";
const BASE = "https://videos.tipote.com/assets";
const PREFIXES = prefixesSupabase(SUPA, "public-assets");

/** Un dossier local qui contient exactement ces deux fichiers. */
const PRESENTS = new Set([
  "logos/abc/logo-1.webp",
  "rich-content/abc/photo de vacances.png",
]);
const regles = (manquants?: Set<string>) => ({
  prefixes: PREFIXES,
  base: BASE,
  fichierPresent: (c: string) => PRESENTS.has(c),
  manquants,
});

const pub = (chemin: string) => `${SUPA}/storage/v1/object/public/public-assets/${chemin}`;

describe("Ce qu'on réécrit", () => {
  test("une adresse simple part sur notre serveur", () => {
    assert.equal(
      reecrireTexte(pub("logos/abc/logo-1.webp"), regles()),
      `${BASE}/logos/abc/logo-1.webp`,
    );
  });

  test("dans du HTML de texte riche, au milieu du reste", () => {
    const avant = `<p>Coucou</p><img src="${pub("logos/abc/logo-1.webp")}" alt="x"><p>Fin</p>`;
    const apres = reecrireTexte(avant, regles());
    assert.match(apres, /<img src="https:\/\/videos\.tipote\.com\/assets\/logos\/abc\/logo-1\.webp"/);
    assert.match(apres, /<p>Coucou<\/p>/);
    assert.match(apres, /<p>Fin<\/p>/);
    assert.doesNotMatch(apres, /supabase/);
  });

  test("plusieurs adresses dans la même valeur", () => {
    const avant = `${pub("logos/abc/logo-1.webp")} et ${pub("logos/abc/logo-1.webp")}`;
    const apres = reecrireTexte(avant, regles());
    assert.equal(apres.split(BASE).length - 1, 2);
    assert.doesNotMatch(apres, /supabase/);
  });

  test("un chemin avec des espaces se ré-encode", () => {
    // La cliente a envoyé "photo de vacances.png". L'adresse stockée est
    // encodée ; le fichier sur disque, lui, porte les espaces.
    const avant = pub("rich-content/abc/photo%20de%20vacances.png");
    assert.equal(
      reecrireTexte(avant, regles()),
      `${BASE}/rich-content/abc/photo%20de%20vacances.png`,
    );
  });

  test("au fond d'un JSONB, objets et tableaux compris", () => {
    const avant = {
      options: [
        { label: "A", image_url: pub("logos/abc/logo-1.webp") },
        { label: "B", image_url: null },
      ],
      note: 4,
    };
    const apres = reecrireValeur(avant, regles()) as typeof avant;
    assert.equal(apres.options[0].image_url, `${BASE}/logos/abc/logo-1.webp`);
    assert.equal(apres.options[1].image_url, null);
    assert.equal(apres.note, 4);
  });
});

describe("Ce qu'on ne touche JAMAIS", () => {
  test("LE FICHIER ABSENT DE CHEZ NOUS RESTE SUR SUPABASE", () => {
    // La règle qui protège une cliente : réécrire vers un fichier qu'on
    // n'a pas, c'est une image cassée sur un quiz en ligne.
    const avant = pub("logos/abc/jamais-copie.webp");
    const manquants = new Set<string>();
    assert.equal(reecrireTexte(avant, regles(manquants)), avant);
    assert.deepEqual([...manquants], ["logos/abc/jamais-copie.webp"]);
  });

  test("un autre bucket n'est pas concerne", () => {
    const avant = `${SUPA}/storage/v1/object/public/content-images/abc/x.png`;
    assert.equal(reecrireTexte(avant, regles()), avant);
  });

  test("une adresse deja migree ne bouge plus", () => {
    const deja = `${BASE}/logos/abc/logo-1.webp`;
    assert.equal(reecrireTexte(deja, regles()), deja);
  });

  test("un texte sans aucune adresse ressort au caractere pres", () => {
    const avant = "Prêt à commencer ? Clique sur le bouton (c'est gratuit).";
    assert.equal(reecrireTexte(avant, regles()), avant);
  });

  test("les nombres, booleens et null traversent sans dommage", () => {
    assert.equal(reecrireValeur(42, regles()), 42);
    assert.equal(reecrireValeur(true, regles()), true);
    assert.equal(reecrireValeur(null, regles()), null);
  });

  test("ce qui SUIT l'adresse est conserve", () => {
    // Le piege : avaler le `&amp;` ou la balise fermante d'a cote, donc
    // casser le HTML de la cliente en croyant corriger une adresse.
    const avant = `<img src="${pub("logos/abc/logo-1.webp")}"><br>suite`;
    const apres = reecrireTexte(avant, regles());
    assert.ok(apres.endsWith('"><br>suite'), apres.slice(-30));
  });

  test("une query collee a l'adresse est conservee", () => {
    const avant = `${pub("logos/abc/logo-1.webp")}?width=800`;
    assert.equal(reecrireTexte(avant, regles()), `${BASE}/logos/abc/logo-1.webp?width=800`);
  });
});

describe("La mecanique elle meme", () => {
  test("les deux formes d'adresse publique de Supabase sont couvertes", () => {
    const p = prefixesSupabase(SUPA, "public-assets");
    assert.equal(p.length, 2);
    assert.ok(p.some((x) => x.includes("/object/public/")));
    assert.ok(p.some((x) => x.includes("/render/image/public/")));
  });

  test("`fichierPresent` est un PARAMETRE, jamais un acces disque cache", () => {
    // C'est ce qui rend cette fonction testable, et ce qui oblige
    // l'appelant a dire OU il regarde. Un module qui lirait le disque
    // lui meme ne serait teste par personne, donc pas teste du tout.
    const src = readFileSync(new URL("../../scripts/lib/reecrireAssets.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(src, /node:fs/);
  });
});

import { readFileSync } from "node:fs";
