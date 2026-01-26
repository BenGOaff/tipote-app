"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type PyramidOfferLite = {
  id: string;
  name: string | null;
  level?: string | null;
  promise?: string | null;
  description?: string | null;
  price_min?: string | number | null;
  price_max?: string | number | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  updated_at?: string | null;
};

interface FunnelFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;

  // Offres issues de la pyramide (optionnel)
  pyramidOffers?: PyramidOfferLite[] | null;
  pyramidLeadMagnet?: PyramidOfferLite | null;
  pyramidPaidOffer?: PyramidOfferLite | null;
}

type FunnelPage = "capture" | "sales";
type FunnelMode = "from_pyramid" | "from_scratch";

function isLeadMagnetLevel(level: string | null | undefined) {
  const s = String(level ?? "").toLowerCase();
  return s.includes("lead") || s.includes("free") || s.includes("gratuit");
}

function formatOfferLabel(o: PyramidOfferLite) {
  const name = (o.name ?? "").trim() || "Offre";
  const level = (o.level ?? "").trim();
  const price =
    o.price_min || o.price_max
      ? ` — ${String(o.price_min ?? "").trim()}${o.price_max ? `-${String(o.price_max).trim()}` : ""}€`
      : "";
  return `${name}${level ? ` (${level})` : ""}${price}`;
}

