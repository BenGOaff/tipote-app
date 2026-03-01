// components/pages/PageBuilder.tsx
// Main page editor: preview iframe + chat bar + settings panel.
// Loaded after page generation is complete.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Eye, EyeOff, Download, ExternalLink, Share2, Copy, Check,
  Settings, Upload, Video, Link2, Smartphone, Monitor,
  Globe, Loader2, ArrowLeft, ImagePlus, Trash2
} from "lucide-react";
import PageChatBar from "./PageChatBar";
import { renderTemplateHtml } from "./renderClient";

type PageData = {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  status: string;
  template_kind: string;
  template_id: string;
  content_data: Record<string, any>;
  brand_tokens: Record<string, any>;
  html_snapshot: string;
  custom_images: any[];
  video_embed_url: string;
  payment_url: string;
  payment_button_text: string;
  meta_title: string;
  meta_description: string;
  og_image_url: string;
  legal_mentions_url: string;
  legal_cgv_url: string;
  legal_privacy_url: string;
  capture_enabled: boolean;
  capture_heading: string;
  capture_subtitle: string;
  sio_capture_tag: string;
  views_count: number;
  leads_count: number;
  iteration_count: number;
};

type Props = {
  initialPage: PageData;
  onBack: () => void;
};

export default function PageBuilder({ initialPage, onBack }: Props) {
  const [page, setPage] = useState<PageData>(initialPage);
  const [htmlPreview, setHtmlPreview] = useState(initialPage.html_snapshot);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [showSettings, setShowSettings] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Re-render HTML when content changes
  const refreshPreview = useCallback(async (contentData: Record<string, any>, brandTokens: Record<string, any>) => {
    const html = await renderClient(page.template_kind as any, page.template_id, contentData, brandTokens);
    setHtmlPreview(html);
  }, [page.template_kind, page.template_id]);

  // Chat update handler
  const handleChatUpdate = useCallback(async (nextContentData: Record<string, any>, nextBrandTokens: Record<string, any>, explanation: string) => {
    setPage((prev) => ({
      ...prev,
      content_data: nextContentData,
      brand_tokens: nextBrandTokens,
    }));
    await refreshPreview(nextContentData, nextBrandTokens);
  }, [refreshPreview]);

  // Publish / unpublish
  const togglePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/pages/${page.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: page.status !== "published" }),
      });
      const data = await res.json();
      if (data.ok) {
        setPage((prev) => ({ ...prev, status: data.page.status }));
      }
    } catch { /* ignore */ } finally {
      setPublishing(false);
    }
  }, [page.id, page.status]);

  // Copy public URL
  const copyUrl = useCallback(() => {
    const url = `${window.location.origin}/p/${page.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [page.slug]);

  // Download HTML
  const downloadHtml = useCallback(() => {
    const blob = new Blob([htmlPreview], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.slug || "page"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [htmlPreview, page.slug]);

  // Open in new tab
  const openPreview = useCallback(() => {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(htmlPreview);
      win.document.close();
    }
  }, [htmlPreview]);

  // Image upload
  const handleImageUpload = useCallback(async (fieldKey: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("contentId", `page-${page.id}`);

        const res = await fetch("/api/upload/image", { method: "POST", body: formData });
        const data = await res.json();

        if (data.ok && data.url) {
          const nextContentData = { ...page.content_data, [fieldKey]: data.url };
          setPage((prev) => ({ ...prev, content_data: nextContentData }));
          await refreshPreview(nextContentData, page.brand_tokens);

          // Save to backend
          fetch(`/api/pages/${page.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content_data: nextContentData }),
          }).catch(() => {});
        }
      } catch { /* ignore */ } finally {
        setUploadingImage(false);
      }
    };
    input.click();
  }, [page, refreshPreview]);

  // Video embed update
  const handleVideoUpdate = useCallback(async (url: string) => {
    const nextContentData = { ...page.content_data, video_embed_url: url };
    setPage((prev) => ({ ...prev, content_data: nextContentData, video_embed_url: url }));

    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_embed_url: url, content_data: nextContentData }),
    }).catch(() => {});
  }, [page]);

  // Settings update
  const handleSettingUpdate = useCallback(async (field: string, value: any) => {
    setPage((prev) => ({ ...prev, [field]: value }));

    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => {});
  }, [page.id]);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${page.slug}` : `/p/${page.slug}`;
  const isPublished = page.status === "published";

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold truncate max-w-[200px]">{page.title}</h1>
            <p className="text-xs text-muted-foreground">
              {page.views_count} vues · {page.leads_count} leads · {page.iteration_count} modif.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("desktop")}
              className={`p-2 ${viewMode === "desktop" ? "bg-muted" : ""}`}
              title="Desktop"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("mobile")}
              className={`p-2 ${viewMode === "mobile" ? "bg-muted" : ""}`}
              title="Mobile"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          {/* Media buttons */}
          <button
            onClick={() => handleImageUpload("logo_image_url")}
            disabled={uploadingImage}
            className="p-2 rounded-lg border hover:bg-muted text-muted-foreground"
            title="Changer le logo"
          >
            {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          </button>

          <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg border ${showSettings ? "bg-muted" : ""} hover:bg-muted text-muted-foreground`} title="Paramètres">
            <Settings className="w-4 h-4" />
          </button>

          <button onClick={openPreview} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Aperçu plein écran">
            <ExternalLink className="w-4 h-4" />
          </button>

          <button onClick={downloadHtml} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Télécharger HTML">
            <Download className="w-4 h-4" />
          </button>

          {/* Publish button */}
          <button
            onClick={togglePublish}
            disabled={publishing}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isPublished
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            } disabled:opacity-50`}
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPublished ? (
              <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> En ligne</span>
            ) : (
              "Publier"
            )}
          </button>
        </div>
      </div>

      {/* Published URL bar */}
      {isPublished && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950/20 border-b text-sm">
          <Globe className="w-4 h-4 text-green-600" />
          <span className="text-green-700 dark:text-green-400 font-medium">Ta page est en ligne :</span>
          <a href={publicUrl} target="_blank" rel="noopener" className="text-green-600 underline truncate">
            {publicUrl}
          </a>
          <button onClick={copyUrl} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30">
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-green-600" />}
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Preview */}
        <div className="flex-1 flex justify-center bg-muted/30 overflow-auto p-4">
          <div
            className={`bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300 ${
              viewMode === "mobile" ? "w-[390px]" : "w-full max-w-[1200px]"
            }`}
            style={{ height: "calc(100vh - 200px)" }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={htmlPreview}
              title="Preview"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="w-80 border-l bg-background overflow-y-auto shrink-0">
            <div className="p-4 space-y-6">
              <h3 className="font-semibold text-sm">Paramètres de la page</h3>

              {/* Slug */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">URL personnalisée</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">/p/</span>
                  <input
                    type="text"
                    value={page.slug}
                    onChange={(e) => handleSettingUpdate("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    className="flex-1 px-2 py-1.5 text-sm border rounded-md"
                  />
                </div>
              </div>

              {/* SEO */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Titre SEO</label>
                <input
                  type="text"
                  value={page.meta_title}
                  onChange={(e) => handleSettingUpdate("meta_title", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded-md"
                  maxLength={60}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description SEO</label>
                <textarea
                  value={page.meta_description}
                  onChange={(e) => handleSettingUpdate("meta_description", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded-md resize-none"
                  rows={3}
                  maxLength={160}
                />
              </div>

              {/* Video embed */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
                  <Video className="w-3.5 h-3.5" /> URL vidéo (YouTube/Vimeo)
                </label>
                <input
                  type="url"
                  value={page.video_embed_url}
                  onChange={(e) => handleVideoUpdate(e.target.value)}
                  placeholder="https://youtube.com/embed/..."
                  className="w-full px-2 py-1.5 text-sm border rounded-md"
                />
              </div>

              {/* Payment URL */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" /> Lien de paiement
                </label>
                <input
                  type="url"
                  value={page.payment_url}
                  onChange={(e) => handleSettingUpdate("payment_url", e.target.value)}
                  placeholder="https://checkout.stripe.com/..."
                  className="w-full px-2 py-1.5 text-sm border rounded-md"
                />
              </div>

              {/* Images */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">Images</label>
                <div className="space-y-2">
                  <button
                    onClick={() => handleImageUpload("logo_image_url")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs border rounded-md hover:bg-muted"
                  >
                    <Upload className="w-3.5 h-3.5" /> Changer le logo
                  </button>
                  <button
                    onClick={() => handleImageUpload("author_photo_url")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs border rounded-md hover:bg-muted"
                  >
                    <Upload className="w-3.5 h-3.5" /> Changer la photo auteur
                  </button>
                  <button
                    onClick={() => handleImageUpload("og_image_url")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs border rounded-md hover:bg-muted"
                  >
                    <Upload className="w-3.5 h-3.5" /> Image de partage (OG)
                  </button>
                </div>
              </div>

              {/* Lead capture */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Capture d'emails</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={page.capture_enabled}
                    onChange={(e) => handleSettingUpdate("capture_enabled", e.target.checked)}
                  />
                  Activer la capture
                </label>
                {page.capture_enabled && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={page.capture_heading}
                      onChange={(e) => handleSettingUpdate("capture_heading", e.target.value)}
                      placeholder="Titre du formulaire"
                      className="w-full px-2 py-1.5 text-sm border rounded-md"
                    />
                    <input
                      type="text"
                      value={page.sio_capture_tag}
                      onChange={(e) => handleSettingUpdate("sio_capture_tag", e.target.value)}
                      placeholder="Tag Systeme.io (optionnel)"
                      className="w-full px-2 py-1.5 text-sm border rounded-md"
                    />
                  </div>
                )}
              </div>

              {/* Legal */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Liens légaux</label>
                <div className="space-y-2">
                  <input
                    type="url"
                    value={page.legal_mentions_url}
                    onChange={(e) => handleSettingUpdate("legal_mentions_url", e.target.value)}
                    placeholder="URL Mentions légales"
                    className="w-full px-2 py-1.5 text-sm border rounded-md"
                  />
                  <input
                    type="url"
                    value={page.legal_cgv_url}
                    onChange={(e) => handleSettingUpdate("legal_cgv_url", e.target.value)}
                    placeholder="URL CGV"
                    className="w-full px-2 py-1.5 text-sm border rounded-md"
                  />
                  <input
                    type="url"
                    value={page.legal_privacy_url}
                    onChange={(e) => handleSettingUpdate("legal_privacy_url", e.target.value)}
                    placeholder="URL Politique de confidentialité"
                    className="w-full px-2 py-1.5 text-sm border rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat bar */}
      <PageChatBar
        pageId={page.id}
        templateId={page.template_id}
        kind={page.template_kind as "capture" | "vente"}
        contentData={page.content_data}
        brandTokens={page.brand_tokens}
        onUpdate={handleChatUpdate}
      />
    </div>
  );
}

// Client-side render helper
async function renderClient(kind: string, templateId: string, contentData: Record<string, any>, brandTokens: Record<string, any>): Promise<string> {
  try {
    const res = await fetch("/api/templates/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, templateId, mode: "preview", contentData, brandTokens }),
    });
    return await res.text();
  } catch {
    return "<html><body><p>Erreur de rendu</p></body></html>";
  }
}
