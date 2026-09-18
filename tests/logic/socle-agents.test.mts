// tests/logic/socle-agents.test.mts
//
// LE SOCLE NE REGONFLE PAS (Béné, 18 septembre 2026).
//
// "Pourquoi ma fenêtre de contexte est toujours trop pleine ? Je
// compacte encore et encore mais rien n'y fait."
//
// MESURÉ ce jour là, avant d'y toucher : `tiquiz/AGENTS.md` faisait
// 786 625 octets et `tipote-app/AGENTS.md` 279 904, soit 1 066 529
// octets (~300 000 jetons) RE-INJECTÉS avant chacun de ses messages.
// `/compact` réécrit la conversation, puis les deux fichiers sont
// recollés par-dessus dans la seconde qui suit : le plancher était au
// dessus du plafond, et compacter ne pouvait rien y faire.
//
// Le récit chronologique est parti dans `AGENTS_HISTORIQUE.md`, qui
// n'est chargé par personne et se lit à la demande. Le socle est tombé
// à 40 302 et 32 382 octets.
//
// CE TEST EXISTE PARCE QUE LA DISCIPLINE NE TIENT PAS. Ces fichiers ont
// grossi de 1 Mo parce que chaque session y ajoute son récit et n'en
// retire jamais rien. Une consigne écrite dans un fichier que personne
// ne relit est exactement le problème qu'on vient de fermer : c'est
// donc une MESURE qui le tient, et elle rougit avant le push.
//
// IL MESURE UN FAIT, PAS UNE FORMULATION. La taille d'un fichier, la
// présence d'un import, l'existence de l'historique. Le socle se
// réécrit librement tant qu'il reste court : un garde-fou qui figerait
// une tournure empêcherait de corriger la tournure, et ces dépôts l'ont
// déjà payé neuf fois.
//
// CE TEST VIT DANS LES DEUX DÉPÔTS, à l'octet près : un garde-fou qui
// ne protège qu'un des deux jumeaux ne protège personne, et ici le coût
// se paie sur la SOMME des deux fichiers, pas sur l'un des deux.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const RACINE = process.cwd();
const SOCLE = join(RACINE, "AGENTS.md");
const HISTORIQUE = join(RACINE, "AGENTS_HISTORIQUE.md");
const CLAUDE = join(RACINE, "CLAUDE.md");

// La borne laisse de la marge sur les 40 302 octets du 18 septembre
// (assez pour plusieurs règles transverses de plus) et ferme le retour
// aux 786 625. Elle se relève en connaissance de cause : chaque octet
// ajouté ici est un octet payé à CHAQUE tour, dans CHAQUE conversation.
const BORNE_SOCLE = 55_000;

test("AGENTS.md reste un socle, il ne redevient pas un journal", () => {
  assert.ok(existsSync(SOCLE), "AGENTS.md a disparu : le socle est ce que chaque session relit");

  const taille = statSync(SOCLE).size;
  assert.ok(
    taille <= BORNE_SOCLE,
    `AGENTS.md fait ${taille} octets, la borne est ${BORNE_SOCLE}. Ce fichier est ` +
      "recollé AVANT chacun des messages de Béné, dans toutes ses conversations : " +
      "ce qu'on y ajoute, elle le paie à chaque tour. Le récit d'un chantier va " +
      "dans AGENTS_HISTORIQUE.md. On ne touche au socle que pour une règle qui " +
      "s'applique à CHAQUE tour (le style, git, les migrations, les tests avant " +
      "push, l'argent, les secrets), et on retire alors ce qu'elle remplace.",
  );
});

test("le récit chronologique vit toujours à part, et il porte des sections", () => {
  assert.ok(
    existsSync(HISTORIQUE),
    "AGENTS_HISTORIQUE.md a disparu. Si quelqu'un l'a refondu dans AGENTS.md, la " +
      "fenêtre de contexte de Béné est repartie à 1 Mo par tour.",
  );

  // Un historique vidé passerait la borne du socle sans rien protéger :
  // le test dirait vert sur un fichier dont le contenu a été jeté.
  const sections = readFileSync(HISTORIQUE, "utf-8")
    .split("\n")
    .filter((l) => l.startsWith("## ")).length;
  assert.ok(
    sections >= 50,
    `AGENTS_HISTORIQUE.md ne porte plus que ${sections} sections. Rien n'a jamais ` +
      "été supprimé de ce fichier : s'il a maigri, c'est que du contenu a été perdu " +
      "ou remonté dans le socle.",
  );
});

test("CLAUDE.md n'importe QUE le socle, jamais l'historique", () => {
  if (!existsSync(CLAUDE)) return; // Pas de CLAUDE.md : rien n'est auto-chargé.

  const source = readFileSync(CLAUDE, "utf-8");
  assert.ok(
    source.includes("@AGENTS.md"),
    "CLAUDE.md n'importe plus AGENTS.md : les règles ne sont plus chargées du tout.",
  );

  // LE VRAI RISQUE DE RETOUR EN ARRIÈRE EST ICI. Un `@AGENTS_HISTORIQUE.md`
  // ajouté en croyant "finir le travail" rebranche le mégaoctet d'un
  // coup, et ça ne se voit sur AUCUN écran : la conversation se remplit
  // toute seule, exactement comme avant le 18 septembre.
  assert.ok(
    !source.includes("@AGENTS_HISTORIQUE.md"),
    "CLAUDE.md importe AGENTS_HISTORIQUE.md : tout le récit chronologique repart " +
      "dans chaque tour de conversation. L'historique se lit à la demande (grep, " +
      "sed), il ne s'importe jamais.",
  );
});
