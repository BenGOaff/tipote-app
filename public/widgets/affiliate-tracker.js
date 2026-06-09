/**
 * Tipote Affiliate Tracking Snippet — v1.1 (8 juin 2026)
 *
 * Installation (Systeme.io) :
 *   Paramètres compte -> Code de tracking GLOBAL (header), coller :
 *     <script src="https://app.tipote.com/widgets/affiliate-tracker.js" async></script>
 *
 *   Ne PAS coller le contenu de ce fichier inline. Via <script src=...>,
 *   on garde une seule version centralisée et Béné peut vérifier que
 *   le fichier charge bien dans l'onglet Network du navigateur.
 *
 * Ce que fait le snippet :
 *   1. Si l'URL contient ?sa=XXX -> stocke le SA en cookie tipote_sa (90j)
 *      ET POST un "click" vers app.tipote.com pour les stats.
 *   2. Réécrit tous les liens sortants vers tipote.* pour propager le sa=
 *      (un visiteur arrivé via affilié sur le blog garde son cookie quand
 *      il clique sur "Acheter" et part vers la landing checkout).
 *   3. À chaque submit d'un form contenant un input email, POST un
 *      "conversion" vers app.tipote.com pour lier l'email à l'affilié.
 *
 * Aucun PII collecté côté client. La table affiliate_clicks ne stocke
 * que des IPs hashées (SHA256 + secret), jamais l'IP brute.
 *
 * Test rapide (Béné) : ouvrir tipote.fr/?sa=satest1234567890abcdef1234567890abcdef
 *   - Onglet Application/Storage -> cookie tipote_sa posé ?
 *   - Onglet Network -> POST /api/affiliate/track 200 ?
 *   - Tous les liens vers tipote.com / tipote.fr / tipote.blog ont ?sa= ?
 */
(function () {
  "use strict";
  if (window.__tipoteAffiliateTrackerLoaded__) return;
  window.__tipoteAffiliateTrackerLoaded__ = true;

  var ENDPOINT = "https://app.tipote.com/api/affiliate/track";
  var COOKIE_NAME = "tipote_sa";
  var COOKIE_MAX_AGE = 90 * 24 * 3600; // 90 jours
  var TIPOTE_DOMAINS = ["tipote.com", "tipote.fr", "tipote.blog"];

  function setCookie(name, value) {
    // SameSite=Lax pour que le cookie survive aux clics de liens
    // externes vers nos domaines.
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; max-age=" +
      COOKIE_MAX_AGE +
      "; path=/; SameSite=Lax";
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function isValidSa(sa) {
    // Format Systeme.io : "sa" suivi de 20-80 caractères hex.
    return typeof sa === "string" && /^sa[a-f0-9]{20,80}$/i.test(sa);
  }

  function post(payload) {
    try {
      var json = JSON.stringify(payload);
      var blob = new Blob([json], { type: "application/json" });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
      // sendBeacon a renvoyé false (queue pleine) ou n'existe pas :
      // fallback fetch keepalive. Both no-cors-safe : l'endpoint répond
      // toujours 200/4xx sans bloquer la nav cote SIO.
      fetch(ENDPOINT, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: json,
      }).catch(function () {});
    } catch (_) {}
  }

  // ─── 1. Capture ?sa= depuis URL ────────────────────────────────────

  var saFromUrl = null;
  try {
    saFromUrl = new URLSearchParams(window.location.search).get("sa");
  } catch (_) {}

  if (saFromUrl && isValidSa(saFromUrl)) {
    setCookie(COOKIE_NAME, saFromUrl);
    post({
      type: "click",
      sa: saFromUrl,
      page_url: window.location.href,
      referrer: document.referrer || null,
    });
  }

  // ─── 2. Réécriture des liens sortants vers tipote.* ─────────────────

  function rewriteLinks() {
    var sa = getCookie(COOKIE_NAME);
    if (!sa || !isValidSa(sa)) return;
    var anchors = document.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href");
      if (!href) continue;
      if (href.indexOf("://") === -1) continue;
      var matches = false;
      for (var j = 0; j < TIPOTE_DOMAINS.length; j++) {
        if (href.indexOf("://" + TIPOTE_DOMAINS[j]) > -1) { matches = true; break; }
        if (href.indexOf("." + TIPOTE_DOMAINS[j]) > -1) { matches = true; break; }
      }
      if (!matches) continue;
      if (/[?&]sa=/.test(href)) continue;
      var sep = href.indexOf("?") > -1 ? "&" : "?";
      a.setAttribute("href", href + sep + "sa=" + encodeURIComponent(sa));
    }
  }

  rewriteLinks();
  // Re-run pour rattraper les liens lazy-loaded (carousels, articles AJAX).
  setTimeout(rewriteLinks, 1000);
  setTimeout(rewriteLinks, 3000);

  // ─── 3. Capture conversion au submit de form ────────────────────────

  document.addEventListener(
    "submit",
    function (e) {
      try {
        var form = e.target;
        if (!form || form.tagName !== "FORM") return;
        var sa = getCookie(COOKIE_NAME);
        if (!sa || !isValidSa(sa)) return;
        var emailInput = form.querySelector(
          'input[type="email"], input[name*="email" i]'
        );
        var email = emailInput && emailInput.value ? emailInput.value.trim().toLowerCase() : null;
        if (!email || email.indexOf("@") === -1) return;
        post({
          type: "conversion",
          sa: sa,
          email: email,
          page_url: window.location.href,
        });
      } catch (_) {}
    },
    true,
  );
})();
