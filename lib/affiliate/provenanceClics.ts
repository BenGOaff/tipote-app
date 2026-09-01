// lib/affiliate/provenanceClics.ts
//
// D'OÙ VIENNENT VRAIMENT SES FILLEULS (Béné, 27 août 2026).
//
// "Oui je veux le canal : Youtube, email, fb, linkedin... tout ce qui
// est intéressant pour que l'affilié identifie d'où viennent vraiment
// ses affiliés et insister sur ce canal. C'est ça qui est important, on
// réfléchit toujours en terme de ce qui est utile et pas ce qui rend
// bien."
//
// -- DEUX COLONNES, PAS UNE, ET LA DISTINCTION EST TOUT ----------------
//
// La PROVENANCE est déduite du referrer (`resolveClickSource`). Elle
// existe même quand l'affilié n'a rien taggé, donc personne ne se
// retrouve devant un écran vide parce qu'il n'y a pas pensé. C'est ce
// qui répond à "YouTube ou LinkedIn ?".
//
// Le CANAL est écrit par l'affilié (`?c=story-mardi`). Il existe pour ce
// que le referrer ne peut PAS voir : une newsletter (les clients mail
// suppriment le referrer), un lien en bio, un QR code sur un flyer. Et
// il distingue deux vidéos YouTube, ce que la provenance ne saura jamais
// faire.
//
// -- UNE ADRESSE IP N'EST PAS UNE PERSONNE -----------------------------
//
// Béné : "on peut pas identifier l'IP pour identifier les visiteurs
// uniques ?" Oui, et c'est ce qu'on fait, mais le mot juste est
// APPROXIMATION, pas identité :
//
//   - une famille, un bureau, un café partagent une adresse ;
//   - un téléphone en 4G change d'adresse en marchant ;
//   - les opérateurs mobiles mettent des milliers d'abonnés derrière la
//     même adresse.
//
// On ne stocke d'ailleurs jamais l'adresse : `recordClick` en garde une
// empreinte salée, irréversible, qui sert au dédoublonnage. Compter les
// empreintes distinctes est donc gratuit et honnête, à condition que
// l'écran dise "visiteurs" et pas "personnes".
//
// **Un clic SANS empreinte compte pour un visiteur à lui seul.** Les
// fondre en un seul sous-estimerait franchement, et ce sont justement
// les clics qu'on connaît le moins bien. Leur nombre sort à part
// (`sansEmpreinte`) pour que l'écran puisse le dire au lieu de le
// noyer.

/** Une ligne de `affiliate_clicks`, réduite à ce qu'on en agrège. */
export interface LigneClic {
  source: string | null;
  channel: string | null;
  ip_hash: string | null;
}

export interface GroupeProvenance {
  /** `youtube`, `email`, `newsletter`... */
  cle: string;
  clics: number;
  visiteurs: number;
}

export interface Provenance {
  totaux: { clics: number; visiteurs: number };
  /** Déduite du referrer. Toujours renseignée. */
  parSource: GroupeProvenance[];
  /** Écrite par l'affilié. Vide tant qu'il n'tag rien. */
  parCanal: GroupeProvenance[];
  /** Clics dont on ne peut pas dire s'ils viennent de la même personne. */
  sansEmpreinte: number;
}

/** Ce qu'on affiche quand la provenance n'a pas été écrite. */
const SOURCE_INCONNUE = "direct";

function ajouter(
  index: Map<string, { clics: number; empreintes: Set<string>; anonymes: number }>,
  cle: string,
  empreinte: string | null,
) {
  const vu = index.get(cle) ?? { clics: 0, empreintes: new Set<string>(), anonymes: 0 };
  vu.clics += 1;
  if (empreinte) vu.empreintes.add(empreinte);
  else vu.anonymes += 1;
  index.set(cle, vu);
}

function sortir(
  index: Map<string, { clics: number; empreintes: Set<string>; anonymes: number }>,
): GroupeProvenance[] {
  return [...index.entries()]
    .map(([cle, v]) => ({ cle, clics: v.clics, visiteurs: v.empreintes.size + v.anonymes }))
    // Le plus gros d'abord : c'est le canal sur lequel insister, et
    // c'est la seule question que l'affilié se pose en ouvrant l'écran.
    .sort((a, b) => b.clics - a.clics || a.cle.localeCompare(b.cle));
}

/**
 * Les clics d'un affilié, rangés par provenance et par canal.
 *
 * Fonction PURE : elle prend des lignes, elle rend un tableau. La
 * lecture en base vit dans la page, comme pour `mesLiens.ts`.
 */
export function construireProvenance(lignes: readonly LigneClic[]): Provenance {
  const parSource = new Map<string, { clics: number; empreintes: Set<string>; anonymes: number }>();
  const parCanal = new Map<string, { clics: number; empreintes: Set<string>; anonymes: number }>();
  const empreintes = new Set<string>();
  let anonymes = 0;

  for (const l of lignes) {
    const empreinte = String(l.ip_hash ?? "").trim() || null;
    if (empreinte) empreintes.add(empreinte);
    else anonymes += 1;

    ajouter(parSource, String(l.source ?? "").trim() || SOURCE_INCONNUE, empreinte);
    const canal = String(l.channel ?? "").trim();
    if (canal) ajouter(parCanal, canal, empreinte);
  }

  return {
    totaux: { clics: lignes.length, visiteurs: empreintes.size + anonymes },
    parSource: sortir(parSource),
    parCanal: sortir(parCanal),
    sansEmpreinte: anonymes,
  };
}
