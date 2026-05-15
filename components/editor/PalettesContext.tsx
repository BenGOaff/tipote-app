"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PaletteList } from "@/components/editor/UserPalettePicker";

// Contexte React qui propage les palettes utilisateur (chargées une
// fois par l'éditeur depuis /api/profile) vers TOUS les composants
// imbriqués qui ont besoin d'afficher des swatches user, sans avoir à
// les passer en props à chaque <RichTextEdit /> ou <ColorSwatchPicker />.
//
// Concrètement, ça permet au color picker INLINE des questions (toolbar
// du contentEditable) de surfacer la même charte que le picker global
// dans le panneau Design — sans ajouter une prop dans chaque appel.
//
// Default = tableau vide : si un composant utilise useUserPalettes()
// en dehors d'un Provider, il dégrade proprement à "pas de palettes
// custom" (la palette curée reste affichée).

const PalettesContext = createContext<PaletteList>([]);

export function UserPalettesProvider({
  palettes,
  children,
}: {
  palettes: PaletteList;
  children: ReactNode;
}) {
  // useMemo : le tableau est typiquement stable côté parent
  // (useState) ; on évite quand même les re-renders inutiles des
  // consommateurs en stabilisant la référence sur le contenu.
  const value = useMemo(() => palettes, [palettes]);
  return (
    <PalettesContext.Provider value={value}>
      {children}
    </PalettesContext.Provider>
  );
}

export function useUserPalettes(): PaletteList {
  return useContext(PalettesContext);
}
