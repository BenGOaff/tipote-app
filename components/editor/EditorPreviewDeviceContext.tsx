"use client";

// components/editor/EditorPreviewDeviceContext.tsx
//
// Propage le device de preview ("mobile" / "desktop") choisi dans les
// editeurs (toggle Monitor/Smartphone des QuizDetailClient /
// SurveyDetailClient) vers les RichTextEdit imbriques. La toolbar
// font-size lit ce contexte pour appliquer la taille a la bonne CSS
// variable :
//   - device="mobile"  -> --rt-fs-m sur le wrapper .rt-field-fs
//   - device="desktop" -> --rt-fs-d
// Drame Bene 8 juin 2026 : "je veux pouvoir editer la taille mobile et
// la taille PC separement".
//
// Pattern identique a UserPalettesProvider (memoization + default value
// pour les composants utilises hors Provider).

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type EditorPreviewDevice = "mobile" | "desktop";

const EditorPreviewDeviceContext = createContext<EditorPreviewDevice>("desktop");

export function EditorPreviewDeviceProvider({
  device,
  children,
}: {
  device: EditorPreviewDevice;
  children: ReactNode;
}) {
  // useMemo stabilise la valeur quand le parent re-render pour une autre
  // raison (state du formulaire), evite des re-renders en chaine de tous
  // les RichTextEdit qui ne sont pas concernes.
  const value = useMemo(() => device, [device]);
  return (
    <EditorPreviewDeviceContext.Provider value={value}>
      {children}
    </EditorPreviewDeviceContext.Provider>
  );
}

export function useEditorPreviewDevice(): EditorPreviewDevice {
  return useContext(EditorPreviewDeviceContext);
}
