// components/pages/PageBuilder.tsx
// Main page editor: preview iframe + chat bar + publish modal.
// Features: multi-device preview, always-on inline text editing,
// inline color picker for text/illustrations, illustration delete/replace,
// publish modal with slug/SIO tag/OG image/meta description,
// download HTML, download text as PDF, edit after publication.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Download, ExternalLink, Copy, Check, X,
  Upload, Smartphone, Tablet, Monitor,
  Globe, Loader2, ArrowLeft,
  FileText, FileDown,
  Share2, Tag, Image as ImageIcon, Link2,
  EyeOff, Users, QrCode, HelpCircle,
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
  facebook_pixel_id?: string;
  google_tag_id?: string;
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

// ---------- Always-on inline editing script ----------
// Text is always editable, hover shows a minimal toolbar with color picker.
// Illustrations/SVGs/animations get hover overlay: delete, replace image, or change color.

const INLINE_EDIT_SCRIPT = `
<script>
(function(){
  var editableSelectors = 'h1, h2, h3, h4, h5, h6, p, span, li, a, button, blockquote, figcaption, td, th, label, .hero-title, .hero-subtitle, .cta-text, [data-editable]';
  var illustSelectors = '.tp-illust, .tp-visual, .tp-mockup, [data-tipote-visual], svg:not(.tp-toolbar-icon), .tp-float, [class*="illustration"], [class*="animation"]';

  /* ── Toolbar element (shared, moves to focused element) ── */
  var toolbar = document.createElement('div');
  toolbar.className = 'tipote-toolbar';
  toolbar.style.cssText = 'position:fixed;z-index:99999;display:none;align-items:center;gap:6px;padding:4px 8px;background:#1e293b;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.25);pointer-events:auto;transition:opacity 0.15s;';
  toolbar.innerHTML = '<input type="color" class="tp-color-input" title="Couleur du texte" style="width:24px;height:24px;border:2px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;background:none;padding:0;-webkit-appearance:none;appearance:none;overflow:hidden;" />';
  document.body.appendChild(toolbar);

  var colorInput = toolbar.querySelector('.tp-color-input');
  var activeEl = null;

  colorInput.addEventListener('input', function(e) {
    if (activeEl) {
      activeEl.style.color = e.target.value;
      parent.postMessage({ type: 'tipote:text-edit', tag: activeEl.tagName.toLowerCase(), text: (activeEl.innerText || '').trim(), html: activeEl.innerHTML }, '*');
    }
  });
  colorInput.addEventListener('click', function(e) { e.stopPropagation(); });

  /* ── Illustration overlay element (shared) ── */
  var illustOverlay = document.createElement('div');
  illustOverlay.className = 'tipote-illust-overlay';
  illustOverlay.style.cssText = 'position:fixed;z-index:99998;display:none;align-items:center;justify-content:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);border-radius:10px;pointer-events:auto;';
  illustOverlay.innerHTML = '<button class="tp-illust-btn tp-illust-delete" title="Supprimer" style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,70,70,0.2);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:system-ui;">'+
    '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="tp-toolbar-icon"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>'+
    '</button>'+
    '<button class="tp-illust-btn tp-illust-replace" title="Remplacer par une image" style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:system-ui;">'+
    '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="tp-toolbar-icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'+
    '</button>'+
    '<input type="color" class="tp-illust-color" title="Couleur" style="width:28px;height:28px;border:2px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;background:none;padding:0;-webkit-appearance:none;appearance:none;overflow:hidden;" />';
  document.body.appendChild(illustOverlay);

  var activeIllust = null;
  var illustColorInput = illustOverlay.querySelector('.tp-illust-color');
  var illustDeleteBtn = illustOverlay.querySelector('.tp-illust-delete');
  var illustReplaceBtn = illustOverlay.querySelector('.tp-illust-replace');

  illustColorInput.addEventListener('input', function(e) {
    if (!activeIllust) return;
    var color = e.target.value;
    activeIllust.style.setProperty('--brand', color);
    activeIllust.querySelectorAll('svg *[stroke]').forEach(function(p) {
      var s = p.getAttribute('stroke') || '';
      if (s.indexOf('var(') >= 0 || s.indexOf('brand') >= 0 || (s.indexOf('#') >= 0 && s !== '#fff' && s !== '#ffffff' && s !== 'none')) {
        p.setAttribute('stroke', color);
      }
    });
    activeIllust.querySelectorAll('svg *[fill]').forEach(function(p) {
      var f = p.getAttribute('fill') || '';
      if (f.indexOf('var(') >= 0 || f.indexOf('brand') >= 0 || (f.indexOf('#') >= 0 && f !== '#fff' && f !== '#ffffff' && f !== 'none' && f !== 'white')) {
        p.setAttribute('fill', color);
      }
    });
    parent.postMessage({ type: 'tipote:text-edit', tag: 'illust-color', text: color }, '*');
  });

  illustDeleteBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!activeIllust) return;
    activeIllust.style.display = 'none';
    illustOverlay.style.display = 'none';
    activeIllust = null;
    parent.postMessage({ type: 'tipote:text-edit', tag: 'illust-delete', text: '' }, '*');
  });

  illustReplaceBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!activeIllust) return;
    /* Find or set ID on outermost container */
    var target = activeIllust;
    var p = target.closest('.tp-visual, .tp-illust, [data-tipote-visual]');
    if (p) target = p;
    var id = target.getAttribute('data-tipote-img-id');
    if (!id) {
      id = 'tipote-img-' + Date.now();
      target.setAttribute('data-tipote-img-id', id);
    }
    parent.postMessage({ type: 'tipote:image-click', imgId: id, hasImage: false }, '*');
    illustOverlay.style.display = 'none';
    activeIllust = null;
  });

  illustOverlay.addEventListener('click', function(e) { e.stopPropagation(); });

  /* ── Listen for messages from parent ── */
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'tipote:image-uploaded') {
      var sel = e.data.selector;
      var url = e.data.url;
      if (sel && url) {
        var el = document.querySelector(sel);
        if (el) {
          if (el.tagName === 'IMG') { el.src = url; }
          else {
            /* Fully replace the SVG/illustration container with an image */
            /* Walk up to find the outermost illustration container */
            var container = el;
            while (container.parentElement && (
              container.parentElement.classList.contains('tp-illust') ||
              container.parentElement.classList.contains('tp-visual') ||
              container.parentElement.classList.contains('tp-mockup') ||
              container.parentElement.tagName === 'svg' ||
              container.parentElement.hasAttribute('data-tipote-visual')
            )) {
              container = container.parentElement;
            }
            /* Replace with clean image element */
            var img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'width:100%;max-width:520px;height:auto;border-radius:16px;object-fit:cover;display:block;margin:0 auto;box-shadow:0 12px 40px rgba(0,0,0,0.12);';
            img.setAttribute('data-tipote-img-id', el.getAttribute('data-tipote-img-id') || '');
            container.replaceWith(img);
          }
        }
      }
    }
    if (e.data && e.data.type === 'tipote:image-removed') {
      var sel2 = e.data.selector;
      if (sel2) {
        var el2 = document.querySelector(sel2);
        if (el2) { el2.style.display = 'none'; }
      }
    }
  });

  /* ── Init: make all text editable ── */
  function init() {
    document.body.classList.add('tipote-edit-mode');
    var els = document.querySelectorAll(editableSelectors);
    els.forEach(function(el) {
      if (el.closest('script') || el.closest('style') || el.closest('noscript') || el.closest('.tipote-toolbar') || el.closest('.tipote-illust-overlay')) return;
      if (el.children.length > 3 && !el.matches('[data-editable]')) return;
      var text = (el.textContent || '').trim();
      if (!text || text.length < 2) return;
      el.setAttribute('contenteditable', 'true');
      el.style.outline = 'none';
      el.style.cursor = 'text';
      el.addEventListener('focus', onFocus);
      el.addEventListener('blur', onBlur);
    });

    /* Setup illustration hover targets */
    document.querySelectorAll(illustSelectors).forEach(function(el) {
      if (el.closest('.tipote-toolbar') || el.closest('.tipote-illust-overlay')) return;
      el.addEventListener('mouseenter', onIllustEnter);
      el.addEventListener('mouseleave', onIllustLeave);
    });
  }

  function positionToolbar(el) {
    var rect = el.getBoundingClientRect();
    toolbar.style.display = 'flex';
    toolbar.style.left = Math.max(4, rect.left) + 'px';
    toolbar.style.top = Math.max(4, rect.top - 38) + 'px';
    colorInput.value = rgbToHex(getComputedStyle(el).color);
    activeEl = el;
  }

  function positionIllustOverlay(el) {
    var rect = el.getBoundingClientRect();
    illustOverlay.style.display = 'flex';
    illustOverlay.style.left = (rect.left + rect.width/2 - 80) + 'px';
    illustOverlay.style.top = (rect.top + rect.height/2 - 18) + 'px';
    var brand = getComputedStyle(el).getPropertyValue('--brand') || getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#2563eb';
    illustColorInput.value = brand.trim().startsWith('#') ? brand.trim() : '#2563eb';
    activeIllust = el;
  }

  function onFocus(e) {
    e.target.style.outlineOffset = '2px';
    e.target.style.borderRadius = '4px';
    positionToolbar(e.target);
  }

  function onBlur(e) {
    e.target.style.outline = 'none';
    e.target.style.outlineOffset = '';
    setTimeout(function() {
      if (!document.activeElement || !document.activeElement.closest('.tipote-toolbar')) {
        toolbar.style.display = 'none';
        activeEl = null;
      }
    }, 200);
    var tag = e.target.tagName.toLowerCase();
    var text = e.target.innerText || e.target.textContent || '';
    parent.postMessage({ type: 'tipote:text-edit', tag: tag, text: text.trim(), html: e.target.innerHTML }, '*');
  }

  var illustLeaveTimer = null;
  function onIllustEnter(e) {
    clearTimeout(illustLeaveTimer);
    positionIllustOverlay(e.currentTarget);
  }
  function onIllustLeave(e) {
    illustLeaveTimer = setTimeout(function() {
      if (!illustOverlay.matches(':hover')) {
        illustOverlay.style.display = 'none';
        activeIllust = null;
      }
    }, 300);
  }
  illustOverlay.addEventListener('mouseenter', function() { clearTimeout(illustLeaveTimer); });
  illustOverlay.addEventListener('mouseleave', function() {
    illustOverlay.style.display = 'none';
    activeIllust = null;
  });

  function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith('#')) return rgb || '#000000';
    var m = rgb.match(/\\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + [m[0],m[1],m[2]].map(function(x){var h=parseInt(x).toString(16);return h.length<2?'0'+h:h;}).join('');
  }

  /* Styles */
  var style = document.createElement('style');
  style.textContent = [
    '.tipote-edit-mode [contenteditable]:hover { outline: 1px dashed rgba(37,99,235,0.4) !important; outline-offset: 2px; border-radius: 4px; cursor: text; }',
    '.tipote-edit-mode [contenteditable]:focus { outline: 2px solid #2563eb !important; outline-offset: 2px; border-radius: 4px; }',
    '.tp-color-input::-webkit-color-swatch-wrapper { padding: 2px; }',
    '.tp-color-input::-webkit-color-swatch { border: none; border-radius: 4px; }',
    '.tp-illust-color::-webkit-color-swatch-wrapper { padding: 2px; }',
    '.tp-illust-color::-webkit-color-swatch { border: none; border-radius: 4px; }',
    '.tp-illust-btn:hover { background: rgba(255,255,255,0.2) !important; }',
  ].join('\\n');
  document.head.appendChild(style);

  /* Init on load */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
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
  const [saving, setSaving] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingHtmlRef = useRef<string | null>(null);

  // Publish modal state
  const [publishSlug, setPublishSlug] = useState(initialPage.slug);
  const [publishTag, setPublishTag] = useState(initialPage.sio_capture_tag || "");
  const [publishMetaDesc, setPublishMetaDesc] = useState(initialPage.meta_description || "");
  const [publishOgUrl, setPublishOgUrl] = useState(initialPage.og_image_url || "");
  const [uploadingOg, setUploadingOg] = useState(false);
  const [publishFbPixel, setPublishFbPixel] = useState(initialPage.facebook_pixel_id || "");
  const [publishGtag, setPublishGtag] = useState(initialPage.google_tag_id || "");

  // Leads modal state
  const [showLeadsModal, setShowLeadsModal] = useState(false);
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  // QR code state
  const [showQrModal, setShowQrModal] = useState(false);


  // Thank-you page
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [thankYouHeading, setThankYouHeading] = useState(page.content_data?.thank_you_heading || "Merci pour ton inscription !");
  const [thankYouMessage, setThankYouMessage] = useState(page.content_data?.thank_you_message || "Tu vas recevoir un email de confirmation dans quelques instants. Pense à vérifier tes spams.");
  const [thankYouCtaText, setThankYouCtaText] = useState(page.content_data?.thank_you_cta_text || "");
  const [thankYouCtaUrl, setThankYouCtaUrl] = useState(page.content_data?.thank_you_cta_url || "");
  const [savingThankYou, setSavingThankYou] = useState(false);

  // Inject always-on inline edit script into HTML
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

  // Apply pending HTML edits when content is refreshed
  const applyPendingHtml = useCallback(() => {
    if (pendingHtmlRef.current) {
      setHtmlPreview(pendingHtmlRef.current);
      pendingHtmlRef.current = null;
    }
  }, []);

  // Handle image click from iframe — always upload (delete is handled by illustration overlay)
  const handleIframeImageClick = useCallback((imgId: string, _hasImage: boolean) => {
    triggerImageUploadForIframe(imgId);
  }, []);

  const triggerImageUploadForIframe = useCallback((imgId: string) => {
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
        formData.append("contentId", `page-${page.id}-img-${imgId}`);
        const res = await fetch("/api/upload/image", { method: "POST", body: formData });
        const data = await res.json();
        if (data.ok && data.url) {
          const iframe = iframeRef.current;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: "tipote:image-uploaded", selector: `[data-tipote-img-id="${imgId}"]`, url: data.url }, "*");
            setTimeout(() => saveIframeHtml(), 300);
          }
        }
      } catch { /* ignore */ } finally {
        setUploadingImage(false);
      }
    };
    input.click();
  }, [page.id]);

  const saveIframeHtml = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const updatedHtml = iframe.contentDocument.documentElement.outerHTML;
    setHtmlPreview("<!DOCTYPE html><html>" + updatedHtml.slice(updatedHtml.indexOf("<html>") + 6));
    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html_snapshot: updatedHtml }),
    }).catch(() => {});
  }, [page.id]);

  // Listen for inline edits from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "tipote:text-edit") {
        setSaving(true);
        // Debounce save: extract updated HTML from iframe and persist
        // IMPORTANT: do NOT update htmlPreview here — that causes React re-render
        // which resets the iframe and loses edit mode state.
        clearTimeout((window as any).__tipoteSaveTimer);
        (window as any).__tipoteSaveTimer = setTimeout(() => {
          const iframe = iframeRef.current;
          if (iframe?.contentDocument) {
            const fullHtml = "<!DOCTYPE html>" + iframe.contentDocument.documentElement.outerHTML;
            // Save to API (persists html_snapshot in DB)
            // Store pending HTML so it's applied when exiting edit mode
            pendingHtmlRef.current = fullHtml;
            fetch(`/api/pages/${page.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html_snapshot: fullHtml }),
            }).then(() => {
              setSaving(false);
            }).catch(() => setSaving(false));
          } else {
            setSaving(false);
          }
        }, 2000);
      }
      if (e.data?.type === "tipote:image-click") {
        handleIframeImageClick(e.data.imgId, e.data.hasImage);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [page.id, handleIframeImageClick]);

  // Chat update handler
  const handleChatUpdate = useCallback(async (nextContentData: Record<string, any>, nextBrandTokens: Record<string, any>, _explanation: string) => {
    applyPendingHtml();
    setPage((prev) => ({
      ...prev,
      content_data: nextContentData,
      brand_tokens: nextBrandTokens,
    }));
    await refreshPreview(nextContentData, nextBrandTokens);
  }, [refreshPreview, applyPendingHtml]);

  // Settings update (debounced save)
  const handleSettingUpdate = useCallback(async (field: string, value: any) => {
    setPage((prev) => ({ ...prev, [field]: value }));
    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => {});
  }, [page.id]);

  // Load leads for leads modal
  const loadLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const res = await fetch(`/api/pages/${page.id}/leads`);
      const data = await res.json();
      if (data.ok) setLeadsData(data.leads || []);
    } catch { /* ignore */ } finally {
      setLeadsLoading(false);
    }
  }, [page.id]);

  // Download leads CSV
  const downloadLeadsCsv = useCallback(() => {
    window.open(`/api/pages/${page.id}/leads?format=csv`, "_blank");
  }, [page.id]);


  // Open publish modal
  const openPublishModal = useCallback(() => {
    setPublishSlug(page.slug);
    setPublishTag(page.sio_capture_tag || "");
    setPublishMetaDesc(page.meta_description || "");
    setPublishOgUrl(page.og_image_url || "");
    setPublishFbPixel(page.facebook_pixel_id || "");
    setPublishGtag(page.google_tag_id || "");
    setShowPublishModal(true);
  }, [page.slug, page.sio_capture_tag, page.meta_description, page.og_image_url, page.facebook_pixel_id, page.google_tag_id]);

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
          facebook_pixel_id: publishFbPixel,
          google_tag_id: publishGtag,
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
          facebook_pixel_id: publishFbPixel,
          google_tag_id: publishGtag,
        }));
        setShowPublishModal(false);
      }
    } catch { /* ignore */ } finally {
      setPublishing(false);
    }
  }, [page.id, publishSlug, publishTag, publishMetaDesc, publishOgUrl, publishFbPixel, publishGtag]);

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

  // Save thank-you page settings (direct DB columns, not content_data)
  const saveThankYou = useCallback(async () => {
    setSavingThankYou(true);
    try {
      await fetch(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thank_you_title: thankYouHeading,
          thank_you_message: thankYouMessage,
          thank_you_cta_text: thankYouCtaText,
          thank_you_cta_url: thankYouCtaUrl,
        }),
      });
      setShowThankYouModal(false);
    } catch { /* ignore */ } finally {
      setSavingThankYou(false);
    }
  }, [page.id, thankYouHeading, thankYouMessage, thankYouCtaText, thankYouCtaUrl]);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${page.slug}` : `/p/${page.slug}`;
  const publishPreviewUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${publishSlug}` : `/p/${publishSlug}`;
  const isPublished = page.status === "published";
  const deviceCfg = DEVICE_CONFIG[device];

  return (
    <div className="flex flex-col h-screen min-h-0 bg-background">
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

          {/* Upload indicator */}
          {uploadingImage && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Upload...</span>
            </div>
          )}

          {/* Thank-you page (capture only) */}
          {(page.page_type === "capture" || page.template_kind === "capture") && (
            <button
              onClick={() => setShowThankYouModal(true)}
              className="p-2 rounded-lg border hover:bg-muted text-muted-foreground"
              title="Page de remerciement"
            >
              <Check className="w-4 h-4" />
            </button>
          )}

          {/* View leads */}
          <button
            onClick={() => { setShowLeadsModal(true); loadLeads(); }}
            className="p-2 rounded-lg border hover:bg-muted text-muted-foreground relative"
            title="Voir les leads"
          >
            <Users className="w-4 h-4" />
            {page.leads_count > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {page.leads_count > 99 ? "99+" : page.leads_count}
              </span>
            )}
          </button>

          {/* Full-screen preview */}
          <button onClick={openPreview} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Aperçu plein écran">
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* Download HTML */}
          <button onClick={downloadHtml} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Télécharger HTML">
            <Download className="w-4 h-4" />
          </button>

          {/* Download text as PDF */}
          <button onClick={downloadTextPdf} className="p-2 rounded-lg border hover:bg-muted text-muted-foreground" title="Télécharger le texte en PDF">
            <FileDown className="w-4 h-4" />
          </button>

          {/* QR code (only when published) */}
          {isPublished && (
            <button
              onClick={() => setShowQrModal(true)}
              className="p-2 rounded-lg border hover:bg-muted text-muted-foreground"
              title="QR Code"
            >
              <QrCode className="w-4 h-4" />
            </button>
          )}

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

      {/* Saving indicator */}
      {saving && (
        <div className="flex items-center gap-2 px-4 py-1 border-b text-xs text-muted-foreground bg-muted/30">
          <Loader2 className="w-3 h-3 animate-spin" />
          Sauvegarde...
        </div>
      )}

      {/* Main content + Chat side panel */}
      <div className="flex-1 flex min-h-0">
        {/* Preview area */}
        <div className="flex-1 flex justify-center bg-muted/30 overflow-auto p-4 min-h-0">
          <div
            className="bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300"
            style={{
              width: device === "desktop" ? "100%" : `${deviceCfg.width}px`,
              maxWidth: device === "desktop" ? "1200px" : `${deviceCfg.width}px`,
              height: "100%",
              minHeight: "400px",
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

        {/* Chat panel (right side) */}
        <PageChatBar
          pageId={page.id}
          templateId={page.template_id}
          kind={page.template_kind as "capture" | "vente"}
          contentData={page.content_data}
          brandTokens={page.brand_tokens}
          onUpdate={handleChatUpdate}
          locale={page.locale}
        />
      </div>

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
                <p className="text-sm text-muted-foreground">Configure les paramètres avant la mise en ligne.</p>
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
                  placeholder="Description qui apparaît dans Google..."
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {publishMetaDesc.length}/160 caractères
                </p>
              </div>

              {/* Facebook Pixel */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook Pixel ID
                  <a href="https://www.facebook.com/business/help/952192354843755" target="_blank" rel="noopener" title="Comment trouver son Pixel ID ?">
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-primary" />
                  </a>
                </label>
                <input
                  type="text"
                  value={publishFbPixel}
                  onChange={(e) => setPublishFbPixel(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Ex: 123456789012345"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Suivi des conversions Facebook/Meta Ads.
                </p>
              </div>

              {/* Google Tag */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  Google Tag (gtag)
                  <a href="https://support.google.com/tagmanager/answer/6102821" target="_blank" rel="noopener" title="Comment trouver son Google Tag ?">
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-primary" />
                  </a>
                </label>
                <input
                  type="text"
                  value={publishGtag}
                  onChange={(e) => setPublishGtag(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                  placeholder="Ex: G-XXXXXXXXXX ou GTM-XXXXXX"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Suivi Google Analytics / Google Ads.
                </p>
              </div>

              {/* Widgets */}
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Widgets
                </p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Affiche des widgets sur ta page publique (preuve sociale, partage).
                  Les widgets activés dans ta section Widgets apparaîtront automatiquement.
                </p>
                <div className="flex gap-2">
                  <a
                    href="/widgets"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted/50 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Gérer les widgets
                  </a>
                </div>
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

      {/* ==================== LEADS MODAL ==================== */}
      {showLeadsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLeadsModal(false)}>
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Leads capturés</h2>
                <p className="text-sm text-muted-foreground">
                  {leadsData.length} lead{leadsData.length !== 1 ? "s" : ""} ·{" "}
                  {page.views_count > 0 ? ((page.leads_count / page.views_count) * 100).toFixed(1) : "0"}% de conversion
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadLeadsCsv}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter CSV
                </button>
                <button onClick={() => setShowLeadsModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {leadsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : leadsData.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Aucun lead capturé pour le moment.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {leadsData.map((lead: any) => (
                    <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{lead.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {lead.first_name && <span>{lead.first_name} · </span>}
                          {new Date(lead.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          {lead.utm_source && <span> · via {lead.utm_source}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {lead.sio_synced ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Sync SIO
                          </span>
                        ) : page.sio_capture_tag ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                            En attente
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== QR CODE MODAL ==================== */}
      {showQrModal && isPublished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowQrModal(false)}>
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">QR Code</h2>
              <button onClick={() => setShowQrModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-4">
              {/* QR code via public API (no dependency needed) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(publicUrl)}`}
                alt="QR Code"
                className="w-60 h-60 rounded-lg border"
              />
              <p className="text-xs text-muted-foreground text-center break-all">{publicUrl}</p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=${encodeURIComponent(publicUrl)}`;
                    link.download = `qr-${page.slug}.png`;
                    link.click();
                  }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border hover:bg-muted flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Télécharger PNG
                </button>
                <button
                  onClick={copyUrl}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copié !" : "Copier le lien"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== THANK-YOU PAGE MODAL ==================== */}
      {showThankYouModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowThankYouModal(false)}>
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Page de remerciement</h2>
                <p className="text-sm text-muted-foreground">
                  Affichée après l&apos;inscription. Personnalise le message et ajoute un lien.
                </p>
              </div>
              <button onClick={() => setShowThankYouModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Titre</label>
                <input
                  type="text"
                  value={thankYouHeading}
                  onChange={(e) => setThankYouHeading(e.target.value)}
                  placeholder="Merci pour ton inscription !"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Message</label>
                <textarea
                  value={thankYouMessage}
                  onChange={(e) => setThankYouMessage(e.target.value)}
                  placeholder="Tu vas recevoir un email..."
                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                  rows={4}
                  maxLength={500}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Bouton (optionnel)</label>
                <input
                  type="text"
                  value={thankYouCtaText}
                  onChange={(e) => setThankYouCtaText(e.target.value)}
                  placeholder="Rejoindre le groupe Facebook"
                  className="w-full px-3 py-2 border rounded-lg text-sm mb-2"
                  maxLength={50}
                />
                <input
                  type="url"
                  value={thankYouCtaUrl}
                  onChange={(e) => setThankYouCtaUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* Preview */}
              <div className="rounded-xl border bg-muted/20 p-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">Aperçu</p>
                <div className="text-3xl mb-2">&#10003;</div>
                <h3 className="text-lg font-bold mb-2">{thankYouHeading || "Merci !"}</h3>
                <p className="text-sm text-muted-foreground mb-4">{thankYouMessage || "..."}</p>
                {thankYouCtaText && (
                  <span className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                    {thankYouCtaText}
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 pt-4 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setShowThankYouModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-muted"
              >
                Annuler
              </button>
              <button
                onClick={saveThankYou}
                disabled={savingThankYou}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {savingThankYou ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Enregistrer
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
