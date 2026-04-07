// components/pages/PageBuilder.tsx
// Full-screen page builder inspired by Systeme.io.
// Layout: top bar (logo + devices + save/exit) + optional left sidebar + full preview + Chat IA right.
// All settings accessible from a left panel (Paramètres) instead of modals.

"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
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
  Copy as CopyIcon, Columns, Video, LayoutGrid, Sparkles,
  Undo2, Redo2,
} from "lucide-react";
import PageChatBar from "./PageChatBar";
import { SioTagPicker } from "@/components/ui/sio-tag-picker";

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

const DEVICE_WIDTHS: Record<Device, { width: number; icon: typeof Monitor }> = {
  mobile: { width: 375, icon: Smartphone },
  tablet: { width: 768, icon: Tablet },
  desktop: { width: 1200, icon: Monitor },
};

// ---------- Left sidebar tabs ----------

type LeftTab = "builder" | "parametres";

// ---------- Selected element info from iframe ----------

type SelectedElementInfo = {
  /** Auto-generated id on the element */
  elId: string;
  /** Detected type: section, heading, text, image, button, list, row, divider, nav, form, unknown */
  elType: string;
  /** Display label */
  label: string;
  /** Breadcrumb path, e.g. ["Section", "Rangée", "Titre"] */
  breadcrumb: string[];
  /** Current computed styles */
  styles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    textAlign: string;
    paddingTop: string;
    paddingBottom: string;
    paddingLeft: string;
    paddingRight: string;
    marginTop: string;
    marginBottom: string;
    borderRadius: string;
    borderWidth: string;
    borderColor: string;
    borderStyle: string;
    backgroundImage: string;
    fontFamily: string;
  };
  /** Text content (for text elements) */
  text: string;
  /** Tag name */
  tagName: string;
  /** Whether it has a link (href) */
  href: string;
  /** Image src if image */
  imgSrc: string;
  /** Image data-tipote-img-id if image */
  imgId: string;
};

type SectionInfo = {
  id: string;
  label: string;
  tagName: string;
  classes: string;
  top: number;
  anchorId?: string;
};

// Elements palette (labels translated inside component)
const ELEMENT_PALETTE_KEYS = [
  { type: "section", tKey: "addElement.section", icon: LayoutGrid },
  { type: "row", tKey: "addElement.row", icon: Columns },
  { type: "heading", tKey: "addElement.heading", icon: Heading },
  { type: "text", tKey: "addElement.text", icon: AlignLeft },
  { type: "button", tKey: "addElement.button", icon: Square },
  { type: "image", tKey: "addElement.image", icon: ImageIcon },
  { type: "video", tKey: "addElement.video", icon: Video },
  { type: "divider", tKey: "addElement.divider", icon: Minus },
  { type: "columns", tKey: "addElement.columns", icon: Columns },
  { type: "link", tKey: "addElement.link", icon: Link2 },
];

// Google Fonts available
const GOOGLE_FONTS = [
  "Inter", "DM Sans", "Poppins", "Montserrat", "Playfair Display",
  "Raleway", "Open Sans", "Lato", "Roboto", "Nunito",
  "Oswald", "Merriweather", "Source Sans 3", "Ubuntu", "PT Sans",
  "Rubik", "Work Sans", "Quicksand", "Josefin Sans", "Crimson Text",
];

// CSS animations (labels translated inside component)
const CSS_ANIMATION_KEYS = [
  { value: "none", tKey: "controls.animNone" },
  { value: "fadeIn", tKey: "controls.animFade" },
  { value: "fadeUp", tKey: "controls.animFadeUp" },
  { value: "slideInLeft", tKey: "controls.animSlideLeft" },
  { value: "slideInRight", tKey: "controls.animSlideRight" },
  { value: "zoomIn", tKey: "controls.animZoom" },
  { value: "bounce", tKey: "controls.animBounce" },
  { value: "pulse", tKey: "controls.animPulse" },
];

// EL_TYPE_LABELS moved inside component as elTypeLabels (translated)

// ---------- Always-on inline editing script ----------

