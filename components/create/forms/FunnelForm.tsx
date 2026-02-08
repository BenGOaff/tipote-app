"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { SystemeTemplate } from "@/data/systemeTemplates";
import { FunnelModeStep } from "@/components/create/forms/funnel/FunnelModeStep";
import { FunnelTemplateStep } from "@/components/create/forms/funnel/FunnelTemplateStep";
import { FunnelConfigStep, type FunnelOfferOption } from "@/components/create/forms/funnel/FunnelConfigStep";
import { FunnelPreviewStep } from "@/components/create/forms/funnel/FunnelPreviewStep";

import type { PyramidOfferLite } from "@/components/create/forms/_shared";

type FunnelPageType = "capture" | "sales";
type Mode = "visual" | "text_only";
type OfferChoice = "existing" | "scratch";

type Step = "mode" | "template" | "config" | "preview";

type ChatMessage = { role: "user" | "assistant"; content: string };

function safeJsonParse<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractTemplateContentData(raw: string): Record<string, any> | null {
  const parsed = safeJsonParse<any>(raw);
  if (!parsed || typeof parsed !== "object") return null;

  // Backend stores funnel templates as:
  // { kind: "capture"|"vente", templateId: "capture-01"/"sale-01", contentData: {...} }
  if (parsed.contentData && typeof parsed.contentData === "object") {
    return parsed.contentData as Record<string, any>;
  }

  // Backward compatible: allow raw contentData object directly.
  const maybeKeys = Object.keys(parsed);
  if (maybeKeys.length && !("kind" in parsed) && !("templateId" in parsed)) {
    return parsed as Record<string, any>;
  }

  return null;
}

function guessTitleFromOfferOrTemplate(opts: {
  mode: Mode;
  funnelPageType: FunnelPageType;
  selectedTemplate: SystemeTemplate | null;
  offerName?: string;
}): string {
  const pageLabel = opts.funnelPageType === "sales" ? "Page de vente" : "Page de capture";
  if (opts.mode === "visual" && opts.selectedTemplate?.name) return `${pageLabel} — ${opts.selectedTemplate.name}`;
  if (opts.offerName?.trim()) return `${pageLabel} — ${opts.offerName.trim()}`;
  return pageLabel;
}

export type FunnelFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
  pyramidOffers?: PyramidOfferLite[];
};

