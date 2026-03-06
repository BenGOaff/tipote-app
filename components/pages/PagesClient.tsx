// components/pages/PagesClient.tsx
// Refactored creation flow:
// Step 1: Capture or Sales
// Step 2: From existing offer or from scratch
// Generating: SSE progress
// Editor: PageBuilder

"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Plus, FileText, ShoppingCart, Trash2, Copy,
  ArrowLeft, ArrowRight, Loader2, Package, PenTool, Check, Globe,
  Users, Download, X, Eye, MousePointerClick, BarChart3,
} from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { loadAllOffers, type OfferOption, levelLabel, formatPriceRange } from "@/lib/offers";
import PageGenerateProgress, { type ProgressStep } from "./PageGenerateProgress";
import PageBuilder from "./PageBuilder";

type PageSummary = {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  status: string;
  template_id: string;
  og_image_url: string;
  views_count: number;
  leads_count: number;
  clicks_count: number;
  created_at: string;
  updated_at: string;
};

type View = "list" | "step1" | "step2" | "generating" | "edit";

export default function PagesClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [view, setView] = useState<View>("list");
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPage, setEditPage] = useState<any>(null);

  // Generate state
  const [genSteps, setGenSteps] = useState<ProgressStep[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  // Leads panel
  const [leadsPageId, setLeadsPageId] = useState<string | null>(null);
  const [leadsPageTitle, setLeadsPageTitle] = useState("");

  // Step 1: page type
  const [createType, setCreateType] = useState<"capture" | "sales" | "showcase">("capture");

  // Step 2: offer source
  const [offerSource, setOfferSource] = useState<"existing" | "scratch">("existing");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [offersLoading, setOffersLoading] = useState(false);

  // Scratch fields
  const [offerName, setOfferName] = useState("");
  const [offerPromise, setOfferPromise] = useState("");
  const [offerTarget, setOfferTarget] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerGuarantees, setOfferGuarantees] = useState("");
  const [offerUrgency, setOfferUrgency] = useState("");
  const [offerBenefits, setOfferBenefits] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [hasLogo, setHasLogo] = useState<"yes" | "no" | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>("");

  // Common fields for both existing + scratch flows
  const [offerBonuses, setOfferBonuses] = useState("");
  const [urgencyType, setUrgencyType] = useState<"none" | "places" | "date" | "custom">("none");
  const [urgencyDetail, setUrgencyDetail] = useState("");

  // Fetch pages
  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pages/list");
      const data = await res.json();
      if (data.ok) setPages(data.pages);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  // Open editor if ?edit=pageId is in the URL (after pages are loaded)
  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId && view === "list") {
      (async () => {
        try {
          const res = await fetch(`/api/pages/${editId}`);
          const data = await res.json();
          if (data.ok) { setEditPage(data.page); setView("edit"); }
        } catch { /* ignore */ }
      })();
    }
  }, [loading]);

  // Load offers when entering step2
  const loadOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const result = await loadAllOffers(supabase);
      setOffers(result);
      if (result.length > 0) {
        setSelectedOfferId(result[0].id);
        setOfferSource("existing");
      } else {
        setOfferSource("scratch");
      }
    } catch { /* ignore */ } finally {
      setOffersLoading(false);
    }
  }, [supabase]);

  // Reset create form
  const resetCreate = useCallback(() => {
    setOfferName("");
    setOfferPromise("");
    setOfferTarget("");
    setOfferPrice("");
    setOfferGuarantees("");
    setOfferUrgency("");
    setOfferBenefits("");
    setPaymentUrl("");
    setOfferBonuses("");
    setUrgencyType("none");
    setUrgencyDetail("");
    setSelectedOfferId(null);
    setHasLogo(null);
    setLogoFile(null);
    setLogoPreviewUrl("");
  }, []);

  // Go to step 2
  const goToStep2 = useCallback(() => {
    resetCreate();
    loadOffers();
    setView("step2");
  }, [resetCreate, loadOffers]);

  // Generate page via SSE
  const handleGenerate = useCallback(async () => {
    setView("generating");
    setGenSteps([]);
    setGenError(null);

    // Build payload from offer source
    const payload: Record<string, any> = { pageType: createType };

    if (offerSource === "existing" && selectedOfferId) {
      const offer = offers.find((o) => o.id === selectedOfferId);
      if (offer) {
        payload.offerName = offer.name;
        payload.offerPromise = offer.promise || "";
        payload.offerTarget = offer.target || "";
        payload.offerDescription = offer.description || "";
        const price = formatPriceRange(offer);
        if (price) payload.offerPrice = price;
        if (offer.pricing && offer.pricing.length > 0) {
          payload.offerPricing = offer.pricing;
        }
      }
    } else {
      payload.offerName = offerName;
      payload.offerPromise = offerPromise;
      payload.offerTarget = offerTarget;
      payload.offerPrice = offerPrice;
      payload.offerGuarantees = offerGuarantees;
      payload.offerUrgency = offerUrgency;
      payload.offerBenefits = offerBenefits;
      // Logo handling for from-scratch: if user has no logo, don't use branding logo
      if (hasLogo === "no") {
        payload.skipBrandLogo = true;
        payload.logoText = offerName; // Use offer name as text logo
      }
      if (hasLogo === "yes" && logoPreviewUrl) {
        payload.customLogoUrl = logoPreviewUrl;
      }
    }

    // Common fields (both existing + scratch)
    if (offerBonuses.trim()) payload.offerBonuses = offerBonuses;
    if (urgencyType !== "none") {
      const urgencyText = urgencyType === "places"
        ? `Places limitées${urgencyDetail ? ` : ${urgencyDetail}` : ""}`
        : urgencyType === "date"
        ? `Date limite${urgencyDetail ? ` : ${urgencyDetail}` : ""}`
        : urgencyDetail || "";
      if (urgencyText) payload.offerUrgency = urgencyText;
    }

    if (createType === "sales" && paymentUrl) {
      payload.paymentUrl = paymentUrl;
    }

    try {
      const res = await fetch("/api/pages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        setGenError(err.error || "Erreur serveur");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setGenError("Pas de flux SSE"); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6).trim();

            if (eventType && eventData) {
              try {
                const p = JSON.parse(eventData);

                if (eventType === "step") {
                  setGenSteps((prev) => {
                    const idx = prev.findIndex((s) => s.id === p.id);
                    if (idx >= 0) { const n = [...prev]; n[idx] = p; return n; }
                    return [...prev, p];
                  });
                }

                if (eventType === "done") {
                  const pageRes = await fetch(`/api/pages/${p.pageId}`);
                  const pageData = await pageRes.json();
                  if (pageData.ok) {
                    setEditPage(pageData.page);
                    setTimeout(() => setView("edit"), 1000);
                  }
                }

                if (eventType === "error") {
                  setGenError(p.message || "Erreur inconnue");
                }
              } catch { /* ignore */ }
              eventType = "";
              eventData = "";
            }
          }
        }
      }
    } catch (err: any) {
      setGenError(err?.message || "Erreur réseau");
    }
  }, [createType, offerSource, selectedOfferId, offers, offerName, offerPromise, offerTarget, offerPrice, offerGuarantees, offerUrgency, offerBenefits, paymentUrl]);

  // Open editor
  const handleEdit = useCallback(async (pageId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}`);
      const data = await res.json();
      if (data.ok) { setEditPage(data.page); setView("edit"); }
    } catch { /* ignore */ }
  }, []);

  // Archive page (with confirmation)
  const handleArchive = useCallback(async (pageId: string) => {
    const confirmed = window.confirm("Supprimer cette page ? Cette action est irréversible.");
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setPages((prev) => prev.filter((p) => p.id !== pageId));
      }
    } catch { /* ignore */ }
  }, []);

  // ==================== RENDER ====================

  if (view === "edit" && editPage) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 min-w-0 overflow-hidden">
            <PageBuilder
              initialPage={editPage}
              onBack={() => {
                // Clear ?edit= from URL so the useEffect doesn't reopen the editor
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("edit");
                  window.history.replaceState({}, "", url.pathname);
                }
                setView("list"); setEditPage(null); fetchPages();
              }}
            />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 max-w-6xl mx-auto">

            {/* ==================== GENERATING ==================== */}
            {view === "generating" && (
              <PageGenerateProgress steps={genSteps} error={genError} />
            )}

            {/* ==================== STEP 1: Type choice ==================== */}
            {view === "step1" && (
              <div className="max-w-lg mx-auto py-8">
                <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> Retour
                </button>

                <h1 className="text-2xl font-bold mb-2">Quel type de page ?</h1>
                <p className="text-muted-foreground mb-8">
                  Tipote crée tout : copywriting + design + hébergement.
                </p>

                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={() => { setCreateType("capture"); goToStep2(); }}
                    className="p-6 rounded-xl border-2 text-left transition-all hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Page de capture</h3>
                        <p className="text-sm text-muted-foreground">
                          Récupère des emails avec un lead magnet ou une promesse de contenu gratuit.
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">5 crédits</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>

                  <button
                    onClick={() => { setCreateType("sales"); goToStep2(); }}
                    className="p-6 rounded-xl border-2 text-left transition-all hover:border-green-400 hover:bg-green-50/50 dark:hover:bg-green-950/20 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                        <ShoppingCart className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Page de vente</h3>
                        <p className="text-sm text-muted-foreground">
                          Vends ton offre avec une page de vente optimisée pour la conversion.
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">7 crédits</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>

                  <button
                    onClick={() => { setCreateType("showcase"); goToStep2(); }}
                    className="p-6 rounded-xl border-2 text-left transition-all hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                        <Globe className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Site vitrine</h3>
                        <p className="text-sm text-muted-foreground">
                          Présente ton activité, tes services et redirige vers un RDV, formulaire ou essai gratuit.
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">7 crédits</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ==================== STEP 2: Offer source ==================== */}
            {view === "step2" && (
              <div className="max-w-xl mx-auto py-8">
                <button onClick={() => setView("step1")} className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> Retour
                </button>

                <h1 className="text-2xl font-bold mb-2">
                  {createType === "capture" ? "Page de capture" : createType === "showcase" ? "Site vitrine" : "Page de vente"}
                </h1>
                <p className="text-muted-foreground mb-6">
                  Tipote utilise automatiquement ton branding, ton ton de voix et tes mentions légales.
                </p>

                {offersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Source toggle */}
                    {offers.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                        <button
                          onClick={() => setOfferSource("existing")}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            offerSource === "existing" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Package className="w-5 h-5 mb-1.5 text-primary" />
                          <h3 className="font-semibold text-sm">Offre existante</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">Les infos sont déjà prêtes</p>
                        </button>
                        <button
                          onClick={() => setOfferSource("scratch")}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            offerSource === "scratch" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <PenTool className="w-5 h-5 mb-1.5 text-primary" />
                          <h3 className="font-semibold text-sm">De zéro</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">Je donne les infos moi-même</p>
                        </button>
                      </div>
                    )}

                    {/* Existing offer selector */}
                    {offerSource === "existing" && offers.length > 0 && (
                      <div className="space-y-3 mb-6">
                        {offers.map((offer) => (
                          <button
                            key={offer.id}
                            onClick={() => setSelectedOfferId(offer.id)}
                            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                              selectedOfferId === offer.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-sm">{offer.name}</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {levelLabel(offer.level)}
                                  {formatPriceRange(offer) && ` \u00B7 ${formatPriceRange(offer)}`}
                                </p>
                              </div>
                              {selectedOfferId === offer.id && (
                                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                          </button>
                        ))}

                        {/* Payment URL for sales */}
                        {createType === "sales" && (
                          <div className="pt-2">
                            <label className="text-sm font-medium block mb-1">Lien de paiement (optionnel)</label>
                            <input
                              type="url"
                              value={paymentUrl}
                              onChange={(e) => setPaymentUrl(e.target.value)}
                              placeholder="https://checkout.stripe.com/..."
                              className="w-full px-3 py-2.5 border rounded-lg text-sm"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Scratch form */}
                    {offerSource === "scratch" && (
                      <div className="space-y-4 mb-6">
                        <div>
                          <label className="text-sm font-medium block mb-1">Nom de l&apos;offre *</label>
                          <input
                            type="text"
                            value={offerName}
                            onChange={(e) => setOfferName(e.target.value)}
                            placeholder="Ex: Formation 'Booste tes ventes'"
                            className="w-full px-3 py-2.5 border rounded-lg text-sm"
                          />
                        </div>

                        {/* Logo question */}
                        <div>
                          <label className="text-sm font-medium block mb-1.5">As-tu un logo pour cette offre ?</label>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <button
                              type="button"
                              onClick={() => setHasLogo("yes")}
                              className={`px-3 py-2 rounded-lg text-xs border transition-all ${
                                hasLogo === "yes" ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/50"
                              }`}
                            >
                              Oui, j&apos;ai un logo
                            </button>
                            <button
                              type="button"
                              onClick={() => { setHasLogo("no"); setLogoFile(null); setLogoPreviewUrl(""); }}
                              className={`px-3 py-2 rounded-lg text-xs border transition-all ${
                                hasLogo === "no" ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/50"
                              }`}
                            >
                              Non, pas de logo
                            </button>
                          </div>
                          {hasLogo === "yes" && (
                            <div>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setLogoFile(file);
                                  // Upload immediately
                                  const formData = new FormData();
                                  formData.append("file", file);
                                  formData.append("contentId", `scratch-logo-${Date.now()}`);
                                  try {
                                    const res = await fetch("/api/upload/image", { method: "POST", body: formData });
                                    const data = await res.json();
                                    if (data.ok && data.url) setLogoPreviewUrl(data.url);
                                  } catch { /* ignore */ }
                                }}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                              />
                              {logoPreviewUrl && (
                                <div className="mt-2 flex items-center gap-2">
                                  <img src={logoPreviewUrl} alt="Logo" className="h-8 w-auto rounded" />
                                  <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Logo uploadé</span>
                                </div>
                              )}
                            </div>
                          )}
                          {hasLogo === "no" && (
                            <p className="text-[10px] text-muted-foreground">
                              Le nom de l&apos;offre sera utilisé à la place du logo.
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="text-sm font-medium block mb-1">Promesse principale *</label>
                          <input
                            type="text"
                            value={offerPromise}
                            onChange={(e) => setOfferPromise(e.target.value)}
                            placeholder="Ex: Double tes revenus en 90 jours"
                            className="w-full px-3 py-2.5 border rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-sm font-medium block mb-1">Public cible *</label>
                          <input
                            type="text"
                            value={offerTarget}
                            onChange={(e) => setOfferTarget(e.target.value)}
                            placeholder="Ex: Coachs et consultants qui veulent scaler"
                            className="w-full px-3 py-2.5 border rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-sm font-medium block mb-1">5 bénéfices concrets</label>
                          <textarea
                            value={offerBenefits}
                            onChange={(e) => setOfferBenefits(e.target.value)}
                            placeholder={"1. Génère tes premiers clients en 7 jours\n2. Automatise ton tunnel de vente\n3. ..."}
                            rows={4}
                            className="w-full px-3 py-2.5 border rounded-lg text-sm resize-none"
                          />
                        </div>

                        {createType === "sales" && (
                          <>
                            <div>
                              <label className="text-sm font-medium block mb-1">Prix</label>
                              <input
                                type="text"
                                value={offerPrice}
                                onChange={(e) => setOfferPrice(e.target.value)}
                                placeholder="Ex: 497\u20AC"
                                className="w-full px-3 py-2.5 border rounded-lg text-sm"
                              />
                            </div>

                            <div>
                              <label className="text-sm font-medium block mb-1">Garanties</label>
                              <input
                                type="text"
                                value={offerGuarantees}
                                onChange={(e) => setOfferGuarantees(e.target.value)}
                                placeholder="Ex: Satisfait ou remboursé 30 jours"
                                className="w-full px-3 py-2.5 border rounded-lg text-sm"
                              />
                            </div>

                            <div>
                              <label className="text-sm font-medium block mb-1">Lien de paiement</label>
                              <input
                                type="url"
                                value={paymentUrl}
                                onChange={(e) => setPaymentUrl(e.target.value)}
                                placeholder="https://checkout.stripe.com/..."
                                className="w-full px-3 py-2.5 border rounded-lg text-sm"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Common options: urgency + bonuses */}
                    <div className="space-y-4 mb-6 p-4 border rounded-xl bg-muted/30">
                      <h3 className="text-sm font-semibold">Options avancées</h3>

                      {/* Urgency */}
                      <div>
                        <label className="text-sm font-medium block mb-1.5">Urgence</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                          {([
                            { v: "none" as const, l: "Aucune" },
                            { v: "places" as const, l: "Places limitées" },
                            { v: "date" as const, l: "Date limite" },
                            { v: "custom" as const, l: "Autre" },
                          ]).map(({ v, l }) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setUrgencyType(v)}
                              className={`px-3 py-2 rounded-lg text-xs border transition-all ${
                                urgencyType === v ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/50"
                              }`}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                        {urgencyType !== "none" && (
                          <input
                            type="text"
                            value={urgencyDetail}
                            onChange={(e) => setUrgencyDetail(e.target.value)}
                            placeholder={
                              urgencyType === "places" ? "Ex: 50 places" :
                              urgencyType === "date" ? "Ex: 15 mars 2026" :
                              "Ex: Offre flash 48h"
                            }
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                        )}
                      </div>

                      {/* Bonuses */}
                      <div>
                        <label className="text-sm font-medium block mb-1">Bonus inclus (optionnel)</label>
                        <textarea
                          value={offerBonuses}
                          onChange={(e) => setOfferBonuses(e.target.value)}
                          placeholder={"Si tu as des bonus, liste-les ici :\n1. Accès communauté privée\n2. Templates offerts\n\nSi pas de bonus, laisse vide."}
                          rows={3}
                          className="w-full px-3 py-2.5 border rounded-lg text-sm resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Pas de bonus ? Laisse vide et la section bonus ne sera pas générée.
                        </p>
                      </div>
                    </div>

                    {/* Generate button */}
                    <button
                      onClick={handleGenerate}
                      disabled={offerSource === "scratch" && !offerName.trim()}
                      className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer ma page ({createType === "capture" ? "5 crédits" : "7 crédits"})
                    </button>

                    <p className="text-xs text-muted-foreground text-center mt-3">
                      Tu pourras modifier chaque détail ensuite.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ==================== LIST ==================== */}
            {view === "list" && (
              <>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h1 className="text-3xl font-display font-bold mb-1">Mes pages</h1>
                    <p className="text-muted-foreground">Crée et héberge tes pages de capture et de vente.</p>
                  </div>
                  <button
                    onClick={() => setView("step1")}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Nouvelle page
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pages.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-lg font-semibold mb-2">Aucune page</h2>
                    <p className="text-muted-foreground mb-6">Crée ta première page de capture ou de vente en un clic.</p>
                    <button
                      onClick={() => setView("step1")}
                      className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium"
                    >
                      Créer ma première page
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pages.map((p) => (
                      <PageCard
                        key={p.id}
                        page={p}
                        onEdit={() => handleEdit(p.id)}
                        onArchive={() => handleArchive(p.id)}
                        onLeads={() => { setLeadsPageId(p.id); setLeadsPageTitle(p.title || "Sans titre"); }}
                      />
                    ))}
                  </div>
                )}

                {/* Global stats summary */}
                {pages.length > 0 && (
                  <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="border rounded-xl p-4 text-center bg-card">
                      <Eye className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-2xl font-bold">{pages.reduce((s, p) => s + (p.views_count || 0), 0)}</div>
                      <div className="text-xs text-muted-foreground">Vues totales</div>
                    </div>
                    <div className="border rounded-xl p-4 text-center bg-card">
                      <MousePointerClick className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-2xl font-bold">{pages.reduce((s, p) => s + (p.clicks_count || 0), 0)}</div>
                      <div className="text-xs text-muted-foreground">Clics totaux</div>
                    </div>
                    <div className="border rounded-xl p-4 text-center bg-card">
                      <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-2xl font-bold">{pages.reduce((s, p) => s + (p.leads_count || 0), 0)}</div>
                      <div className="text-xs text-muted-foreground">Leads totaux</div>
                    </div>
                    <div className="border rounded-xl p-4 text-center bg-card">
                      <BarChart3 className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-2xl font-bold">
                        {(() => {
                          const totalViews = pages.reduce((s, p) => s + (p.views_count || 0), 0);
                          const totalLeads = pages.reduce((s, p) => s + (p.leads_count || 0), 0);
                          return totalViews > 0 ? ((totalLeads / totalViews) * 100).toFixed(1) + "%" : "—";
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground">Conversion moy.</div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Leads panel modal */}
            {leadsPageId && (
              <LeadsPanel
                pageId={leadsPageId}
                pageTitle={leadsPageTitle}
                onClose={() => setLeadsPageId(null)}
              />
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

// ---------- Page card ----------

function PageCard({ page, onEdit, onArchive, onLeads }: { page: PageSummary; onEdit: () => void; onArchive: () => void; onLeads: () => void }) {
  const [copied, setCopied] = useState(false);
  const isPublished = page.status === "published";

  const copyUrl = () => {
    navigator.clipboard.writeText(`${window.location.origin}/p/${page.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-xl p-4 hover:shadow-md transition-shadow bg-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {page.page_type === "capture" ? (
            <FileText className="w-4 h-4 text-blue-600" />
          ) : page.page_type === "showcase" ? (
            <Globe className="w-4 h-4 text-purple-600" />
          ) : (
            <ShoppingCart className="w-4 h-4 text-green-600" />
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isPublished ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
          }`}>
            {isPublished ? "En ligne" : "Brouillon"}
          </span>
        </div>
      </div>

      <h3
        className="font-semibold text-sm mb-1 truncate cursor-pointer hover:text-primary"
        onClick={onEdit}
      >
        {page.title || "Sans titre"}
      </h3>

      <p className="text-xs text-muted-foreground mb-3">
        {page.views_count} vues &middot; {page.clicks_count || 0} clics &middot; {page.leads_count} leads
        {page.views_count > 0 && (
          <span className="ml-1 font-medium text-primary">
            &middot; {((page.leads_count / page.views_count) * 100).toFixed(1)}%
          </span>
        )}
      </p>

      <div className="flex items-center gap-2">
        <button onClick={onEdit} className="flex-1 py-1.5 text-xs border rounded-md hover:bg-muted font-medium">
          Modifier
        </button>
        {page.leads_count > 0 && (
          <button onClick={onLeads} className="p-1.5 border rounded-md hover:bg-muted" title="Voir les leads">
            <Users className="w-3.5 h-3.5 text-blue-600" />
          </button>
        )}
        {isPublished && (
          <button onClick={copyUrl} className="p-1.5 border rounded-md hover:bg-muted" title="Copier le lien">
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
        <button onClick={onArchive} className="p-1.5 border rounded-md hover:bg-muted text-destructive" title="Supprimer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------- Leads panel ----------

type Lead = {
  id: string;
  email: string;
  first_name: string;
  phone: string;
  sio_synced: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  referrer: string;
  created_at: string;
};

function LeadsPanel({ pageId, pageTitle, onClose }: { pageId: string; pageTitle: string; onClose: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pages/${pageId}/leads`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setLeads(d.leads || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pageId]);

  const exportCsv = () => {
    window.open(`/api/pages/${pageId}/leads?format=csv`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Leads &mdash; {pageTitle}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{leads.length} contact{leads.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {leads.length > 0 && (
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                Exporter CSV
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Aucun lead pour cette page.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Email</th>
                    <th className="pb-2 pr-3 font-medium">Prénom</th>
                    <th className="pb-2 pr-3 font-medium">Téléphone</th>
                    <th className="pb-2 pr-3 font-medium">Source</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-3 font-medium">{lead.email}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{lead.first_name || "—"}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{lead.phone || "—"}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                        {lead.utm_source || lead.referrer ? (lead.utm_source || new URL(lead.referrer || "https://direct").hostname) : "Direct"}
                      </td>
                      <td className="py-2.5 text-muted-foreground text-xs">
                        {lead.created_at ? new Date(lead.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
