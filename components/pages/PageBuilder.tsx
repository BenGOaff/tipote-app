// components/pages/PageBuilder.tsx
// Full-screen page builder inspired by Systeme.io.
// Layout: top bar (logo + devices + save/exit) + optional left sidebar + full preview + Chat IA right.
// All settings accessible from a left panel (Paramètres) instead of modals.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Download, Copy, Check, X,
  Upload, Smartphone, Tablet, Monitor,
  Globe, Loader2,
  FileText, FileDown,
  Share2, Tag, Image as ImageIcon, Link2,
  EyeOff, Users, QrCode,
  Settings, Play,
  Save, LogOut,
  Layers, Trash2, ChevronUp, ChevronDown,
  MousePointer, Heading, AlignLeft, Square, Minus,
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

// ---------- Left sidebar tabs ----------

type LeftTab = "builder" | "parametres";

// ---------- Section info from iframe ----------

type SectionInfo = {
  id: string;
  label: string;
  tagName: string;
  classes: string;
  top: number;
};

// Section labels for display
const SECTION_LABELS: Record<string, string> = {
  "tp-header-bar": "Barre d'annonce",
  "tp-hero": "Hero",
  "tp-section": "Section",
  "tp-final-cta": "CTA final",
  "tp-footer": "Pied de page",
  "nav": "Navigation",
};

// Elements that can be added
const ELEMENT_PALETTE = [
  { type: "heading", label: "Titre", icon: Heading },
  { type: "text", label: "Texte", icon: AlignLeft },
  { type: "button", label: "Bouton", icon: Square },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "divider", label: "Séparateur", icon: Minus },
];

