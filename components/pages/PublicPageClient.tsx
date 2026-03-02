// components/pages/PublicPageClient.tsx
// Renders a published hosted page in full-screen mode.
// Displays the pre-rendered HTML snapshot in an iframe.
// Handles lead capture: inline form injected into HTML + overlay on CTA click.
// Client-side fetches via dedicated /api/pages/public/[slug] endpoint (like quiz).
//
// IMPORTANT: The html_snapshot from render.ts already includes:
// - Inline capture form (tipote-capture-form-wrap)
// - Legal footer (injectLegalFooterHtml)
// This client must NOT re-inject them to avoid duplicates.

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
  // Thank-you page customization (editable by user)
  thank_you_title?: string;
  thank_you_message?: string;
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
    thanksTitle: v ? "Merci pour votre inscription !" : "Merci pour ton inscription !",
    thanksMessage: v
      ? "Votre inscription est valid\u00e9e ! Vous allez recevoir vos acc\u00e8s par email dans les 10 prochaines minutes. Pensez \u00e0 v\u00e9rifier vos spams si vous ne le recevez pas."
      : "Ton inscription est valid\u00e9e ! Tu vas recevoir tes acc\u00e8s par email dans les 10 prochaines minutes. Pense \u00e0 v\u00e9rifier tes spams si tu ne le re\u00e7ois pas.",
    thanksRedirect: v
      ? "Vous allez \u00eatre redirig\u00e9(e) dans quelques instants..."
      : "Tu vas \u00eatre redirig\u00e9(e) dans quelques instants...",
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

      // If there's a payment URL, redirect after showing thank-you briefly
      if (page.payment_url) {
        setTimeout(() => {
          window.location.href = page.payment_url;
        }, 3000);
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

  // Inject CTA interception script into the HTML (NO legal footer or capture form — already in html_snapshot)
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

      {/* Thank-you / confirmation page after successful capture */}
      {captureSuccess && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            textAlign: "center",
            maxWidth: 500,
            width: "90%",
            boxShadow: "0 25px 80px rgba(0,0,0,0.3)",
          }}>
            {/* Success icon */}
            <div style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              boxShadow: "0 8px 30px rgba(16,185,129,0.3)",
            }}>
              <svg width="36" height="36" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h2 style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              marginBottom: 16,
              color: "#1c1c1c",
              lineHeight: 1.3,
            }}>
              {page.thank_you_title || txt.thanksTitle}
            </h2>

            <p style={{
              color: "#555",
              fontSize: "1.05rem",
              lineHeight: 1.7,
              marginBottom: 24,
              maxWidth: 380,
              marginLeft: "auto",
              marginRight: "auto",
            }}>
              {page.thank_you_message || txt.thanksMessage}
            </p>

            {/* Email icon hint */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 24px",
              background: "#f0fdf4",
              borderRadius: 12,
              border: "1px solid #bbf7d0",
              marginBottom: page.payment_url ? 24 : 0,
            }}>
              <svg width="20" height="20" fill="none" stroke="#059669" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span style={{ fontSize: "0.9rem", color: "#059669", fontWeight: 600 }}>
                {page.address_form === "vous" ? "V\u00e9rifiez votre bo\u00eete email" : "V\u00e9rifie ta bo\u00eete email"}
              </span>
            </div>

            {/* Redirect notice */}
            {page.payment_url && (
              <p style={{
                color: "#999",
                fontSize: "0.85rem",
                marginTop: 16,
                fontStyle: "italic",
              }}>
                {txt.thanksRedirect}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Inject a small script into the HTML that intercepts CTA clicks
// and posts a message to the parent to open the capture overlay.
// IMPORTANT: Does NOT re-inject legal footer or capture form (already in html_snapshot from render.ts).
function injectCaptureScript(page: PublicPageData): string {
  const html = page.html_snapshot || "";

  if (!page.capture_enabled) {
    // No capture interception needed — page is served as-is
    // Legal footer is already in the html_snapshot from render.ts
    return html;
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

  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + script;
  return html.slice(0, idx) + script + "\n" + html.slice(idx);
}
