// components/pages/PageBuilder.tsx
// Main page editor: preview iframe + chat bar + publish modal.
// Features: multi-device preview, inline text editing,
// publish modal with slug/SIO tag/OG image/meta description,
// download HTML, download text as PDF, edit after publication.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Download, ExternalLink, Copy, Check, X,
  Upload, Smartphone, Tablet, Monitor,
  Globe, Loader2, ArrowLeft, ImagePlus,
  MousePointerClick, FileText, FileDown,
  Share2, Tag, Image as ImageIcon, Link2,
  EyeOff,
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
  capture_first_name: boolean;
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

// ---------- Device config ----------

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
      if (el.children.length > 3) return;
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
    var tag = e.target.tagName.toLowerCase();
    var text = e.target.innerText || e.target.textContent || '';
    parent.postMessage({ type: 'tipote:text-edit', tag: tag, text: text.trim(), html: e.target.innerHTML }, '*');
  }

  function onInput(e) {}

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
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Publish modal state
  const [publishSlug, setPublishSlug] = useState(initialPage.slug);
  const [publishTag, setPublishTag] = useState(initialPage.sio_capture_tag || "");
  const [publishMetaDesc, setPublishMetaDesc] = useState(initialPage.meta_description || "");
  const [publishOgUrl, setPublishOgUrl] = useState(initialPage.og_image_url || "");
  const [uploadingOg, setUploadingOg] = useState(false);

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
        setSaving(true);
        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          const updatedHtml = iframe.contentDocument.documentElement.outerHTML;
          setHtmlPreview("<!DOCTYPE html><html>" + updatedHtml.slice(updatedHtml.indexOf("<html>") + 6));

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

  // Settings update (debounced save)
  const handleSettingUpdate = useCallback(async (field: string, value: any) => {
    setPage((prev) => ({ ...prev, [field]: value }));
    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => {});
  }, [page.id]);

  // Open publish modal
  const openPublishModal = useCallback(() => {
    setPublishSlug(page.slug);
    setPublishTag(page.sio_capture_tag || "");
    setPublishMetaDesc(page.meta_description || "");
    setPublishOgUrl(page.og_image_url || "");
    setShowPublishModal(true);
  }, [page.slug, page.sio_capture_tag, page.meta_description, page.og_image_url]);

  // Publish with modal settings
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      // Save settings first
      await fetch(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: publishSlug,
          sio_capture_tag: publishTag,
          meta_description: publishMetaDesc,
          og_image_url: publishOgUrl,
        }),
      });

      // Publish
      const res = await fetch(`/api/pages/${page.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setPage((prev) => ({
          ...prev,
          status: data.page.status,
          slug: publishSlug,
          sio_capture_tag: publishTag,
          meta_description: publishMetaDesc,
          og_image_url: publishOgUrl,
        }));
        setShowPublishModal(false);
      }
    } catch { /* ignore */ } finally {
      setPublishing(false);
    }
  }, [page.id, publishSlug, publishTag, publishMetaDesc, publishOgUrl]);

  // Unpublish
  const handleUnpublish = useCallback(async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/pages/${page.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: false }),
      });
      const data = await res.json();
      if (data.ok) {
        setPage((prev) => ({ ...prev, status: data.page.status }));
      }
    } catch { /* ignore */ } finally {
      setPublishing(false);
    }
  }, [page.id]);

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

  // Download text as PDF (printable HTML)
  const downloadTextPdf = useCallback(() => {
    // Extract text content from the iframe
    const iframe = iframeRef.current;
    let textContent = "";

    if (iframe?.contentDocument) {
      const body = iframe.contentDocument.body;
      const elements = body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, span, a, button, blockquote, td, th");
      const seen = new Set<string>();

      elements.forEach((el) => {
        // Skip nested elements already captured by parent
        if (el.closest("script") || el.closest("style") || el.closest("noscript")) return;
        const text = (el.textContent || "").trim();
        if (!text || text.length < 3 || seen.has(text)) return;
        seen.add(text);

        const tag = el.tagName.toLowerCase();
        if (tag.startsWith("h")) {
          textContent += `\n${"#".repeat(parseInt(tag[1]) || 1)} ${text}\n\n`;
        } else if (tag === "li") {
          textContent += `- ${text}\n`;
        } else if (tag === "blockquote") {
          textContent += `> ${text}\n\n`;
        } else {
          textContent += `${text}\n\n`;
        }
      });
    } else {
      // Fallback: extract from content_data
      const cd = page.content_data;
      for (const [key, val] of Object.entries(cd)) {
        if (typeof val === "string" && val.trim() && !key.includes("url") && !key.includes("image") && !key.includes("color")) {
          textContent += `${val}\n\n`;
        }
      }
    }

    if (!textContent.trim()) {
      textContent = "Aucun contenu texte disponible.";
    }

    // Create a printable HTML document
    const printHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${page.title || "Page"} - Texte</title>
<style>
  @media print { @page { margin: 2cm; } }
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.8; font-size: 14px; }
  h1, h2, h3, h4, h5, h6 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin-top: 1.5em; margin-bottom: 0.5em; color: #111; }
  h1 { font-size: 24px; border-bottom: 2px solid #eee; padding-bottom: 8px; }
  h2 { font-size: 20px; }
  h3 { font-size: 17px; }
  p { margin: 0 0 1em; }
  blockquote { border-left: 3px solid #ddd; padding-left: 16px; color: #555; margin: 1em 0; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #999; }
</style>
</head>
<body>
<h1>${page.title || "Page"}</h1>
${textContent.split("\n").map((line) => {
      const l = line.trim();
      if (!l) return "";
      if (l.startsWith("# ")) return `<h1>${l.slice(2)}</h1>`;
      if (l.startsWith("## ")) return `<h2>${l.slice(3)}</h2>`;
      if (l.startsWith("### ")) return `<h3>${l.slice(4)}</h3>`;
      if (l.startsWith("#### ")) return `<h4>${l.slice(5)}</h4>`;
      if (l.startsWith("- ")) return `<li>${l.slice(2)}</li>`;
      if (l.startsWith("> ")) return `<blockquote>${l.slice(2)}</blockquote>`;
      return `<p>${l}</p>`;
    }).join("\n")}
<div class="footer">Genere par Tipote</div>
</body>
</html>`;

    // Open in new window and trigger print (saves as PDF)
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(printHtml);
      win.document.close();
      // Auto-trigger print dialog after load
      win.onload = () => win.print();
      setTimeout(() => win.print(), 500);
    }
  }, [page.content_data, page.title]);

  // Open in new tab
  const openPreview = useCallback(() => {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(htmlPreview);
      win.document.close();
    }
  }, [htmlPreview]);

  // Image upload (generic)
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

  // OG image upload (for publish modal)
  const handleOgImageUpload = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadingOg(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("contentId", `page-${page.id}-og`);

        const res = await fetch("/api/upload/image", { method: "POST", body: formData });
        const data = await res.json();
        if (data.ok && data.url) {
          setPublishOgUrl(data.url);
        }
      } catch { /* ignore */ } finally {
        setUploadingOg(false);
      }
    };
    input.click();
  }, [page.id]);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${page.slug}` : `/p/${page.slug}`;
  const publishPreviewUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${publishSlug}` : `/p/${publishSlug}`;
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
              {page.views_count} vues · {page.leads_count} leads
              {saving && <span className="ml-2 text-primary">Sauvegarde...</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Device toggle */}
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
            title={editMode ? "Desactiver l'edition directe" : "Modifier le texte directement"}
          >
            <MousePointerClick className="w-4 h-4" />
          </button>

          {/* Logo upload */}
          <button
            onClick={() => handleImageUpload("logo_image_url")}
            disabled={uploadingImage}
            className="p-2 rounded-lg border hover:bg-muted text-muted-foreground"
            title="Changer le logo"
          >
            {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          </button>

          {/* Full-screen preview */}
          <button onClick={openPreview} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Apercu plein ecran">
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* Download HTML */}
          <button onClick={downloadHtml} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Telecharger HTML">
            <Download className="w-4 h-4" />
          </button>

          {/* Download text as PDF */}
          <button onClick={downloadTextPdf} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Telecharger le texte en PDF">
            <FileDown className="w-4 h-4" />
          </button>

          {/* Publish / manage */}
          {isPublished ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={copyUrl}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                {copied ? "Copie !" : "En ligne"}
              </button>
              <button
                onClick={handleUnpublish}
                disabled={publishing}
                className="p-2 rounded-lg border hover:bg-muted text-muted-foreground"
                title="Depublier"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <button
              onClick={openPublishModal}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              Publier
            </button>
          )}
        </div>
      </div>

      {/* Published URL bar */}
      {isPublished && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950/20 border-b text-sm">
          <Globe className="w-4 h-4 text-green-600" />
          <span className="text-green-700 dark:text-green-400 font-medium">En ligne :</span>
          <a href={publicUrl} target="_blank" rel="noopener" className="text-green-600 underline truncate">
            {publicUrl}
          </a>
          <button onClick={copyUrl} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30">
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-green-600" />}
          </button>
          <span className="text-xs text-green-600/60 ml-auto">Modifications en temps reel</span>
        </div>
      )}

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 dark:bg-blue-950/20 border-b text-xs text-blue-700 dark:text-blue-400">
          <MousePointerClick className="w-3.5 h-3.5" />
          Clique sur n&apos;importe quel texte pour le modifier directement
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex justify-center bg-muted/30 overflow-auto p-4">
        <div
          className="bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300"
          style={{
            width: device === "desktop" ? "100%" : `${deviceCfg.width}px`,
            maxWidth: device === "desktop" ? "1200px" : `${deviceCfg.width}px`,
            height: "calc(100vh - 220px)",
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

      {/* Chat bar */}
      <PageChatBar
        pageId={page.id}
        templateId={page.template_id}
        kind={page.template_kind as "capture" | "vente"}
        contentData={page.content_data}
        brandTokens={page.brand_tokens}
        onUpdate={handleChatUpdate}
        locale={page.locale}
      />

      {/* ==================== PUBLISH MODAL ==================== */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPublishModal(false)}>
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Publier ta page</h2>
                <p className="text-sm text-muted-foreground">Configure les parametres avant la mise en ligne.</p>
              </div>
              <button onClick={() => setShowPublishModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* URL / Slug */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                  URL de partage
                </label>
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-2 border">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{typeof window !== "undefined" ? window.location.origin : ""}/p/</span>
                  <input
                    type="text"
                    value={publishSlug}
                    onChange={(e) => setPublishSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    className="flex-1 bg-transparent text-sm font-medium focus:outline-none min-w-0"
                    placeholder="mon-slug"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">{publishPreviewUrl}</p>
              </div>

              {/* Systeme.io tag */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  Tag Systeme.io (optionnel)
                </label>
                <input
                  type="text"
                  value={publishTag}
                  onChange={(e) => setPublishTag(e.target.value)}
                  placeholder="Ex: capture-ebook-fitness"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Les leads captures seront tagges dans Systeme.io avec ce tag.
                </p>
              </div>

              {/* OG Image */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  Image de partage (OG)
                </label>
                {publishOgUrl ? (
                  <div className="relative rounded-lg overflow-hidden border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publishOgUrl} alt="OG preview" className="w-full h-32 object-cover" />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={handleOgImageUpload}
                        className="p-1.5 rounded-md bg-background/80 hover:bg-background border text-xs"
                      >
                        Changer
                      </button>
                      <button
                        onClick={() => setPublishOgUrl("")}
                        className="p-1.5 rounded-md bg-background/80 hover:bg-background border text-xs text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleOgImageUpload}
                    disabled={uploadingOg}
                    className="w-full py-8 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:bg-muted/30 transition-colors flex flex-col items-center gap-2"
                  >
                    {uploadingOg ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        <span>Ajouter une image de partage</span>
                      </>
                    )}
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Affichée quand ta page est partagée sur les réseaux sociaux.
                </p>
              </div>

              {/* Meta description */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Description (SEO)
                </label>
                <textarea
                  value={publishMetaDesc}
                  onChange={(e) => setPublishMetaDesc(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                  rows={3}
                  maxLength={160}
                  placeholder="Description qui apparait dans Google..."
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {publishMetaDesc.length}/160 caracteres
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 pt-4 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-muted"
              >
                Annuler
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || !publishSlug.trim()}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                Mettre en ligne
              </button>
            </div>
          </div>
        </div>
      )}
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
