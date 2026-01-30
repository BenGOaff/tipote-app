"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AIContent } from "@/components/ui/ai-content";

import type { PyramidOfferLite } from "@/components/create/forms/_shared";
import { isLeadMagnetLevel } from "@/components/create/forms/_shared";

type FunnelPageType = "capture" | "sales";
type FunnelMode = "from_pyramid" | "from_scratch";

export type FunnelFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;

  pyramidOffers?: PyramidOfferLite[];
  pyramidLeadMagnet?: PyramidOfferLite | null;
  pyramidPaidOffer?: PyramidOfferLite | null;
};

export function FunnelForm(props: FunnelFormProps) {
  const { toast } = useToast();

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");

  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);

  // from_pyramid
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");

  // from_scratch (capture + sales)
  const [offerName, setOfferName] = useState("");
  const [pitch, setPitch] = useState("");
  const [target, setTarget] = useState("");

  // sales only
  const [price, setPrice] = useState("");
  const [urgency, setUrgency] = useState("");
  const [guarantee, setGuarantee] = useState("");

  useEffect(() => {
    setResult("");
    setShowRawEditor(false);
  }, [pageType, mode]);

  const offers = props.pyramidOffers ?? [];

  const filteredOffers = useMemo(() => {
    if (pageType === "capture") return offers.filter((o) => isLeadMagnetLevel(o.level ?? null));
    return offers.filter((o) => !isLeadMagnetLevel(o.level ?? null));
  }, [offers, pageType]);

  const defaultOfferFromProps = useMemo(() => {
    return pageType === "capture" ? props.pyramidLeadMagnet : props.pyramidPaidOffer;
  }, [pageType, props.pyramidLeadMagnet, props.pyramidPaidOffer]);

  useEffect(() => {
    if (mode !== "from_pyramid") return;

    const idFromDefault = defaultOfferFromProps?.id ?? "";
    const first = filteredOffers[0]?.id ?? "";

    setSelectedOfferId(idFromDefault || first || "");
  }, [mode, defaultOfferFromProps, filteredOffers]);

  const selectedOffer = useMemo(() => {
    const id = selectedOfferId || defaultOfferFromProps?.id || "";
    return filteredOffers.find((o) => o.id === id) ?? defaultOfferFromProps ?? null;
  }, [selectedOfferId, filteredOffers, defaultOfferFromProps]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result || "");
      toast({ title: "Copié", description: "Le texte a été copié dans le presse-papiers." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier.", variant: "destructive" });
    }
  };

  const validateScratch = (): boolean => {
    if (!offerName.trim()) {
      toast({ title: "Champ requis", description: "Nom de l'offre requis.", variant: "destructive" });
      return false;
    }
    if (!pitch.trim()) {
      toast({ title: "Champ requis", description: "Pitch (promesse) requis.", variant: "destructive" });
      return false;
    }
    if (!target.trim()) {
      toast({ title: "Champ requis", description: "Public cible requis.", variant: "destructive" });
      return false;
    }
    if (pageType === "sales") {
      if (!price.trim()) {
        toast({ title: "Champ requis", description: "Prix requis pour une page de vente.", variant: "destructive" });
        return false;
      }
      if (!urgency.trim()) {
        toast({ title: "Champ requis", description: "Urgence requise (ex: offre de lancement...).", variant: "destructive" });
        return false;
      }
      if (!guarantee.trim()) {
        toast({ title: "Champ requis", description: "Garantie requise.", variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const handleGenerate = async () => {
    setResult("");
    setShowRawEditor(false);

    if (mode === "from_pyramid") {
      if (!selectedOffer?.id) {
        toast({
          title: "Aucune offre trouvée",
          description: "Impossible d'utiliser la pyramide pour ce type de page. Passe en “À partir de zéro”.",
          variant: "destructive",
        });
        return;
      }

      const payload = {
        type: "funnel",
        funnelPageType: pageType,
        funnelMode: "from_pyramid",
        offerId: selectedOffer.id, // réutilise offerId côté API
        theme: selectedOffer.promise || selectedOffer.name || "Funnel",
      };

      const text = await props.onGenerate(payload);
      if (!text?.trim()) return;
      setResult(text);
      return;
    }

    // from_scratch
    if (!validateScratch()) return;

    const payload = {
      type: "funnel",
      funnelPageType: pageType,
      funnelMode: "from_scratch",
      theme: offerName || pitch || "Funnel",
      funnelManual: {
        name: offerName,
        pitch,
        target,
        price: pageType === "sales" ? price : undefined,
        urgency: pageType === "sales" ? urgency : undefined,
        guarantee: pageType === "sales" ? guarantee : undefined,
      },
    };

    const text = await props.onGenerate(payload);
    if (!text?.trim()) return;
    setResult(text);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Titre requis", description: "Entre un titre pour sauvegarder.", variant: "destructive" });
      return;
    }
    if (!result.trim()) {
      toast({ title: "Contenu requis", description: "Génère un contenu avant de sauvegarder.", variant: "destructive" });
      return;
    }

    await props.onSave({
      title,
      type: "funnel",
      content: result,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Funnels</h2>
          <p className="text-sm text-muted-foreground">
            Génère une page de capture ou une page de vente, optimisée conversion, inspirée des ressources Tipote.
          </p>
        </div>
        <Button variant="ghost" onClick={props.onClose}>
          ✕
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Type de page</Label>
            <Tabs value={pageType} onValueChange={(v) => setPageType(v as FunnelPageType)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="capture">Page de capture</TabsTrigger>
                <TabsTrigger value="sales">Page de vente</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label>Mode de création</Label>
            <Tabs value={mode} onValueChange={(v) => setMode(v as FunnelMode)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="from_pyramid">À partir de la pyramide</TabsTrigger>
                <TabsTrigger value="from_scratch">À partir de zéro</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mode === "from_pyramid" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Offre (pyramide)</Label>
                <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une offre..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredOffers.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name ?? "(Sans nom)"} {o.level ? `— ${o.level}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium mb-1">Résumé</div>
                {selectedOffer ? (
                  <div className="space-y-1">
                    <div>
                      <span className="font-medium">Nom :</span> {selectedOffer.name ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium">Promesse :</span> {selectedOffer.promise ?? "—"}
                    </div>
                    {pageType === "sales" ? (
                      <div>
                        <span className="font-medium">Prix :</span> {selectedOffer.price_min ?? "—"} →{" "}
                        {selectedOffer.price_max ?? "—"}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-muted-foreground">Aucune offre disponible pour ce type.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nom de l’offre</Label>
                <Input value={offerName} onChange={(e) => setOfferName(e.target.value)} placeholder="Ex: Quiz Cash Creator" />
              </div>

              <div className="space-y-2">
                <Label>Pitch (promesse principale)</Label>
                <Textarea
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  placeholder="Ex: Transforme ton audience en leads qualifiés grâce à..."
                />
              </div>

              <div className="space-y-2">
                <Label>Public cible</Label>
                <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Ex: infopreneurs, coaches..." />
              </div>

              {pageType === "sales" ? (
                <>
                  <div className="space-y-2">
                    <Label>Prix</Label>
                    <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex: 49€" />
                  </div>
                  <div className="space-y-2">
                    <Label>Urgence</Label>
                    <Input value={urgency} onChange={(e) => setUrgency(e.target.value)} placeholder="Ex: offre de lancement 72h..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Garantie</Label>
                    <Input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} placeholder="Ex: satisfait ou remboursé 14 jours" />
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Page de capture - Quiz Cash Creator" />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={props.isGenerating}>
              {props.isGenerating ? "Génération..." : "Générer"}
            </Button>
            <Button variant="secondary" onClick={handleSave} disabled={props.isSaving}>
              {props.isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Résultat</Label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRawEditor((v) => !v)}
                disabled={!result.trim()}
              >
                {showRawEditor ? "Aperçu" : "Texte brut"}
              </Button>

              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!result.trim()}>
                Copier
              </Button>
            </div>
          </div>

          {/* ✅ Aperçu “beau” (markdown) par défaut */}
          {!showRawEditor ? (
            <div className="rounded-xl border bg-background p-4 min-h-[520px]">
              <AIContent content={result} mode="auto" />
            </div>
          ) : (
            <Textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              className="min-h-[520px]"
              placeholder="Le texte généré apparaîtra ici..."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