export function FunnelForm({
  onGenerate,
  onSave,
  onClose,
  isGenerating,
  isSaving,
  pyramidOffers,
  pyramidLeadMagnet,
  pyramidPaidOffer,
}: FunnelFormProps) {
  const { toast } = useToast();

  const [page, setPage] = useState<FunnelPage>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");

  // from pyramid
  const [offerId, setOfferId] = useState<string>("");

  // from scratch
  const [name, setName] = useState("");
  const [promise, setPromise] = useState("");
  const [target, setTarget] = useState("");
  const [price, setPrice] = useState("");
  const [urgency, setUrgency] = useState("");
  const [guarantee, setGuarantee] = useState("");

  const [title, setTitle] = useState("");
  const [generated, setGenerated] = useState("");

  const offersForPage = useMemo(() => {
    const list = (pyramidOffers ?? []).slice();
    if (!list.length) return [];
    return page === "capture"
      ? list.filter((o) => isLeadMagnetLevel(o.level ?? null))
      : list.filter((o) => !isLeadMagnetLevel(o.level ?? null));
  }, [pyramidOffers, page]);

  useEffect(() => {
    if (mode !== "from_pyramid") return;
    if (page === "capture") {
      const preferred = pyramidLeadMagnet?.id || offersForPage?.[0]?.id || "";
      setOfferId(preferred);
    } else {
      const preferred = pyramidPaidOffer?.id || offersForPage?.[0]?.id || "";
      setOfferId(preferred);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, page, pyramidLeadMagnet?.id, pyramidPaidOffer?.id]);

  const handleGenerate = async () => {
    setGenerated("");

    if (!title.trim()) {
      toast({
        title: "Titre requis",
        description: "Entre un titre pour générer (et sauvegarder ensuite).",
        variant: "destructive",
      });
      return;
    }

    if (mode === "from_pyramid") {
      if (!offerId) {
        toast({
          title: "Offre requise",
          description:
            "Aucune offre trouvée dans ta pyramide. Crée une offre dans la pyramide ou passe en 'À partir de zéro'.",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!name.trim() || !promise.trim() || !target.trim()) {
        toast({
          title: "Infos manquantes",
          description: "Nom de l'offre + promesse + public cible sont requis.",
          variant: "destructive",
        });
        return;
      }

      if (page === "sales" && !price.trim()) {
        toast({
          title: "Prix requis",
          description: "Pour une page de vente, indique un prix (ou une fourchette).",
          variant: "destructive",
        });
        return;
      }
    }

    const text = await onGenerate({
      type: "funnel",
      funnelPage: page,
      funnelMode: mode,
      funnelOfferId: mode === "from_pyramid" ? offerId : undefined,
      funnelManual:
        mode === "from_scratch"
          ? {
              name: name.trim(),
              promise: promise.trim(),
              target: target.trim(),
              price: page === "sales" ? price.trim() : "",
              urgency: page === "sales" ? urgency.trim() : "",
              guarantee: page === "sales" ? guarantee.trim() : "",
            }
          : undefined,
      title: title.trim(),
    });

    setGenerated(text || "");
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Titre requis", description: "Entre un titre pour sauvegarder", variant: "destructive" });
      return;
    }
    if (!generated.trim()) {
      toast({ title: "Contenu manquant", description: "Génère un contenu avant de sauvegarder", variant: "destructive" });
      return;
    }

    await onSave({
      type: "funnel",
      title: title.trim(),
      content: generated.trim(),
      status: "draft",
    });
  };

  const handleCopy = async () => {
    const text = (generated ?? "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copié", description: "Le texte a été copié dans le presse-papiers." });
    } catch {
      toast({
        title: "Impossible de copier",
        description: "Ton navigateur a bloqué l'accès au presse-papiers.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Funnels</h2>
          <p className="text-muted-foreground">
            Génère une page de capture ou une page de vente, optimisée conversion, inspirée des ressources Tipote.
          </p>
        </div>

        <Button variant="ghost" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Type de page</Label>
            <div className="flex gap-2">
              <Button type="button" variant={page === "capture" ? "default" : "outline"} onClick={() => setPage("capture")}>
                Page de capture
              </Button>
              <Button type="button" variant={page === "sales" ? "default" : "outline"} onClick={() => setPage("sales")}>
                Page de vente
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mode de création</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={mode === "from_pyramid" ? "default" : "outline"} onClick={() => setMode("from_pyramid")}>
                À partir de la pyramide
              </Button>
              <Button type="button" variant={mode === "from_scratch" ? "default" : "outline"} onClick={() => setMode("from_scratch")}>
                À partir de zéro
              </Button>
            </div>
          </div>

          {mode === "from_pyramid" ? (
            <div className="space-y-2">
              <Label>Offre (pyramide)</Label>
              <select
                value={offerId}
                onChange={(e) => setOfferId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {offersForPage.length ? "Choisir une offre" : "Aucune offre trouvée pour ce type de page"}
                </option>
                {offersForPage.map((o) => (
                  <option key={o.id} value={o.id}>
                    {formatOfferLabel(o)}
                  </option>
                ))}
              </select>

              <p className="text-xs text-muted-foreground">
                {page === "capture"
                  ? "Tip: pour une page de capture, on utilise ton lead magnet."
                  : "Tip: pour une page de vente, on utilise ton offre payante (middle / premium)."}
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="grid gap-2">
                <Label>Nom de l’offre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sprint Acquisition 14 jours" />
              </div>

              <div className="grid gap-2">
                <Label>Pitch (promesse principale)</Label>
                <Textarea
                  value={promise}
                  onChange={(e) => setPromise(e.target.value)}
                  placeholder="Ex: Obtenir 10 leads qualifiés en 14 jours sans pub."
                  className="min-h-[90px]"
                />
              </div>

              <div className="grid gap-2">
                <Label>Public cible</Label>
                <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Ex: Coachs B2B qui vendent en high ticket" />
              </div>

              {page === "sales" ? (
                <>
                  <div className="grid gap-2">
                    <Label>Prix</Label>
                    <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex: 997€ ou 497-997€" />
                  </div>

                  <div className="grid gap-2">
                    <Label>Urgence (optionnel)</Label>
                    <Input value={urgency} onChange={(e) => setUrgency(e.target.value)} placeholder="Ex: Offre de lancement jusqu’à dimanche / 20 places" />
                  </div>

                  <div className="grid gap-2">
                    <Label>Garantie (optionnel)</Label>
                    <Input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} placeholder="Ex: satisfait ou remboursé 14 jours" />
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Page capture - Lead Magnet" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Génération..." : "Générer"}
            </Button>
            <Button variant="outline" onClick={handleSave} disabled={isSaving || !generated.trim()}>
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Résultat</Label>
            <Button variant="outline" onClick={handleCopy} disabled={!generated.trim()}>
              Copier
            </Button>
          </div>
          <Textarea
            value={generated}
            readOnly
            placeholder="Le texte généré apparaîtra ici..."
            className="min-h-[520px] font-mono text-sm"
          />
        </div>
      </div>
    </div>
  );
}
