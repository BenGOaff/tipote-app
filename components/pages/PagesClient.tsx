// components/pages/PagesClient.tsx
// Refactored creation flow:
// Step 1: Capture or Sales
// Step 2: From existing offer or from scratch
// Generating: SSE progress
// Editor: PageBuilder

"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, FileText, ShoppingCart, Trash2, Copy,
  ArrowLeft, ArrowRight, Loader2, Package, PenTool, Check, Globe,
  Users, Download, X, Eye, MousePointerClick, BarChart3, Link2, Video,
} from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { PageBanner } from "@/components/PageBanner";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { loadAllOffers, type OfferOption, levelLabel, formatPriceRange } from "@/lib/offers";
import PageGenerateProgress, { type ProgressStep } from "./PageGenerateProgress";
import PageBuilder from "./PageBuilder";
import LinkinbioEditor from "./LinkinbioEditor";

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

type View = "list" | "step1" | "step2" | "generating" | "edit" | "linkinbio-edit";

export default function PagesClient({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const t = useTranslations("pages");
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
  const [offerSource, setOfferSource] = useState<"existing" | "scratch" | "event">("existing");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [offersLoading, setOffersLoading] = useState(false);

  // Event source
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

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
      // Only show user-created offers (from settings), not AI-generated strategy offers
      const userOffers = result.filter((o) => o.source !== "generated");
      setOffers(userOffers);
      if (userOffers.length > 0) {
        setSelectedOfferId(userOffers[0].id);
        setOfferSource("existing");
      } else {
        setOfferSource("scratch");
      }
    } catch { /* ignore */ } finally {
      setOffersLoading(false);
    }
  }, [supabase]);

  // Load events when "event" source is selected
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch("/api/webinars");
      const data = await res.json();
      if (data.ok) {
        // Only show upcoming/scheduled events
        const upcoming = (data.webinars || []).filter(
          (e: any) => e.status === "scheduled" || e.status === "draft"
        );
        setEvents(upcoming);
        if (upcoming.length > 0) setSelectedEventId(upcoming[0].id);
      }
    } catch { /* ignore */ } finally {
      setEventsLoading(false);
    }
  }, []);

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
    setSelectedEventId(null);
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

    if (offerSource === "event" && selectedEventId) {
      const ev = events.find((e) => e.id === selectedEventId);
      if (ev) {
        payload.eventId = ev.id;
        payload.offerName = ev.title || "";
        payload.offerDescription = ev.description || "";
        if (ev.offer_name) payload.offerPromise = ev.offer_name;
        // Inject date as urgency
        if (ev.webinar_date) {
          const d = new Date(ev.webinar_date);
          const dateStr = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
          payload.offerUrgency = ev.event_type === "challenge" && ev.end_date
            ? `Du ${dateStr} au ${new Date(ev.end_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
            : dateStr;
        }
      }
    } else if (offerSource === "existing" && selectedOfferId) {
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
  }, [createType, offerSource, selectedOfferId, offers, selectedEventId, events, offerName, offerPromise, offerTarget, offerPrice, offerGuarantees, offerUrgency, offerBenefits, paymentUrl]);

  // Open editor
  const handleEdit = useCallback(async (pageId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}`);
      const data = await res.json();
      if (data.ok) {
        setEditPage(data.page);
        setView(data.page.page_type === "linkinbio" ? "linkinbio-edit" : "edit");
      }
    } catch { /* ignore */ }
  }, []);

  // Create linkinbio page and open editor
  const [creatingLinkinbio, setCreatingLinkinbio] = useState(false);
  const handleCreateLinkinbio = useCallback(async () => {
    setCreatingLinkinbio(true);
    try {
      const res = await fetch("/api/pages/linkinbio", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.pageId) {
        // Fetch the created page and open editor
        const pageRes = await fetch(`/api/pages/${data.pageId}`);
        const pageData = await pageRes.json();
        if (pageData.ok) {
          setEditPage(pageData.page);
          setView("linkinbio-edit");
        }
      }
    } catch { /* ignore */ }
    setCreatingLinkinbio(false);
  }, []);

  // Archive page (with confirmation)
  const handleArchive = useCallback(async (pageId: string) => {
    const confirmed = window.confirm(t("confirmDelete"));
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

  const isEditorView = (view === "linkinbio-edit" || view === "edit") && editPage;

  const handleEditorBack = () => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.history.replaceState({}, "", url.pathname);
    }
    setView("list"); setEditPage(null); fetchPages();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader left={!isEditorView ? <h1 className="text-lg font-display font-bold truncate">{t("headerTitle")}</h1> : undefined} userEmail={userEmail} />

          {/* ==================== LINKINBIO EDITOR ==================== */}
          {view === "linkinbio-edit" && editPage && (
            <LinkinbioEditor initialPage={editPage} onBack={handleEditorBack} />
          )}

          {/* ==================== PAGE BUILDER EDITOR ==================== */}
          {view === "edit" && editPage && (
            <PageBuilder initialPage={editPage} onBack={handleEditorBack} />
          )}

          {/* ==================== NON-EDITOR VIEWS ==================== */}
          {!isEditorView && (
            <div className="flex-1 p-4 sm:p-5 lg:p-6">
              <div className="max-w-[1200px] mx-auto w-full space-y-5">

                <PageBanner icon={<Globe className="w-5 h-5" />} title={t("headerTitle")} subtitle="Crée et gère tes pages de capture, de vente et ton Link in Bio." />

                {/* ==================== GENERATING ==================== */}
                {view === "generating" && (
                  <PageGenerateProgress steps={genSteps} error={genError} />
                )}

                {/* ==================== STEP 1: Type choice ==================== */}
                {view === "step1" && (
                  <div className="max-w-lg mx-auto py-8">
                    <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1">
                      <ArrowLeft className="w-3.5 h-3.5" /> {t("back")}
                    </button>

                    <h1 className="text-2xl font-bold mb-2">{t("step1Title")}</h1>
                    <p className="text-muted-foreground mb-8">{t("step1Desc")}</p>

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
                            <h3 className="font-semibold mb-1">{t("typeCapture")}</h3>
                            <p className="text-sm text-muted-foreground">{t("typeCaptureDesc")}</p>
                            <p className="text-xs text-muted-foreground mt-2">{t("credits5")}</p>
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
                            <h3 className="font-semibold mb-1">{t("typeSales")}</h3>
                            <p className="text-sm text-muted-foreground">{t("typeSalesDesc")}</p>
                            <p className="text-xs text-muted-foreground mt-2">{t("credits6")}</p>
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
                            <h3 className="font-semibold mb-1">{t("typeShowcase")}</h3>
                            <p className="text-sm text-muted-foreground">{t("typeShowcaseDesc")}</p>
                            <p className="text-xs text-muted-foreground mt-2">{t("credits6")}</p>
                          </div>
                          <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>

                      <button
                        onClick={handleCreateLinkinbio}
                        disabled={creatingLinkinbio}
                        className="p-6 rounded-xl border-2 text-left transition-all hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 group"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                            {creatingLinkinbio ? <Loader2 className="w-6 h-6 text-orange-600 animate-spin" /> : <Link2 className="w-6 h-6 text-orange-600" />}
                          </div>
                          <div>
                            <h3 className="font-semibold mb-1">{t("typeLinkinbio")}</h3>
                            <p className="text-sm text-muted-foreground">{t("typeLinkinbioDesc")}</p>
                            <p className="text-xs text-muted-foreground mt-2">{t("free")}</p>
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
                      <ArrowLeft className="w-3.5 h-3.5" /> {t("back")}
                    </button>

                    <h1 className="text-2xl font-bold mb-2">
                      {createType === "capture" ? t("typeCapture") : createType === "showcase" ? t("typeShowcase") : t("typeSales")}
                    </h1>
                    <p className="text-muted-foreground mb-6">{t("step2Desc")}</p>

                    {offersLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {/* Source toggle */}
                        <div className={`grid grid-cols-1 ${offers.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3 mb-6`}>
                          {offers.length > 0 && (
                            <button
                              onClick={() => setOfferSource("existing")}
                              className={`p-4 rounded-xl border-2 text-left transition-all ${
                                offerSource === "existing" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                              }`}
                            >
                              <Package className="w-5 h-5 mb-1.5 text-primary" />
                              <h3 className="font-semibold text-sm">{t("existingOffer")}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5">{t("existingOfferDesc")}</p>
                            </button>
                          )}
                          <button
                            onClick={() => { setOfferSource("event"); loadEvents(); }}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                              offerSource === "event" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                            }`}
                          >
                            <Video className="w-5 h-5 mb-1.5 text-primary" />
                            <h3 className="font-semibold text-sm">{t("fromEvent")}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{t("fromEventDesc")}</p>
                          </button>
                          <button
                            onClick={() => setOfferSource("scratch")}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                              offerSource === "scratch" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                            }`}
                          >
                            <PenTool className="w-5 h-5 mb-1.5 text-primary" />
                            <h3 className="font-semibold text-sm">{t("fromScratch")}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{t("fromScratchDesc")}</p>
                          </button>
                        </div>

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
                                <label className="text-sm font-medium block mb-1">{t("paymentLinkOptional")}</label>
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

                        {/* Event selector */}
                        {offerSource === "event" && (
                          <div className="space-y-3 mb-6">
                            {eventsLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : events.length === 0 ? (
                              <div className="text-center py-8 text-sm text-muted-foreground">
                                {t("noEvents")}
                              </div>
                            ) : (
                              events.map((ev) => (
                                <button
                                  key={ev.id}
                                  onClick={() => setSelectedEventId(ev.id)}
                                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                                    selectedEventId === ev.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h4 className="font-medium text-sm">{ev.title}</h4>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {ev.event_type === "challenge" ? "Challenge" : "Webinaire"}
                                        {ev.webinar_date && ` · ${new Date(ev.webinar_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
                                        {ev.event_type === "challenge" && ev.end_date && ` → ${new Date(ev.end_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
                                      </p>
                                    </div>
                                    {selectedEventId === ev.id && (
                                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                        <Check className="w-3 h-3 text-primary-foreground" />
                                      </div>
                                    )}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}

                        {/* Scratch form */}
                        {offerSource === "scratch" && (
                          <div className="space-y-4 mb-6">
                            <div>
                              <label className="text-sm font-medium block mb-1">{t("offerName")} *</label>
                              <input
                                type="text"
                                value={offerName}
                                onChange={(e) => setOfferName(e.target.value)}
                                placeholder={t("offerNamePlaceholder")}
                                className="w-full px-3 py-2.5 border rounded-lg text-sm"
                              />
                            </div>

                            {/* Logo question */}
                            <div>
                              <label className="text-sm font-medium block mb-1.5">{t("hasLogo")}</label>
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <button
                                  type="button"
                                  onClick={() => setHasLogo("yes")}
                                  className={`px-3 py-2 rounded-lg text-xs border transition-all ${
                                    hasLogo === "yes" ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/50"
                                  }`}
                                >
                                  {t("hasLogoYes")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setHasLogo("no"); setLogoFile(null); setLogoPreviewUrl(""); }}
                                  className={`px-3 py-2 rounded-lg text-xs border transition-all ${
                                    hasLogo === "no" ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/50"
                                  }`}
                                >
                                  {t("hasLogoNo")}
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
                                      <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> {t("logoUploaded")}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {hasLogo === "no" && (
                                <p className="text-[10px] text-muted-foreground">{t("noLogoHint")}</p>
                              )}
                            </div>

                            <div>
                              <label className="text-sm font-medium block mb-1">{t("mainPromise")} *</label>
                              <input
                                type="text"
                                value={offerPromise}
                                onChange={(e) => setOfferPromise(e.target.value)}
                                placeholder={t("mainPromisePlaceholder")}
                                className="w-full px-3 py-2.5 border rounded-lg text-sm"
                              />
                            </div>

                            <div>
                              <label className="text-sm font-medium block mb-1">{t("targetAudience")} *</label>
                              <input
                                type="text"
                                value={offerTarget}
                                onChange={(e) => setOfferTarget(e.target.value)}
                                placeholder={t("targetAudiencePlaceholder")}
                                className="w-full px-3 py-2.5 border rounded-lg text-sm"
                              />
                            </div>

                            <div>
                              <label className="text-sm font-medium block mb-1">{t("benefits")}</label>
                              <textarea
                                value={offerBenefits}
                                onChange={(e) => setOfferBenefits(e.target.value)}
                                placeholder={t("benefitsPlaceholder")}
                                rows={4}
                                className="w-full px-3 py-2.5 border rounded-lg text-sm resize-none"
                              />
                            </div>

                            {createType === "sales" && (
                              <>
                                <div>
                                  <label className="text-sm font-medium block mb-1">{t("price")}</label>
                                  <input
                                    type="text"
                                    value={offerPrice}
                                    onChange={(e) => setOfferPrice(e.target.value)}
                                    placeholder={t("pricePlaceholder")}
                                    className="w-full px-3 py-2.5 border rounded-lg text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="text-sm font-medium block mb-1">{t("guarantees")}</label>
                                  <input
                                    type="text"
                                    value={offerGuarantees}
                                    onChange={(e) => setOfferGuarantees(e.target.value)}
                                    placeholder={t("guaranteesPlaceholder")}
                                    className="w-full px-3 py-2.5 border rounded-lg text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="text-sm font-medium block mb-1">{t("paymentLink")}</label>
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
                          <h3 className="text-sm font-semibold">{t("advancedOptions")}</h3>

                          {/* Urgency */}
                          <div>
                            <label className="text-sm font-medium block mb-1.5">{t("urgency")}</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                              {([
                                { v: "none" as const, l: t("urgencyNone") },
                                { v: "places" as const, l: t("urgencyPlaces") },
                                { v: "date" as const, l: t("urgencyDate") },
                                { v: "custom" as const, l: t("urgencyOther") },
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
                                  urgencyType === "places" ? t("urgencyPlacesPlaceholder") :
                                  urgencyType === "date" ? t("urgencyDatePlaceholder") :
                                  t("urgencyOtherPlaceholder")
                                }
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                              />
                            )}
                          </div>

                          {/* Bonuses */}
                          <div>
                            <label className="text-sm font-medium block mb-1">{t("bonuses")}</label>
                            <textarea
                              value={offerBonuses}
                              onChange={(e) => setOfferBonuses(e.target.value)}
                              placeholder={t("bonusesPlaceholder")}
                              rows={3}
                              className="w-full px-3 py-2.5 border rounded-lg text-sm resize-none"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">{t("bonusesHint")}</p>
                          </div>
                        </div>

                        {/* Generate button */}
                        <button
                          onClick={handleGenerate}
                          disabled={(offerSource === "scratch" && !offerName.trim()) || (offerSource === "event" && !selectedEventId)}
                          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t("createPage")} ({createType === "capture" ? t("credits5") : t("credits6")})
                        </button>

                        <p className="text-xs text-muted-foreground text-center mt-3">{t("canEditLater")}</p>
                      </>
                    )}
                  </div>
                )}

                {/* ==================== LIST ==================== */}
                {view === "list" && (
                  <>
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h1 className="text-3xl font-display font-bold mb-1">{t("listTitle")}</h1>
                        <p className="text-muted-foreground">{t("listDesc")}</p>
                      </div>
                      <button
                        onClick={() => setView("step1")}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {t("newPage")}
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
                        <h2 className="text-lg font-semibold mb-2">{t("emptyTitle")}</h2>
                        <p className="text-muted-foreground mb-6">{t("emptyDesc")}</p>
                        <button
                          onClick={() => setView("step1")}
                          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium"
                        >
                          {t("createFirst")}
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
                            onLeads={() => { setLeadsPageId(p.id); setLeadsPageTitle(p.title || t("untitled")); }}
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
                          <div className="text-xs text-muted-foreground">{t("totalViews")}</div>
                        </div>
                        <div className="border rounded-xl p-4 text-center bg-card">
                          <MousePointerClick className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{pages.reduce((s, p) => s + (p.clicks_count || 0), 0)}</div>
                          <div className="text-xs text-muted-foreground">{t("totalClicks")}</div>
                        </div>
                        <div className="border rounded-xl p-4 text-center bg-card">
                          <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{pages.reduce((s, p) => s + (p.leads_count || 0), 0)}</div>
                          <div className="text-xs text-muted-foreground">{t("totalLeads")}</div>
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
                          <div className="text-xs text-muted-foreground">{t("avgConversion")}</div>
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
            </div>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}

// ---------- Page card ----------

function PageCard({ page, onEdit, onArchive, onLeads }: { page: PageSummary; onEdit: () => void; onArchive: () => void; onLeads: () => void }) {
  const t = useTranslations("pages");
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
          ) : page.page_type === "linkinbio" ? (
            <Link2 className="w-4 h-4 text-orange-600" />
          ) : (
            <ShoppingCart className="w-4 h-4 text-green-600" />
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isPublished ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
          }`}>
            {isPublished ? t("statusOnline") : t("statusDraft")}
          </span>
        </div>
      </div>

      <h3
        className="font-semibold text-sm mb-1 truncate cursor-pointer hover:text-primary"
        onClick={onEdit}
      >
        {page.title || t("untitled")}
      </h3>

      <p className="text-xs text-muted-foreground mb-3">
        {page.views_count} {t("views")} &middot; {page.clicks_count || 0} {t("clicks")} &middot; {page.leads_count} leads
        {page.views_count > 0 && (
          <span className="ml-1 font-medium text-primary">
            &middot; {((page.leads_count / page.views_count) * 100).toFixed(1)}%
          </span>
        )}
      </p>

      <div className="flex items-center gap-2">
        <button onClick={onEdit} className="flex-1 py-1.5 text-xs border rounded-md hover:bg-muted font-medium">
          {t("edit")}
        </button>
        {page.leads_count > 0 && (
          <button onClick={onLeads} className="p-1.5 border rounded-md hover:bg-muted" title={t("viewLeads")}>
            <Users className="w-3.5 h-3.5 text-blue-600" />
          </button>
        )}
        {isPublished && (
          <button onClick={copyUrl} className="p-1.5 border rounded-md hover:bg-muted" title={t("copyLink")}>
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
        <button onClick={onArchive} className="p-1.5 border rounded-md hover:bg-muted text-destructive" title={t("delete")}>
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
  const t = useTranslations("pages");
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
            <p className="text-xs text-muted-foreground mt-0.5">{leads.length} {t("contacts")}</p>
          </div>
          <div className="flex items-center gap-2">
            {leads.length > 0 && (
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                {t("exportCsv")}
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
              <p>{t("noLeads")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Email</th>
                    <th className="pb-2 pr-3 font-medium">{t("firstName")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("phone")}</th>
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
