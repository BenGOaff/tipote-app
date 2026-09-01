"use client";

// components/quiz/SettingsSection.tsx
//
// UN GROUPE DE RÉGLAGES : UN TITRE, UNE PHRASE, ET ÇA SE REPLIE.
//
// Béné, 25 août 2026 : "il faudra retravailler la barre gauche de
// l'éditeur, pour les paramètres c'est un gros bordel on a tout empilé au
// fur et à mesure et ça ressemble plus à rien. [...] peut être avec des
// menus déroulants comme le design, avec des titres clairs pour savoir
// quoi trouver et où. Uniformiser la mise en page, police etc."
//
// Mesuré avant de toucher quoi que ce soit : SEPT blocs empilés dans une
// seule colonne, chacun avec son propre `<h3>` et ses propres marges.
// Rien ne disait où commençait l'un et où finissait l'autre.
//
// -- POURQUOI `<details>` ET PAS UN useState ---------------------------
//
// Aucun composant repliable n'existe dans ce dépôt, et Radix Collapsible
// n'est pas installé. Une dépendance de plus, c'est une ligne de plus
// dans `npm ci` et un risque de plus au build de production (leçon
// `pdf-parse`, 7 août). `<details>` fait exactement ça, nativement :
// clavier, lecteur d'écran, et l'état survit sans rien à gérer.
//
// -- FERMÉ PAR DÉFAUT, ET C'EST LE POINT ------------------------------
//
// "Là on se perd." Un écran qui s'ouvre sur trois titres se lit d'un coup
// d'oeil ; le même écran déplié est le mur d'avant. `ouvertParDefaut`
// existe pour le groupe qu'on veut voir tout de suite, pas pour en ouvrir
// trois.
//
// -- LA MISE EN PAGE VIT ICI, PAS DANS L'APPELANT ---------------------
//
// Taille de titre, graisse, couleur de la phrase d'aide, espacement :
// tout est écrit UNE fois. C'est la seule façon d'obtenir "uniformiser la
// mise en page" et de la garder : sept blocs qui portent chacun leurs
// classes finissent toujours par diverger, et c'est très exactement ce
// qu'elle décrit.

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface SettingsSectionProps {
  /** Le titre du groupe. Court, et il dit ce qu'on trouve dedans. */
  titre: string;
  /** Une phrase sous le titre, ou rien. */
  aide?: string | null;
  /** Le groupe qu'on veut voir ouvert en arrivant. Un seul. */
  ouvertParDefaut?: boolean;
  children: ReactNode;
}

export function SettingsSection({
  titre,
  aide,
  ouvertParDefaut = false,
  children,
}: SettingsSectionProps) {
  return (
    <details
      open={ouvertParDefaut}
      className="group rounded-lg border border-border bg-background/40 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">{titre}</span>
          {aide ? (
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{aide}</span>
          ) : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      {/* `space-y-5` ici et nulle part ailleurs : le rythme vertical entre
          deux réglages d'un même groupe est une décision de mise en page,
          pas de contenu. */}
      <div className="space-y-5 border-t border-border/60 px-3 py-3.5">{children}</div>
    </details>
  );
}
