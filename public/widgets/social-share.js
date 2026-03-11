/**
 * Tipote Social Share Widget — Embeddable share buttons
 * Inspired by ShareThis: clean branded buttons, responsive, mobile-friendly.
 *
 * Usage:
 *   <script src="https://app.tipote.com/widgets/social-share.js" data-widget-id="YOUR_WIDGET_ID"></script>
 *
 * Or with inline placement:
 *   <div id="tipote-share"></div>
 *   <script src="https://app.tipote.com/widgets/social-share.js" data-widget-id="YOUR_WIDGET_ID" data-container="tipote-share"></script>
 */
(function () {
  "use strict";

  // ─── Platform definitions ───────────────────────────────────────────
  var PLATFORMS = {
    facebook: {
      name: "Facebook",
      color: "#1877F2",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
      share: function (u, t) { return "https://www.facebook.com/sharer/sharer.php?u=" + e(u); }
    },
    twitter: {
      name: "X",
      color: "#000000",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      share: function (u, t, h) {
        var url = "https://twitter.com/intent/tweet?url=" + e(u);
        if (t) url += "&text=" + e(t);
        if (h) url += "&hashtags=" + e(h);
        return url;
      }
    },
    linkedin: {
      name: "LinkedIn",
      color: "#0A66C2",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
      share: function (u) { return "https://www.linkedin.com/sharing/share-offsite/?url=" + e(u); }
    },
    whatsapp: {
      name: "WhatsApp",
      color: "#25D366",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
      share: function (u, t) { return "https://api.whatsapp.com/send?text=" + e((t ? t + " " : "") + u); }
    },
    pinterest: {
      name: "Pinterest",
      color: "#E60023",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/></svg>',
      share: function (u, t) { return "https://pinterest.com/pin/create/button/?url=" + e(u) + "&description=" + e(t || ""); }
    },
    telegram: {
      name: "Telegram",
      color: "#26A5E4",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.013-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
      share: function (u, t) { return "https://telegram.me/share/url?url=" + e(u) + "&text=" + e(t || ""); }
    },
    email: {
      name: "Email",
      color: "#7C7C7C",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>',
      share: function (u, t) { return "mailto:?subject=" + e(t || document.title) + "&body=" + e(u); }
    }
  };

  function e(s) { return encodeURIComponent(s); }

  // ─── Computed sizes ─────────────────────────────────────────────────
  function getMetrics(cfg) {
    var sizes = { sm: 32, md: 40, lg: 48 };
    var sz = sizes[cfg.button_size] || 40;
    var iconSz = Math.round(sz * 0.45);
    var radius = { rounded: "8px", square: "0", circle: "50%", pill: "999px" }[cfg.button_style] || "8px";
    var gap = cfg.button_style === "circle" ? "8px" : "6px";
    return { sz: sz, iconSz: iconSz, radius: radius, gap: gap };
  }

  // ─── CSS injection (supplementary — hover, animation, mobile) ─────
  // All critical layout/visibility is set as inline styles on elements
  // so the widget resists CMS CSS overrides (Systeme.io, WordPress…).
  // This stylesheet only handles pseudo-states and media queries.
  function injectCSS(cfg) {
    if (document.getElementById("tpt-share-css")) return;
    var m = getMetrics(cfg);

    var css = [
      // Hover & active (cannot be inline)
      ".tpt-share-btn:hover{transform:scale(1.08)!important;opacity:0.92!important}",
      ".tpt-share-btn:active{transform:scale(0.95)!important}",

      // Floating edge radius overrides
      ".tpt-share-floating-left .tpt-share-btn{border-radius:0 " + m.radius + " " + m.radius + " 0!important}",
      ".tpt-share-floating-right .tpt-share-btn{border-radius:" + m.radius + " 0 0 " + m.radius + "!important}",

      // Mono modes (override inline bg)
      ".tpt-share-mono-light .tpt-share-btn{background:#f3f4f6!important;color:#374151!important}",
      ".tpt-share-mono-light .tpt-share-btn:hover{background:#e5e7eb!important}",
      ".tpt-share-mono-dark .tpt-share-btn{background:#374151!important;color:#fff!important}",
      ".tpt-share-mono-dark .tpt-share-btn:hover{background:#4b5563!important}",

      // Mobile: bottom-bar compact
      "@media(max-width:640px){" +
        ".tpt-share-floating{display:none!important}" +
        ".tpt-share-bottom .tpt-share-label{display:none!important}" +
        ".tpt-share-bottom .tpt-share-btn{padding:0!important;width:" + m.sz + "px!important}" +
        ".tpt-share-bottom .tpt-share-btns{gap:4px!important}" +
      "}"
    ].join("\n");

    var style = document.createElement("style");
    style.id = "tpt-share-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Inline style helper ──────────────────────────────────────────
  // Sets all properties with !important via cssText to beat CMS rules.
  function setStyles(el, props) {
    var parts = [];
    for (var k in props) {
      if (props.hasOwnProperty(k)) {
        // Convert camelCase to kebab-case
        var kebab = k.replace(/([A-Z])/g, function (m) { return "-" + m.toLowerCase(); });
        parts.push(kebab + ":" + props[k] + " !important");
      }
    }
    el.style.cssText = parts.join(";");
  }

  // ─── Render ─────────────────────────────────────────────────────────
  // Every visible element gets ALL critical styles inline so that
  // third-party CMS stylesheets (Systeme.io, WordPress, Wix…) cannot
  // override them. This is the same approach ShareThis uses.
  function render(cfg, scriptEl) {
    injectCSS(cfg);

    var m = getMetrics(cfg);
    var pageUrl = cfg.share_url || window.location.href;
    var pageTitle = cfg.share_text || document.title;
    var hashtags = cfg.share_hashtags || "";
    var platforms = cfg.platforms || ["facebook", "twitter", "linkedin", "whatsapp", "email"];
    var containerId = scriptEl.getAttribute("data-container");

    // ── Wrapper ──
    var wrap = document.createElement("div");
    wrap.className = "tpt-share-wrap";

    var wrapStyles = {
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      lineHeight: "1",
      boxSizing: "border-box",
      zIndex: "9998",
      visibility: "visible",
      opacity: "1",
      display: "block"
    };

    if (cfg.display_mode === "floating-left" || cfg.display_mode === "floating-right") {
      wrap.className += " tpt-share-floating tpt-share-floating-" + (cfg.display_mode === "floating-left" ? "left" : "right");
      wrapStyles.position = "fixed";
      wrapStyles.top = "50%";
      wrapStyles.transform = "translateY(-50%)";
      if (cfg.display_mode === "floating-left") wrapStyles.left = "0";
      else wrapStyles.right = "0";
    } else if (cfg.display_mode === "bottom-bar") {
      wrap.className += " tpt-share-bottom";
      wrapStyles.position = "fixed";
      wrapStyles.bottom = "0";
      wrapStyles.left = "0";
      wrapStyles.right = "0";
      wrapStyles.padding = "8px 12px";
      wrapStyles.background = "rgba(255,255,255,0.97)";
      wrapStyles.borderTop = "1px solid rgba(0,0,0,0.08)";
      wrapStyles.backdropFilter = "blur(8px)";
      wrapStyles.WebkitBackdropFilter = "blur(8px)";
    } else {
      wrap.className += " tpt-share-inline";
    }

    if (cfg.color_mode === "mono-light") wrap.className += " tpt-share-mono-light";
    else if (cfg.color_mode === "mono-dark") wrap.className += " tpt-share-mono-dark";

    setStyles(wrap, wrapStyles);

    // ── Buttons container ──
    var btnsWrap = document.createElement("div");
    btnsWrap.className = "tpt-share-btns";
    var btnsStyles = {
      display: "flex",
      flexWrap: "wrap",
      gap: m.gap,
      alignItems: "center",
      visibility: "visible",
      opacity: "1",
      listStyle: "none",
      margin: "0",
      padding: "0"
    };
    if (cfg.display_mode === "floating-left" || cfg.display_mode === "floating-right") {
      btnsStyles.flexDirection = "column";
    }
    if (cfg.display_mode === "bottom-bar" || cfg.display_mode === "inline" || !cfg.display_mode) {
      btnsStyles.justifyContent = "center";
    }
    setStyles(btnsWrap, btnsStyles);

    // ── Buttons ──
    platforms.forEach(function (key) {
      var p = PLATFORMS[key];
      if (!p) return;

      var btn = document.createElement("a");
      btn.className = "tpt-share-btn";
      btn.setAttribute("aria-label", "Share on " + p.name);
      btn.setAttribute("rel", "noopener noreferrer");

      var url = p.share(pageUrl, pageTitle, hashtags);
      btn.href = url;

      // Email opens in same window, others in popup
      if (key === "email") {
        btn.target = "_self";
      } else {
        btn.target = "_blank";
        btn.onclick = function (ev) {
          ev.preventDefault();
          window.open(url, "share_" + key, "width=600,height=500,menubar=no,toolbar=no");
        };
      }

      // Determine background color — default is ALWAYS the platform brand color
      // so the button is never invisible, regardless of DB value for color_mode.
      var bgColor = p.color;
      var textColor = "#fff";
      if (cfg.color_mode === "mono-light") {
        bgColor = "#f3f4f6";
        textColor = "#374151";
      } else if (cfg.color_mode === "mono-dark") {
        bgColor = "#374151";
      } else if (cfg.color_mode === "custom") {
        // Use user's custom color, or same default as the settings form (#2563eb)
        bgColor = cfg.custom_color || "#2563eb";
      }
      // "brand", null, undefined, or any other value → keep p.color

      // ALL critical styles inline
      setStyles(btn, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        border: "none",
        cursor: "pointer",
        textDecoration: "none",
        transition: "transform .15s ease, opacity .15s ease",
        padding: cfg.show_labels ? "0 14px" : "0",
        width: cfg.show_labels ? "auto" : m.sz + "px",
        height: m.sz + "px",
        minWidth: m.sz + "px",
        borderRadius: m.radius,
        backgroundColor: bgColor,
        color: textColor,
        fontSize: "13px",
        fontWeight: "600",
        visibility: "visible",
        opacity: "1",
        overflow: "visible",
        lineHeight: "1",
        boxSizing: "border-box",
        float: "none",
        position: "relative",
        margin: "0"
      });

      // Build icon HTML with inline styles baked in
      var svgInline = p.icon.replace(
        "<svg",
        '<svg style="display:inline-block !important;width:' + m.iconSz + 'px !important;height:' + m.iconSz + 'px !important;' +
        'flex-shrink:0 !important;visibility:visible !important;opacity:1 !important;' +
        'fill:currentColor !important;vertical-align:middle !important;overflow:visible !important"'
      );

      btn.innerHTML = svgInline;

      if (cfg.show_labels) {
        var labelSpan = document.createElement("span");
        labelSpan.className = "tpt-share-label";
        setStyles(labelSpan, {
          whiteSpace: "nowrap",
          visibility: "visible",
          opacity: "1",
          display: "inline",
          color: "inherit",
          fontSize: "13px",
          fontWeight: "600"
        });
        labelSpan.textContent = p.name;
        btn.appendChild(labelSpan);
      }

      btnsWrap.appendChild(btn);
    });

    wrap.appendChild(btnsWrap);

    // Place in DOM
    if (containerId) {
      var container = document.getElementById(containerId);
      if (container) {
        container.appendChild(wrap);
        return;
      }
    }

    // For floating/bottom-bar, append to body
    if (cfg.display_mode !== "inline" && cfg.display_mode) {
      document.body.appendChild(wrap);
    } else {
      // Inline: insert after the script tag
      if (scriptEl.parentNode) {
        scriptEl.parentNode.insertBefore(wrap, scriptEl.nextSibling);
      } else {
        document.body.appendChild(wrap);
      }
    }
  }

  // ─── Find & init all widget script tags ─────────────────────────────
  // We cannot rely on document.currentScript — it is null in many CMS
  // environments (Systeme.io, WordPress, etc.) that dynamically inject
  // raw HTML blocks. Instead, we find ALL our script tags by selector.
  function initAll() {
    var scripts = document.querySelectorAll('script[data-widget-id][src*="social-share"]');
    if (!scripts.length) return;

    // Track which widget IDs we've already rendered (supports page re-runs)
    if (!window.__tipote_share_ids) window.__tipote_share_ids = {};

    for (var i = 0; i < scripts.length; i++) {
      (function (scriptEl) {
        var widgetId = scriptEl.getAttribute("data-widget-id");
        if (!widgetId) return;

        // Skip if this widget was already rendered
        if (window.__tipote_share_ids[widgetId]) return;
        window.__tipote_share_ids[widgetId] = true;

        var apiBase = scriptEl.src.replace(/\/widgets\/social-share\.js.*$/, "");

        fetch(apiBase + "/api/widgets/share/" + widgetId + "/public")
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok && data.widget) render(data.widget, scriptEl);
          })
          .catch(function () {});
      })(scripts[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
