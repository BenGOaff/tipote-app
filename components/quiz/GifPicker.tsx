"use client";

// Bouton "GIF" + sélecteur Tenor, réutilisable pour la couverture du quiz/sondage
// ET pour l'image d'un résultat. La clé Tenor reste serveur (proxy /api/gifs/search) ;
// ici on ne fait que chercher + afficher + renvoyer l'URL du GIF choisi via onPick.
//
// Attribution : Tenor impose d'afficher "Powered by Tenor" (cf. règles d'usage).
// Si la clé n'est pas configurée (503 not_configured), on affiche un message
// clair invitant à ajouter TENOR_API_KEY plutôt que de planter.

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Gif = {
  id: string;
  url: string;
  preview: string;
  width: number | null;
  height: number | null;
  description: string;
};

export function GifPickerButton({
  onPick,
  label = "GIF",
  size = "sm",
  variant = "outline",
  disabled = false,
}: {
  /** Reçoit l'URL du GIF sélectionné (à poser dans intro_image_url / result.image_url). */
  onPick: (url: string) => void;
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | "not_configured" | "generic">(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/gifs/search?q=${encodeURIComponent(q)}&limit=24`,
        { credentials: "include" },
      );
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        setError(body?.reason === "not_configured" ? "not_configured" : "generic");
        setGifs([]);
        return;
      }
      if (!res.ok) {
        setError("generic");
        setGifs([]);
        return;
      }
      const body = await res.json();
      setGifs(Array.isArray(body?.gifs) ? body.gifs : []);
    } catch {
      setError("generic");
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Ouverture → tendances. Saisie → recherche debouncée (350ms).
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, search]);

  function pick(url: string) {
    onPick(url);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Film className="h-4 w-4 mr-1.5" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choisir un GIF</DialogTitle>
            <DialogDescription>
              Recherche un GIF de qualité à utiliser comme couverture ou illustration.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un GIF…"
              className="pl-9"
            />
          </div>

          {error === "not_configured" ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              La bibliothèque de GIFs n&apos;est pas encore activée.
              <br />
              <span className="text-xs">
                Ajoute la variable d&apos;environnement <code>TENOR_API_KEY</code> pour l&apos;activer.
              </span>
            </div>
          ) : error === "generic" ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Recherche indisponible pour le moment. Réessaie dans un instant.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto p-0.5">
              {loading && gifs.length === 0 ? (
                <div className="col-span-3 flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : gifs.length === 0 ? (
                <div className="col-span-3 py-10 text-center text-sm text-muted-foreground">
                  Aucun GIF trouvé. Essaie un autre mot-clé.
                </div>
              ) : (
                gifs.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pick(g.url)}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    title={g.description}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.preview}
                      alt={g.description}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                ))
              )}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/70 text-right">Powered by Tenor</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