const INLINE_EDIT_SCRIPT = `
<script data-tipote-injected="1">
(function(){
  var editableSelectors = 'h1, h2, h3, h4, h5, h6, p, span, li, a, button, blockquote, figcaption, td, th, label, .hero-title, .hero-subtitle, .cta-text, [data-editable]';
  var illustSelectors = '.tp-illust, .tp-visual, .tp-mockup, [data-tipote-visual], svg:not(.tp-toolbar-icon):not(button svg):not(a svg):not(form svg):not(nav svg):not(label svg), .tp-float, [class*="illustration"], [class*="animation"]';

  /* ── Toolbar element (shared, moves to focused element) ── */
  var toolbar = document.createElement('div');
  toolbar.className = 'tipote-toolbar';
  toolbar.style.cssText = 'position:fixed;z-index:99999;display:none;align-items:center;gap:4px;padding:4px 8px;background:#1e293b;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.25);pointer-events:auto;transition:opacity 0.15s;';
  toolbar.setAttribute('data-tipote-injected', '1');

  var btnStyle = 'display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:5px;cursor:pointer;background:transparent;color:rgba(255,255,255,0.7);padding:0;transition:background 0.15s,color 0.15s;';
  var btnHover = 'background:rgba(255,255,255,0.15);color:#fff;';
  var sepStyle = 'width:1px;height:18px;background:rgba(255,255,255,0.15);flex-shrink:0;';

  toolbar.innerHTML =
    '<button class="tp-fmt-btn" data-cmd="bold" title="Gras (Ctrl+B)" style="' + btnStyle + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"/><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg></button>' +
    '<button class="tp-fmt-btn" data-cmd="italic" title="Italique (Ctrl+I)" style="' + btnStyle + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>' +
    '<button class="tp-fmt-btn" data-cmd="underline" title="Souligner (Ctrl+U)" style="' + btnStyle + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg></button>' +
    '<div style="' + sepStyle + '"></div>' +
    '<button class="tp-fmt-btn" data-cmd="insertUnorderedList" title="Liste à puces" style="' + btnStyle + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg></button>' +
    '<div style="' + sepStyle + '"></div>' +
    '<input type="color" class="tp-color-input" title="Couleur du texte" style="width:24px;height:24px;border:2px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;background:none;padding:0;-webkit-appearance:none;appearance:none;overflow:hidden;" />';
  document.body.appendChild(toolbar);

  /* Formatting button handlers */
  toolbar.querySelectorAll('.tp-fmt-btn').forEach(function(btn) {
    btn.addEventListener('mouseenter', function() { btn.style.background = 'rgba(255,255,255,0.15)'; btn.style.color = '#fff'; });
    btn.addEventListener('mouseleave', function() { btn.style.background = 'transparent'; btn.style.color = 'rgba(255,255,255,0.7)'; });
    btn.addEventListener('mousedown', function(e) {
      e.preventDefault(); // preserve text selection
      e.stopPropagation();
    });
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var cmd = btn.getAttribute('data-cmd');
      if (cmd && activeEl) {
        document.execCommand(cmd, false, null);
        parent.postMessage({ type: 'tipote:text-edit', tag: activeEl.tagName.toLowerCase(), text: (activeEl.innerText || '').trim(), html: activeEl.innerHTML }, '*');
      }
    });
  });

  var colorInput = toolbar.querySelector('.tp-color-input');
  var activeEl = null;

  colorInput.addEventListener('input', function(e) {
    if (activeEl) {
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed && activeEl.contains(sel.anchorNode)) {
        // Apply color only to selected text using execCommand
        document.execCommand('foreColor', false, e.target.value);
      } else {
        // No selection: apply to entire element
        activeEl.style.color = e.target.value;
      }
      parent.postMessage({ type: 'tipote:text-edit', tag: activeEl.tagName.toLowerCase(), text: (activeEl.innerText || '').trim(), html: activeEl.innerHTML }, '*');
    }
  });
  colorInput.addEventListener('click', function(e) { e.stopPropagation(); });

  /* ── Illustration overlay element (shared) ── */
  var illustOverlay = document.createElement('div');
  illustOverlay.className = 'tipote-illust-overlay';
  illustOverlay.style.cssText = 'position:fixed;z-index:99998;display:none;align-items:center;justify-content:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);border-radius:10px;pointer-events:auto;';
  illustOverlay.setAttribute('data-tipote-injected', '1');
  illustOverlay.innerHTML = '<button class="tp-illust-btn tp-illust-delete" title={t("elementActions.delete")} style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,70,70,0.2);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:system-ui;">'+
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

  /* ── Element selection highlight ── */
  var elHighlight = document.createElement('div');
  elHighlight.style.cssText = 'position:absolute;z-index:99989;pointer-events:none;border:2px solid #5D6CDB;background:rgba(93,108,219,0.06);display:none;transition:all 0.12s ease;border-radius:4px;';
  elHighlight.setAttribute('data-tipote-injected', '1');
  var elLabel = document.createElement('div');
  elLabel.style.cssText = 'position:absolute;top:-20px;left:0;background:#5D6CDB;color:#fff;font-size:10px;font-family:system-ui;padding:1px 6px;border-radius:3px 3px 0 0;white-space:nowrap;';
  elHighlight.appendChild(elLabel);
  document.body.appendChild(elHighlight);
  var selectedEl = null;

  function detectElType(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'img' || el.hasAttribute('data-tipote-img-id') || (tag !== 'a' && tag !== 'button' && el.querySelector && el.querySelector(':scope > img'))) return 'image';
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'heading';
    if (tag === 'a' && (el.classList.contains('tp-cta-btn') || el.classList.contains('tp-cta') || el.classList.contains('tp-final-btn'))) return 'button';
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'li') return 'list-item';
    if (tag === 'hr') return 'divider';
    if (tag === 'blockquote') return 'blockquote';
    if (tag === 'form') return 'form';
    if (tag === 'nav') return 'nav';
    if (tag === 'p' || tag === 'span' || tag === 'label' || tag === 'figcaption' || tag === 'td' || tag === 'th') return 'text';
    if (tag === 'video' || tag === 'iframe') return 'video';
    // Check if it's a section-level element
    var cls = el.className || '';
    if (cls.indexOf('tp-hero') >= 0 || cls.indexOf('tp-section') >= 0 || cls.indexOf('tp-final-cta') >= 0 || cls.indexOf('tp-footer') >= 0 || cls.indexOf('tp-header-bar') >= 0) return 'section';
    if (el.style && (el.style.display === 'flex' || el.style.display === 'grid') && el.children.length > 1) return 'row';
    var cs = getComputedStyle(el);
    if ((cs.display === 'flex' || cs.display === 'grid') && el.children.length > 1) return 'row';
    // Check for divs with data-editable or content
    if (tag === 'div' && el.hasAttribute('data-editable')) return 'text';
    if (tag === 'section') return 'section';
    return 'unknown';
  }

  function buildBreadcrumb(el) {
    var crumbs = [];
    var cur = el;
    var maxDepth = 6;
    while (cur && cur !== document.body && maxDepth-- > 0) {
      var t = detectElType(cur);
      var labels = { section:'Section', heading:'Titre', text:'Texte', image:'Image', button:'Bouton', list:'Liste', 'list-item':'Item', row:'Rangée', divider:'Séparateur', nav:'Navigation', form:'Formulaire', link:'Lien', blockquote:'Citation', unknown:'' };
      var lbl = labels[t] || '';
      if (lbl && (crumbs.length === 0 || crumbs[crumbs.length-1] !== lbl)) crumbs.push(lbl);
      if (t === 'section') break;
      cur = cur.parentElement;
    }
    crumbs.reverse();
    return crumbs;
  }

  function getElStyles(el) {
    var cs = getComputedStyle(el);
    // Detect the actual visible text color (may come from child spans/fonts)
    var textColor = cs.color;
    var fillColor = cs.webkitTextFillColor || cs.getPropertyValue('-webkit-text-fill-color');
    if (fillColor && fillColor !== 'inherit' && fillColor !== 'initial' && fillColor !== 'currentcolor' && fillColor !== textColor) {
      textColor = fillColor;
    }
    // If element has children with a more specific color, prefer that
    var firstInline = el.querySelector('span, font, strong, em, b, i, a');
    if (firstInline) {
      var childColor = getComputedStyle(firstInline).color;
      if (childColor && childColor !== textColor) textColor = childColor;
    }
    return {
      color: rgbToHex(textColor),
      backgroundColor: cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'transparent' : rgbToHex(cs.backgroundColor),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      textAlign: cs.textAlign,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      borderRadius: cs.borderRadius,
      borderWidth: cs.borderWidth || cs.borderTopWidth || '0px',
      borderColor: cs.borderColor ? rgbToHex(cs.borderColor) : '#000000',
      borderStyle: cs.borderStyle || 'none',
      backgroundImage: el.style.backgroundImage || cs.backgroundImage || 'none',
      fontFamily: cs.fontFamily || ''
    };
  }

  function sendElSelected(el) {
    if (!el) return;
    if (!el.id) el.id = 'tp-el-' + Date.now() + '-' + Math.random().toString(36).substr(2,4);
    var elType = detectElType(el);
    var typeLabels = { section:'Section', heading:'Titre', text:'Texte', image:'Image', button:'Bouton', list:'Liste', 'list-item':'Élément', row:'Rangée', divider:'Séparateur', nav:'Navigation', form:'Formulaire', link:'Lien', blockquote:'Citation', unknown:'Élément' };
    var label = typeLabels[elType] || 'Élément';
    // For headings/text, add a preview of the content
    if ((elType === 'heading' || elType === 'text' || elType === 'button' || elType === 'link') && el.textContent) {
      var preview = el.textContent.trim().substring(0, 30);
      if (preview) label += ' : ' + preview + (el.textContent.trim().length > 30 ? '...' : '');
    }

    var imgEl = el.tagName === 'IMG' ? el : el.querySelector('img');
    parent.postMessage({
      type: 'tipote:element-selected',
      elId: el.id,
      elType: elType,
      label: label,
      breadcrumb: buildBreadcrumb(el),
      styles: getElStyles(el),
      text: (el.innerText || '').trim().substring(0, 200),
      tagName: el.tagName.toLowerCase(),
      href: el.getAttribute('href') || '',
      imgSrc: imgEl ? (imgEl.src || '') : '',
      imgId: el.getAttribute('data-tipote-img-id') || (imgEl ? imgEl.getAttribute('data-tipote-img-id') || '' : '')
    }, '*');
  }

  function highlightEl(el) {
    if (!el) { elHighlight.style.display = 'none'; return; }
    var rect = el.getBoundingClientRect();
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var scrollX = window.scrollX || document.documentElement.scrollLeft;
    elHighlight.style.display = 'block';
    elHighlight.style.left = (rect.left + scrollX - 2) + 'px';
    elHighlight.style.top = (rect.top + scrollY - 2) + 'px';
    elHighlight.style.width = (rect.width + 4) + 'px';
    elHighlight.style.height = (rect.height + 4) + 'px';
    var typeLabels = { section:'Section', heading:'Titre', text:'Texte', image:'Image', button:'Bouton', list:'Liste', 'list-item':'Item', row:'Rangée', divider:'Séparateur', nav:'Nav', form:'Form', link:'Lien', blockquote:'Citation', unknown:'' };
    elLabel.textContent = typeLabels[detectElType(el)] || '';
  }

  /* ── Make all text elements editable ── */
  document.querySelectorAll(editableSelectors).forEach(function(el) {
    if (el.closest('script') || el.closest('style') || el.closest('noscript') || el.closest('.tipote-toolbar') || el.closest('.tipote-illust-overlay')) return;
    if (el.children.length > 3 && !el.hasAttribute('data-editable')) return;
    el.contentEditable = 'true';
    el.style.outline = 'none';
    el.style.cursor = 'text';

    el.addEventListener('focus', function() {
      activeEl = el;
      selectedEl = el;
      toolbar.style.display = 'flex';
      var elCs = getComputedStyle(el);
      var elColor = elCs.color;
      // Check children for more specific color
      var firstInl = el.querySelector('span, font, strong, em, b, i, a');
      if (firstInl) { var cc = getComputedStyle(firstInl).color; if (cc && cc !== elColor) elColor = cc; }
      colorInput.value = rgbToHex(elColor);
      setTimeout(function() { positionAbove(el, toolbar); }, 0);
      highlightEl(el);
      sendElSelected(el);
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
    // ✅ Skip SVGs inside interactive elements (buttons, links, forms, nav)
    if (el.tagName === 'svg' && el.closest('button, a, form, nav, label, .tp-nav-burger')) return;

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

  /* ── Click outside to dismiss overlays + generic element selection ── */
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.tipote-illust-overlay') && !e.target.closest(illustSelectors)) {
      illustOverlay.style.display = 'none';
      activeIllust = null;
    }
    // Generic element selection: for any click, detect and highlight the nearest meaningful element
    var clicked = e.target;
    if (clicked.closest('.tipote-toolbar') || clicked.closest('.tipote-illust-overlay') || clicked === elHighlight) return;
    // Find the closest meaningful element (not body/html)
    var meaningful = clicked;
    // If it's a tiny inline element, go up to find something meaningful
    var maxUp = 8;
    while (meaningful && meaningful !== document.body && maxUp-- > 0) {
      var mt = detectElType(meaningful);
      if (mt !== 'unknown') break;
      // Also accept divs with editable content or that look like content blocks
      if (meaningful.tagName === 'DIV' && meaningful.textContent && meaningful.textContent.trim().length > 0 && meaningful.children.length <= 5) {
        break;
      }
      meaningful = meaningful.parentElement;
    }
    if (meaningful && meaningful !== document.body) {
      var mt = detectElType(meaningful);
      if (mt === 'section' || mt === 'nav' || mt === 'form') {
        // Section-level: hide element highlight (section handler shows sectionHighlight)
        elHighlight.style.display = 'none';
        selectedEl = null;
      } else {
        // Regular element: show element highlight, hide section highlight
        sectionHighlight.style.display = 'none';
        selectedSectionEl = null;
        selectedEl = meaningful;
        highlightEl(meaningful);
      }
      sendElSelected(meaningful);
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
    if (!rgb || rgb === 'transparent' || rgb === 'inherit' || rgb === 'initial') return '#000000';
    if (rgb.charAt(0) === '#') return rgb.length === 4 ? '#' + rgb[1]+rgb[1]+rgb[2]+rgb[2]+rgb[3]+rgb[3] : rgb.substring(0, 7);
    var m = rgb.match(/([\d.]+)/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0,3).map(function(x) { return Math.round(parseFloat(x)).toString(16).padStart(2,'0'); }).join('');
  }

  /* ── Section detection: identify all top-level sections ── */
  var sectionSelectors = '.tp-header-bar, .tp-hero, .tp-section, .tp-final-cta, .tp-footer, nav, [class*="tp-section"]';
  var allSections = document.querySelectorAll(sectionSelectors);
  var sectionList = [];
  var selectedSectionEl = null;
  var sectionHighlight = document.createElement('div');
  sectionHighlight.style.cssText = 'position:absolute;z-index:99990;pointer-events:none;border:2px solid #5D6CDB;background:rgba(93,108,219,0.05);display:none;transition:all 0.15s ease;';
  sectionHighlight.setAttribute('data-tipote-injected', '1');
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

    var anchorId = el.getAttribute('id') || '';
    sectionList.push({ id: id, label: label, tagName: el.tagName, classes: cls, top: el.offsetTop, idx: i, anchorId: anchorId });

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
            updated.push({ id: el.id, label: t ? (t.textContent || '').trim().substring(0,40) : 'Section', tagName: el.tagName, classes: el.className || '', top: el.offsetTop, idx: i, anchorId: el.getAttribute('id') || '' });
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
          updated.push({ id: el.id, label: t ? (t.textContent || '').trim().substring(0,40) : 'Section', tagName: el.tagName, classes: el.className || '', top: el.offsetTop, idx: i, anchorId: el.getAttribute('id') || '' });
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
        case 'section':
          newEl = document.createElement('section');
          newEl.className = 'tp-section';
          newEl.style.cssText = 'padding:60px 0;';
          var secContainer = document.createElement('div');
          secContainer.className = 'tp-container';
          secContainer.innerHTML = '<h2 class="tp-section-title" data-editable="true" contenteditable="true" style="outline:none;cursor:text;">Nouvelle section</h2><p data-editable="true" contenteditable="true" style="outline:none;cursor:text;margin:16px 0;">Contenu de la section. Cliquez pour modifier.</p>';
          newEl.appendChild(secContainer);
          break;
        case 'row':
          newEl = document.createElement('div');
          newEl.style.cssText = 'display:flex;gap:24px;margin:24px 0;flex-wrap:wrap;';
          newEl.innerHTML = '<div style="flex:1;min-width:200px;padding:20px;background:#f8fafc;border-radius:12px;"><p data-editable="true" contenteditable="true" style="outline:none;cursor:text;">Colonne 1</p></div><div style="flex:1;min-width:200px;padding:20px;background:#f8fafc;border-radius:12px;"><p data-editable="true" contenteditable="true" style="outline:none;cursor:text;">Colonne 2</p></div>';
          break;
        case 'columns':
          newEl = document.createElement('div');
          newEl.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:24px 0;';
          newEl.innerHTML = '<div style="padding:24px;background:#f8fafc;border-radius:12px;text-align:center;"><p data-editable="true" contenteditable="true" style="outline:none;cursor:text;font-weight:600;">Colonne 1</p></div><div style="padding:24px;background:#f8fafc;border-radius:12px;text-align:center;"><p data-editable="true" contenteditable="true" style="outline:none;cursor:text;font-weight:600;">Colonne 2</p></div><div style="padding:24px;background:#f8fafc;border-radius:12px;text-align:center;"><p data-editable="true" contenteditable="true" style="outline:none;cursor:text;font-weight:600;">Colonne 3</p></div>';
          break;
        case 'video':
          newEl = document.createElement('div');
          newEl.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:24px auto;max-width:800px;background:#1e293b;border-radius:12px;';
          newEl.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;flex-direction:column;gap:8px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Coller l\\\'URL de la vidéo</span></div>';
          break;
        case 'link':
          newEl = document.createElement('a');
          newEl.href = '#';
          newEl.setAttribute('data-editable', 'true');
          newEl.contentEditable = 'true';
          newEl.style.cssText = 'outline:none;cursor:text;display:inline-block;color:var(--brand);text-decoration:underline;margin:16px 0;font-size:1rem;';
          newEl.textContent = 'Lien texte';
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
      if (e.data.backgroundImage) sec.style.backgroundImage = e.data.backgroundImage;
      if (e.data.backgroundSize) sec.style.backgroundSize = e.data.backgroundSize;
      if (e.data.backgroundPosition) sec.style.backgroundPosition = e.data.backgroundPosition;
      parent.postMessage({ type: 'tipote:text-edit', tag: 'section-style', text: '' }, '*');
    }

    // Element-level style updates
    if (e.data && e.data.type === 'tipote:update-element-style') {
      var el = document.getElementById(e.data.elId);
      if (!el) return;
      var s = e.data;
      if (s.color) el.style.color = s.color;
      if (s.backgroundColor && s.backgroundColor !== 'transparent') el.style.backgroundColor = s.backgroundColor;
      if (s.fontSize) el.style.fontSize = s.fontSize;
      if (s.fontWeight) el.style.fontWeight = s.fontWeight;
      if (s.textAlign) el.style.textAlign = s.textAlign;
      if (s.borderRadius) el.style.borderRadius = s.borderRadius;
      if (s.paddingY != null) { el.style.paddingTop = s.paddingY + 'px'; el.style.paddingBottom = s.paddingY + 'px'; }
      if (s.paddingX != null) { el.style.paddingLeft = s.paddingX + 'px'; el.style.paddingRight = s.paddingX + 'px'; }
      if (s.marginTop != null) el.style.marginTop = s.marginTop + 'px';
      if (s.marginBottom != null) el.style.marginBottom = s.marginBottom + 'px';
      if (s.borderWidth != null) el.style.borderWidth = s.borderWidth + 'px';
      if (s.borderColor) el.style.borderColor = s.borderColor;
      if (s.borderStyle) el.style.borderStyle = s.borderStyle;
      if (s.backgroundImage) el.style.backgroundImage = s.backgroundImage;
      if (s.fontFamily) el.style.fontFamily = s.fontFamily;
      if (s.animation) {
        if (s.animation === 'none') { el.style.animation = 'none'; }
        else { el.style.animation = 'tp-' + s.animation + ' 0.6s ease both'; }
      }
      if (typeof s.href === 'string') el.setAttribute('href', s.href);
      parent.postMessage({ type: 'tipote:text-edit', tag: 'element-style', text: '' }, '*');
    }

    // Apply color to text selection within an element
    if (e.data && e.data.type === 'tipote:apply-text-color') {
      var el = document.getElementById(e.data.elId);
      if (!el) return;
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.anchorNode)) {
        // Apply to selection only
        document.execCommand('foreColor', false, e.data.color);
      } else {
        // No selection in this element: apply to whole element
        el.style.color = e.data.color;
      }
      parent.postMessage({ type: 'tipote:text-edit', tag: 'text-color', text: '' }, '*');
    }

    // Duplicate element
    if (e.data && e.data.type === 'tipote:duplicate-element') {
      var el = document.getElementById(e.data.elId);
      if (el) {
        var clone = el.cloneNode(true);
        clone.id = 'tp-el-' + Date.now() + '-' + Math.random().toString(36).substr(2,4);
        el.parentNode.insertBefore(clone, el.nextSibling);
        parent.postMessage({ type: 'tipote:text-edit', tag: 'element-duplicate', text: '' }, '*');
      }
    }

    // Delete element
    if (e.data && e.data.type === 'tipote:delete-element') {
      var el = document.getElementById(e.data.elId);
      if (el) {
        el.remove();
        elHighlight.style.display = 'none';
        selectedEl = null;
        parent.postMessage({ type: 'tipote:element-deselected' }, '*');
        parent.postMessage({ type: 'tipote:text-edit', tag: 'element-delete', text: '' }, '*');
      }
    }

    // Deselect element
    if (e.data && e.data.type === 'tipote:deselect-element') {
      elHighlight.style.display = 'none';
      selectedEl = null;
    }
  });

  // Update highlights on scroll
  window.addEventListener('scroll', function() {
    if (selectedSectionEl) {
      var rect = selectedSectionEl.getBoundingClientRect();
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      sectionHighlight.style.top = (rect.top + scrollY) + 'px';
    }
    if (selectedEl) highlightEl(selectedEl);
  });
})();
</script>`;


