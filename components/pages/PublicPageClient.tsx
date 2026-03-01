// components/pages/PublicPageClient.tsx
// Renders a published hosted page in full-screen mode.
// Displays the pre-rendered HTML snapshot in an iframe.
// Handles lead capture overlay if enabled.

"use client";

import { useState, useCallback } from "react";

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
};

export default function PublicPageClient({ page }: { page: PublicPageData }) {
  const [showCapture, setShowCapture] = useState(false);
  const [captureEmail, setCaptureEmail] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);

  const handleSubmitLead = useCallback(async () => {
    if (!captureEmail.trim() || capturing) return;
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
  }, [captureEmail, captureFirstName, capturing, page.id, page.payment_url]);

  // Inject capture form overlay script into the HTML
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
              {page.capture_heading || "Accède gratuitement"}
            </h2>
            {page.capture_subtitle && (
              <p style={{ color: "#666", textAlign: "center", marginBottom: 20, fontSize: "0.95rem" }}>
                {page.capture_subtitle}
              </p>
            )}

            {(page.capture_first_name !== false) && (
            <input
              type="text"
              placeholder="Ton prénom"
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
              placeholder="Ton email"
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
              {capturing ? "..." : page.payment_button_text || "C'est parti !"}
            </button>

            <p style={{ fontSize: "0.75rem", color: "#999", textAlign: "center", marginTop: 12 }}>
              Tes données sont protégées.{" "}
              {page.legal_privacy_url && (
                <a href={page.legal_privacy_url} target="_blank" rel="noopener" style={{ color: "#999", textDecoration: "underline" }}>
                  Politique de confidentialité
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
            <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Merci !</h2>
            <p style={{ color: "#666" }}>
              {page.payment_url ? "Redirection en cours..." : "Tu vas recevoir un email de confirmation."}
            </p>
          </div>
        </div>
      )}

      {/* Listen for capture events from iframe */}
      <CaptureListener onCapture={() => setShowCapture(true)} />
    </>
  );
}

// Listens for postMessage from the iframe to trigger capture overlay
function CaptureListener({ onCapture }: { onCapture: () => void }) {
  if (typeof window !== "undefined") {
    window.addEventListener("message", (e) => {
      if (e.data === "tipote:capture") onCapture();
    }, { once: false });
  }
  return null;
}

// Inject a small script into the HTML that intercepts CTA clicks
// and posts a message to the parent to open the capture overlay
function injectCaptureScript(page: PublicPageData): string {
  const html = page.html_snapshot || "";
  if (!page.capture_enabled) return html;

  const script = `<script>
(function(){
  // Intercept all CTA-like button/link clicks
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a[href="#"], a[href="#capture"], button, .cta-primary, .cta-button, [data-capture]');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    // Only intercept hash/empty links and buttons, not real URLs
    if (href && href !== '#' && href !== '#capture' && !href.startsWith('#')) return;
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage('tipote:capture', '*');
  }, true);
})();
</script>`;

  // Also add legal footer if not already present
  const legalFooter = buildLegalFooter(page);

  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + legalFooter + script;
  return html.slice(0, idx) + legalFooter + "\n" + script + "\n" + html.slice(idx);
}

function buildLegalFooter(page: PublicPageData): string {
  const links: string[] = [];
  if (page.legal_mentions_url) links.push(`<a href="${page.legal_mentions_url}" target="_blank" style="color:#999;text-decoration:underline">Mentions légales</a>`);
  if (page.legal_cgv_url) links.push(`<a href="${page.legal_cgv_url}" target="_blank" style="color:#999;text-decoration:underline">CGV</a>`);
  if (page.legal_privacy_url) links.push(`<a href="${page.legal_privacy_url}" target="_blank" style="color:#999;text-decoration:underline">Politique de confidentialité</a>`);

  if (links.length === 0) return "";

  return `<div style="text-align:center;padding:16px;font-size:12px;color:#999;font-family:system-ui;border-top:1px solid #eee;margin-top:24px">${links.join(" | ")}</div>`;
}
