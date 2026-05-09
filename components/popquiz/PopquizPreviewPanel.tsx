"use client";

// PopquizPreviewPanel — wrapper qui gère l'affichage de l'aperçu
// live à 3 niveaux :
//
//   • Desktop (≥ lg)  : colonne droite sticky, toujours visible
//                       pendant que l'user édite à gauche.
//   • Mobile "top"    : aperçu épinglé en haut de page, scrolle
//                       avec la zone éditeur en dessous.
//   • Mobile "drawer" : bouton flottant bottom-right qui ouvre
//                       un overlay bas-de-page avec l'aperçu.
//
// Le choix mobile est stocké dans localStorage pour respecter
// la préférence de l'user d'une session à l'autre. Par défaut
// on mise sur "drawer" : non-intrusif, l'user voit son éditeur
// pleine largeur et n'ouvre l'aperçu qu'au moment de vérifier.
//
// Les éléments mobile (`aside.top` et le drawer) ont `lg:hidden`,
// donc en desktop ils ne sont pas rendus visibly et ne prennent
// aucune cellule dans le CSS Grid parent (display:none).

import { useEffect, useState } from "react";
import { Eye, X, Pin } from "lucide-react";
import { PopquizLivePreview } from "@/components/popquiz/PopquizLivePreview";
import type { Popquiz } from "@/lib/popquiz";

type MobileMode = "drawer" | "top";
const STORAGE_KEY = "popquiz-preview-mobile-mode";

interface Props {
  popquiz: Popquiz | null;
}

export function PopquizPreviewPanel({ popquiz }: Props) {
  const [mobileMode, setMobileMode] = useState<MobileMode>("drawer");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hydrate la préférence stockée au mount. On évite la lecture
  // synchrone côté SSR pour ne pas désynchroniser l'hydratation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "top" || stored === "drawer") setMobileMode(stored);
  }, []);

  function setMode(m: MobileMode) {
    setMobileMode(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, m);
    }
  }

  const placeholder = (
    <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
      Ajoute une source vidéo pour voir l&apos;aperçu en temps réel.
    </div>
  );

  return (
    <>
      {/* Desktop : colonne sticky. Cell #2 du grid parent. */}
      <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
        {popquiz ? <PopquizLivePreview popquiz={popquiz} /> : placeholder}
      </aside>

      {/* Mobile : 2 modes au choix, persistés en localStorage. */}
      {mobileMode === "top" ? (
        <aside className="lg:hidden sticky top-0 z-20 -mx-4 mb-4 px-4 pt-2 pb-3 bg-background/95 backdrop-blur border-b">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Aperçu épinglé
            </span>
            <button
              type="button"
              onClick={() => setMode("drawer")}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Basculer en bouton flottant"
            >
              <Eye className="size-3" />
              Bouton flottant
            </button>
          </div>
          {popquiz ? <PopquizLivePreview popquiz={popquiz} /> : placeholder}
        </aside>
      ) : (
        <>
          {/* Bouton flottant — mode drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden fixed bottom-4 right-4 z-30 h-12 px-4 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-2 text-sm font-medium hover:opacity-90 transition"
            aria-label="Voir l'aperçu"
          >
            <Eye className="size-4" />
            Aperçu
          </button>

          {drawerOpen ? (
            <div className="lg:hidden fixed inset-0 z-40">
              <button
                type="button"
                aria-label="Fermer l'aperçu"
                className="absolute inset-0 bg-black/50"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 max-h-[92vh] bg-background rounded-t-xl shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="text-sm font-semibold">Aperçu</h3>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("top");
                        setDrawerOpen(false);
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
                      title="Épingler l'aperçu en haut de la page"
                    >
                      <Pin className="size-3" />
                      Épingler en haut
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(false)}
                      className="rounded-md p-1.5 hover:bg-muted"
                      aria-label="Fermer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto p-3 flex-1">
                  {popquiz ? <PopquizLivePreview popquiz={popquiz} /> : placeholder}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