// ---------- Always-on inline editing script ----------

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
    var target = activeIllust;
    if (!target.id) target.id = 'tipote-illust-' + Date.now();
    parent.postMessage({ type: 'tipote:image-click', imgId: target.id, hasImage: false }, '*');
    illustOverlay.style.display = 'none';
    activeIllust = null;
  });

  /* ── Shared positioning helper ── */
  function positionAbove(el, overlay) {
    var r = el.getBoundingClientRect();
    overlay.style.left = Math.max(8, r.left + r.width/2 - overlay.offsetWidth/2) + 'px';
    overlay.style.top = Math.max(8, r.top - overlay.offsetHeight - 8) + 'px';
  }

  /* ── Make all text elements editable ── */
  document.querySelectorAll(editableSelectors).forEach(function(el) {
    if (el.closest('script') || el.closest('style') || el.closest('noscript') || el.closest('.tipote-toolbar') || el.closest('.tipote-illust-overlay')) return;
    if (el.children.length > 3) return;
    el.contentEditable = 'true';
    el.style.outline = 'none';
    el.style.cursor = 'text';

    el.addEventListener('focus', function() {
      activeEl = el;
      toolbar.style.display = 'flex';
      colorInput.value = getComputedStyle(el).color.indexOf('rgb') >= 0 ? rgbToHex(getComputedStyle(el).color) : '#000000';
      setTimeout(function() { positionAbove(el, toolbar); }, 0);
    });

    el.addEventListener('blur', function() {
      setTimeout(function() {
        if (document.activeElement !== colorInput && document.activeElement !== el) {
          toolbar.style.display = 'none';
          activeEl = null;
        }
      }, 200);
      parent.postMessage({ type: 'tipote:text-edit', tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim(), html: el.innerHTML }, '*');
    });
  });

  /* ── Illustration/SVG hover overlay ── */
  document.querySelectorAll(illustSelectors).forEach(function(el) {
    if (el.closest('.tipote-toolbar') || el.closest('.tipote-illust-overlay')) return;
    if (el.closest(illustSelectors) !== el) return;

    el.style.cursor = 'pointer';
    el.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      if (el.hasAttribute('data-tipote-img-id') || el.querySelector('[data-tipote-img-id]')) {
        var imgTarget = el.hasAttribute('data-tipote-img-id') ? el : el.querySelector('[data-tipote-img-id]');
        if (imgTarget) {
          parent.postMessage({ type: 'tipote:image-click', imgId: imgTarget.getAttribute('data-tipote-img-id'), hasImage: !!imgTarget.src }, '*');
          return;
        }
      }

      activeIllust = el;
      illustOverlay.style.display = 'flex';
      var brandColor = getComputedStyle(el).getPropertyValue('--brand').trim() || '#5D6CDB';
      if (brandColor.indexOf('rgb') >= 0) brandColor = rgbToHex(brandColor);
      illustColorInput.value = brandColor;
      setTimeout(function() { positionAbove(el, illustOverlay); }, 0);
    });
  });

  /* ── Also listen for image clicks (standalone images) ── */
  document.querySelectorAll('img[data-tipote-img-id]').forEach(function(img) {
    img.style.cursor = 'pointer';
    img.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      parent.postMessage({ type: 'tipote:image-click', imgId: img.getAttribute('data-tipote-img-id'), hasImage: !!img.src }, '*');
    });
  });

  /* ── Placeholder image click handlers ── */
  document.querySelectorAll('[data-tipote-img-id]:not(img)').forEach(function(el) {
    if (el.closest(illustSelectors)) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      parent.postMessage({ type: 'tipote:image-click', imgId: el.getAttribute('data-tipote-img-id'), hasImage: false }, '*');
    });
  });

  /* ── Click outside to dismiss overlays ── */
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.tipote-illust-overlay') && !e.target.closest(illustSelectors)) {
      illustOverlay.style.display = 'none';
      activeIllust = null;
    }
  });

  /* ── Listen for uploaded image from parent ── */
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'tipote:image-uploaded') {
      var target = document.querySelector(e.data.selector);
      if (target) {
        if (target.tagName === 'IMG') {
          target.src = e.data.url;
        } else {
          var newImg = document.createElement('img');
          newImg.src = e.data.url;
          newImg.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
          newImg.setAttribute('data-tipote-img-id', target.getAttribute('data-tipote-img-id') || '');
          target.replaceWith(newImg);
        }
      }
    }
  });

  /* ── Helper: rgb to hex ── */
  function rgbToHex(rgb) {
    var m = rgb.match(/(\d+)/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0,3).map(function(x) { return parseInt(x).toString(16).padStart(2,'0'); }).join('');
  }

  /* ── Section detection: identify all top-level sections ── */
  var sectionSelectors = '.tp-header-bar, .tp-hero, .tp-section, .tp-final-cta, .tp-footer, nav, [class*="tp-section"]';
  var allSections = document.querySelectorAll(sectionSelectors);
  var sectionList = [];
  var selectedSectionEl = null;
  var sectionHighlight = document.createElement('div');
  sectionHighlight.style.cssText = 'position:absolute;z-index:99990;pointer-events:none;border:2px solid #5D6CDB;background:rgba(93,108,219,0.05);display:none;transition:all 0.15s ease;';
  document.body.appendChild(sectionHighlight);

  // Gather section info and send to parent
  allSections.forEach(function(el, i) {
    if (el.closest('.tipote-toolbar') || el.closest('.tipote-illust-overlay')) return;
    var id = el.id || ('tp-auto-section-' + i);
    if (!el.id) el.id = id;
    el.setAttribute('data-tp-section-idx', String(i));

    var cls = el.className || '';
    var label = 'Section';
    if (cls.indexOf('tp-header-bar') >= 0) label = 'Barre d\\'annonce';
    else if (cls.indexOf('tp-hero') >= 0) label = 'Hero';
    else if (cls.indexOf('tp-final-cta') >= 0) label = 'CTA final';
    else if (cls.indexOf('tp-footer') >= 0) label = 'Pied de page';
    else if (el.tagName === 'NAV') label = 'Navigation';
    else if (cls.indexOf('dark') >= 0) label = 'Section sombre';
    else if (cls.indexOf('alt') >= 0) label = 'Section alt';

    // Try to find a section title for better labeling
    var titleEl = el.querySelector('.tp-section-title, h2, h1');
    if (titleEl) {
      var titleText = (titleEl.textContent || '').trim().substring(0, 40);
      if (titleText) label = titleText;
    }

    sectionList.push({ id: id, label: label, tagName: el.tagName, classes: cls, top: el.offsetTop, idx: i });

    // Section click detection (only on section background, not on editable content)
    el.addEventListener('click', function(e) {
      // Don't intercept clicks on editable elements
      var target = e.target;
      if (target.contentEditable === 'true' || target.closest('[contenteditable="true"]')) return;
      if (target.closest('.tipote-toolbar') || target.closest('.tipote-illust-overlay')) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      selectedSectionEl = el;
      var rect = el.getBoundingClientRect();
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      sectionHighlight.style.display = 'block';
      sectionHighlight.style.left = rect.left + 'px';
      sectionHighlight.style.top = (rect.top + scrollY) + 'px';
      sectionHighlight.style.width = rect.width + 'px';
      sectionHighlight.style.height = rect.height + 'px';

      parent.postMessage({ type: 'tipote:section-click', sectionId: id, sectionIdx: i }, '*');
    });
  });

  // Send section list to parent on load
  setTimeout(function() {
    parent.postMessage({ type: 'tipote:sections-list', sections: sectionList }, '*');
  }, 300);

  // Listen for parent commands
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'tipote:select-section') {
      var el = document.getElementById(e.data.sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        selectedSectionEl = el;
        var rect = el.getBoundingClientRect();
        var scrollY = window.scrollY || document.documentElement.scrollTop;
        sectionHighlight.style.display = 'block';
        sectionHighlight.style.left = rect.left + 'px';
        sectionHighlight.style.top = (rect.top + scrollY) + 'px';
        sectionHighlight.style.width = rect.width + 'px';
        sectionHighlight.style.height = rect.height + 'px';
      }
    }

    if (e.data && e.data.type === 'tipote:deselect-section') {
      sectionHighlight.style.display = 'none';
      selectedSectionEl = null;
    }

    if (e.data && e.data.type === 'tipote:delete-section') {
      var target = document.getElementById(e.data.sectionId);
      if (target) {
        target.remove();
        sectionHighlight.style.display = 'none';
        selectedSectionEl = null;
        parent.postMessage({ type: 'tipote:text-edit', tag: 'section-delete', text: '' }, '*');
        // Re-scan sections
        setTimeout(function() {
          var remaining = document.querySelectorAll(sectionSelectors);
          var updated = [];
          remaining.forEach(function(el, i) {
            var t = el.querySelector('.tp-section-title, h2, h1');
            updated.push({ id: el.id, label: t ? (t.textContent || '').trim().substring(0,40) : 'Section', tagName: el.tagName, classes: el.className || '', top: el.offsetTop, idx: i });
          });
          parent.postMessage({ type: 'tipote:sections-list', sections: updated }, '*');
        }, 100);
      }
    }

    if (e.data && e.data.type === 'tipote:move-section') {
      var el = document.getElementById(e.data.sectionId);
      if (!el) return;
      var dir = e.data.direction;
      if (dir === 'up' && el.previousElementSibling) {
        el.parentNode.insertBefore(el, el.previousElementSibling);
      } else if (dir === 'down' && el.nextElementSibling) {
        el.parentNode.insertBefore(el.nextElementSibling, el);
      }
      parent.postMessage({ type: 'tipote:text-edit', tag: 'section-move', text: '' }, '*');
      // Re-scan
      setTimeout(function() {
        var remaining = document.querySelectorAll(sectionSelectors);
        var updated = [];
        remaining.forEach(function(el, i) {
          var t = el.querySelector('.tp-section-title, h2, h1');
          updated.push({ id: el.id, label: t ? (t.textContent || '').trim().substring(0,40) : 'Section', tagName: el.tagName, classes: el.className || '', top: el.offsetTop, idx: i });
        });
        parent.postMessage({ type: 'tipote:sections-list', sections: updated }, '*');
      }, 100);
    }

    if (e.data && e.data.type === 'tipote:add-element') {
      var targetSection = selectedSectionEl || document.querySelector('.tp-section');
      if (!targetSection) return;
      var container = targetSection.querySelector('.tp-container') || targetSection;
      var newEl;
      switch (e.data.elementType) {
        case 'heading':
          newEl = document.createElement('h2');
          newEl.className = 'tp-section-title';
          newEl.setAttribute('data-editable', 'true');
          newEl.contentEditable = 'true';
          newEl.style.outline = 'none';
          newEl.style.cursor = 'text';
          newEl.textContent = 'Nouveau titre';
          break;
        case 'text':
          newEl = document.createElement('p');
          newEl.setAttribute('data-editable', 'true');
          newEl.contentEditable = 'true';
          newEl.style.cssText = 'outline:none;cursor:text;font-size:1rem;line-height:1.7;color:inherit;margin:16px 0;';
          newEl.textContent = 'Nouveau paragraphe de texte. Cliquez pour modifier.';
          break;
        case 'button':
          newEl = document.createElement('a');
          newEl.className = 'tp-cta-btn';
          newEl.setAttribute('data-editable', 'true');
          newEl.contentEditable = 'true';
          newEl.style.cssText = 'outline:none;cursor:text;display:inline-block;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;margin:16px 0;background:var(--brand);color:#fff;';
          newEl.textContent = 'Bouton';
          break;
        case 'image':
          newEl = document.createElement('div');
          var imgId = 'user-img-' + Date.now();
          newEl.setAttribute('data-tipote-img-id', imgId);
          newEl.style.cssText = 'width:100%;max-width:600px;height:250px;background:#e5e7eb;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:24px auto;cursor:pointer;color:#9ca3af;font-size:14px;';
          newEl.textContent = 'Cliquer pour ajouter une image';
          newEl.addEventListener('click', function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            parent.postMessage({ type: 'tipote:image-click', imgId: imgId, hasImage: false }, '*');
          });
          break;
        case 'divider':
          newEl = document.createElement('hr');
          newEl.style.cssText = 'border:none;border-top:1px solid #e5e7eb;margin:32px auto;max-width:200px;';
          break;
        default: return;
      }
      container.appendChild(newEl);
      parent.postMessage({ type: 'tipote:text-edit', tag: 'element-add', text: e.data.elementType }, '*');
    }

    if (e.data && e.data.type === 'tipote:update-section-style') {
      var sec = document.getElementById(e.data.sectionId);
      if (!sec) return;
      if (e.data.bgColor) sec.style.backgroundColor = e.data.bgColor;
      if (e.data.textColor) sec.style.color = e.data.textColor;
      if (typeof e.data.paddingY === 'number') { sec.style.paddingTop = e.data.paddingY + 'px'; sec.style.paddingBottom = e.data.paddingY + 'px'; }
      if (typeof e.data.paddingX === 'number') { sec.style.paddingLeft = e.data.paddingX + 'px'; sec.style.paddingRight = e.data.paddingX + 'px'; }
      parent.postMessage({ type: 'tipote:text-edit', tag: 'section-style', text: '' }, '*');
    }
  });

  // Update highlight on scroll
  window.addEventListener('scroll', function() {
    if (selectedSectionEl) {
      var rect = selectedSectionEl.getBoundingClientRect();
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      sectionHighlight.style.top = (rect.top + scrollY) + 'px';
    }
  });
})();
</script>`;


// ─────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────

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

  // Left sidebar
  const [leftTab, setLeftTab] = useState<LeftTab>("builder");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Section selection
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [sectionBgColor, setSectionBgColor] = useState("#ffffff");
  const [sectionTextColor, setSectionTextColor] = useState("#1a1a1a");
  const [sectionPaddingY, setSectionPaddingY] = useState(80);
  const [sectionPaddingX, setSectionPaddingX] = useState(40);

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

  // Handle image click from iframe
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

  // Listen for inline edits + section events from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "tipote:text-edit") {
        setSaving(true);
        clearTimeout((window as any).__tipoteSaveTimer);
        (window as any).__tipoteSaveTimer = setTimeout(() => {
          const iframe = iframeRef.current;
          if (iframe?.contentDocument) {
            const fullHtml = "<!DOCTYPE html>" + iframe.contentDocument.documentElement.outerHTML;
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
      // Section events
      if (e.data?.type === "tipote:sections-list") {
        setSections(e.data.sections || []);
      }
      if (e.data?.type === "tipote:section-click") {
        setSelectedSectionId(e.data.sectionId);
        setLeftTab("builder");
        setSidebarOpen(true);
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

  // Load leads
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

  // Publish
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
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

  // Copy URL
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

  // Download text as PDF
  const downloadTextPdf = useCallback(() => {
    const iframe = iframeRef.current;
    let textContent = "";
    if (iframe?.contentDocument) {
      const body = iframe.contentDocument.body;
      const elements = body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, span, a, button, blockquote, td, th");
      const seen = new Set<string>();
      elements.forEach((el) => {
        if (el.closest("script") || el.closest("style") || el.closest("noscript")) return;
        const text = (el.textContent || "").trim();
        if (!text || text.length < 3 || seen.has(text)) return;
        seen.add(text);
        const tag = el.tagName.toLowerCase();
        if (tag.startsWith("h")) textContent += `\n${"#".repeat(parseInt(tag[1]) || 1)} ${text}\n\n`;
        else if (tag === "li") textContent += `- ${text}\n`;
        else if (tag === "blockquote") textContent += `> ${text}\n\n`;
        else textContent += `${text}\n\n`;
      });
    } else {
      const cd = page.content_data;
      for (const [key, val] of Object.entries(cd)) {
        if (typeof val === "string" && val.trim() && !key.includes("url") && !key.includes("image") && !key.includes("color")) {
          textContent += `${val}\n\n`;
        }
      }
    }
    if (!textContent.trim()) textContent = "Aucun contenu texte disponible.";
    const printHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${page.title || "Page"} - Texte</title><style>@media print{@page{margin:2cm}}body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.8;font-size:14px}h1,h2,h3{font-family:-apple-system,sans-serif;margin-top:1.5em;margin-bottom:.5em;color:#111}h1{font-size:24px;border-bottom:2px solid #eee;padding-bottom:8px}p{margin:0 0 1em}li{margin-bottom:4px}.footer{margin-top:40px;border-top:1px solid #eee;font-size:11px;color:#999;padding-top:16px}</style></head><body><h1>${page.title || "Page"}</h1>${textContent.split("\n").map((l) => { const t = l.trim(); if (!t) return ""; if (t.startsWith("# ")) return `<h1>${t.slice(2)}</h1>`; if (t.startsWith("## ")) return `<h2>${t.slice(3)}</h2>`; if (t.startsWith("### ")) return `<h3>${t.slice(4)}</h3>`; if (t.startsWith("- ")) return `<li>${t.slice(2)}</li>`; if (t.startsWith("> ")) return `<blockquote>${t.slice(2)}</blockquote>`; return `<p>${t}</p>`; }).join("\n")}<div class="footer">Genere par Tipote</div></body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(printHtml); win.document.close(); win.onload = () => win.print(); setTimeout(() => win.print(), 500); }
  }, [page.content_data, page.title]);

  // Preview in new tab
  const openPreview = useCallback(() => {
    const win = window.open("", "_blank");
    if (win) { win.document.write(htmlPreview); win.document.close(); }
  }, [htmlPreview]);

  // OG image upload
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
        if (data.ok && data.url) setPublishOgUrl(data.url);
      } catch { /* ignore */ } finally { setUploadingOg(false); }
    };
    input.click();
  }, [page.id]);

  // Save thank-you
  const saveThankYou = useCallback(async () => {
    setSavingThankYou(true);
    try {
      await fetch(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thank_you_title: thankYouHeading, thank_you_message: thankYouMessage, thank_you_cta_text: thankYouCtaText, thank_you_cta_url: thankYouCtaUrl }),
      });
      setShowThankYouModal(false);
    } catch { /* ignore */ } finally { setSavingThankYou(false); }
  }, [page.id, thankYouHeading, thankYouMessage, thankYouCtaText, thankYouCtaUrl]);

  // Manual save (triggers re-render + persist)
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // If there's pending inline HTML edits, save them
      const iframe = iframeRef.current;
      if (iframe?.contentDocument) {
        const fullHtml = "<!DOCTYPE html>" + iframe.contentDocument.documentElement.outerHTML;
        pendingHtmlRef.current = fullHtml;
        await fetch(`/api/pages/${page.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html_snapshot: fullHtml, content_data: page.content_data, brand_tokens: page.brand_tokens }),
        });
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }, [page.id, page.content_data, page.brand_tokens]);

  // Section operations
  const selectSection = useCallback((sectionId: string | null) => {
    setSelectedSectionId(sectionId);
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      if (sectionId) {
        iframe.contentWindow.postMessage({ type: "tipote:select-section", sectionId }, "*");
      } else {
        iframe.contentWindow.postMessage({ type: "tipote:deselect-section" }, "*");
      }
    }
  }, []);

  const deleteSection = useCallback((sectionId: string) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:delete-section", sectionId }, "*");
    }
    setSelectedSectionId(null);
  }, []);

  const moveSection = useCallback((sectionId: string, direction: "up" | "down") => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:move-section", sectionId, direction }, "*");
    }
  }, []);

  const addElement = useCallback((elementType: string) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:add-element", elementType }, "*");
    }
  }, []);

  const updateSectionStyle = useCallback((sectionId: string, updates: Record<string, any>) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:update-section-style", sectionId, ...updates }, "*");
    }
  }, []);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${page.slug}` : `/p/${page.slug}`;
  const publishPreviewUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${publishSlug}` : `/p/${publishSlug}`;
  const isPublished = page.status === "published";
  const deviceCfg = DEVICE_CONFIG[device];

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#f0f2f5] dark:bg-[#0d1117]">

      {/* ════════════════ TOP BAR (Systeme.io style) ════════════════ */}
      <div className="h-12 shrink-0 flex items-center justify-between px-3 bg-white dark:bg-[#161b22] border-b border-border/50 shadow-sm">

        {/* Left: Sidebar toggle + Title */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 rounded-lg transition-colors ${sidebarOpen ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"}`}
            title="Panneau latéral"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Tipote logo mark */}
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-md gradient-primary flex items-center justify-center">
              <span className="text-white text-xs font-bold">t</span>
            </div>
            <span className="text-sm font-semibold text-foreground hidden sm:inline truncate max-w-[140px]">{page.title}</span>
          </div>

          {/* Saving indicator */}
          {saving && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">Sauvegarde...</span>
            </div>
          )}
          {uploadingImage && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">Upload...</span>
            </div>
          )}
        </div>

        {/* Center: Device toggle + Preview */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/60 rounded-lg p-0.5 gap-0.5">
            {(Object.keys(DEVICE_CONFIG) as Device[]).map((d) => {
              const Icon = DEVICE_CONFIG[d].icon;
              return (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${
                    device === d ? "bg-white dark:bg-[#21262d] shadow-sm font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{DEVICE_CONFIG[d].label}</span>
                </button>
              );
            })}
          </div>

          {/* Preview button */}
          <button onClick={openPreview} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Aperçu">
            <Play className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Actions + Sauvegarder + Sortir */}
        <div className="flex items-center gap-1.5">
          {/* Quick actions */}
          <div className="hidden sm:flex items-center gap-1">
            {(page.page_type === "capture" || page.template_kind === "capture") && (
              <button onClick={() => setShowThankYouModal(true)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Page de remerciement">
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => { setShowLeadsModal(true); loadLeads(); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground relative" title="Leads">
              <Users className="w-3.5 h-3.5" />
              {page.leads_count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {page.leads_count > 99 ? "+" : page.leads_count}
                </span>
              )}
            </button>
            <button onClick={downloadHtml} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Télécharger HTML">
              <Download className="w-3.5 h-3.5" />
            </button>
            {isPublished && (
              <button onClick={() => setShowQrModal(true)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="QR Code">
                <QrCode className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-border/50 mx-1 hidden sm:block" />

          {/* Publish / En ligne */}
          {isPublished ? (
            <div className="flex items-center gap-1">
              <button
                onClick={copyUrl}
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                {copied ? "Copié !" : "En ligne"}
              </button>
              <button
                onClick={handleUnpublish}
                disabled={publishing}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                title="Dépublier"
              >
                {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          ) : (
            <button
              onClick={openPublishModal}
              className="h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3 h-3" />
              Publier
            </button>
          )}

          {/* Sauvegarder */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-3 rounded-lg text-xs font-semibold border border-border hover:bg-muted flex items-center gap-1.5 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            <span className="hidden sm:inline">Sauvegarder</span>
          </button>

          {/* Sortir */}
          <button
            onClick={onBack}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Sortir
          </button>
        </div>
      </div>

      {/* Published URL bar (slim) */}
      {isPublished && (
        <div className="h-7 shrink-0 flex items-center gap-2 px-3 bg-green-50 dark:bg-green-950/20 border-b border-green-200/50 text-xs">
          <Globe className="w-3 h-3 text-green-600" />
          <a href={publicUrl} target="_blank" rel="noopener" className="text-green-600 underline truncate">
            {publicUrl}
          </a>
          <button onClick={copyUrl} className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30">
            {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-green-600" />}
          </button>
          <span className="text-green-600/50 ml-auto hidden sm:inline">Modifications en temps réel</span>
        </div>
      )}

      {/* ════════════════ MAIN AREA ════════════════ */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ──── LEFT SIDEBAR (Builder + Paramètres + Chat IA) ──── */}
        {sidebarOpen && (
          <div className="w-[300px] shrink-0 bg-white dark:bg-[#161b22] border-r border-border/50 flex flex-col overflow-hidden">

            {/* Tab switcher */}
            <div className="flex border-b border-border/30">
              <button
                onClick={() => setLeftTab("builder")}
                className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
                  leftTab === "builder" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="w-3 h-3 inline mr-1" />
                Builder
              </button>
              <button
                onClick={() => setLeftTab("parametres")}
                className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
                  leftTab === "parametres" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Settings className="w-3 h-3 inline mr-1" />
                Paramètres
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* ──── BUILDER TAB ──── */}
              {leftTab === "builder" && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">

                    {/* Section list */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Sections</p>
                        {selectedSectionId && (
                          <button onClick={() => selectSection(null)} className="text-[10px] text-primary hover:underline">
                            Désélectionner
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {sections.length === 0 && (
                          <p className="text-[11px] text-muted-foreground/60 py-2">Clique sur une section dans l&apos;aperçu</p>
                        )}
                        {sections.map((s) => (
                          <div
                            key={s.id}
                            className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-xs ${
                              selectedSectionId === s.id
                                ? "bg-primary/10 border border-primary/30 text-primary font-medium"
                                : "hover:bg-muted/50 border border-transparent"
                            }`}
                            onClick={() => selectSection(s.id)}
                          >
                            <MousePointer className="w-3 h-3 shrink-0 opacity-50" />
                            <span className="flex-1 truncate">{s.label}</span>

                            {/* Section actions (visible on hover or when selected) */}
                            <div className={`flex items-center gap-0.5 ${selectedSectionId === s.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                              <button
                                onClick={(e) => { e.stopPropagation(); moveSection(s.id, "up"); }}
                                className="p-0.5 rounded hover:bg-muted"
                                title="Monter"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); moveSection(s.id, "down"); }}
                                className="p-0.5 rounded hover:bg-muted"
                                title="Descendre"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteSection(s.id); }}
                                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                                title="Supprimer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Section properties (when selected) */}
                    {selectedSectionId && (
                      <div className="pt-3 border-t border-border/30 space-y-3">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Propriétés</p>

                        {/* Background color */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Arrière-fond</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={sectionBgColor}
                              onChange={(e) => {
                                setSectionBgColor(e.target.value);
                                updateSectionStyle(selectedSectionId, { bgColor: e.target.value });
                              }}
                              className="w-6 h-6 rounded border cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Text color */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Couleur texte</span>
                          <input
                            type="color"
                            value={sectionTextColor}
                            onChange={(e) => {
                              setSectionTextColor(e.target.value);
                              updateSectionStyle(selectedSectionId, { textColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded border cursor-pointer"
                          />
                        </div>

                        {/* Padding Y */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">Rembourrage vertical</span>
                            <span className="text-[10px] text-muted-foreground">{sectionPaddingY}px</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={200}
                            value={sectionPaddingY}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSectionPaddingY(v);
                              updateSectionStyle(selectedSectionId, { paddingY: v });
                            }}
                            className="w-full h-1.5 accent-primary"
                          />
                        </div>

                        {/* Padding X */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">Rembourrage horizontal</span>
                            <span className="text-[10px] text-muted-foreground">{sectionPaddingX}px</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={120}
                            value={sectionPaddingX}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSectionPaddingX(v);
                              updateSectionStyle(selectedSectionId, { paddingX: v });
                            }}
                            className="w-full h-1.5 accent-primary"
                          />
                        </div>
                      </div>
                    )}

                    {/* Element palette */}
                    <div className="pt-3 border-t border-border/30">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ajouter un élément</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {ELEMENT_PALETTE.map((el) => {
                          const Icon = el.icon;
                          return (
                            <button
                              key={el.type}
                              onClick={() => addElement(el.type)}
                              className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-border/50 hover:bg-muted/50 hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
                            >
                              <Icon className="w-4 h-4" />
                              <span className="text-[10px]">{el.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inline editing tip */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/50">
                      <span className="text-[10px] text-blue-700 dark:text-blue-300">💡 Clique sur un texte ou une image dans l&apos;aperçu pour le modifier directement.</span>
                    </div>
                  </div>

                  {/* ──── AI CHAT (bottom of builder tab) ──── */}
                  <div className="h-[280px] shrink-0 border-t border-border/30">
                    <PageChatBar
                      pageId={page.id}
                      templateId={page.template_id}
                      kind={page.template_kind as "capture" | "vente" | "vitrine"}
                      contentData={page.content_data}
                      brandTokens={page.brand_tokens}
                      onUpdate={handleChatUpdate}
                      locale={page.locale}
                      compact
                    />
                  </div>
                </div>
              )}

              {/* ──── PARAMETRES TAB ──── */}
              {leftTab === "parametres" && (
                <div className="p-3 space-y-4">
                  {/* URL / Slug */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                      <Link2 className="w-3 h-3" /> URL
                    </label>
                    <div className="flex items-center gap-1 bg-muted/30 rounded-lg px-2 py-1.5 border text-xs">
                      <span className="text-muted-foreground whitespace-nowrap">/p/</span>
                      <input
                        type="text"
                        value={page.slug}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                          handleSettingUpdate("slug", val);
                        }}
                        className="flex-1 bg-transparent font-medium focus:outline-none min-w-0"
                      />
                    </div>
                  </div>

                  {/* SEO */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                      <FileText className="w-3 h-3" /> Description SEO
                    </label>
                    <textarea
                      value={page.meta_description || ""}
                      onChange={(e) => handleSettingUpdate("meta_description", e.target.value)}
                      className="w-full px-2 py-1.5 border rounded-lg text-xs resize-none"
                      rows={2}
                      maxLength={160}
                      placeholder="Description pour Google..."
                    />
                  </div>

                  {/* Systeme.io tag */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                      <Tag className="w-3 h-3" /> Tag Systeme.io
                    </label>
                    <input
                      type="text"
                      value={page.sio_capture_tag || ""}
                      onChange={(e) => handleSettingUpdate("sio_capture_tag", e.target.value)}
                      placeholder="capture-ebook"
                      className="w-full px-2 py-1.5 border rounded-lg text-xs"
                    />
                  </div>

                  {/* OG Image */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                      <ImageIcon className="w-3 h-3" /> Image de partage
                    </label>
                    {page.og_image_url ? (
                      <div className="relative rounded-lg overflow-hidden border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={page.og_image_url} alt="OG" className="w-full h-20 object-cover" />
                        <button
                          onClick={() => handleSettingUpdate("og_image_url", "")}
                          className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white hover:bg-black/70"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleOgImageUpload}
                        className="w-full py-4 border border-dashed rounded-lg text-xs text-muted-foreground hover:bg-muted/30 flex flex-col items-center gap-1"
                      >
                        <Upload className="w-4 h-4" />
                        Ajouter
                      </button>
                    )}
                  </div>

                  {/* Tracking */}
                  <div className="pt-2 border-t border-border/30">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Tracking</p>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={page.facebook_pixel_id || ""}
                        onChange={(e) => handleSettingUpdate("facebook_pixel_id", e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="Facebook Pixel ID"
                        className="w-full px-2 py-1.5 border rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        value={page.google_tag_id || ""}
                        onChange={(e) => handleSettingUpdate("google_tag_id", e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                        placeholder="Google Tag (G-XXXX)"
                        className="w-full px-2 py-1.5 border rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Thank-you page (capture only) */}
                  {(page.page_type === "capture" || page.template_kind === "capture") && (
                    <div className="pt-2 border-t border-border/30">
                      <button
                        onClick={() => setShowThankYouModal(true)}
                        className="w-full py-2 border rounded-lg text-xs font-medium hover:bg-muted/30 flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3 h-3" />
                        Page de remerciement
                      </button>
                    </div>
                  )}

                  {/* Downloads */}
                  <div className="pt-2 border-t border-border/30">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Exports</p>
                    <div className="flex gap-2">
                      <button onClick={downloadHtml} className="flex-1 py-1.5 border rounded-lg text-xs hover:bg-muted/30 flex items-center justify-center gap-1">
                        <Download className="w-3 h-3" /> HTML
                      </button>
                      <button onClick={downloadTextPdf} className="flex-1 py-1.5 border rounded-lg text-xs hover:bg-muted/30 flex items-center justify-center gap-1">
                        <FileDown className="w-3 h-3" /> PDF
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="pt-2 border-t border-border/30">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Statistiques</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-muted/30 text-center">
                        <p className="text-lg font-bold">{page.views_count}</p>
                        <p className="text-[10px] text-muted-foreground">Vues</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 text-center">
                        <p className="text-lg font-bold">{page.leads_count}</p>
                        <p className="text-[10px] text-muted-foreground">Leads</p>
                      </div>
                    </div>
                    {page.leads_count > 0 && (
                      <button
                        onClick={() => { setShowLeadsModal(true); loadLeads(); }}
                        className="w-full mt-2 py-1.5 border rounded-lg text-xs hover:bg-muted/30 flex items-center justify-center gap-1"
                      >
                        <Users className="w-3 h-3" /> Voir les leads
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──── PREVIEW AREA (full width) ──── */}
        <div className="flex-1 flex justify-center overflow-auto p-2 sm:p-4 min-h-0">
          <div
            className="bg-white shadow-lg rounded-lg overflow-hidden transition-all duration-300"
            style={{
              width: device === "desktop" ? "100%" : `${deviceCfg.width}px`,
              maxWidth: device === "desktop" ? "100%" : `${deviceCfg.width}px`,
              height: "100%",
              minHeight: "300px",
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
      </div>

      {/* ════════════════ MODALS ════════════════ */}

      {/* PUBLISH MODAL */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPublishModal(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Publier ta page</h2>
                <p className="text-sm text-muted-foreground">Configure les paramètres avant la mise en ligne.</p>
              </div>
              <button onClick={() => setShowPublishModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* URL */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Link2 className="w-4 h-4 text-muted-foreground" /> URL de partage
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

              {/* Tag SIO */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Tag className="w-4 h-4 text-muted-foreground" /> Tag Systeme.io
                </label>
                <input type="text" value={publishTag} onChange={(e) => setPublishTag(e.target.value)} placeholder="capture-ebook" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              {/* OG Image */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" /> Image de partage
                </label>
                {publishOgUrl ? (
                  <div className="relative rounded-lg overflow-hidden border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publishOgUrl} alt="OG preview" className="w-full h-32 object-cover" />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button onClick={handleOgImageUpload} className="p-1.5 rounded-md bg-background/80 hover:bg-background border text-xs">Changer</button>
                      <button onClick={() => setPublishOgUrl("")} className="p-1.5 rounded-md bg-background/80 hover:bg-background border text-xs text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={handleOgImageUpload} disabled={uploadingOg} className="w-full py-8 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:bg-muted/30 flex flex-col items-center gap-2">
                    {uploadingOg ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Upload className="w-5 h-5" /><span>Ajouter une image</span></>}
                  </button>
                )}
              </div>

              {/* Meta desc */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Description SEO
                </label>
                <textarea value={publishMetaDesc} onChange={(e) => setPublishMetaDesc(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm resize-none" rows={3} maxLength={160} placeholder="Description pour Google..." />
                <p className="text-[10px] text-muted-foreground mt-1">{publishMetaDesc.length}/160</p>
              </div>

              {/* Tracking */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">Facebook Pixel ID</label>
                  <input type="text" value={publishFbPixel} onChange={(e) => setPublishFbPixel(e.target.value.replace(/[^0-9]/g, ""))} placeholder="123456789012345" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">Google Tag</label>
                  <input type="text" value={publishGtag} onChange={(e) => setPublishGtag(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))} placeholder="G-XXXXXXXXXX" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="p-6 pt-4 border-t flex items-center justify-end gap-3">
              <button onClick={() => setShowPublishModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-muted">Annuler</button>
              <button onClick={handlePublish} disabled={publishing || !publishSlug.trim()} className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                Mettre en ligne
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEADS MODAL */}
      {showLeadsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLeadsModal(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Leads capturés</h2>
                <p className="text-sm text-muted-foreground">
                  {leadsData.length} lead{leadsData.length !== 1 ? "s" : ""} · {page.views_count > 0 ? ((page.leads_count / page.views_count) * 100).toFixed(1) : "0"}% conversion
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadLeadsCsv} className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button onClick={() => setShowLeadsModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {leadsLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : leadsData.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Aucun lead pour le moment.</p>
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
                        </p>
                      </div>
                      {lead.sio_synced && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">Sync SIO</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR CODE MODAL */}
      {showQrModal && isPublished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowQrModal(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">QR Code</h2>
              <button onClick={() => setShowQrModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(publicUrl)}`} alt="QR Code" className="w-60 h-60 rounded-lg border" />
              <p className="text-xs text-muted-foreground text-center break-all">{publicUrl}</p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => { const l = document.createElement("a"); l.href = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=${encodeURIComponent(publicUrl)}`; l.download = `qr-${page.slug}.png`; l.click(); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border hover:bg-muted flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> PNG
                </button>
                <button onClick={copyUrl} className="flex-1 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1.5">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copié !" : "Copier"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THANK-YOU MODAL */}
      {showThankYouModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowThankYouModal(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Page de remerciement</h2>
                <p className="text-sm text-muted-foreground">Affichée après inscription.</p>
              </div>
              <button onClick={() => setShowThankYouModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Titre</label>
                <input type="text" value={thankYouHeading} onChange={(e) => setThankYouHeading(e.target.value)} placeholder="Merci !" className="w-full px-3 py-2 border rounded-lg text-sm" maxLength={100} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message</label>
                <textarea value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value)} placeholder="Tu vas recevoir un email..." className="w-full px-3 py-2 border rounded-lg text-sm resize-none" rows={4} maxLength={500} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Bouton (optionnel)</label>
                <input type="text" value={thankYouCtaText} onChange={(e) => setThankYouCtaText(e.target.value)} placeholder="Rejoindre le groupe" className="w-full px-3 py-2 border rounded-lg text-sm mb-2" maxLength={50} />
                <input type="url" value={thankYouCtaUrl} onChange={(e) => setThankYouCtaUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              {/* Preview */}
              <div className="rounded-xl border bg-muted/20 p-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">Aperçu</p>
                <div className="text-3xl mb-2">&#10003;</div>
                <h3 className="text-lg font-bold mb-2">{thankYouHeading || "Merci !"}</h3>
                <p className="text-sm text-muted-foreground mb-4">{thankYouMessage || "..."}</p>
                {thankYouCtaText && <span className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">{thankYouCtaText}</span>}
              </div>
            </div>
            <div className="p-6 pt-4 border-t flex items-center justify-end gap-3">
              <button onClick={() => setShowThankYouModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-muted">Annuler</button>
              <button onClick={saveThankYou} disabled={savingThankYou} className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
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
