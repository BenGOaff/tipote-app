// components/pages/PageBuilder.tsx
// Main page editor: preview iframe + chat bar + settings panel.
// Features: multi-device preview, inline text editing, language selector,
// edit after publication, media upload.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Download, ExternalLink, Copy, Check,
  Settings, Upload, Video, Link2, Smartphone, Tablet, Monitor,
  Globe, Loader2, ArrowLeft, ImagePlus,
  MousePointerClick, Languages
} from "lucide-react";
import PageChatBar from "./PageChatBar";

// ---------- Types ----------

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
  locale?: string;
};

type Props = {
  initialPage: PageData;
  onBack: () => void;
};

// ---------- Device config (like quiz) ----------

type Device = "mobile" | "tablet" | "desktop";

const DEVICE_CONFIG: Record<Device, { width: number; label: string; icon: typeof Monitor }> = {
  mobile: { width: 375, label: "Mobile", icon: Smartphone },
  tablet: { width: 768, label: "Tablette", icon: Tablet },
  desktop: { width: 1200, label: "Desktop", icon: Monitor },
};

// ---------- Inline editing script ----------

const INLINE_EDIT_SCRIPT = `
<script>
(function(){
  var editing = false;
  var editableSelectors = 'h1, h2, h3, h4, h5, h6, p, span, li, a, button, .hero-title, .hero-subtitle, .cta-text, [data-editable]';

  // Listen for toggle from parent
  window.addEventListener('message', function(e) {
    if (e.data === 'tipote:enable-edit') {
      editing = true;
      document.body.classList.add('tipote-edit-mode');
      enableEditMode();
    }
    if (e.data === 'tipote:disable-edit') {
      editing = false;
      document.body.classList.remove('tipote-edit-mode');
      disableEditMode();
    }
  });

  function enableEditMode() {
    var els = document.querySelectorAll(editableSelectors);
    els.forEach(function(el) {
      if (el.closest('script') || el.closest('style') || el.closest('noscript')) return;
      if (el.children.length > 3) return; // skip complex containers
      el.setAttribute('contenteditable', 'true');
      el.style.outline = 'none';
      el.style.cursor = 'text';
      el.addEventListener('focus', onFocus);
      el.addEventListener('blur', onBlur);
      el.addEventListener('input', onInput);
    });
  }

  function disableEditMode() {
    var els = document.querySelectorAll('[contenteditable="true"]');
    els.forEach(function(el) {
      el.removeAttribute('contenteditable');
      el.style.cursor = '';
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('input', onInput);
    });
  }

  function onFocus(e) {
    e.target.style.outline = '2px solid #2563eb';
    e.target.style.outlineOffset = '2px';
    e.target.style.borderRadius = '4px';
  }

  function onBlur(e) {
    e.target.style.outline = 'none';
    e.target.style.outlineOffset = '';
    // Send updated text to parent
    var tag = e.target.tagName.toLowerCase();
    var text = e.target.innerText || e.target.textContent || '';
    parent.postMessage({ type: 'tipote:text-edit', tag: tag, text: text.trim(), html: e.target.innerHTML }, '*');
  }

  function onInput(e) {
    // Debounced save hint
  }

  // Edit mode styles
  var style = document.createElement('style');
  style.textContent = '.tipote-edit-mode [contenteditable]:hover { outline: 1px dashed #93c5fd !important; outline-offset: 2px; border-radius: 4px; }';
  document.head.appendChild(style);
})();
</script>`;

// ---------- Component ----------