// ─────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────

export default function PageBuilder({ initialPage, onBack }: Props) {
  const t = useTranslations("pageBuilder");

  // Translated device labels
  const deviceLabels = useMemo<Record<Device, string>>(() => ({
    mobile: t("devices.mobile"),
    tablet: t("devices.tablet"),
    desktop: t("devices.desktop"),
  }), [t]);

  // Translated element type labels
  const elTypeLabels = useMemo<Record<string, string>>(() => ({
    section: t("elementTypes.section"),
    heading: t("elementTypes.heading"),
    text: t("elementTypes.text"),
    image: t("elementTypes.image"),
    button: t("elementTypes.button"),
    list: t("elementTypes.list"),
    "list-item": t("elementTypes.listItem"),
    row: t("elementTypes.row"),
    divider: t("elementTypes.divider"),
    nav: t("elementTypes.nav"),
    form: t("elementTypes.form"),
    link: t("elementTypes.link"),
    blockquote: t("elementTypes.blockquote"),
    unknown: t("elementTypes.unknown"),
  }), [t]);

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

  // Section & element selection
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<SelectedElementInfo | null>(null);
  const [sectionBgMode, setSectionBgMode] = useState<"color" | "gradient">("color");

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

  // Undo/Redo history
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  // QR code state
  const [showQrModal, setShowQrModal] = useState(false);

  // Thank-you page
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [thankYouHeading, setThankYouHeading] = useState(page.content_data?.thank_you_heading || "Merci pour ton inscription !");
  const [thankYouMessage, setThankYouMessage] = useState(page.content_data?.thank_you_message || "Tu vas recevoir un email de confirmation dans quelques instants. Pense à vérifier tes spams.");
  const [thankYouCtaText, setThankYouCtaText] = useState(page.content_data?.thank_you_cta_text || "");
  const [thankYouCtaUrl, setThankYouCtaUrl] = useState(page.content_data?.thank_you_cta_url || "");
  const [savingThankYou, setSavingThankYou] = useState(false);

  // Undo/Redo reactivity
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = useCallback((html: string) => {
    if (isUndoRedoRef.current) return;
    const h = historyRef.current;
    const idx = historyIdxRef.current;
    // Truncate any forward history
    historyRef.current = h.slice(0, idx + 1);
    historyRef.current.push(html);
    // Keep max 50 entries
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIdxRef.current -= 1;
    const html = historyRef.current[historyIdxRef.current];
    setHtmlPreview(html);
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
    // Save to server
    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html_snapshot: html }),
    }).catch(() => {});
    setTimeout(() => { isUndoRedoRef.current = false; }, 500);
  }, [page.id]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIdxRef.current += 1;
    const html = historyRef.current[historyIdxRef.current];
    setHtmlPreview(html);
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html_snapshot: html }),
    }).catch(() => {});
    setTimeout(() => { isUndoRedoRef.current = false; }, 500);
  }, [page.id]);

  // Initialize history with current HTML
  useEffect(() => {
    if (historyRef.current.length === 0 && htmlPreview) {
      historyRef.current = [htmlPreview];
      historyIdxRef.current = 0;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  // Google Fonts link tag
  const GOOGLE_FONTS_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${GOOGLE_FONTS.map(f => f.replace(/ /g, "+")+":wght@400;600;700;900").join("&family=")}&display=swap" rel="stylesheet">`;

  // Inject always-on inline edit script + Google Fonts into HTML
  const getPreviewHtml = useCallback((html: string) => {
    // Inject Google Fonts into <head>
    let result = html;
    const headIdx = result.indexOf("</head>");
    if (headIdx !== -1) {
      result = result.slice(0, headIdx) + GOOGLE_FONTS_LINK + result.slice(headIdx);
    }
    // Inject inline edit script before </body>
    const idx = result.lastIndexOf("</body>");
    if (idx === -1) return result + INLINE_EDIT_SCRIPT;
    return result.slice(0, idx) + INLINE_EDIT_SCRIPT + result.slice(idx);
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

  // Extract clean HTML from iframe by removing injected editing UI
  const getCleanIframeHtml = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return htmlPreview;
    const clone = iframe.contentDocument.documentElement.cloneNode(true) as HTMLElement;
    // Remove all injected elements (toolbar, overlays, highlights, script)
    clone.querySelectorAll("[data-tipote-injected]").forEach(el => el.remove());
    // Remove contentEditable attributes added by the inline script
    clone.querySelectorAll("[contenteditable]").forEach(el => {
      el.removeAttribute("contenteditable");
      const htmlEl = el as HTMLElement;
      if (htmlEl.style.cursor === "text") htmlEl.style.removeProperty("cursor");
      if (htmlEl.style.outline === "none") htmlEl.style.removeProperty("outline");
      if (htmlEl.getAttribute("style") === "") htmlEl.removeAttribute("style");
    });
    // Remove editor tracking attributes
    clone.querySelectorAll("[data-tp-section-idx]").forEach(el => {
      el.removeAttribute("data-tp-section-idx");
    });
    return "<!DOCTYPE html>" + clone.outerHTML;
  }, [htmlPreview]);

  const saveIframeHtml = useCallback(() => {
    const cleanHtml = getCleanIframeHtml();
    // Don't update htmlPreview to avoid iframe reload (iframe already has correct state)
    fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html_snapshot: cleanHtml }),
    }).catch(() => {});
  }, [page.id, getCleanIframeHtml]);

  // Listen for inline edits + section events from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "tipote:text-edit") {
        setSaving(true);
        clearTimeout((window as any).__tipoteSaveTimer);
        (window as any).__tipoteSaveTimer = setTimeout(() => {
          const cleanHtml = getCleanIframeHtml();
          pendingHtmlRef.current = cleanHtml;
          pushHistory(cleanHtml);
          fetch(`/api/pages/${page.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html_snapshot: cleanHtml }),
          }).then(() => {
            setSaving(false);
          }).catch(() => setSaving(false));
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
      // Element selection
      if (e.data?.type === "tipote:element-selected") {
        const styles = e.data.styles || {};
        setSelectedElement({
          elId: e.data.elId,
          elType: e.data.elType,
          label: e.data.label,
          breadcrumb: e.data.breadcrumb || [],
          styles,
          text: e.data.text || "",
          tagName: e.data.tagName || "",
          href: e.data.href || "",
          imgSrc: e.data.imgSrc || "",
          imgId: e.data.imgId || "",
        });
        // Detect if the element has a gradient background
        const bgImg = styles.backgroundImage || "none";
        setSectionBgMode(bgImg !== "none" && bgImg.includes("gradient") ? "gradient" : "color");
        setLeftTab("builder");
        setSidebarOpen(true);
      }
      if (e.data?.type === "tipote:element-deselected") {
        setSelectedElement(null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [page.id, handleIframeImageClick, getCleanIframeHtml]);

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
    const cleanHtml = getCleanIframeHtml();
    const blob = new Blob([cleanHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.slug || "page"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getCleanIframeHtml, page.slug]);

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
    if (!textContent.trim()) textContent = t("noContent");
    const printHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${page.title || "Page"} - Texte</title><style>@media print{@page{margin:2cm}}body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.8;font-size:14px}h1,h2,h3{font-family:-apple-system,sans-serif;margin-top:1.5em;margin-bottom:.5em;color:#111}h1{font-size:24px;border-bottom:2px solid #eee;padding-bottom:8px}p{margin:0 0 1em}li{margin-bottom:4px}.footer{margin-top:40px;border-top:1px solid #eee;font-size:11px;color:#999;padding-top:16px}</style></head><body><h1>${page.title || "Page"}</h1>${textContent.split("\n").map((l) => { const t = l.trim(); if (!t) return ""; if (t.startsWith("# ")) return `<h1>${t.slice(2)}</h1>`; if (t.startsWith("## ")) return `<h2>${t.slice(3)}</h2>`; if (t.startsWith("### ")) return `<h3>${t.slice(4)}</h3>`; if (t.startsWith("- ")) return `<li>${t.slice(2)}</li>`; if (t.startsWith("> ")) return `<blockquote>${t.slice(2)}</blockquote>`; return `<p>${t}</p>`; }).join("\n")}<div class="footer">Genere par Tipote</div></body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(printHtml); win.document.close(); win.onload = () => win.print(); setTimeout(() => win.print(), 500); }
  }, [page.content_data, page.title]);

  // Preview in new tab
  const openPreview = useCallback(() => {
    const cleanHtml = getCleanIframeHtml();
    const win = window.open("", "_blank");
    if (win) { win.document.write(cleanHtml); win.document.close(); }
  }, [getCleanIframeHtml]);

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

  const updateElementStyle = useCallback((elId: string, updates: Record<string, any>) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:update-element-style", elId, ...updates }, "*");
    }
    // Map special fields to style keys for local state
    const styleUpdates: Record<string, any> = { ...updates };
    if (updates.paddingY != null) { styleUpdates.paddingTop = updates.paddingY + "px"; styleUpdates.paddingBottom = updates.paddingY + "px"; }
    if (updates.paddingX != null) { styleUpdates.paddingLeft = updates.paddingX + "px"; styleUpdates.paddingRight = updates.paddingX + "px"; }
    if (updates.marginTop != null) { styleUpdates.marginTop = updates.marginTop + "px"; }
    if (updates.marginBottom != null) { styleUpdates.marginBottom = updates.marginBottom + "px"; }
    setSelectedElement((prev) => {
      if (!prev) return null;
      const next = { ...prev, styles: { ...prev.styles, ...styleUpdates } };
      if (typeof updates.href === "string") next.href = updates.href;
      return next;
    });
  }, []);

  const deleteElement = useCallback((elId: string) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:delete-element", elId }, "*");
    }
    setSelectedElement(null);
  }, []);

  const deselectElement = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:deselect-element" }, "*");
    }
    setSelectedElement(null);
  }, []);

  const duplicateElement = useCallback((elId: string) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "tipote:duplicate-element", elId }, "*");
    }
  }, []);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${page.slug}` : `/p/${page.slug}`;
  const publishPreviewUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${publishSlug}` : `/p/${publishSlug}`;
  const isPublished = page.status === "published";
  const deviceCfg = DEVICE_WIDTHS[device];

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
            title={t("nav.sidePanel")}
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
              <span className="hidden sm:inline">{t("nav.saving")}</span>
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
            {(Object.keys(DEVICE_WIDTHS) as Device[]).map((d) => {
              const Icon = DEVICE_WIDTHS[d].icon;
              return (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${
                    device === d ? "bg-white dark:bg-[#21262d] shadow-sm font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{deviceLabels[d]}</span>
                </button>
              );
            })}
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Preview button */}
          <button onClick={openPreview} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title={t("actions.preview")}>
            <Play className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Actions + Sauvegarder + Sortir */}
        <div className="flex items-center gap-1.5">
          {/* Quick actions */}
          <div className="hidden sm:flex items-center gap-1">
            {(page.page_type === "capture" || page.template_kind === "capture") && (
              <button onClick={() => setShowThankYouModal(true)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title={t("actions.thankYou")}>
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => { setShowLeadsModal(true); loadLeads(); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground relative" title={t("actions.leads")}>
              <Users className="w-3.5 h-3.5" />
              {page.leads_count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {page.leads_count > 99 ? "+" : page.leads_count}
                </span>
              )}
            </button>
            <button onClick={downloadHtml} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title={t("actions.downloadHtml")}>
              <Download className="w-3.5 h-3.5" />
            </button>
            {isPublished && (
              <button onClick={() => setShowQrModal(true)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title={t("actions.qrCode")}>
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
                {copied ? t("actions.copied") : t("actions.online")}
              </button>
              <button
                onClick={handleUnpublish}
                disabled={publishing}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                title={t("publish.unpublish")}
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
            <span className="hidden sm:inline">{t("actions.save")}</span>
          </button>

          {/* Sortir */}
          <button
            onClick={onBack}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3 h-3" />
            {t("actions.exit")}
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
          <div className="w-[300px] shrink-0 bg-[#18181b] text-white border-r border-[#27272a] flex flex-col overflow-hidden">

            {/* Tab switcher */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setLeftTab("builder")}
                className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
                  leftTab === "builder" ? "text-white border-b-2 border-white bg-white/10" : "text-white/60 hover:text-white/80"
                }`}
              >
                <Layers className="w-3 h-3 inline mr-1" />
                {t("tabs.builder")}
              </button>
              <button
                onClick={() => setLeftTab("parametres")}
                className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
                  leftTab === "parametres" ? "text-white border-b-2 border-white bg-white/10" : "text-white/60 hover:text-white/80"
                }`}
              >
                <Settings className="w-3 h-3 inline mr-1" />
                {t("tabs.settings")}
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* ──── BUILDER TAB ──── */}
              {leftTab === "builder" && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">

                    {/* ── Selected element panel ── */}
                    {selectedElement ? (
                      <>
                        {/* Breadcrumb + Back */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[10px] text-white/50 overflow-hidden">
                            <button onClick={deselectElement} className="text-blue-300 hover:underline shrink-0">
                              ← {t("nav.back")}
                            </button>
                            {selectedElement.breadcrumb.length > 0 && (
                              <>
                                <span className="mx-1">·</span>
                                {selectedElement.breadcrumb.map((crumb, i) => (
                                  <span key={i} className="shrink-0">
                                    {i > 0 && <span className="mx-0.5">›</span>}
                                    {crumb}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Element type header */}
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">{elTypeLabels[selectedElement.elType] || t("elementTypes.element")}</h3>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => duplicateElement(selectedElement.elId)}
                              className="p-1 rounded hover:bg-white/10 text-white/60"
                              title={t("elementActions.duplicate")}
                            >
                              <CopyIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { moveSection(selectedElement.elId, "up"); }}
                              className="p-1 rounded hover:bg-white/10 text-white/60"
                              title={t("elementActions.moveUp")}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { moveSection(selectedElement.elId, "down"); }}
                              className="p-1 rounded hover:bg-white/10 text-white/60"
                              title={t("elementActions.moveDown")}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteElement(selectedElement.elId)}
                              className="p-1 rounded hover:bg-red-500/20 text-red-400"
                              title={t("elementActions.delete")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* ── Properties per element type ── */}
                        <div className="space-y-3">

                          {/* TEXT COLOR + FONT (all text types) */}
                          {["heading", "text", "button", "link", "list", "list-item", "blockquote"].includes(selectedElement.elType) && (
                            <>
                              {/* Google Font picker */}
                              <div>
                                <span className="text-xs text-white/60 block mb-1">{t("controls.font")}</span>
                                <select
                                  value={(() => { const ff = selectedElement.styles.fontFamily || ""; const match = GOOGLE_FONTS.find(f => ff.includes(f)); return match || ""; })()}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { fontFamily: e.target.value ? `'${e.target.value}', sans-serif` : "inherit" })}
                                  className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/10 border border-white/20 text-white"
                                >
                                  <option value="" className="text-gray-900">{t("controls.default")}</option>
                                  {GOOGLE_FONTS.map(f => <option key={f} value={f} className="text-gray-900">{f}</option>)}
                                </select>
                              </div>

                              <div className="flex items-center justify-between">
                                <span className="text-xs text-white/60">{t("controls.textColor")}</span>
                                <input
                                  type="color"
                                  value={selectedElement.styles.color || "#000000"}
                                  onChange={(e) => {
                                    const iframe = iframeRef.current;
                                    if (iframe?.contentWindow) {
                                      iframe.contentWindow.postMessage({ type: "tipote:apply-text-color", elId: selectedElement.elId, color: e.target.value }, "*");
                                    }
                                    setSelectedElement((prev) => prev ? { ...prev, styles: { ...prev.styles, color: e.target.value } } : null);
                                  }}
                                  className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                />
                              </div>

                              {/* Font size */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-white/60">{t("controls.size")}</span>
                                  <span className="text-[10px] text-white/40">{selectedElement.styles.fontSize || "16px"}</span>
                                </div>
                                <input
                                  type="range"
                                  min={10}
                                  max={72}
                                  value={parseInt(selectedElement.styles.fontSize) || 16}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { fontSize: e.target.value + "px" })}
                                  className="w-full h-1.5 accent-blue-400"
                                />
                              </div>

                              {/* Font weight */}
                              <div>
                                <span className="text-xs text-white/60 block mb-1">{t("controls.weight")}</span>
                                <div className="flex gap-1">
                                  {[
                                    { v: "400", l: t("controls.weightNormal") },
                                    { v: "600", l: t("controls.weightSemi") },
                                    { v: "700", l: t("controls.weightBold") },
                                    { v: "900", l: t("controls.weightBlack") },
                                  ].map((fw) => (
                                    <button
                                      key={fw.v}
                                      onClick={() => updateElementStyle(selectedElement.elId, { fontWeight: fw.v })}
                                      className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                                        String(selectedElement.styles.fontWeight) === fw.v
                                          ? "bg-white/20 border-white/40 text-white font-medium"
                                          : "border-white/10 text-white/50 hover:bg-white/10"
                                      }`}
                                    >
                                      {fw.l}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Text alignment */}
                              <div>
                                <span className="text-xs text-white/60 block mb-1">{t("controls.alignment")}</span>
                                <div className="flex gap-1">
                                  {[
                                    { v: "left", l: t("controls.alignLeft") },
                                    { v: "center", l: t("controls.alignCenter") },
                                    { v: "right", l: t("controls.alignRight") },
                                  ].map((ta) => (
                                    <button
                                      key={ta.v}
                                      onClick={() => updateElementStyle(selectedElement.elId, { textAlign: ta.v })}
                                      className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                                        selectedElement.styles.textAlign === ta.v
                                          ? "bg-white/20 border-white/40 text-white font-medium"
                                          : "border-white/10 text-white/50 hover:bg-white/10"
                                      }`}
                                    >
                                      {ta.l}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {/* BUTTON specific */}
                          {(selectedElement.elType === "button" || selectedElement.elType === "link") && (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-white/60">{t("controls.bgColor")}</span>
                                <input
                                  type="color"
                                  value={selectedElement.styles.backgroundColor !== "transparent" ? selectedElement.styles.backgroundColor : "#5D6CDB"}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { backgroundColor: e.target.value })}
                                  className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                />
                              </div>

                              {/* Gradient for button */}
                              <div>
                                <span className="text-xs text-white/60 block mb-1">{t("controls.gradient")}</span>
                                <div className="flex gap-1.5 items-center">
                                  <input
                                    type="color"
                                    defaultValue="#5D6CDB"
                                    onChange={(e) => {
                                      const c2 = (document.getElementById("btn-grad-c2") as HTMLInputElement)?.value || "#8B5CF6";
                                      const angle = (document.getElementById("btn-grad-angle") as HTMLInputElement)?.value || "135";
                                      updateElementStyle(selectedElement.elId, { backgroundImage: `linear-gradient(${angle}deg, ${e.target.value}, ${c2})` });
                                    }}
                                    className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                    title={t("controls.color1")}
                                  />
                                  <input
                                    id="btn-grad-c2"
                                    type="color"
                                    defaultValue="#8B5CF6"
                                    onChange={(e) => {
                                      const c1Inputs = e.target.previousElementSibling as HTMLInputElement;
                                      const c1 = c1Inputs?.value || "#5D6CDB";
                                      const angle = (document.getElementById("btn-grad-angle") as HTMLInputElement)?.value || "135";
                                      updateElementStyle(selectedElement.elId, { backgroundImage: `linear-gradient(${angle}deg, ${c1}, ${e.target.value})` });
                                    }}
                                    className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                    title={t("controls.color2")}
                                  />
                                  <input
                                    id="btn-grad-angle"
                                    type="number"
                                    defaultValue={135}
                                    min={0}
                                    max={360}
                                    className="w-14 px-1.5 py-1 rounded text-[10px] bg-white/10 border border-white/20 text-white text-center"
                                    title="Angle (deg)"
                                    onChange={(e) => {
                                      // Re-apply gradient with new angle
                                    }}
                                  />
                                  <span className="text-[9px] text-white/40">deg</span>
                                  <button
                                    onClick={() => updateElementStyle(selectedElement.elId, { backgroundImage: "none" })}
                                    className="p-1 rounded hover:bg-white/10 text-white/40"
                                    title={t("controls.removeGradient")}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-white/60">{t("controls.borderRadius")}</span>
                                  <span className="text-[10px] text-white/40">{selectedElement.styles.borderRadius || "0px"}</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={50}
                                  value={parseInt(selectedElement.styles.borderRadius) || 0}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { borderRadius: e.target.value + "px" })}
                                  className="w-full h-1.5 accent-blue-400"
                                />
                              </div>

                              {/* Border */}
                              <div>
                                <span className="text-xs text-white/60 block mb-1">{t("controls.border")}</span>
                                <div className="flex gap-1.5 items-center">
                                  <input
                                    type="number"
                                    min={0}
                                    max={10}
                                    value={parseInt(selectedElement.styles.borderWidth) || 0}
                                    onChange={(e) => updateElementStyle(selectedElement.elId, { borderWidth: Number(e.target.value), borderStyle: Number(e.target.value) > 0 ? "solid" : "none" })}
                                    className="w-12 px-1.5 py-1 rounded text-[10px] bg-white/10 border border-white/20 text-white text-center"
                                  />
                                  <span className="text-[9px] text-white/40">px</span>
                                  <input
                                    type="color"
                                    value={selectedElement.styles.borderColor || "#000000"}
                                    onChange={(e) => updateElementStyle(selectedElement.elId, { borderColor: e.target.value })}
                                    className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                  />
                                </div>
                              </div>

                              <div>
                                <span className="text-xs text-white/60 block mb-1">{t("controls.linkUrl")}</span>
                                <input
                                  type="url"
                                  value={selectedElement.href || ""}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { href: e.target.value })}
                                  placeholder="https://..."
                                  className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/10 border border-white/20 text-white placeholder:text-white/30"
                                />
                              </div>
                            </>
                          )}

                          {/* IMAGE specific */}
                          {selectedElement.elType === "image" && (
                            <>
                              {selectedElement.imgSrc && (
                                <div className="rounded-lg border border-white/20 overflow-hidden">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={selectedElement.imgSrc} alt="" className="w-full h-24 object-cover" />
                                </div>
                              )}
                              <button
                                onClick={() => {
                                  if (selectedElement.imgId) {
                                    triggerImageUploadForIframe(selectedElement.imgId);
                                  }
                                }}
                                className="w-full py-2 border border-dashed border-white/20 rounded-lg text-xs text-white/60 hover:bg-white/10 flex items-center justify-center gap-1.5"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                {selectedElement.imgSrc ? t("publish.changeImage") : t("publish.addImage")}
                              </button>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-white/60">{t("controls.borderRadius")}</span>
                                  <span className="text-[10px] text-white/40">{selectedElement.styles.borderRadius || "0px"}</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={50}
                                  value={parseInt(selectedElement.styles.borderRadius) || 0}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { borderRadius: e.target.value + "px" })}
                                  className="w-full h-1.5 accent-blue-400"
                                />
                              </div>
                            </>
                          )}

                          {/* SECTION / ROW specific */}
                          {(selectedElement.elType === "section" || selectedElement.elType === "row" || selectedElement.elType === "nav" || selectedElement.elType === "form") && (
                            <>
                              {/* Toggle: Solid color vs Gradient */}
                              <div>
                                <span className="text-xs text-white/60 block mb-1.5">{t("controls.background")}</span>
                                <div className="flex gap-1 mb-2">
                                  <button
                                    onClick={() => {
                                      setSectionBgMode("color");
                                      updateElementStyle(selectedElement.elId, { backgroundImage: "none" });
                                    }}
                                    className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                                      sectionBgMode === "color"
                                        ? "bg-white/20 border-white/40 text-white font-medium"
                                        : "border-white/10 text-white/50 hover:bg-white/10"
                                    }`}
                                  >
                                    {t("controls.solidColor")}
                                  </button>
                                  <button
                                    onClick={() => setSectionBgMode("gradient")}
                                    className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                                      sectionBgMode === "gradient"
                                        ? "bg-white/20 border-white/40 text-white font-medium"
                                        : "border-white/10 text-white/50 hover:bg-white/10"
                                    }`}
                                  >
                                    {t("controls.gradient")}
                                  </button>
                                </div>

                                {sectionBgMode === "color" ? (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-white/40">{t("controls.color")}</span>
                                    <input
                                      type="color"
                                      value={selectedElement.styles.backgroundColor !== "transparent" ? selectedElement.styles.backgroundColor : "#ffffff"}
                                      onChange={(e) => updateElementStyle(selectedElement.elId, { backgroundColor: e.target.value })}
                                      className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="color"
                                      defaultValue="#5D6CDB"
                                      onChange={(e) => {
                                        const c2 = (document.getElementById("sec-grad-c2-" + selectedElement.elId) as HTMLInputElement)?.value || "#2E3A6E";
                                        const angle = (document.getElementById("sec-grad-angle-" + selectedElement.elId) as HTMLInputElement)?.value || "135";
                                        updateElementStyle(selectedElement.elId, { backgroundImage: `linear-gradient(${angle}deg, ${e.target.value}, ${c2})` });
                                      }}
                                      className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                      title={t("controls.color1")}
                                    />
                                    <input
                                      id={"sec-grad-c2-" + selectedElement.elId}
                                      type="color"
                                      defaultValue="#2E3A6E"
                                      onChange={(e) => {
                                        const prev = e.target.previousElementSibling as HTMLInputElement;
                                        const c1 = prev?.value || "#5D6CDB";
                                        const angle = (document.getElementById("sec-grad-angle-" + selectedElement.elId) as HTMLInputElement)?.value || "135";
                                        updateElementStyle(selectedElement.elId, { backgroundImage: `linear-gradient(${angle}deg, ${c1}, ${e.target.value})` });
                                      }}
                                      className="w-6 h-6 rounded border border-white/20 cursor-pointer"
                                      title={t("controls.color2")}
                                    />
                                    <input
                                      id={"sec-grad-angle-" + selectedElement.elId}
                                      type="number"
                                      defaultValue={135}
                                      min={0}
                                      max={360}
                                      className="w-14 px-1.5 py-1 rounded text-[10px] bg-white/10 border border-white/20 text-white text-center"
                                      title="Angle"
                                      onChange={(e) => {
                                        const c1El = document.getElementById("sec-grad-c2-" + selectedElement.elId)?.previousElementSibling as HTMLInputElement;
                                        const c2El = document.getElementById("sec-grad-c2-" + selectedElement.elId) as HTMLInputElement;
                                        const c1 = c1El?.value || "#5D6CDB";
                                        const c2 = c2El?.value || "#2E3A6E";
                                        updateElementStyle(selectedElement.elId, { backgroundImage: `linear-gradient(${e.target.value}deg, ${c1}, ${c2})` });
                                      }}
                                    />
                                    <span className="text-[9px] text-white/40">°</span>
                                  </div>
                                )}
                              </div>

                              {/* Padding */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-white/60">{t("controls.paddingV")}</span>
                                  <span className="text-[10px] text-white/40">{parseInt(selectedElement.styles.paddingTop) || 0}px</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={200}
                                  value={parseInt(selectedElement.styles.paddingTop) || 0}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { paddingY: Number(e.target.value) })}
                                  className="w-full h-1.5 accent-blue-400"
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-white/60">{t("controls.paddingH")}</span>
                                  <span className="text-[10px] text-white/40">{parseInt(selectedElement.styles.paddingLeft) || 0}px</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={120}
                                  value={parseInt(selectedElement.styles.paddingLeft) || 0}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { paddingX: Number(e.target.value) })}
                                  className="w-full h-1.5 accent-blue-400"
                                />
                              </div>

                              {/* Border radius for rows */}
                              {(selectedElement.elType === "row") && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-white/60">{t("controls.borderRadius")}</span>
                                    <span className="text-[10px] text-white/40">{selectedElement.styles.borderRadius || "0px"}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={0}
                                    max={40}
                                    value={parseInt(selectedElement.styles.borderRadius) || 0}
                                    onChange={(e) => updateElementStyle(selectedElement.elId, { borderRadius: e.target.value + "px" })}
                                    className="w-full h-1.5 accent-blue-400"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {/* ── COMMON: Margin, Border, Animation (all elements) ── */}
                          <div className="pt-2 border-t border-white/10">
                            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wide">{t("controls.spacing")}</span>
                            <div className="grid grid-cols-2 gap-2 mt-1.5">
                              <div>
                                <span className="text-[9px] text-white/40">{t("controls.marginTop")}</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={200}
                                  value={parseInt(selectedElement.styles.marginTop) || 0}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { marginTop: Number(e.target.value) })}
                                  className="w-full px-1.5 py-1 rounded text-[10px] bg-white/10 border border-white/20 text-white text-center"
                                />
                              </div>
                              <div>
                                <span className="text-[9px] text-white/40">{t("controls.marginBottom")}</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={200}
                                  value={parseInt(selectedElement.styles.marginBottom) || 0}
                                  onChange={(e) => updateElementStyle(selectedElement.elId, { marginBottom: Number(e.target.value) })}
                                  className="w-full px-1.5 py-1 rounded text-[10px] bg-white/10 border border-white/20 text-white text-center"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Animation */}
                          <div>
                            <span className="text-xs text-white/60 block mb-1">{t("controls.animation")}</span>
                            <select
                              onChange={(e) => updateElementStyle(selectedElement.elId, { animation: e.target.value })}
                              className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/10 border border-white/20 text-white"
                              defaultValue="none"
                            >
                              {CSS_ANIMATION_KEYS.map(a => <option key={a.value} value={a.value} className="text-gray-900">{t(a.tKey)}</option>)}
                            </select>
                          </div>

                          {/* AI Element Editing */}
                          <div className="pt-2 border-t border-white/10">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="w-3 h-3 text-blue-300" />
                              <span className="text-xs text-white/60">{t("chat.editWithAi")}</span>
                            </div>
                            <p className="text-[10px] text-white/30 mb-1.5">
                              {t("chat.placeholder")}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* ── No element selected: show sections + palette ── */
                      <>
                        {/* Sections list */}
                        <div>
                          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2">{t("elementTypes.section")}s</p>
                          <div className="space-y-1">
                            {sections.length === 0 && (
                              <p className="text-[11px] text-white/30 py-2">Clique sur un élément dans l&apos;aperçu</p>
                            )}
                            {sections.map((s) => (
                              <div
                                key={s.id}
                                className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs hover:bg-white/10 border border-transparent text-white/80"
                                onClick={() => selectSection(s.id)}
                              >
                                <MousePointer className="w-3 h-3 shrink-0 opacity-40" />
                                <div className="flex-1 min-w-0">
                                  <span className="block truncate">{s.label}</span>
                                  {s.anchorId && s.anchorId.startsWith("sc-") && (
                                    <span className="block text-[9px] text-blue-300/60 font-mono truncate">#{s.anchorId}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={(e) => { e.stopPropagation(); moveSection(s.id, "up"); }} className="p-0.5 rounded hover:bg-white/10" title={t("elementActions.moveUp")}>
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); moveSection(s.id, "down"); }} className="p-0.5 rounded hover:bg-white/10" title={t("elementActions.moveDown")}>
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); deleteSection(s.id); }} className="p-0.5 rounded hover:bg-red-500/20 text-red-400" title={t("elementActions.delete")}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Element palette */}
                        <div className="pt-3 border-t border-white/10">
                          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2">{t("addElement.title")}</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {ELEMENT_PALETTE_KEYS.map((el) => {
                              const Icon = el.icon;
                              return (
                                <button
                                  key={el.type}
                                  onClick={() => addElement(el.type)}
                                  className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-white/10 hover:bg-white/10 hover:border-white/30 transition-all text-white/60 hover:text-white"
                                >
                                  <Icon className="w-4 h-4" />
                                  <span className="text-[10px]">{t(el.tKey)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Tip */}
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                          <span className="text-[10px] text-white/50">{t("tip")}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ──── AI CHAT (bottom of builder tab) ──── */}
                  <div className="h-[280px] shrink-0 border-t border-white/10 bg-[#162d4a]">
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
                    <label className="text-xs font-medium text-white/60 flex items-center gap-1 mb-1">
                      <Link2 className="w-3 h-3" /> URL
                    </label>
                    <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1.5 border border-white/20 text-xs">
                      <span className="text-white/40 whitespace-nowrap">/p/</span>
                      <input
                        type="text"
                        value={page.slug}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                          handleSettingUpdate("slug", val);
                        }}
                        className="flex-1 bg-transparent font-medium focus:outline-none min-w-0 text-white"
                      />
                    </div>
                  </div>

                  {/* SEO */}
                  <div>
                    <label className="text-xs font-medium text-white/60 flex items-center gap-1 mb-1">
                      <FileText className="w-3 h-3" /> Description SEO
                    </label>
                    <textarea
                      value={page.meta_description || ""}
                      onChange={(e) => handleSettingUpdate("meta_description", e.target.value)}
                      className="w-full px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs resize-none text-white placeholder:text-white/30"
                      rows={2}
                      maxLength={160}
                      placeholder="Description pour Google..."
                    />
                  </div>

                  {/* Systeme.io tag */}
                  <div>
                    <label className="text-xs font-medium text-white/60 flex items-center gap-1 mb-1">
                      <Tag className="w-3 h-3" /> Tag Systeme.io
                    </label>
                    <SioTagPicker
                      value={page.sio_capture_tag || ""}
                      onChange={(v) => handleSettingUpdate("sio_capture_tag", v)}
                      variant="dark"
                      placeholder="capture-ebook"
                    />
                  </div>

                  {/* OG Image */}
                  <div>
                    <label className="text-xs font-medium text-white/60 flex items-center gap-1 mb-1">
                      <ImageIcon className="w-3 h-3" /> Image de partage
                    </label>
                    {page.og_image_url ? (
                      <div className="relative rounded-lg overflow-hidden border border-white/20">
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
                        className="w-full py-4 border border-dashed border-white/20 rounded-lg text-xs text-white/40 hover:bg-white/5 flex flex-col items-center gap-1"
                      >
                        <Upload className="w-4 h-4" />
                        Ajouter
                      </button>
                    )}
                  </div>

                  {/* Tracking */}
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs font-medium text-white/60 mb-2">Tracking</p>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={page.facebook_pixel_id || ""}
                        onChange={(e) => handleSettingUpdate("facebook_pixel_id", e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="Facebook Pixel ID"
                        className="w-full px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder:text-white/30"
                      />
                      <input
                        type="text"
                        value={page.google_tag_id || ""}
                        onChange={(e) => handleSettingUpdate("google_tag_id", e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                        placeholder="Google Tag (G-XXXX)"
                        className="w-full px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder:text-white/30"
                      />
                    </div>
                  </div>

                  {/* Thank-you page (capture only) */}
                  {(page.page_type === "capture" || page.template_kind === "capture") && (
                    <div className="pt-2 border-t border-white/10">
                      <button
                        onClick={() => setShowThankYouModal(true)}
                        className="w-full py-2 border border-white/20 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3 h-3" />
                        {t("thankYou.title")}
                      </button>
                    </div>
                  )}

                  {/* Downloads */}
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs font-medium text-white/60 mb-2">{t("actions.exports")}</p>
                    <div className="flex gap-2">
                      <button onClick={downloadHtml} className="flex-1 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 hover:bg-white/10 flex items-center justify-center gap-1">
                        <Download className="w-3 h-3" /> HTML
                      </button>
                      <button onClick={downloadTextPdf} className="flex-1 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 hover:bg-white/10 flex items-center justify-center gap-1">
                        <FileDown className="w-3 h-3" /> PDF
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs font-medium text-white/60 mb-2">{t("actions.stats")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-white/10 text-center">
                        <p className="text-lg font-bold text-white">{page.views_count}</p>
                        <p className="text-[10px] text-white/40">{t("actions.views")}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-white/10 text-center">
                        <p className="text-lg font-bold text-white">{page.leads_count}</p>
                        <p className="text-[10px] text-white/40">Leads</p>
                      </div>
                    </div>
                    {page.leads_count > 0 && (
                      <button
                        onClick={() => { setShowLeadsModal(true); loadLeads(); }}
                        className="w-full mt-2 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 hover:bg-white/10 flex items-center justify-center gap-1"
                      >
                        <Users className="w-3 h-3" /> {t("leads.viewAll")}
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
                <h2 className="text-lg font-bold">{t("publish.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("publish.description")}</p>
              </div>
              <button onClick={() => setShowPublishModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* URL */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Link2 className="w-4 h-4 text-muted-foreground" /> {t("publish.url")}
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
                  <Tag className="w-4 h-4 text-muted-foreground" /> {t("publish.captureTag")}
                </label>
                <SioTagPicker
                  value={publishTag}
                  onChange={setPublishTag}
                  variant="light"
                  placeholder="capture-ebook"
                />
              </div>

              {/* OG Image */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" /> {t("publish.ogImage")}
                </label>
                {publishOgUrl ? (
                  <div className="relative rounded-lg overflow-hidden border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publishOgUrl} alt="OG preview" className="w-full h-32 object-cover" />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button onClick={handleOgImageUpload} className="p-1.5 rounded-md bg-background/80 hover:bg-background border text-xs">{t("publish.changeImage")}</button>
                      <button onClick={() => setPublishOgUrl("")} className="p-1.5 rounded-md bg-background/80 hover:bg-background border text-xs text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={handleOgImageUpload} disabled={uploadingOg} className="w-full py-8 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:bg-muted/30 flex flex-col items-center gap-2">
                    {uploadingOg ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Upload className="w-5 h-5" /><span>{t("publish.addImage")}</span></>}
                  </button>
                )}
              </div>

              {/* Meta desc */}
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-4 h-4 text-muted-foreground" /> {t("publish.metaDesc")}
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
              <button onClick={() => setShowPublishModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-muted">{t("publish.close")}</button>
              <button onClick={handlePublish} disabled={publishing || !publishSlug.trim()} className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                {t("publish.publishBtn")}
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
                <h2 className="text-lg font-bold">{t("leads.title")}</h2>
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
                  <p className="text-sm text-muted-foreground">{t("leads.none")}</p>
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
              <h2 className="text-lg font-bold">{t("qrCode.title")}</h2>
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
                  {copied ? t("actions.copied") : t("actions.copy")}
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
                <h2 className="text-lg font-bold">{t("thankYou.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("thankYou.subtitle")}</p>
              </div>
              <button onClick={() => setShowThankYouModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("thankYou.heading")}</label>
                <input type="text" value={thankYouHeading} onChange={(e) => setThankYouHeading(e.target.value)} placeholder={t("thankYou.defaultHeading")} className="w-full px-3 py-2 border rounded-lg text-sm" maxLength={100} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("thankYou.message")}</label>
                <textarea value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value)} placeholder={t("thankYou.defaultMessage")} className="w-full px-3 py-2 border rounded-lg text-sm resize-none" rows={4} maxLength={500} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("thankYou.ctaText")}</label>
                <input type="text" value={thankYouCtaText} onChange={(e) => setThankYouCtaText(e.target.value)} placeholder="Rejoindre le groupe" className="w-full px-3 py-2 border rounded-lg text-sm mb-2" maxLength={50} />
                <input type="url" value={thankYouCtaUrl} onChange={(e) => setThankYouCtaUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              {/* Preview */}
              <div className="rounded-xl border bg-muted/20 p-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">{t("actions.preview")}</p>
                <div className="text-3xl mb-2">&#10003;</div>
                <h3 className="text-lg font-bold mb-2">{thankYouHeading || "Merci !"}</h3>
                <p className="text-sm text-muted-foreground mb-4">{thankYouMessage || "..."}</p>
                {thankYouCtaText && <span className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">{thankYouCtaText}</span>}
              </div>
            </div>
            <div className="p-6 pt-4 border-t flex items-center justify-end gap-3">
              <button onClick={() => setShowThankYouModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-muted">{t("publish.close")}</button>
              <button onClick={saveThankYou} disabled={savingThankYou} className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {savingThankYou ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t("thankYou.save")}
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
