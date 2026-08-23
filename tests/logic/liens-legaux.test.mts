// tests/logic/liens-legaux.test.mts
//
// UN LIEN LÉGAL NE FAIT JAMAIS QUITTER LA PAGE.
//
// Béné, 24 août 2026 : "pour toutes les pages créées dans Tiquiz et
// Tipote : un lien vers la politique de confi etc. doit s'ouvrir dans un
// nouvel onglet et JAMAIS faire quitter la page à un visiteur !!
// D'autant que sur le quiz, la personne doit tout recommencer suivant
// les situations... c'est infernal et le genre de choses pratiques
// auxquelles tu dois penser. Je ne sais pas quand ça a sauté mais en
// tous cas je l'ai demandé et ça a été codé, puis retiré."
//
// **Ça n'avait pas sauté : ça n'avait jamais été posé pour les liens
// écrits par les créatrices.** Le code DISAIT le faire. `sanitizeRichText`
// portait `ADD_ATTR: ["target"]` sous le commentaire "Force links to open
// safely", et `ADD_ATTR` ne fait qu'AUTORISER l'attribut à survivre au
// nettoyage : il n'en ajoute aucun. Un lien posé dans un champ riche
// (consentement, page de résultat, bouton, pied de page) sortait donc
// sans `target`, donc dans le même onglet. Le visiteur à la question 7
// qui va lire la politique de confidentialité perdait ses réponses, et
// il ne revenait pas : c'est juste avant de laisser son email.
//
// Ce test tient les DEUX moitiés, parce qu'une seule ne protège rien :
// - le SANITIZER, pour tout lien écrit par une créatrice (c'est du
//   comportement, pas de la relecture de source : on sanitise vraiment) ;
// - les liens légaux ÉCRITS EN DUR par nous, dans les écrans où la
//   personne a déjà commencé quelque chose (saisie, quiz, ticket).
//
// Ce qui n'est PAS visé : la navigation ENTRE pages légales (le sommaire
// de `/legal`, un renvoi d'un document à l'autre). On n'y perd rien, et
// forcer un onglet à chaque clic y serait juste pénible. Un test qui crie
// pour rien finit désactivé.
//
// Le module quiz de Tiquiz est jumeau : le même test y vit.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import { sanitizeRichText } from "../../lib/richText.ts";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// ── Le sanitizer : du comportement, pas de la relecture ──────────────

describe("Le lien écrit par une créatrice s'ouvre dans un nouvel onglet", () => {
  test("lien absolu", () => {
    const out = sanitizeRichText('<p>Voir la <a href="https://exemple.fr/confidentialite">politique</a></p>');
    assert.match(out, /target="_blank"/);
    assert.match(out, /rel="noopener noreferrer"/);
  });

  test("lien relatif (une page à nous)", () => {
    const out = sanitizeRichText('<a href="/legal/privacy">Confidentialité</a>');
    assert.match(out, /target="_blank"/);
    assert.match(out, /rel="noopener noreferrer"/);
  });

  test("un target=_self déjà écrit ne gagne pas", () => {
    // Un contentEditable, un copier-coller depuis un autre site, un vieux
    // contenu sauvegardé : on ne fait pas confiance à ce qui arrive.
    const out = sanitizeRichText('<a href="https://exemple.fr" target="_self">ici</a>');
    assert.match(out, /target="_blank"/);
    assert.doesNotMatch(out, /target="_self"/);
  });

  test("une ancre sans href n'est pas touchée", () => {
    // `<a>` sans `href` n'est pas un lien : lui poser un `target` ne
    // ferait qu'ajouter du bruit dans le HTML sauvegardé.
    const out = sanitizeRichText("<a>texte</a>");
    assert.doesNotMatch(out, /target=/);
  });

  test("les liens mailto: et tel: aussi", () => {
    const out = sanitizeRichText('<a href="mailto:hello@tipote.com">écrire</a>');
    assert.match(out, /target="_blank"/);
  });

  test("le HOOK est la source, ADD_ATTR ne fait qu'autoriser", () => {
    // Le commentaire "Force links to open safely" posé sur ADD_ATTR a
    // coûté le retour du 24 août : on fige la présence du hook, pour que
    // le prochain qui nettoie le fichier ne le prenne pas pour un doublon.
    const src = lire("lib/richText.ts");
    assert.match(src, /addHook\(\s*"afterSanitizeAttributes"/);
  });
});

// ── Les liens légaux qu'on écrit nous-mêmes ─────────────────────────

/** Les documents légaux de Tipote vivent tous sous /legal/<slug>. */
const CHEMINS_LEGAUX = /^\/legal(\/|$)/;

/**
 * Écrans où la personne a DÉJÀ commencé quelque chose : un départ lui
 * coûte sa saisie. C'est là que la règle est non négociable.
 */
const ECRANS_A_RISQUE: readonly string[] = [
  "components/quiz/PublicQuizClient.tsx", // le visiteur au milieu du quiz
  "components/LoginForm.tsx",             // adresse et mot de passe déjà saisis
  "components/support/SupportFooter.tsx", // un message de support à moitié écrit
];

/**
 * Récupère la balise ouvrante qui contient `index`, en suivant les
 * accolades JSX : un attribut peut contenir `>` (`onClick={(e) => ...}`),
 * donc s'arrêter au premier `>` couperait la balise au mauvais endroit.
 */
function baliseAutour(src: string, index: number): { nom: string; attrs: string } | null {
  const debut = src.lastIndexOf("<", index);
  if (debut < 0) return null;
  const nom = /^<([A-Za-z][\w.]*)/.exec(src.slice(debut, index))?.[1];
  if (!nom) return null;
  let profondeur = 0;
  for (let i = debut + 1; i < src.length; i++) {
    const c = src[i];
    if (c === "{") profondeur++;
    else if (c === "}") profondeur--;
    else if (c === ">" && profondeur === 0) return { nom, attrs: src.slice(debut, i) };
  }
  return null;
}

/** Tous les liens légaux écrits en dur dans un fichier. */
function liensLegaux(src: string): { nom: string; attrs: string; href: string }[] {
  const trouves: { nom: string; attrs: string; href: string }[] = [];
  const re = /href=(?:"([^"]*)"|\{`([^`]*)`\})/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const href = m[1] ?? m[2] ?? "";
    // Un href de gabarit (`/legal/${slug}`) compte : c'est bien un
    // chemin légal, même si le slug est calculé.
    const test = href.replace(/\$\{[^}]*\}/g, "x");
    if (!CHEMINS_LEGAUX.test(test)) continue;
    const balise = baliseAutour(src, m.index);
    if (balise) trouves.push({ ...balise, href });
  }
  return trouves;
}

