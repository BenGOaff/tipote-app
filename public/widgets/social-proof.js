/**
 * Tipote Social Proof Widget — Embeddable toast notifications
 * Design inspired by ProveSource & TrustPulse: clean card with avatar circle,
 * bold name, action text, time ago, subtle shadow, smooth slide-in animation.
 *
 * Usage (single script tag):
 *   <script src="https://app.tipote.com/widgets/social-proof.js" data-widget-id="YOUR_WIDGET_ID"></script>
 *
 * Pixel mode (on thank-you pages):
 *   <script src="https://app.tipote.com/widgets/social-proof.js"
 *           data-widget-id="YOUR_WIDGET_ID"
 *           data-event="purchase"
 *           data-name="John"></script>
 */
(function () {
  "use strict";

  if (window.__tipote_sp_loaded) return;
  window.__tipote_sp_loaded = true;

  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    return s[s.length - 1];
  })();

  var WIDGET_ID = script.getAttribute("data-widget-id");
  if (!WIDGET_ID) return;

  var API_BASE = script.src.replace(/\/widgets\/social-proof\.js.*$/, "");
  var EVENT_TYPE = script.getAttribute("data-event");
  var EVENT_NAME = script.getAttribute("data-name") || "";

  // Clean up unresolved template variables (e.g. "{{ contact.first_name }}")
  if (EVENT_NAME && /^\{\{.*\}\}$/.test(EVENT_NAME.trim())) EVENT_NAME = "";

  // Auto-detect name from URL query params (Systeme.io, etc.)
  if (!EVENT_NAME) {
    try {
      var params = new URLSearchParams(location.search);
      EVENT_NAME = params.get("first_name") || params.get("firstname") || params.get("prenom") || params.get("name") || params.get("contact_first_name") || params.get("fname") || "";
    } catch(e) {}
  }

  // ─── Pixel mode ──────────────────────────────────────────────────────
  if (EVENT_TYPE && (EVENT_TYPE === "signup" || EVENT_TYPE === "purchase")) {
    fetch(API_BASE + "/api/widgets/toast/" + WIDGET_ID + "/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: EVENT_TYPE, name: EVENT_NAME, page_url: location.href }),
    }).catch(function () {});
    return;
  }

  // ─── Visitor ID ──────────────────────────────────────────────────────
  var VID = sessionStorage.getItem("tipote_vid");
  if (!VID) {
    VID = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("tipote_vid", VID);
  }

  var queue = [], showing = false, shown = 0, cfg = null;

  // ─── Styles — ProveSource-inspired design ────────────────────────────
  function injectStyles() {
    if (document.getElementById("tpt-sp-css")) return;
    var s = document.createElement("style");
    s.id = "tpt-sp-css";
    s.textContent = "\
@keyframes tpt-slide-in{0%{opacity:0;transform:translateX(-20px) translateY(10px) scale(.96)}100%{opacity:1;transform:translateX(0) translateY(0) scale(1)}}\
@keyframes tpt-slide-out{0%{opacity:1;transform:translateX(0) translateY(0) scale(1)}100%{opacity:0;transform:translateX(-20px) translateY(10px) scale(.96)}}\
@keyframes tpt-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}\
.tpt-sp{position:fixed;z-index:99999;max-width:360px;width:calc(100vw - 24px);padding:0;display:flex;align-items:stretch;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;font-size:13px;line-height:1.45;border-radius:10px;overflow:hidden;cursor:default;animation:tpt-slide-in .5s cubic-bezier(.16,1,.3,1) forwards}\
.tpt-sp.tpt-hide{animation:tpt-slide-out .35s ease-in forwards}\
.tpt-sp-accent{width:4px;flex-shrink:0}\
.tpt-sp-body{flex:1;display:flex;align-items:center;gap:12px;padding:14px 36px 14px 14px}\
.tpt-sp-avatar{flex-shrink:0;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;letter-spacing:-.5px}\
.tpt-sp-info{flex:1;min-width:0}\
.tpt-sp-main{font-size:13.5px;color:#1a1a2e}\
.tpt-sp-main b{font-weight:700}\
.tpt-sp-meta{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11px;color:#8b8fa3}\
.tpt-sp-dot{width:4px;height:4px;border-radius:50%;background:#22c55e;display:inline-block;animation:tpt-pulse 2s infinite}\
.tpt-sp-close{position:absolute;top:8px;right:8px;background:none;border:none;width:20px;height:20px;display:flex;align-items:center;justify-content:center;opacity:.35;cursor:pointer;font-size:14px;line-height:1;color:#64748b;border-radius:50%;transition:opacity .2s,background .2s}\
.tpt-sp-close:hover{opacity:.8;background:rgba(0,0,0,.05)}\
.tpt-sp-powered{font-size:9.5px;color:#b0b4c3;text-align:right;padding:0 12px 6px 0;text-decoration:none;display:block}\
.tpt-sp-powered:hover{color:#8b8fa3}\
@media(max-width:480px){.tpt-sp{max-width:calc(100vw - 16px);font-size:12px}.tpt-sp-body{padding:10px 30px 10px 10px;gap:10px}.tpt-sp-avatar{width:36px;height:36px;font-size:15px}}";
    document.head.appendChild(s);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────
  function timeAgo(d) {
    var s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "a few seconds ago";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function cleanName(name) {
    if (!name) return name;
    // Strip unresolved template variables
    if (/\{\{.*\}\}/.test(name) || /\{%.*%\}/.test(name)) return "";
    return name;
  }

  function anon(name, n) {
    name = cleanName(name);
    if (!name || !n || n <= 0) return name;
    return name.length <= n ? name : name.charAt(0).toUpperCase() + ".";
  }

  function initials(name) {
    if (!name) return "?";
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  // Color palette for avatar backgrounds (ProveSource-like soft colors)
  var AVATAR_COLORS = [
    { bg: "#dbeafe", fg: "#2563eb" },
    { bg: "#dcfce7", fg: "#16a34a" },
    { bg: "#fef9c3", fg: "#ca8a04" },
    { bg: "#fce7f3", fg: "#db2777" },
    { bg: "#e0e7ff", fg: "#4f46e5" },
    { bg: "#f3e8ff", fg: "#9333ea" },
    { bg: "#ffedd5", fg: "#ea580c" },
    { bg: "#ccfbf1", fg: "#0d9488" },
  ];

  function avatarColor(name) {
    var h = 0;
    for (var i = 0; i < (name || "x").length; i++) h = ((h << 5) - h + (name || "x").charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }

  function posStyle(pos) {
    var r = {};
    r[pos.indexOf("left") >= 0 ? "left" : "right"] = "12px";
    r[pos.indexOf("top") >= 0 ? "top" : "bottom"] = "12px";
    return r;
  }

  // ─── Build queue ─────────────────────────────────────────────────────
  function buildQueue(data) {
    var q = [], w = data.widget;

    // Visitors
    if (w.show_visitor_count && data.active_visitors > 1) {
      q.push({
        type: "visitors",
        name: null,
        text: w.visitor_count_label.replace("{count}", data.active_visitors),
        time: null,
        icon: "👥",
        accent: "#3b82f6",
      });
    }

    // Events
    (data.events || []).forEach(function (ev) {
      if (ev.event_type === "signup" && w.show_recent_signups) {
        var n = anon(ev.visitor_name || "Someone", w.anonymize_after);
        q.push({
          type: "signup",
          name: n,
          text: w.signup_label.replace("{name}", "<b>" + n + "</b>"),
          time: timeAgo(ev.created_at),
          icon: null,
          accent: "#22c55e",
        });
      } else if (ev.event_type === "purchase" && w.show_recent_purchases) {
        var pn = anon(ev.visitor_name || "Someone", w.anonymize_after);
        q.push({
          type: "purchase",
          name: pn,
          text: w.purchase_label.replace("{name}", "<b>" + pn + "</b>"),
          time: timeAgo(ev.created_at),
          icon: null,
          accent: "#f59e0b",
        });
      }
    });

    // Custom messages
    (w.custom_messages || []).forEach(function (msg) {
      if (msg.enabled === false) return;
      q.push({
        type: "custom",
        name: null,
        text: msg.text,
        time: null,
        icon: msg.icon || "💡",
        accent: (w.style && w.style.accent) || "#6366f1",
      });
    });

    return q;
  }

  // ─── Render toast ────────────────────────────────────────────────────
  function showToast(item) {
    if (!cfg) return;
    showing = true;
    var w = cfg.widget;
    var st = w.style || {};
    var isDark = st.theme === "dark";
    var pos = posStyle(w.position);

    var toast = document.createElement("div");
    toast.className = "tpt-sp";
    toast.style.background = isDark ? "#1e293b" : "#ffffff";
    toast.style.boxShadow = isDark
      ? "0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)"
      : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)";
    for (var k in pos) toast.style[k] = pos[k];

    // Accent bar (left colored strip — like ProveSource)
    var accent = document.createElement("div");
    accent.className = "tpt-sp-accent";
    accent.style.background = item.accent;
    toast.appendChild(accent);

    // Inner wrapper
    var inner = document.createElement("div");
    inner.style.flex = "1";
    inner.style.position = "relative";

    // Body
    var body = document.createElement("div");
    body.className = "tpt-sp-body";

    // Avatar (initials or emoji)
    var avatar = document.createElement("div");
    avatar.className = "tpt-sp-avatar";
    if (item.name && !item.icon) {
      var ac = avatarColor(item.name);
      avatar.style.background = isDark ? "rgba(255,255,255,0.1)" : ac.bg;
      avatar.style.color = isDark ? "#e2e8f0" : ac.fg;
      avatar.textContent = initials(item.name);
    } else {
      avatar.style.background = isDark ? "rgba(255,255,255,0.08)" : item.accent + "15";
      avatar.textContent = item.icon || "🔔";
    }
    body.appendChild(avatar);

    // Info
    var info = document.createElement("div");
    info.className = "tpt-sp-info";

    var main = document.createElement("div");
    main.className = "tpt-sp-main";
    if (isDark) main.style.color = "#e2e8f0";
    main.innerHTML = item.text; // contains <b> tags
    info.appendChild(main);

    // Meta line: time ago + green dot
    if (item.time) {
      var meta = document.createElement("div");
      meta.className = "tpt-sp-meta";
      if (isDark) meta.style.color = "#94a3b8";
      var dot = document.createElement("span");
      dot.className = "tpt-sp-dot";
      if (item.type === "purchase") dot.style.background = "#f59e0b";
      meta.appendChild(dot);
      var timeTxt = document.createElement("span");
      timeTxt.textContent = item.time;
      meta.appendChild(timeTxt);
      info.appendChild(meta);
    }

    body.appendChild(info);
    inner.appendChild(body);

    // Close button
    var close = document.createElement("button");
    close.className = "tpt-sp-close";
    close.innerHTML = "&#10005;";
    if (isDark) close.style.color = "#94a3b8";
    close.onclick = function () { hideToast(toast); };
    inner.appendChild(close);

    toast.appendChild(inner);
    document.body.appendChild(toast);

    setTimeout(function () { hideToast(toast); }, w.display_duration || 5000);
  }

  function hideToast(el) {
    if (!el || !el.parentNode) return;
    el.classList.add("tpt-hide");
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      showing = false;
      shown++;
      scheduleNext();
    }, 380);
  }

  function scheduleNext() {
    if (!cfg) return;
    if (shown >= (cfg.widget.max_per_session || 10)) return;
    if (queue.length === 0) return;
    setTimeout(function () {
      if (queue.length > 0 && !showing) showToast(queue.shift());
    }, cfg.widget.delay_between || 8000);
  }

  function sendPing() {
    fetch(API_BASE + "/api/widgets/toast/" + WIDGET_ID + "/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: VID, page_url: location.href }),
    }).catch(function () {});
  }

  // ─── Auto-capture: intercept form submissions to record signup with real name ─
  // Finds name input by name attribute, placeholder, or nearby label
  function findNameInput(container) {
    if (!container) return null;
    // Only match fields that are explicitly "first name" — never grab
    // last name, phone, or other sensitive data.
    var firstNameOnly = /^(pr[eé]nom|first.?name|fname|vorname)$/i;
    // 1. By name attribute (strict first-name fields only)
    var byName = container.querySelector('input[name="first_name"]') || container.querySelector('input[name="firstname"]') || container.querySelector('input[name="prenom"]') || container.querySelector('input[name="fname"]');
    if (byName) return byName;
    // 2. By placeholder text (common on Systeme.io and landing page builders)
    var inputs = container.querySelectorAll('input[type="text"], input:not([type])');
    for (var i = 0; i < inputs.length; i++) {
      var ph = (inputs[i].getAttribute("placeholder") || "").trim();
      if (firstNameOnly.test(ph)) return inputs[i];
    }
    // 3. By associated label text
    for (var j = 0; j < inputs.length; j++) {
      var id = inputs[j].id;
      if (id) {
        var label = container.querySelector('label[for="' + id + '"]');
        if (label && firstNameOnly.test((label.textContent || "").trim())) return inputs[j];
      }
    }
    // No fallback — if we can't identify the first name field with certainty,
    // we don't capture anything (privacy > convenience)
    return null;
  }

  function findEmailInput(container) {
    return container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
  }

  function fireSignupEvent(name) {
    if (window.__tipote_sp_fired) return;
    window.__tipote_sp_fired = true;
    fetch(API_BASE + "/api/widgets/toast/" + WIDGET_ID + "/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "signup", name: name, page_url: location.href }),
    }).catch(function () {});
    // Reset after 5s to allow multiple submissions on the same page
    setTimeout(function () { window.__tipote_sp_fired = false; }, 5000);
  }

  function setupFormCapture() {
    // Strategy 1: Listen to native form submit events
    document.addEventListener("submit", function (e) {
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      var emailInput = findEmailInput(form);
      if (!emailInput || !emailInput.value) return;
      var nameInput = findNameInput(form);
      var capturedName = nameInput ? (nameInput.value || "").trim() : "";
      fireSignupEvent(capturedName);
    }, true);

    // Strategy 2: Listen for click on buttons/links (catches Systeme.io
    // and other builders that use JS handlers instead of native form submit)
    document.addEventListener("click", function (e) {
      var target = e.target;
      if (!target) return;
      // Walk up to find button/a/input[type=submit]
      var btn = target.closest ? target.closest('button, a, input[type="submit"], [role="button"]') : null;
      if (!btn) return;
      // Find the closest form or section containing both email + name fields
      var container = btn.closest("form") || btn.closest("section") || btn.closest("div[class]") || btn.parentElement;
      if (!container) return;
      var emailInput = findEmailInput(container);
      if (!emailInput || !emailInput.value) return;
      var nameInput = findNameInput(container);
      var capturedName = nameInput ? (nameInput.value || "").trim() : "";
      // Small delay to let the form process first
      setTimeout(function () { fireSignupEvent(capturedName); }, 200);
    }, true);
  }

  function init() {
    injectStyles();
    sendPing();
    setInterval(sendPing, 30000);
    setupFormCapture();

    fetch(API_BASE + "/api/widgets/toast/" + WIDGET_ID + "/public?page_url=" + encodeURIComponent(location.href))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;
        cfg = data;
        queue = buildQueue(data);
        // Shuffle
        for (var i = queue.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = queue[i]; queue[i] = queue[j]; queue[j] = t;
        }
        if (queue.length > 0) {
          setTimeout(function () { showToast(queue.shift()); }, 3000);
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
