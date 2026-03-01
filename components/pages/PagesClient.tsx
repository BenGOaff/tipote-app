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
  ArrowLeft, ArrowRight, Loader2, Package, PenTool, Check,
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

  // Step 1: page type
  const [createType, setCreateType] = useState<"capture" | "sales">("capture");

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
    setSelectedOfferId(null);
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
      }
    } else {
      payload.offerName = offerName;
      payload.offerPromise = offerPromise;
      payload.offerTarget = offerTarget;
      payload.offerPrice = offerPrice;
      payload.offerGuarantees = offerGuarantees;
      payload.offerUrgency = offerUrgency;
      payload.offerBenefits = offerBenefits;
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

  // Archive page
  const handleArchive = useCallback(async (pageId: string) => {
    try {
      await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
      setPages((prev) => prev.filter((p) => p.id !== pageId));
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
              onBack={() => { setView("list"); setEditPage(null); fetchPages(); }}
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
                  {createType === "capture" ? "Page de capture" : "Page de vente"}
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
                      <div className="grid grid-cols-2 gap-3 mb-6">
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
                              <label className="text-sm font-medium block mb-1">Urgence / rareté</label>
                              <input
                                type="text"
                                value={offerUrgency}
                                onChange={(e) => setOfferUrgency(e.target.value)}
                                placeholder="Ex: Offre limitée aux 50 premiers inscrits"
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

                    {/* Generate button */}
                    <button
                      onClick={handleGenerate}
                      disabled={offerSource === "scratch" && !offerName.trim()}
                      className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer ma page ({createType === "sales" ? "7 crédits" : "5 crédits"})
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
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

// ---------- Page card ----------

function PageCard({ page, onEdit, onArchive }: { page: PageSummary; onEdit: () => void; onArchive: () => void }) {
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
        {page.views_count} vues &middot; {page.leads_count} leads
      </p>

      <div className="flex items-center gap-2">
        <button onClick={onEdit} className="flex-1 py-1.5 text-xs border rounded-md hover:bg-muted font-medium">
          Modifier
        </button>
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
