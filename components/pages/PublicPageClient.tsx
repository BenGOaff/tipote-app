// components/pages/PublicPageClient.tsx
// Renders a published hosted page in full-screen mode.
// Displays the pre-rendered HTML snapshot in an iframe.
// Handles lead capture: inline form injected into HTML + overlay on CTA click.
// Client-side fetches via dedicated /api/pages/public/[slug] endpoint (like quiz).

"use client";

import { useState, useCallback, useEffect } from "react";

type PublicPageData = {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  html_snapshot: string;
  capture_enabled: boolean;
  capture_heading: string;
  capture_subtitle: string;
  capture_first_name?: boolean;
  payment_url: string;
  payment_button_text: string;
  video_embed_url: string;
  legal_mentions_url: string;
  legal_cgv_url: string;
  legal_privacy_url: string;
  address_form?: string;
};

function pageTexts(addressForm?: string) {
  const v = addressForm === "vous";
  return {
    loading: "Chargement...",
    notFoundTitle: "Page introuvable",
    notFoundDesc: "Cette page n\u2019existe pas ou n\u2019est plus disponible.",
    firstNamePlaceholder: v ? "Votre pr\u00e9nom" : "Ton pr\u00e9nom",
    emailPlaceholder: v ? "Votre email" : "Ton email",
    defaultCta: "C\u2019est parti !",
    dataProtected: v ? "Vos donn\u00e9es sont prot\u00e9g\u00e9es." : "Tes donn\u00e9es sont prot\u00e9g\u00e9es.",
    dataProtectedLong: v
      ? "Vos donn\u00e9es sont prot\u00e9g\u00e9es et ne seront jamais partag\u00e9es."
      : "Tes donn\u00e9es sont prot\u00e9g\u00e9es et ne seront jamais partag\u00e9es.",
    privacyPolicy: "Politique de confidentialit\u00e9",
    thanksTitle: "Merci !",
    thanksRedirect: "Redirection en cours...",
    thanksConfirmation: v
      ? "Vous allez recevoir un email de confirmation."
      : "Tu vas recevoir un email de confirmation.",
    consentLabel: v
      ? "J\u2019accepte de recevoir des emails."
      : "J\u2019accepte de recevoir des emails.",
    defaultHeading: v ? "Acc\u00e9dez gratuitement" : "Acc\u00e8de gratuitement",
  };
}

