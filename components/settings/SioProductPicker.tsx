"use client";

// Dropdown to bind a Tipote offer to one of the user's Systeme.io
// products. Lets the user pick by name (with the SIO price next to
// it) instead of having to chase a numeric ID in the SIO admin URL.
//
// Lazy-load: we only fetch /api/sio/products the first time the user
// opens the dropdown. If they have no API key configured, we degrade
// to "Configure ta clé Systeme.io d'abord" with a link to Settings.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SioProduct {
  id: string;
  name: string;
  price?: number;
  currency?: string;
}

interface Props {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}

export function SioProductPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<SioProduct[] | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  async function ensureLoaded() {
    if (products !== null || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sio/products", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setProducts(json.products ?? []);
        setHasKey(json.hasKey === true);
      } else {
        setProducts([]);
        setHasKey(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    if (disabled) return;
    setOpen((v) => !v);
    void ensureLoaded();
  }

  const selected = products?.find((p) => p.id === value) ?? null;
  const filtered = (products ?? []).filter((p) => {
    if (!search.trim()) return true;
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="truncate">
          {selected ? (
            <>
              <span className="font-medium">{selected.name}</span>
              {selected.price ? (
                <span className="text-muted-foreground ml-2 text-xs">
                  {selected.price.toLocaleString("fr-FR")}{" "}
                  {selected.currency ?? "€"}
                </span>
              ) : null}
            </>
          ) : value ? (
            <span className="font-mono text-xs text-muted-foreground">
              ID: {value}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Pas de produit Systeme.io lié
            </span>
          )}
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-background shadow-lg max-h-72 overflow-hidden flex flex-col">
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Chargement de tes produits Systeme.io…
            </div>
          ) : hasKey === false ? (
            <div className="px-3 py-4 text-sm text-muted-foreground space-y-2">
              <p>
                Pour lier une offre à un produit Systeme.io, configure
                d&apos;abord ta clé API SIO dans les paramètres.
              </p>
              <a
                href="/settings?tab=integrations"
                className="text-primary underline text-xs"
              >
                Configurer ma clé Systeme.io →
              </a>
            </div>
          ) : (products?.length ?? 0) === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              Aucun produit trouvé sur ton compte Systeme.io. Crée
              d&apos;abord un produit dans Systeme.io, puis reviens ici.
            </div>
          ) : (
            <>
              <div className="p-2 border-b">
                <Input
                  type="search"
                  placeholder="Rechercher un produit…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto flex-1">
                {value ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 flex items-center gap-2 border-b"
                  >
                    <X className="size-3.5" />
                    Délier le produit
                  </button>
                ) : null}
                {filtered.map((p) => {
                  const isPicked = p.id === value;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center justify-between gap-2 ${
                        isPicked ? "bg-primary/5" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate ${isPicked ? "font-semibold text-primary" : ""}`}
                        >
                          {p.name}
                        </span>
                        {p.price ? (
                          <span className="block text-[11px] text-muted-foreground">
                            {p.price.toLocaleString("fr-FR")}{" "}
                            {p.currency ?? "€"} · ID {p.id}
                          </span>
                        ) : (
                          <span className="block text-[11px] text-muted-foreground">
                            ID {p.id}
                          </span>
                        )}
                      </span>
                      {isPicked ? (
                        <Check className="size-4 text-primary shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
                {filtered.length === 0 && search.trim() ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    Aucun produit ne match « {search} ».
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
