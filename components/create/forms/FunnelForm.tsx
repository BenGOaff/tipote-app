"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Route, X } from "lucide-react";

import type { SystemeTemplate } from "@/data/systemeTemplates";
import { FunnelModeStep } from "@/components/create/forms/funnel/FunnelModeStep";
import { FunnelTemplateStep } from "@/components/create/forms/funnel/FunnelTemplateStep";
import { FunnelConfigStep, type FunnelOfferOption, type UserField } from "@/components/create/forms/funnel/FunnelConfigStep";
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

function extractHtmlFromRenderResponse(raw: string, data: any): string {
  // /api/templates/render returns text/html on success.
  // On error, it returns JSON { ok:false, error }.
  const r = (raw ?? "").trim();
  if (r.startsWith("<")) return raw;

  const html = typeof data?.html === "string" ? data.html : "";
  if (html && html.trim()) return html;

  // Some callers might receive a JSON string that itself contains HTML
  if (typeof data === "string" && data.trim().startsWith("<")) return data;

  return "";
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

  // Schema-driven template fields
  const [templateUserFields, setTemplateUserFields] = useState<UserField[]>([]);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string>>({});
  const [templateFieldChoices, setTemplateFieldChoices] = useState<Record<string, "user" | "generate" | "remove">>({});
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);

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

  // --- Load template schema when template changes ---
  const loadTemplateSchema = useCallback(async (template: SystemeTemplate) => {
    setIsLoadingSchema(true);
    setTemplateUserFields([]);
    setTemplateFieldValues({});
    setTemplateFieldChoices({});

    try {
      const kind = template.type === "sales" ? "vente" : "capture";
      const res = await fetch("/api/templates/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, templateId: template.id }),
      });

      const data = await res.json();
      if (!data?.ok || !Array.isArray(data.userFields)) {
        return;
      }

      const fields: UserField[] = data.userFields;
      setTemplateUserFields(fields);

      // Initialize default choices based on source/fallback
      const choices: Record<string, "user" | "generate" | "remove"> = {};
      for (const f of fields) {
        if (f.source === "user") {
          choices[f.key] = "user";
        } else {
          // user_or_ai: default to "generate" unless fallback is "remove" and field is not required
          choices[f.key] = "generate";
        }
      }
      setTemplateFieldChoices(choices);
    } catch {
      // fail-open: template will still work, just without adaptive UI
    } finally {
      setIsLoadingSchema(false);
    }
  }, []);

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

  const setTemplateFieldValue = useCallback((key: string, value: string) => {
    setTemplateFieldValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setTemplateFieldChoice = useCallback((key: string, choice: "user" | "generate" | "remove") => {
    setTemplateFieldChoices((prev) => ({ ...prev, [key]: choice }));
  }, []);

  /**
   * Apply user-provided template field values to contentData.
   * This replaces the old hardcoded applyUserOverridesToContentData.
   */
  const applyUserOverridesToContentData = (cd: Record<string, any>): Record<string, any> => {
    const next = { ...(cd || {}) };

    for (const field of templateUserFields) {
      const choice = templateFieldChoices[field.key] || "generate";
      const value = (templateFieldValues[field.key] || "").trim();

      if (choice === "remove") {
        // Remove the field so <!-- IF key --> conditionals strip the section
        delete next[field.key];
        continue;
      }

      if (choice === "user" && value) {
        // User provided a value — inject it
        next[field.key] = value;
        continue;
      }

      // choice === "generate" → leave AI-generated value as-is (already in cd)
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

      const html = extractHtmlFromRenderResponse(raw, data);
      setRenderedHtml(html || "");
    } catch (e: any) {
      toast({
        title: "Erreur preview",
        description: e?.message || "Impossible de prévisualiser",
        variant: "destructive",
      });
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
    setTemplateUserFields([]);
    setTemplateFieldValues({});
    setTemplateFieldChoices({});

    if (m === "visual") {
      setStep("template");
    } else {
      setStep("config");
    }
  };

  const handlePreviewTemplate = async (t: SystemeTemplate) => {
    try {
      const kind = t.type === "sales" ? "vente" : "capture";

      const res = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          templateId: t.id,
          mode: "preview",
          contentData: {},
          brandTokens: null,
        }),
      });

      const raw = await res.text();
      const data = safeJsonParse<any>(raw);

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || raw || "Preview impossible";
        throw new Error(msg);
      }

      const html = extractHtmlFromRenderResponse(raw, data);
      const blob = new Blob([html || "<div style='padding:24px'>Aucun aperçu</div>"], {
        type: "text/html;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({
        title: "Preview indisponible",
        description: e?.message || "Impossible d'ouvrir l'aperçu",
        variant: "destructive",
      });
    }
  };

  const handleSelectTemplate = (t: SystemeTemplate) => {
    setSelectedTemplate(t);
    setFunnelPageType(t.type === "sales" ? "sales" : "capture");
    loadTemplateSchema(t);
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

        // Pass user-provided field values to the API so the AI can use them
        const userOverrides: Record<string, any> = {};
        for (const field of templateUserFields) {
          const choice = templateFieldChoices[field.key] || "generate";
          const value = (templateFieldValues[field.key] || "").trim();
          if (choice === "user" && value) {
            userOverrides[field.key] = value;
          }
        }
        if (Object.keys(userOverrides).length > 0) {
          payload.templateUserOverrides = userOverrides;
        }
      }

      const out = await onGenerate(payload);

      if (mode === "text_only") {
        setMarkdownText(out || "");
        const offerLabel = isExisting ? offers.find((o) => o.id === selectedOfferId)?.name : offerName;
        setTitle((t) =>
          t.trim()
            ? t
            : guessTitleFromOfferOrTemplate({ mode, funnelPageType, selectedTemplate: null, offerName: offerLabel })
        );
        setStep("preview");
        return;
      }

      // Visual: parse contentData JSON
      const outTrimmed = (out || "").trim();

      // Detect server-side error stored as content (e.g. "Erreur: ...")
      if (!outTrimmed || outTrimmed.startsWith("Erreur:")) {
        const errorDetail = outTrimmed.replace(/^Erreur:\s*/i, "").trim();
        toast({
          title: "Erreur de génération",
          description: errorDetail || "La génération a échoué ou le délai a expiré. Réessaye.",
          variant: "destructive",
        });
        return;
      }

      const extracted = extractTemplateContentData(outTrimmed);
      if (!extracted) {
        toast({
          title: "Réponse IA invalide",
          description: "Impossible de lire le contentData du template. Le modèle n'a peut-être pas renvoyé du JSON valide.",
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
      setTitle((t) =>
        t.trim()
          ? t
          : guessTitleFromOfferOrTemplate({ mode, funnelPageType, selectedTemplate, offerName: offerLabel })
      );

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
        markdownText: mode === "text_only" ? markdownText || "" : null,
        contentData: mode === "visual" ? contentData || null : null,
        brandTokens: mode === "visual" ? brandTokens || null : null,
        renderedHtml: mode === "visual" ? renderedHtml || null : null,
        meta: {
          offerChoice,
          selectedOfferId: selectedOfferId || null,
          manual: offerChoice === "scratch" ? { offerName, offerPromise, offerTarget, offerPrice } : null,
          urgency: urgency || null,
          guarantee: guarantee || null,
          templateFieldValues: Object.keys(templateFieldValues).length > 0 ? templateFieldValues : null,
          templateFieldChoices: Object.keys(templateFieldChoices).length > 0 ? templateFieldChoices : null,
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
      setMessages((prev) => [
        ...prev,
        { role: "user", content: message },
        {
          role: "assistant",
          content: "Pour l'instant, les itérations s'appliquent aux templates (mode page prête à l'emploi).",
        },
      ]);
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
        const msg = (data && (data.error || data.message)) || raw || "Impossible d'itérer";
        throw new Error(msg);
      }

      const nextContentData = data?.nextContentData && typeof data.nextContentData === "object" ? data.nextContentData : null;
      const nextBrandTokens = data?.nextBrandTokens && typeof data.nextBrandTokens === "object" ? data.nextBrandTokens : null;

      if (!nextContentData) throw new Error("Réponse itération invalide");

      // Keep as pending until user accepts
      setPendingContentData(nextContentData);
      setPendingBrandTokens(nextBrandTokens);

      // Render preview with pending changes (so user sees before accept)
      await renderHtmlFromContentData(nextContentData, nextBrandTokens);

      const explanation =
        typeof data?.explanation === "string"
          ? data.explanation
          : "Modification proposée. Vérifie l'aperçu, puis accepte ou refuse.";
      setMessages((prev) => [...prev, { role: "assistant", content: explanation }]);

      return explanation;
    } catch (e: any) {
      const msg = e?.message || "Erreur itération";
      setMessages((prev) => [...prev, { role: "assistant", content: `Erreur: ${msg}` }]);
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

  // ─── Step progress ────────────────────────────────────────────

  const visibleSteps =
    mode === "visual"
      ? [
          { key: "mode", label: "Format" },
          { key: "template", label: "Template" },
          { key: "config", label: "Offre" },
          { key: "preview", label: "Résultat" },
        ]
      : [
          { key: "mode", label: "Format" },
          { key: "config", label: "Offre" },
          { key: "preview", label: "Résultat" },
        ];
  const currentStepIdx = visibleSteps.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Route className="w-5 h-5" />
          Créer un Funnel
        </h2>
        <div className="flex items-center gap-3">
          {/* Progress indicator */}
          {step !== "mode" && (
            <div className="hidden sm:flex items-center gap-1 text-xs">
              {visibleSteps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1">
                  {i > 0 && <div className="w-6 h-px bg-border" />}
                  <div
                    className={`h-6 px-2.5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                      step === s.key
                        ? "bg-primary text-primary-foreground"
                        : currentStepIdx > i
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Steps */}
      {step === "mode" && <FunnelModeStep onSelectMode={handleSelectMode} />}

      {step === "template" && (
        <FunnelTemplateStep
          onBack={() => setStep("mode")}
          onSelectTemplate={handleSelectTemplate}
          onPreviewTemplate={handlePreviewTemplate}
          preselected={selectedTemplate}
        />
      )}

      {step === "config" && (
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
          templateUserFields={templateUserFields}
          templateFieldValues={templateFieldValues}
          setTemplateFieldValue={setTemplateFieldValue}
          templateFieldChoices={templateFieldChoices}
          setTemplateFieldChoice={setTemplateFieldChoice}
          isLoadingSchema={isLoadingSchema}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          onBack={() => {
            if (mode === "visual") setStep("template");
            else setStep("mode");
          }}
          creditCost={creditCost}
        />
      )}

      {step === "preview" && (
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
      )}
    </div>
  );
}