describe("Béné : un lien légal s'ouvre dans un nouvel onglet", () => {
  for (const fichier of ECRANS_A_RISQUE) {
    test(fichier, () => {
      const src = lire(fichier);
      for (const lien of liensLegaux(src)) {
        // `<Link>` de Next fait une navigation INTERNE : c'est exactement
        // ce qu'on ne veut pas. Le composant ne peut pas être sauvé par
        // un `target`, il doit devenir un `<a>`.
        assert.notEqual(
          lien.nom,
          "Link",
          `${fichier} : ${lien.href} passe par <Link> (navigation interne). Utiliser <a target="_blank">.`,
        );
        assert.match(
          lien.attrs,
          /target="_blank"/,
          `${fichier} : ${lien.href} n'a pas target="_blank"`,
        );
        assert.match(
          lien.attrs,
          /rel="noopener noreferrer"/,
          `${fichier} : ${lien.href} n'a pas rel="noopener noreferrer"`,
        );
      }
    });
  }

  test("les écrans surveillés portent bien des liens légaux", () => {
    // Si quelqu'un vide ces composants, la boucle ci-dessus passerait au
    // vert sans rien vérifier. Un test qui ne peut plus échouer ment.
    assert.equal(liensLegaux(lire("components/LoginForm.tsx")).length, 1);
    assert.equal(liensLegaux(lire("components/support/SupportFooter.tsx")).length, 2);
  });

  test("le centre d'aide ne renvoie pas sur une page légale inexistante", () => {
    // Les deux liens du pied de page pointaient sur
    // /legal/conditions-utilisation et /legal/politique-confidentialite,
    // absents de VALID_SLUGS : la route dynamique répondait notFound().
    // Un 404 depuis le centre d'aide, sur la page où on demande de faire
    // confiance.
    const slugs = /"([a-z-]+)"/g;
    const valides = new Set(
      [...lire("lib/legal/types.ts").matchAll(slugs)].map((m) => m[1]),
    );
    for (const lien of liensLegaux(lire("components/support/SupportFooter.tsx"))) {
      const slug = lien.href.replace("/legal/", "");
      assert.ok(valides.has(slug), `${lien.href} n'est pas un document légal existant`);
    }
  });

  test("le consentement du quiz ouvre la politique dans un nouvel onglet", () => {
    // `privacy_url` est saisie par la créatrice : elle ne passe pas par
    // CHEMINS_LEGAUX. Les trois branches de ConsentText (rich text,
    // aiguille trouvée, repli) doivent toutes porter le target.
    const src = lire("components/quiz/PublicQuizClient.tsx");
    const debut = src.indexOf("function ConsentText(");
    assert.ok(debut > 0, "ConsentText a été renommé : ce test ne regarde plus rien");
    const bloc = src.slice(debut, src.indexOf("\nfunction ", debut + 10));
    const liens = bloc.match(/href=\{ensureExternalUrl\(privacyUrl\)\}/g) ?? [];
    assert.equal(liens.length, 3, "les 3 branches de ConsentText doivent poser le lien");
    assert.equal(
      (bloc.match(/target="_blank"/g) ?? []).length,
      3,
      "chaque branche de ConsentText doit ouvrir dans un nouvel onglet",
    );
  });
});
