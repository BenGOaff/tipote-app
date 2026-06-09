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
      // IMPORTANT : on envoie en text/plain (pas application/json) pour
      // que la requete soit "simple" cote CORS = AUCUN preflight OPTIONS,
      // AUCUNE verification d'Access-Control-Allow-Origin sur la response.
      // Avec application/json le browser declenche un preflight ; meme si
      // le serveur repond bien, sendBeacon en POST avec content-type
      // non-simple voit le response check CORS echouer et logue "CORS
      // error" dans la console (drame Gwenn / Bene 8 juin 2026 :
      // "j'ai rien sur mon tableau de bord, ping CORS error"). L'endpoint
      // /api/affiliate/track parse deja le body brut en JSON.parse
      // (try-catch), donc text/plain est compatible cote serveur.
      var blob = new Blob([json], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
      // Fallback fetch : meme content-type pour eviter le preflight.
      fetch(ENDPOINT, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
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

  // ─── 3. Capture conversion - approche ROBUSTE multi-signaux ─────────
  //
  // Drame Bene 8 juin 2026 : "zero inscription" malgre des inscriptions
  // reelles. Cause : Systeme.io gere ses formulaires en JS custom / AJAX,
  // l'event `submit` natif ne fire pas toujours (ou est preventDefault).
  // Se reposer UNIQUEMENT sur le submit = fragile.
  //
  // Nouvelle strategie : on CAPTURE l'email des que l'user le tape (dans
  // n'importe quel input email), on le memorise (variable + sessionStorage
  // pour survivre a la navigation), et on FIRE la conversion sur PLUSIEURS
  // signaux independants. Au moins un finira par declencher :
  //   a) submit natif (si SIO le laisse passer)
  //   b) navigation away / fermeture onglet (pagehide / visibilitychange)
  //   c) arrivee sur une page "merci/thank-you" (l'email memorise au step
  //      precedent est envoye - tres fiable car SIO redirige toujours vers
  //      une thank-you page apres inscription)
  //
  // Idempotence cote serveur (dedup email+sa < 24h) garantit qu'aucun
  // double ne soit compte meme si 2 signaux firent.

  var SENT_KEY = "tipote_aff_conv_sent"; // emails deja envoyes (cette session)
  var PENDING_EMAIL_KEY = "tipote_aff_pending_email";

  function isCompleteEmail(v) {
    return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }

  function getSentSet() {
    try {
      var raw = window.sessionStorage.getItem(SENT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }
  function markSent(email, sa) {
    try {
      var set = getSentSet();
      set[sa + "|" + email] = 1;
      window.sessionStorage.setItem(SENT_KEY, JSON.stringify(set));
    } catch (_) {}
  }
  function alreadySent(email, sa) {
    var set = getSentSet();
    return !!set[sa + "|" + email];
  }

  function rememberEmail(email) {
    try { window.sessionStorage.setItem(PENDING_EMAIL_KEY, email); } catch (_) {}
  }
  function getRememberedEmail() {
    try { return window.sessionStorage.getItem(PENDING_EMAIL_KEY); } catch (_) { return null; }
  }

  // Tente d'envoyer la conversion. No-op si pas de SA, pas d'email
  // complet, ou deja envoye cette session (dedup client en plus du dedup
  // serveur).
  function fireConversion(email) {
    var sa = getCookie(COOKIE_NAME);
    if (!sa || !isValidSa(sa)) return;
    if (!isCompleteEmail(email)) return;
    var clean = email.trim().toLowerCase();
    if (alreadySent(clean, sa)) return;
    markSent(clean, sa);
    post({
      type: "conversion",
      sa: sa,
      email: clean,
      page_url: window.location.href,
    });
  }

  // (a) Capture l'email AU FUR ET A MESURE qu'il est tape, sur TOUTE la
  // page (pas seulement dans un form). Couvre les widgets SIO custom.
  function scanEmailInputs() {
    var inputs = document.querySelectorAll(
      'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="mail" i]'
    );
    for (var i = 0; i < inputs.length; i++) {
      var v = inputs[i].value;
      if (isCompleteEmail(v)) {
        rememberEmail(v.trim().toLowerCase());
      }
    }
  }
  document.addEventListener("input", scanEmailInputs, true);
  document.addEventListener("change", scanEmailInputs, true);
  document.addEventListener("blur", scanEmailInputs, true);

  // (b) submit natif : on tente direct (cas ideal ou SIO laisse passer).
  document.addEventListener(
    "submit",
    function (e) {
      try {
        var form = e.target;
        var email = null;
        if (form && form.querySelector) {
          var emailInput = form.querySelector(
            'input[type="email"], input[name*="email" i], input[id*="email" i]'
          );
          if (emailInput && isCompleteEmail(emailInput.value)) {
            email = emailInput.value.trim().toLowerCase();
          }
        }
        if (!email) { scanEmailInputs(); email = getRememberedEmail(); }
        if (email) { rememberEmail(email); fireConversion(email); }
      } catch (_) {}
    },
    true,
  );

  // (c) navigation away / onglet cache : dernier filet avant de quitter
  // la page. Si un email a ete tape mais le submit n'a pas fire (SIO AJAX),
  // on l'envoie ici. sendBeacon survit au unload.
  function flushPending() {
    var email = getRememberedEmail();
    if (email) fireConversion(email);
  }
  window.addEventListener("pagehide", flushPending);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushPending();
  });

  // (d) page "merci / thank-you" : SIO redirige TOUJOURS vers une page de
  // remerciement apres inscription (ex. /part-tiquiz-gratuit-merci). Si on
  // y arrive avec un email memorise a l'etape precedente (sessionStorage
  // survit a la navigation same-origin... mais SIO est cross-page same-
  // domain donc ca tient), on fire. C'est le signal le PLUS fiable car il
  // se declenche APRES une inscription confirmee.
  (function checkThankYouPage() {
    var path = (window.location.pathname || "").toLowerCase();
    var isThankYou = /merci|thank|confirm|success|felicit/.test(path);
    if (!isThankYou) return;
    var email = getRememberedEmail();
    if (email) fireConversion(email);
  })();
})();
