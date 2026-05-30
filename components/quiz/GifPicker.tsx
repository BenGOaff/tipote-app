"use client";

// Bouton "GIF" + sélecteur KLIPY, réutilisable pour la couverture du quiz/sondage
// ET pour l'image d'un résultat. La clé KLIPY reste serveur (proxy /api/gifs/search) ;
// ici on ne fait que chercher + afficher + renvoyer l'URL du GIF choisi via onPick.
// (KLIPY = alternative gratuite à Tenor, qui ferme son API en 2026.)
//
// Si la clé n'est pas configurée (503 not_configured), on affiche un message
// clair invitant à ajouter KLIPY_API_KEY plutôt que de planter.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("gifPicker");
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
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
            />
          </div>

          {error === "not_configured" ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("notConfigured")}
              <br />
              <span className="text-xs">
                {t.rich("notConfiguredHint", { code: (chunks) => <code>{chunks}</code> })}
              </span>
            </div>
          ) : error === "generic" ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("errorGeneric")}
            </div>
          ) : loading && gifs.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : gifs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("noResults")}
            </div>
          ) : (
            // Masonry en colonnes CSS : chaque GIF garde son ratio (w-full h-auto),
            // pas de superposition, lecture facile (cf. pickers Giphy/Tenor).
            <div className="columns-2 sm:columns-3 gap-2 max-h-[55vh] overflow-y-auto p-0.5 [column-fill:_balance]">
              {gifs.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => pick(g.url)}
                  className="group mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg border border-border bg-muted/40 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  title={g.description}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.preview}
                    alt={g.description}
                    loading="lazy"
                    className="block w-full h-auto transition-transform group-hover:scale-[1.03]"
                  />
                </button>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/70 text-right">Powered by KLIPY</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