export default function PublicPageClient({ page: serverPage, slug }: { page: PublicPageData | null; slug: string }) {
  const [page, setPage] = useState<PublicPageData | null>(serverPage);
  const [loading, setLoading] = useState(!serverPage);
  const [notFound, setNotFound] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [captureEmail, setCaptureEmail] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);

  // Client-side fetch via dedicated public API endpoint (uses supabaseAdmin, bypasses RLS)
  useEffect(() => {
    if (serverPage) return;

    fetch(`/api/pages/public/${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.page) {
          setPage(data.page);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        setNotFound(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [serverPage, slug]);

  // Listen for capture events from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === "tipote:capture") setShowCapture(true);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleSubmitLead = useCallback(async () => {
    if (!page || !captureEmail.trim() || capturing) return;
    setCapturing(true);

    try {
      await fetch(`/api/pages/${page.id}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: captureEmail.trim(),
          first_name: captureFirstName.trim(),
          referrer: typeof document !== "undefined" ? document.referrer : "",
        }),
      });
      setCaptureSuccess(true);

      // If there's a payment URL, redirect after capture
      if (page.payment_url) {
        setTimeout(() => {
          window.location.href = page.payment_url;
        }, 1500);
      }
    } catch {
      // Silent fail for UX
    } finally {
      setCapturing(false);
    }
  }, [captureEmail, captureFirstName, capturing, page]);

  const txt = pageTexts(page?.address_form);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#666" }}>{txt.loading}</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>{txt.notFoundTitle}</h1>
          <p style={{ color: "#666", marginTop: 8 }}>{txt.notFoundDesc}</p>
        </div>
      </div>
    );
  }

  // Non-blocking: increment views
  try {
    fetch(`/api/pages/${page.id}/views`, { method: "POST" }).catch(() => {});
  } catch { /* ignore */ }

  // Inject capture form + CTA interception script into the HTML
  const htmlWithCapture = injectCaptureScript(page);

  return (
    <>
      {/* Full-screen iframe */}
      <iframe
        srcDoc={htmlWithCapture}
        title={page.title}
        style={{
          width: "100vw",
          height: "100vh",
          border: "none",
          display: "block",
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />

      {/* Capture overlay (triggered by message from iframe) */}
      {showCapture && !captureSuccess && page.capture_enabled && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowCapture(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "32px 28px",
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
              {page.capture_heading || txt.defaultHeading}
            </h2>
            {page.capture_subtitle && (
              <p style={{ color: "#666", textAlign: "center", marginBottom: 20, fontSize: "0.95rem" }}>
                {page.capture_subtitle}
              </p>
            )}

            {(page.capture_first_name !== false) && (
            <input
              type="text"
              placeholder={txt.firstNamePlaceholder}
              value={captureFirstName}
              onChange={(e) => setCaptureFirstName(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "1px solid #ddd",
                borderRadius: 8,
                marginBottom: 12,
                fontSize: "1rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            )}
            <input
              type="email"
              placeholder={txt.emailPlaceholder}
              value={captureEmail}
              onChange={(e) => setCaptureEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitLead()}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "1px solid #ddd",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: "1rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleSubmitLead}
              disabled={capturing || !captureEmail.trim()}
              style={{
                width: "100%",
                padding: "14px",
                background: capturing ? "#999" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: "1.05rem",
                fontWeight: 600,
                cursor: capturing ? "not-allowed" : "pointer",
              }}
            >
              {capturing ? "..." : page.payment_button_text || txt.defaultCta}
            </button>

            <p style={{ fontSize: "0.75rem", color: "#999", textAlign: "center", marginTop: 12 }}>
              {txt.dataProtected}{" "}
              {page.legal_privacy_url && (
                <a href={page.legal_privacy_url} target="_blank" rel="noopener" style={{ color: "#999", textDecoration: "underline" }}>
                  {txt.privacyPolicy}
                </a>
              )}
            </p>
          </div>
        </div>
      )}

      {captureSuccess && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>&#10003;</div>
            <h2 style={{ fontWeight: 700, marginBottom: 8 }}>{txt.thanksTitle}</h2>
            <p style={{ color: "#666" }}>
              {page.payment_url ? txt.thanksRedirect : txt.thanksConfirmation}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// Inject a small script into the HTML that intercepts CTA clicks
// and posts a message to the parent to open the capture overlay
function injectCaptureScript(page: PublicPageData): string {
  const html = page.html_snapshot || "";

  // For capture pages: inject an inline form into the HTML before any CTA
  let withForm = html;
  if (page.page_type === "capture" && page.capture_enabled) {
    withForm = injectInlineCaptureForm(withForm, page);
  }

  if (!page.capture_enabled) {
    // Still add legal footer
    const legalFooter = buildLegalFooter(page);
    const idx = withForm.lastIndexOf("</body>");
    if (idx === -1) return withForm + legalFooter;
    return withForm.slice(0, idx) + legalFooter + "\n" + withForm.slice(idx);
  }

  const script = `<script>
(function(){
  // Intercept all CTA-like button/link clicks
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a[href="#"], a[href="#capture"], button[type="submit"], .cta-primary, .cta-button, [data-capture]');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    // Only intercept hash/empty links and buttons, not real URLs
    if (href && href !== '#' && href !== '#capture' && !href.startsWith('#')) return;
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage('tipote:capture', '*');
  }, true);

  // Also handle inline form submission
  var inlineForm = document.getElementById('tipote-capture-form');
  if (inlineForm) {
    inlineForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = inlineForm.querySelector('input[type="email"]');
      var name = inlineForm.querySelector('input[type="text"]');
      if (email && email.value.trim()) {
        parent.postMessage('tipote:capture', '*');
      }
    });
  }
})();
</script>`;

  const legalFooter = buildLegalFooter(page);
  const idx = withForm.lastIndexOf("</body>");
  if (idx === -1) return withForm + legalFooter + script;
  return withForm.slice(0, idx) + legalFooter + "\n" + script + "\n" + withForm.slice(idx);
}

/** Inject an inline capture form into the page HTML. */
function injectInlineCaptureForm(html: string, page: PublicPageData): string {
  const txt = pageTexts(page.address_form);
  const heading = page.capture_heading || txt.defaultHeading;
  const subtitle = page.capture_subtitle || "";
  const btnText = page.payment_button_text || txt.defaultCta;
  const privacyUrl = page.legal_privacy_url || "";

  const formHtml = `
<div id="tipote-inline-capture" style="max-width:480px;margin:32px auto;padding:32px 24px;background:rgba(255,255,255,0.95);border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12);text-align:center;font-family:system-ui,sans-serif">
  <h3 style="font-size:1.35rem;font-weight:700;margin:0 0 8px;color:#1c1c1c">${escapeForHtml(heading)}</h3>
  ${subtitle ? `<p style="color:#666;margin:0 0 20px;font-size:0.95rem">${escapeForHtml(subtitle)}</p>` : '<div style="margin-bottom:16px"></div>'}
  <form id="tipote-capture-form" style="display:flex;flex-direction:column;gap:10px">
    <input type="text" placeholder="${escapeForHtml(txt.firstNamePlaceholder)}" style="padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:1rem;outline:none">
    <input type="email" placeholder="${escapeForHtml(txt.emailPlaceholder)}" required style="padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:1rem;outline:none">
    <label style="display:flex;align-items:flex-start;gap:8px;text-align:left;font-size:0.8rem;color:#666;cursor:pointer;margin:4px 0">
      <input type="checkbox" required style="margin-top:2px;accent-color:#2563eb">
      <span>${escapeForHtml(txt.consentLabel)} ${privacyUrl ? `<a href="${escapeForHtml(privacyUrl)}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline">${escapeForHtml(txt.privacyPolicy)}</a>` : ''}</span>
    </label>
    <button type="submit" style="padding:14px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:1.05rem;font-weight:600;cursor:pointer;margin-top:4px">${escapeForHtml(btnText)}</button>
  </form>
  <p style="font-size:0.7rem;color:#999;margin:10px 0 0">${escapeForHtml(txt.dataProtectedLong)}</p>
</div>`;

  // Try to insert the form after the first CTA section or before the footer
  // Strategy: insert before <footer> or before the last section or before </body>
  const footerIdx = html.search(/<footer[\s>]/i);
  if (footerIdx !== -1) {
    return html.slice(0, footerIdx) + formHtml + "\n" + html.slice(footerIdx);
  }

  const bodyIdx = html.lastIndexOf("</body>");
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + formHtml + "\n" + html.slice(bodyIdx);
  }

  return html + formHtml;
}

function escapeForHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildLegalFooter(page: PublicPageData): string {
  const links: string[] = [];
  if (page.legal_mentions_url) links.push(`<a href="${page.legal_mentions_url}" target="_blank" style="color:#999;text-decoration:underline">Mentions légales</a>`);
  if (page.legal_cgv_url) links.push(`<a href="${page.legal_cgv_url}" target="_blank" style="color:#999;text-decoration:underline">CGV</a>`);
  if (page.legal_privacy_url) links.push(`<a href="${page.legal_privacy_url}" target="_blank" style="color:#999;text-decoration:underline">Politique de confidentialité</a>`);

  if (links.length === 0) return "";

  return `<div style="text-align:center;padding:16px;font-size:12px;color:#999;font-family:system-ui;border-top:1px solid #eee;margin-top:24px">${links.join(" | ")}</div>`;
}
