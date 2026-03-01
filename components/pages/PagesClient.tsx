// components/pages/PagesClient.tsx
// Main pages client: lists pages, creates new pages, edits existing pages.
// Uses SSE for page generation with animated progress steps.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Plus, FileText, ShoppingCart, Eye, Pencil, Trash2, Globe, Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
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

type View = "list" | "create" | "generating" | "edit";

export default function PagesClient() {
  const [view, setView] = useState<View>("list");
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPageId, setEditPageId] = useState<string | null>(null);
  const [editPage, setEditPage] = useState<any>(null);

  // Generate state
  const [genSteps, setGenSteps] = useState<ProgressStep[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  // Create form state
  const [createType, setCreateType] = useState<"capture" | "sales">("capture");
  const [createOfferName, setCreateOfferName] = useState("");
  const [createOfferPromise, setCreateOfferPromise] = useState("");
  const [createOfferTarget, setCreateOfferTarget] = useState("");
  const [createOfferPrice, setCreateOfferPrice] = useState("");
  const [createOfferDescription, setCreateOfferDescription] = useState("");
  const [createPaymentUrl, setCreatePaymentUrl] = useState("");
  const [createTheme, setCreateTheme] = useState("");
  const [createVideoUrl, setCreateVideoUrl] = useState("");

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

  // Generate page via SSE
  const handleGenerate = useCallback(async () => {
    setView("generating");
    setGenSteps([]);
    setGenError(null);

    try {
      const res = await fetch("/api/pages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageType: createType,
          offerName: createOfferName || undefined,
          offerPromise: createOfferPromise || undefined,
          offerTarget: createOfferTarget || undefined,
          offerPrice: createOfferPrice || undefined,
          offerDescription: createOfferDescription || undefined,
          paymentUrl: createPaymentUrl || undefined,
          theme: createTheme || undefined,
          videoEmbedUrl: createVideoUrl || undefined,
        }),
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
                const payload = JSON.parse(eventData);

                if (eventType === "step") {
                  setGenSteps((prev) => {
                    const exists = prev.findIndex((s) => s.id === payload.id);
                    if (exists >= 0) {
                      const next = [...prev];
                      next[exists] = payload;
                      return next;
                    }
                    return [...prev, payload];
                  });
                }

                if (eventType === "done") {
                  // Load the created page and go to editor
                  const pageRes = await fetch(`/api/pages/${payload.pageId}`);
                  const pageData = await pageRes.json();
                  if (pageData.ok) {
                    setEditPage(pageData.page);
                    setEditPageId(payload.pageId);
                    setTimeout(() => setView("edit"), 1000);
                  }
                }

                if (eventType === "error") {
                  setGenError(payload.message || "Erreur inconnue");
                }
              } catch { /* ignore parse errors */ }

              eventType = "";
              eventData = "";
            }
          }
        }
      }
    } catch (err: any) {
      setGenError(err?.message || "Erreur réseau");
    }
  }, [createType, createOfferName, createOfferPromise, createOfferTarget, createOfferPrice, createOfferDescription, createPaymentUrl, createTheme, createVideoUrl]);

  // Open editor
  const handleEdit = useCallback(async (pageId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}`);
      const data = await res.json();
      if (data.ok) {
        setEditPage(data.page);
        setEditPageId(pageId);
        setView("edit");
      }
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
      <PageBuilder
        initialPage={editPage}
        onBack={() => { setView("list"); setEditPage(null); fetchPages(); }}
      />
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

            {/* ==================== CREATE ==================== */}
            {view === "create" && (
              <div className="max-w-xl mx-auto">
                <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground mb-6 block">
                  &larr; Retour
                </button>

                <h1 className="text-2xl font-bold mb-2">Créer une page</h1>
                <p className="text-muted-foreground mb-8">
                  Tipote va créer ta page en utilisant toutes tes infos (profil, branding, offres, mentions légales).
                </p>

                {/* Type selection */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <button
                    onClick={() => setCreateType("capture")}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      createType === "capture" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <FileText className="w-6 h-6 mb-2 text-blue-600" />
                    <h3 className="font-semibold text-sm">Page de capture</h3>
                    <p className="text-xs text-muted-foreground mt-1">Récupère des emails avec un lead magnet</p>
                  </button>
                  <button
                    onClick={() => setCreateType("sales")}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      createType === "sales" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <ShoppingCart className="w-6 h-6 mb-2 text-green-600" />
                    <h3 className="font-semibold text-sm">Page de vente</h3>
                    <p className="text-xs text-muted-foreground mt-1">Vends ton offre directement</p>
                  </button>
                </div>

                {/* Offer fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-sm font-medium block mb-1">Nom de l'offre</label>
                    <input
                      type="text"
                      value={createOfferName}
                      onChange={(e) => setCreateOfferName(e.target.value)}
                      placeholder="Ex: Formation en ligne 'Booste tes ventes'"
                      className="w-full px-3 py-2.5 border rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Promesse principale</label>
                    <input
                      type="text"
                      value={createOfferPromise}
                      onChange={(e) => setCreateOfferPromise(e.target.value)}
                      placeholder="Ex: Double tes revenus en 90 jours"
                      className="w-full px-3 py-2.5 border rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Public cible</label>
                    <input
                      type="text"
                      value={createOfferTarget}
                      onChange={(e) => setCreateOfferTarget(e.target.value)}
                      placeholder="Ex: Coachs et consultants qui veulent scaler"
                      className="w-full px-3 py-2.5 border rounded-lg text-sm"
                    />
                  </div>

                  {createType === "sales" && (
                    <>
                      <div>
                        <label className="text-sm font-medium block mb-1">Prix</label>
                        <input
                          type="text"
                          value={createOfferPrice}
                          onChange={(e) => setCreateOfferPrice(e.target.value)}
                          placeholder="Ex: 497€"
                          className="w-full px-3 py-2.5 border rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1">Lien de paiement (optionnel)</label>
                        <input
                          type="url"
                          value={createPaymentUrl}
                          onChange={(e) => setCreatePaymentUrl(e.target.value)}
                          placeholder="https://checkout.stripe.com/..."
                          className="w-full px-3 py-2.5 border rounded-lg text-sm"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="text-sm font-medium block mb-1">Description / Brief (optionnel)</label>
                    <textarea
                      value={createOfferDescription}
                      onChange={(e) => setCreateOfferDescription(e.target.value)}
                      placeholder="Décris ton offre en quelques phrases..."
                      rows={3}
                      className="w-full px-3 py-2.5 border rounded-lg text-sm resize-none"
                    />
                  </div>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                >
                  Créer ma page (1 crédit)
                </button>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  Tipote utilise automatiquement ton branding, ton ton de voix et tes mentions légales.
                  <br />Tu pourras modifier chaque détail ensuite.
                </p>
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
                    onClick={() => setView("create")}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Nouvelle page
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-20 text-muted-foreground">Chargement...</div>
                ) : pages.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-lg font-semibold mb-2">Aucune page</h2>
                    <p className="text-muted-foreground mb-6">Crée ta première page de capture ou de vente en un clic.</p>
                    <button
                      onClick={() => setView("create")}
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
            isPublished ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
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
        {page.views_count} vues · {page.leads_count} leads
      </p>

      <div className="flex items-center gap-2">
        <button onClick={onEdit} className="flex-1 py-1.5 text-xs border rounded-md hover:bg-muted font-medium">
          Modifier
        </button>
        {isPublished && (
          <button onClick={copyUrl} className="p-1.5 border rounded-md hover:bg-muted" title="Copier le lien">
            {copied ? <ExternalLink className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
        <button onClick={onArchive} className="p-1.5 border rounded-md hover:bg-muted text-destructive" title="Supprimer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