export function FunnelForm({
  onGenerate,
  onSave,
  onClose,
  isGenerating,
  isSaving,
  pyramidOffers = [],
}: FunnelFormProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("visual");

  const [selectedTemplate, setSelectedTemplate] = useState<SystemeTemplate | null>(null);

  const [funnelPageType, setFunnelPageType] = useState<FunnelPageType>("capture");

  // Offer linking
  const offers: FunnelOfferOption[] = useMemo(() => {
    return (pyramidOffers || [])
      .filter((o) => !!o?.id)
      .map((o) => ({
        id: String(o.id),
        name: String(o.name ?? "Offre").trim() || "Offre",
      }));
  }, [pyramidOffers]);

  const [offerChoice, setOfferChoice] = useState<OfferChoice>(offers.length ? "existing" : "scratch");
  const [selectedOfferId, setSelectedOfferId] = useState<string>(offers[0]?.id ?? "");

  // Manual offer fields
  const [offerName, setOfferName] = useState("");
  const [offerPromise, setOfferPromise] = useState("");
  const [offerTarget, setOfferTarget] = useState("");
  const [offerPrice, setOfferPrice] = useState("");

  const [urgency, setUrgency] = useState("");
  const [guarantee, setGuarantee] = useState("");

  // Visual extras
  const [authorName, setAuthorName] = useState("");
  const [authorPhotoUrl, setAuthorPhotoUrl] = useState("");
  const [offerMockupUrl, setOfferMockupUrl] = useState("");
  const [testimonials, setTestimonials] = useState("");

  const [legalMentionsUrl, setLegalMentionsUrl] = useState("");
  const [legalPrivacyUrl, setLegalPrivacyUrl] = useState("");
  const [legalCgvUrl, setLegalCgvUrl] = useState("");

  // Output states
  const [title, setTitle] = useState<string>("");

  const [markdownText, setMarkdownText] = useState<string>("");
  const [contentData, setContentData] = useState<Record<string, any> | null>(null);
  const [brandTokens, setBrandTokens] = useState<Record<string, any> | null>(null);

  const [renderedHtml, setRenderedHtml] = useState<string>("");

  // Iteration
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isIterating, setIsIterating] = useState(false);
  const [pendingContentData, setPendingContentData] = useState<Record<string, any> | null>(null);
  const [pendingBrandTokens, setPendingBrandTokens] = useState<Record<string, any> | null>(null);

  const hasPendingChanges = !!pendingContentData || !!pendingBrandTokens;

  useEffect(() => {
    // keep default title up to date before generation
    if (!title.trim()) {
      const fallback = guessTitleFromOfferOrTemplate({
        mode,
        funnelPageType,
        selectedTemplate,
        offerName: offerChoice === "scratch" ? offerName : offers.find((o) => o.id === selectedOfferId)?.name,
      });
      setTitle(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, funnelPageType, selectedTemplate, offerChoice, offerName, selectedOfferId]);

  useEffect(() => {
    // If user switches to sales, keep template consistent
    if (mode === "visual" && selectedTemplate) {
      const expected = funnelPageType === "sales" ? "sales" : "capture";
      if (selectedTemplate.type !== expected) {
        setSelectedTemplate(null);
      }
    }
  }, [funnelPageType, mode, selectedTemplate]);

  const creditCost = useMemo(() => {
    // MVP: funnel generation cost (align with previous defaults)
    return mode === "visual" ? 3 : 2;
  }, [mode]);

  const kitFileName = useMemo(() => {
    const base = (title || "tipote-funnel").trim().replace(/[^\w\-]+/g, "_").slice(0, 80) || "tipote-funnel";
    return `${base}.html`;
  }, [title]);

  const applyUserOverridesToContentData = (cd: Record<string, any>): Record<string, any> => {
    const next = { ...(cd || {}) };

    // Visual assets (best-effort; templates vary)
    if (authorPhotoUrl.trim()) next.about_image = authorPhotoUrl.trim();
    if (offerMockupUrl.trim()) next.benefits_image = offerMockupUrl.trim();
    if (authorName.trim()) next.target_label = authorName.trim();

    // Testimonials: if template has an array slot, we fill it
    const t = testimonials
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (t.length) {
      // Common slot name in capture kits:
      if (Array.isArray(next.benefits_list)) {
        next.benefits_list = t.slice(0, 6);
      }
      // Keep also a generic slot, in case template uses it:
      next.testimonials = t.slice(0, 6);
    }

    // Legal links (we map to footer link slots used by capture-01 kit)
    const links: Array<{ label: string; url: string }> = [];
    if (legalMentionsUrl.trim()) links.push({ label: "Mentions légales", url: legalMentionsUrl.trim() });
    if (legalPrivacyUrl.trim()) links.push({ label: "Politique de confidentialité", url: legalPrivacyUrl.trim() });
    if (funnelPageType === "sales" && legalCgvUrl.trim()) links.push({ label: "CGV", url: legalCgvUrl.trim() });

    if (links[0]) {
      next.footer_link_1_label = links[0].label;
      next.footer_link_1_url = links[0].url;
    }
    if (links[1]) {
      next.footer_link_2_label = links[1].label;
      next.footer_link_2_url = links[1].url;
    }

    return next;
  };

  const renderHtmlFromContentData = async (cd: Record<string, any>, bt?: Record<string, any> | null) => {
    try {
      if (!selectedTemplate?.id) return;

      const kind = funnelPageType === "sales" ? "vente" : "capture";
      const res = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          templateId: selectedTemplate.id,
          mode: "preview_kit",
          contentData: cd,
          brandTokens: bt ?? brandTokens ?? null,
        }),
      });

      const raw = await res.text();
      const data = safeJsonParse<any>(raw);

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || raw || "Impossible de rendre le template";
        throw new Error(msg);
      }

      const html = typeof data?.html === "string" ? data.html : typeof data === "string" ? data : "";
      setRenderedHtml(html || "");
    } catch (e: any) {
      toast({ title: "Erreur preview", description: e?.message || "Impossible de prévisualiser", variant: "destructive" });
      setRenderedHtml("");
    }
  };

  const handleSelectMode = (m: Mode) => {
    setMode(m);
    setSelectedTemplate(null);
    setContentData(null);
    setBrandTokens(null);
    setRenderedHtml("");
    setMarkdownText("");
    setMessages([]);
    setPendingBrandTokens(null);
    setPendingContentData(null);

    if (m === "visual") {
      setStep("template");
    } else {
      setStep("config");
    }
  };

  const handlePreviewTemplate = async (t: SystemeTemplate) => {
    // Preview with a minimal dummy contentData so user "voit avant de choisir"
    // We only show the base look: render with lightweight placeholder data.
    try {
      const kind = t.type === "sales" ? "vente" : "capture";
      const dummy: Record<string, any> = {
        hero_title: "Ressource gratuite",
        hero_subtitle: "VOTRE BASELINE ICI",
        hero_description: "Aperçu du template (contenu exemple).",
        benefits_title: "Bénéfices",
        benefits_list: ["Bénéfice 1", "Bénéfice 2", "Bénéfice 3"],
        footer_text: "Tipote © 2026",
        footer_link_1_label: "Mentions légales",
        footer_link_1_url: "#",
        footer_link_2_label: "Confidentialité",
        footer_link_2_url: "#",
      };

      const res = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, templateId: t.id, mode: "preview_kit", contentData: dummy, brandTokens: null }),
      });

      const raw = await res.text();
      const data = safeJsonParse<any>(raw);

      if (!res.ok) throw new Error((data && (data.error || data.message)) || raw || "Preview impossible");

      const html = typeof data?.html === "string" ? data.html : "";
      const blob = new Blob([html || "<div style='padding:24px'>Aucun aperçu</div>"], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({ title: "Preview indisponible", description: e?.message || "Impossible d’ouvrir l’aperçu", variant: "destructive" });
    }
  };

  const handleSelectTemplate = (t: SystemeTemplate) => {
    setSelectedTemplate(t);
    setFunnelPageType(t.type === "sales" ? "sales" : "capture");
    setStep("config");
  };

  const handleGenerate = async () => {
    try {
      // Build payload for API /api/content/generate (via parent onGenerate)
      const isExisting = offerChoice === "existing" && !!selectedOfferId;
      const funnelMode = isExisting ? "from_offer" : "from_scratch";

      const payload: any = {
        type: "funnel",
        funnelPage: funnelPageType,
        funnelMode,
        funnelOfferId: isExisting ? selectedOfferId : undefined,
        funnelManual: !isExisting
          ? {
              name: offerName || undefined,
              promise: offerPromise || undefined,
              target: offerTarget || undefined,
              price: offerPrice || undefined,
              urgency: urgency || undefined,
              guarantee: guarantee || undefined,
            }
          : undefined,
        urgency: urgency || undefined,
        guarantee: guarantee || undefined,
      };

      if (mode === "visual") {
        if (!selectedTemplate?.id) {
          toast({ title: "Choisis un template", variant: "destructive" });
          return;
        }
        payload.templateId = selectedTemplate.id;
        // route.ts décidera outputFormat=contentData_json via template schema auto
      }

      const out = await onGenerate(payload);

      if (mode === "text_only") {
        setMarkdownText(out || "");
        const offerLabel = isExisting
          ? offers.find((o) => o.id === selectedOfferId)?.name
          : offerName;
        setTitle((t) => (t.trim() ? t : guessTitleFromOfferOrTemplate({ mode, funnelPageType, selectedTemplate: null, offerName: offerLabel })));
        setStep("preview");
        return;
      }

      // Visual: parse contentData JSON
      const extracted = extractTemplateContentData(out || "");
      if (!extracted) {
        toast({
          title: "Réponse IA invalide",
          description: "Impossible de lire le contentData du template.",
          variant: "destructive",
        });
        return;
      }

      const merged = applyUserOverridesToContentData(extracted);
      setContentData(merged);
      setBrandTokens(null);
      setPendingContentData(null);
      setPendingBrandTokens(null);

      const offerLabel = isExisting ? offers.find((o) => o.id === selectedOfferId)?.name : offerName;
      setTitle((t) => (t.trim() ? t : guessTitleFromOfferOrTemplate({ mode, funnelPageType, selectedTemplate, offerName: offerLabel })));

      await renderHtmlFromContentData(merged, null);
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Erreur génération", description: e?.message || "Impossible de générer", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    try {
      // Save through parent handler (keeps existing content_item patterns)
      const payload: any = {
        title: title || "Funnel",
        type: "funnel",
        funnelPage: funnelPageType,
        funnelMode: offerChoice === "existing" ? "from_offer" : "from_scratch",
        templateId: mode === "visual" ? selectedTemplate?.id ?? null : null,
        outputMode: mode,
        markdownText: mode === "text_only" ? (markdownText || "") : null,
        contentData: mode === "visual" ? (contentData || null) : null,
        brandTokens: mode === "visual" ? (brandTokens || null) : null,
        renderedHtml: mode === "visual" ? (renderedHtml || null) : null,
        meta: {
          offerChoice,
          selectedOfferId: selectedOfferId || null,
          manual: offerChoice === "scratch" ? { offerName, offerPromise, offerTarget, offerPrice } : null,
          urgency: urgency || null,
          guarantee: guarantee || null,
          authorName: authorName || null,
          authorPhotoUrl: authorPhotoUrl || null,
          offerMockupUrl: offerMockupUrl || null,
          testimonials: testimonials || null,
          legalMentionsUrl: legalMentionsUrl || null,
          legalPrivacyUrl: legalPrivacyUrl || null,
          legalCgvUrl: legalCgvUrl || null,
        },
      };

      await onSave(payload);
      toast({ title: "Sauvegardé" });
    } catch (e: any) {
      toast({ title: "Erreur sauvegarde", description: e?.message || "Impossible de sauvegarder", variant: "destructive" });
    }
  };

  const handleSendIteration = async (message: string): Promise<string> => {
    if (mode !== "visual") {
      // Text-only iteration: not wired yet; keep UX but no changes.
      setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "Pour l’instant, les itérations s’appliquent aux templates (mode page prête à l’emploi)." }]);
      return "OK";
    }

    if (!contentData || !selectedTemplate?.id) return "No content";

    setIsIterating(true);
    setMessages((prev) => [...prev, { role: "user", content: message }]);

    try {
      const kind = funnelPageType === "sales" ? "vente" : "capture";

      const res = await fetch("/api/templates/iterate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          templateId: selectedTemplate.id,
          instruction: message,
          contentData,
          brandTokens,
        }),
      });

      const raw = await res.text();
      const data = safeJsonParse<any>(raw);

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || raw || "Impossible d’itérer";
        throw new Error(msg);
      }

      const nextContentData = (data?.nextContentData && typeof data.nextContentData === "object") ? data.nextContentData : null;
      const nextBrandTokens = (data?.nextBrandTokens && typeof data.nextBrandTokens === "object") ? data.nextBrandTokens : null;

      if (!nextContentData) throw new Error("Réponse itération invalide");

      // Keep as pending until user accepts
      setPendingContentData(nextContentData);
      setPendingBrandTokens(nextBrandTokens);

      // Render preview with pending changes (so user sees before accept)
      await renderHtmlFromContentData(nextContentData, nextBrandTokens);

      const explanation = typeof data?.explanation === "string" ? data.explanation : "Modification proposée. Vérifie l’aperçu, puis accepte ou refuse.";
      setMessages((prev) => [...prev, { role: "assistant", content: explanation }]);

      return explanation;
    } catch (e: any) {
      const msg = e?.message || "Erreur itération";
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ ${msg}` }]);
      toast({ title: "Erreur itération", description: msg, variant: "destructive" });
      return msg;
    } finally {
      setIsIterating(false);
    }
  };

  const handleAcceptIteration = () => {
    if (!pendingContentData && !pendingBrandTokens) return;

    const nextCd = pendingContentData ?? contentData ?? null;
    const nextBt = pendingBrandTokens ?? brandTokens ?? null;

    if (nextCd) setContentData(nextCd);
    setBrandTokens(nextBt);

    setPendingContentData(null);
    setPendingBrandTokens(null);

    toast({ title: "Modifications appliquées" });
  };

  const handleRejectIteration = async () => {
    setPendingContentData(null);
    setPendingBrandTokens(null);

    // Re-render current committed state
    if (mode === "visual" && contentData) {
      await renderHtmlFromContentData(contentData, brandTokens);
    }

    toast({ title: "Modifications refusées" });
  };

  return (
    <div className="w-full">
      <Card className="p-4 md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-base font-semibold">Funnel (Capture / Vente)</div>
            <div className="text-sm text-muted-foreground">
              Génère une page de capture ou de vente (texte ou template).
            </div>
          </div>

          <Button variant="ghost" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" />
            Fermer
          </Button>
        </div>

        {step === "mode" ? (
          <FunnelModeStep onSelectMode={handleSelectMode} />
        ) : null}

        {step === "template" ? (
          <FunnelTemplateStep
            onBack={() => setStep("mode")}
            onSelectTemplate={handleSelectTemplate}
            onPreviewTemplate={handlePreviewTemplate}
            preselected={selectedTemplate}
          />
        ) : null}

        {step === "config" ? (
          <FunnelConfigStep
            mode={mode}
            selectedTemplate={selectedTemplate}
            funnelPageType={funnelPageType}
            setFunnelPageType={setFunnelPageType}
            offers={offers}
            offerChoice={offerChoice}
            setOfferChoice={setOfferChoice}
            selectedOfferId={selectedOfferId}
            setSelectedOfferId={setSelectedOfferId}
            offerName={offerName}
            setOfferName={setOfferName}
            offerPromise={offerPromise}
            setOfferPromise={setOfferPromise}
            offerTarget={offerTarget}
            setOfferTarget={setOfferTarget}
            offerPrice={offerPrice}
            setOfferPrice={setOfferPrice}
            urgency={urgency}
            setUrgency={setUrgency}
            guarantee={guarantee}
            setGuarantee={setGuarantee}
            authorName={authorName}
            setAuthorName={setAuthorName}
            authorPhotoUrl={authorPhotoUrl}
            setAuthorPhotoUrl={setAuthorPhotoUrl}
            offerMockupUrl={offerMockupUrl}
            setOfferMockupUrl={setOfferMockupUrl}
            testimonials={testimonials}
            setTestimonials={setTestimonials}
            legalMentionsUrl={legalMentionsUrl}
            setLegalMentionsUrl={setLegalMentionsUrl}
            legalPrivacyUrl={legalPrivacyUrl}
            setLegalPrivacyUrl={setLegalPrivacyUrl}
            legalCgvUrl={legalCgvUrl}
            setLegalCgvUrl={setLegalCgvUrl}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onBack={() => {
              if (mode === "visual") setStep("template");
              else setStep("mode");
            }}
            creditCost={creditCost}
          />
        ) : null}

        {step === "preview" ? (
          <FunnelPreviewStep
            mode={mode}
            title={title}
            setTitle={setTitle}
            markdownText={markdownText}
            renderedHtml={renderedHtml}
            onSave={handleSave}
            kitFileName={kitFileName}
            messages={messages}
            isIterating={isIterating}
            hasPendingChanges={hasPendingChanges}
            onSendIteration={handleSendIteration}
            onAcceptIteration={handleAcceptIteration}
            onRejectIteration={handleRejectIteration}
            iterationCost={0.5}
            disabledChat={mode !== "visual" || !contentData}
          />
        ) : null}

        {/* Small helper modal / guidance: keep it simple for now */}
        <Dialog open={false} onOpenChange={() => null}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aide</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground">—</div>
          </DialogContent>
        </Dialog>
      </Card>

      <div className="mt-3 flex items-center justify-between">
        <Badge variant="secondary">
          {step === "mode" ? "Écran 1" : step === "template" ? "Écran 2" : step === "config" ? "Écran 3" : "Résultat"}
        </Badge>
        <div className="text-xs text-muted-foreground">
          {mode === "visual"
            ? "Mode: page prête à l’emploi"
            : "Mode: copywriting uniquement"}
        </div>
      </div>
    </div>
  );
}