export default function PageBuilder({ initialPage, onBack }: Props) {
  const [page, setPage] = useState<PageData>(initialPage);
  const [htmlPreview, setHtmlPreview] = useState(initialPage.html_snapshot);
  const [device, setDevice] = useState<Device>("desktop");
  const [showSettings, setShowSettings] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Inject inline edit script into HTML
  const getPreviewHtml = useCallback((html: string) => {
    const idx = html.lastIndexOf("</body>");
    if (idx === -1) return html + INLINE_EDIT_SCRIPT;
    return html.slice(0, idx) + INLINE_EDIT_SCRIPT + html.slice(idx);
  }, []);

  // Re-render HTML when content changes
  const refreshPreview = useCallback(async (contentData: Record<string, any>, brandTokens: Record<string, any>) => {
    const html = await renderClient(page.template_kind as any, page.template_id, contentData, brandTokens);
    setHtmlPreview(html);
  }, [page.template_kind, page.template_id]);

  // Toggle inline edit mode
  const toggleEditMode = useCallback(() => {
    const next = !editMode;
    setEditMode(next);
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(next ? "tipote:enable-edit" : "tipote:disable-edit", "*");
    }
  }, [editMode]);

  // Listen for inline edits from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "tipote:text-edit") {
        // For now, show the text change via chat explanation
        // The user sees it live in the iframe. We save the full HTML snapshot.
        setSaving(true);
        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          const updatedHtml = iframe.contentDocument.documentElement.outerHTML;
          setHtmlPreview("<!DOCTYPE html><html>" + updatedHtml.slice(updatedHtml.indexOf("<html>") + 6));

          // Save HTML snapshot to backend (debounced)
          clearTimeout((window as any).__tipoteSaveTimer);
          (window as any).__tipoteSaveTimer = setTimeout(() => {
            fetch(`/api/pages/${page.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html_snapshot: updatedHtml }),
            }).then(() => setSaving(false)).catch(() => setSaving(false));
          }, 1500);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [page.id]);

  // Chat update handler
  const handleChatUpdate = useCallback(async (nextContentData: Record<string, any>, nextBrandTokens: Record<string, any>, _explanation: string) => {
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
  const deviceCfg = DEVICE_CONFIG[device];

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
              {saving && <span className="ml-2 text-primary">Sauvegarde...</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Device toggle (like quiz) */}
          <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
            {(Object.keys(DEVICE_CONFIG) as Device[]).map((d) => {
              const Icon = DEVICE_CONFIG[d].icon;
              return (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                    device === d ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{DEVICE_CONFIG[d].label}</span>
                </button>
              );
            })}
          </div>

          {/* Inline edit toggle */}
          <button
            onClick={toggleEditMode}
            className={`p-2 rounded-lg border transition-colors ${
              editMode ? "bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-950 dark:border-blue-700" : "hover:bg-muted text-muted-foreground"
            }`}
            title={editMode ? "Désactiver l'édition directe" : "Modifier le texte directement"}
          >
            <MousePointerClick className="w-4 h-4" />
          </button>

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

          {/* Publish / Unpublish button */}
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

      {/* Published URL bar — always visible when published, editing still works */}
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
          <span className="text-xs text-green-600/60 ml-auto">Les modifications sont appliquées en temps réel</span>
        </div>
      )}

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 dark:bg-blue-950/20 border-b text-xs text-blue-700 dark:text-blue-400">
          <MousePointerClick className="w-3.5 h-3.5" />
          Clique sur n'importe quel texte pour le modifier directement
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Preview */}
        <div className="flex-1 flex justify-center bg-muted/30 overflow-auto p-4">
          <div
            className="bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300"
            style={{
              width: device === "desktop" ? "100%" : `${deviceCfg.width}px`,
              maxWidth: device === "desktop" ? "1200px" : `${deviceCfg.width}px`,
              height: "calc(100vh - 200px)",
            }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={getPreviewHtml(htmlPreview)}
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

              {/* Language */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
                  <Languages className="w-3.5 h-3.5" /> Langue du contenu
                </label>
                <select
                  value={page.locale || "fr"}
                  onChange={(e) => handleSettingUpdate("locale", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                  <option value="pt">Português</option>
                  <option value="it">Italiano</option>
                  <option value="nl">Nederlands</option>
                  <option value="ar">العربية</option>
                  <option value="tr">Türkçe</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Modifie la langue pour regénérer le contenu via le chat.
                </p>
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
                    <label className="flex items-center gap-2 text-sm mt-1">
                      <input
                        type="checkbox"
                        checked={(page as any).capture_first_name ?? false}
                        onChange={(e) => handleSettingUpdate("capture_first_name", e.target.checked)}
                      />
                      Demander le prénom
                    </label>
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

      {/* Chat bar — always active, even when published */}
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
