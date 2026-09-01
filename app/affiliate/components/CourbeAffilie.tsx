// app/affiliate/components/CourbeAffilie.tsx
//
// LA COURBE DE L'AFFILIÉ : trois séries, UN seul axe.
//
// Clics, inscrits et ventes se comptent tous en événements : ils
// partagent une unité, donc ils partagent un axe. Un deuxième axe
// donnerait deux échelles superposées sur le même dessin, et deux
// courbes qui se croisent sans que ce croisement veuille dire quoi que
// ce soit.
//
// -- POURQUOI DU SVG ÉCRIT À LA MAIN -----------------------------------
//
// Aucune dépendance : `npm ci` reste identique, la sortie standalone
// aussi, et rien de nouveau ne peut casser en production sans casser en
// local (leçon `pdf-parse`, 7 août). Le rendu est fait sur le serveur,
// donc la page reste lisible sans JavaScript.
//
// -- LES COULEURS SONT VALIDÉES, PAS CHOISIES À L'OEIL -----------------
//
// Les trois teintes passent les contrôles de séparation pour les
// daltonismes (deutan et protan) sur fond clair ET sur fond sombre. Et
// la couleur n'est jamais la SEULE information : chaque série est
// nommée dans la légende, et la valeur du jour est lisible au survol.

import type { PointJour } from "@/lib/affiliate/suiviAffilie";

const COULEURS = {
  clics: "#3E63DD",
  inscrits: "#12836B",
  ventes: "#C2410C",
} as const;

/** Le jour, écrit court, dans la langue de l'affilié. */
function jourCourt(jour: string, locale: string): string {
  const t = Date.parse(`${jour}T12:00:00Z`);
  if (!Number.isFinite(t)) return jour;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(t));
}

export default function CourbeAffilie({
  points,
  locale,
  libelles,
}: {
  points: PointJour[];
  locale: string;
  libelles: { clics: string; inscrits: string; ventes: string; vide: string };
}) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">{libelles.vide}</p>;
  }

  const max = Math.max(1, ...points.map((p) => Math.max(p.clics, p.inscrits, p.ventes)));
  // Un repère haut arrondi : une graduation à 7 ou à 13 se lit mal.
  const plafond = max <= 5 ? 5 : Math.ceil(max / 5) * 5;

  const H = 160;
  const largeurJour = 100 / points.length;
  const series = [
    { cle: "clics" as const, couleur: COULEURS.clics, nom: libelles.clics },
    { cle: "inscrits" as const, couleur: COULEURS.inscrits, nom: libelles.inscrits },
    { cle: "ventes" as const, couleur: COULEURS.ventes, nom: libelles.ventes },
  ];

  // Un jour sur N en tag : au delà, les dates se chevauchent et
  // aucune n'est lisible. Le premier et le dernier sont toujours là,
  // ce sont eux qui bornent la lecture.
  const pas = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {series.map((s) => (
          <span key={s.cle} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: s.couleur }}
            />
            <span className="text-muted-foreground">{s.nom}</span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 100 ${H + 18}`}
          preserveAspectRatio="none"
          className="h-48 w-full min-w-[320px]"
          role="img"
          aria-label={`${libelles.clics}, ${libelles.inscrits}, ${libelles.ventes}`}
        >
          {/* La grille est RÉCESSIVE : elle aide à situer une hauteur,
              elle ne doit pas concurrencer les barres. */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2="100"
              y1={H - f * H}
              y2={H - f * H}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {points.map((p, i) => {
            const x0 = i * largeurJour;
            const largeurBarre = (largeurJour * 0.8) / series.length;
            const marge = largeurJour * 0.1;
            return (
              <g key={p.jour}>
                {series.map((s, k) => {
                  const v = p[s.cle];
                  const h = (v / plafond) * H;
                  return (
                    <rect
                      key={s.cle}
                      x={x0 + marge + k * largeurBarre}
                      y={H - h}
                      width={largeurBarre * 0.86}
                      height={Math.max(h, v > 0 ? 1.5 : 0)}
                      fill={s.couleur}
                      rx={0.4}
                    >
                      <title>{`${jourCourt(p.jour, locale)} : ${v} ${s.nom.toLowerCase()}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {points
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => i % pas === 0 || i === points.length - 1)
          .map(({ p }) => (
            <span key={p.jour}>{jourCourt(p.jour, locale)}</span>
          ))}
      </div>
    </div>
  );
}
