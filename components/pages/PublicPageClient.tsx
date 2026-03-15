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
import ToastNotificationOverlay from "@/components/widgets/ToastNotificationOverlay";
import SocialShareOverlay from "@/components/widgets/SocialShareOverlay";

type PublicPageData = {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  html_snapshot: string;
  locale?: string;
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
  thank_you_cta_text?: string;
  thank_you_cta_url?: string;
  // Brand tokens for thank-you page styling
  brand_tokens?: Record<string, any> | null;
  content_data?: Record<string, any> | null;
  // Tracking pixels
  facebook_pixel_id?: string;
  google_tag_id?: string;
};

const OVERLAY_I18N: Record<string, (v: boolean) => Record<string, string>> = {
  fr: (v) => ({
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
    consentLabel: "J\u2019accepte de recevoir des emails.",
    defaultHeading: v ? "Acc\u00e9dez gratuitement" : "Acc\u00e8de gratuitement",
  }),
  en: () => ({
    loading: "Loading...",
    notFoundTitle: "Page not found",
    notFoundDesc: "This page doesn\u2019t exist or is no longer available.",
    firstNamePlaceholder: "Your first name",
    emailPlaceholder: "Your email",
    defaultCta: "Let\u2019s go!",
    dataProtected: "Your data is protected.",
    dataProtectedLong: "Your data is protected and will never be shared.",
    privacyPolicy: "Privacy Policy",
    thanksTitle: "Thank you for signing up!",
    thanksMessage: "Your registration is confirmed! You\u2019ll receive access by email within the next 10 minutes. Check your spam folder if you don\u2019t see it.",
    thanksRedirect: "You\u2019ll be redirected in a moment...",
    consentLabel: "I agree to receive emails.",
    defaultHeading: "Get free access",
  }),
  es: () => ({
    loading: "Cargando...",
    notFoundTitle: "P\u00e1gina no encontrada",
    notFoundDesc: "Esta p\u00e1gina no existe o ya no est\u00e1 disponible.",
    firstNamePlaceholder: "Tu nombre",
    emailPlaceholder: "Tu email",
    defaultCta: "\u00a1Vamos!",
    dataProtected: "Tus datos est\u00e1n protegidos.",
    dataProtectedLong: "Tus datos est\u00e1n protegidos y nunca ser\u00e1n compartidos.",
    privacyPolicy: "Pol\u00edtica de privacidad",
    thanksTitle: "\u00a1Gracias por inscribirte!",
    thanksMessage: "\u00a1Tu inscripci\u00f3n est\u00e1 confirmada! Recibir\u00e1s tus accesos por email en los pr\u00f3ximos 10 minutos. Revisa tu carpeta de spam si no lo ves.",
    thanksRedirect: "Ser\u00e1s redirigido en unos instantes...",
    consentLabel: "Acepto recibir emails.",
    defaultHeading: "Accede gratis",
  }),
  it: () => ({
    loading: "Caricamento...",
    notFoundTitle: "Pagina non trovata",
    notFoundDesc: "Questa pagina non esiste o non \u00e8 pi\u00f9 disponibile.",
    firstNamePlaceholder: "Il tuo nome",
    emailPlaceholder: "La tua email",
    defaultCta: "Andiamo!",
    dataProtected: "I tuoi dati sono protetti.",
    dataProtectedLong: "I tuoi dati sono protetti e non saranno mai condivisi.",
    privacyPolicy: "Privacy Policy",
    thanksTitle: "Grazie per l\u2019iscrizione!",
    thanksMessage: "La tua iscrizione \u00e8 confermata! Riceverai l\u2019accesso via email entro 10 minuti. Controlla la cartella spam se non lo vedi.",
    thanksRedirect: "Sarai reindirizzato tra pochi istanti...",
    consentLabel: "Accetto di ricevere email.",
    defaultHeading: "Accedi gratuitamente",
  }),
  ar: () => ({
    loading: "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...",
    notFoundTitle: "\u0627\u0644\u0635\u0641\u062d\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629",
    notFoundDesc: "\u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629 \u0623\u0648 \u0644\u0645 \u062a\u0639\u062f \u0645\u062a\u0627\u062d\u0629.",
    firstNamePlaceholder: "\u0627\u0633\u0645\u0643 \u0627\u0644\u0623\u0648\u0644",
    emailPlaceholder: "\u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
    defaultCta: "\u0647\u064a\u0627 \u0628\u0646\u0627!",
    dataProtected: "\u0628\u064a\u0627\u0646\u0627\u062a\u0643 \u0645\u062d\u0645\u064a\u0629.",
    dataProtectedLong: "\u0628\u064a\u0627\u0646\u0627\u062a\u0643 \u0645\u062d\u0645\u064a\u0629 \u0648\u0644\u0646 \u062a\u062a\u0645 \u0645\u0634\u0627\u0631\u0643\u062a\u0647\u0627 \u0623\u0628\u062f\u064b\u0627.",
    privacyPolicy: "\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629",
    thanksTitle: "\u0634\u0643\u0631\u064b\u0627 \u0644\u062a\u0633\u062c\u064a\u0644\u0643!",
    thanksMessage: "\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u062a\u0633\u062c\u064a\u0644\u0643! \u0633\u062a\u062a\u0644\u0642\u0649 \u0631\u0633\u0627\u0644\u0629 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u062e\u0644\u0627\u0644 10 \u062f\u0642\u0627\u0626\u0642. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0645\u062c\u0644\u062f \u0627\u0644\u0628\u0631\u064a\u062f \u063a\u064a\u0631 \u0627\u0644\u0645\u0631\u063a\u0648\u0628.",
    thanksRedirect: "\u0633\u064a\u062a\u0645 \u0625\u0639\u0627\u062f\u0629 \u062a\u0648\u062c\u064a\u0647\u0643 \u0641\u064a \u0644\u062d\u0638\u0627\u062a...",
    consentLabel: "\u0623\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u062a\u0644\u0642\u064a \u0627\u0644\u0631\u0633\u0627\u0626\u0644.",
    defaultHeading: "\u0627\u062d\u0635\u0644 \u0639\u0644\u0649 \u0648\u0635\u0648\u0644 \u0645\u062c\u0627\u0646\u064a",
  }),
};

function pageTexts(addressForm?: string, locale?: string) {
  const lang = (locale || "fr").slice(0, 2);
  const v = addressForm === "vous";
  const builder = OVERLAY_I18N[lang] || OVERLAY_I18N.fr;
  return builder(v);
}

export default function PublicPageClient({ page: serverPage, slug, toastWidgetId: serverToastId, shareWidgetId: serverShareId }: { page: PublicPageData | null; slug: string; toastWidgetId?: string | null; shareWidgetId?: string | null }) {
  const [page, setPage] = useState<PublicPageData | null>(serverPage);
  const [loading, setLoading] = useState(!serverPage);
  const [notFound, setNotFound] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [captureEmail, setCaptureEmail] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [toastWidgetId, setToastWidgetId] = useState<string | null>(serverToastId || null);
  const [shareWidgetId, setShareWidgetId] = useState<string | null>(serverShareId || null);

  // Client-side fetch via dedicated public API endpoint (uses supabaseAdmin, bypasses RLS)
  useEffect(() => {
    if (serverPage) return;

    fetch(`/api/pages/public/${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.page) {
          setPage(data.page);
          if (data.toast_widget_id) setToastWidgetId(data.toast_widget_id);
          if (data.share_widget_id) setShareWidgetId(data.share_widget_id);
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
      const msg = typeof e.data === "string" ? e.data : "";
      if (msg === "tipote:capture") {
        // Simple CTA click — open capture overlay
        setShowCapture(true);
      } else if (msg.startsWith("tipote:capture:")) {
        // Inline form submitted with pre-filled data — auto-submit the lead
        try {
          const data = JSON.parse(msg.slice("tipote:capture:".length));
          if (data.email) {
            setCaptureEmail(data.email);
            setCaptureFirstName(data.first_name || "");
            // Auto-submit since they already filled the inline form
            if (page) {
              fetch(`/api/pages/${page.id}/leads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: data.email.trim(),
                  first_name: (data.first_name || "").trim(),
                  referrer: typeof document !== "undefined" ? document.referrer : "",
                }),
              }).then(() => {
                setCaptureSuccess(true);
                // Auto-redirect only if no custom CTA
                if (page.payment_url && !page.thank_you_cta_url) {
                  setTimeout(() => { window.location.href = page.payment_url; }, 3000);
                }
              }).catch(() => {});
            }
          }
        } catch {
          setShowCapture(true);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [page]);

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

      // Auto-redirect to payment URL ONLY if no custom CTA button is configured
      // (if user set a thank_you_cta_url, they want manual click, not auto-redirect)
      if (page.payment_url && !page.thank_you_cta_url) {
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

  // Listen for CTA click tracking events from iframe
  // (must be before any conditional return to respect Rules of Hooks)
  useEffect(() => {
    if (!page) return;
    const handler = (e: MessageEvent) => {
      if (typeof e.data === "string" && e.data === "tipote:click") {
        fetch(`/api/pages/${page.id}/clicks`, { method: "POST" }).catch(() => {});
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [page]);

  // Non-blocking: increment views once page is loaded
  useEffect(() => {
    if (!page) return;
    fetch(`/api/pages/${page.id}/views`, { method: "POST" }).catch(() => {});
  }, [page]);

  const txt = pageTexts(page?.address_form, page?.locale);

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
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
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

      {/* Toast notification overlay (social proof) */}
      {toastWidgetId && <ToastNotificationOverlay widgetId={toastWidgetId} />}
      {shareWidgetId && <SocialShareOverlay widgetId={shareWidgetId} />}

      {/* Thank-you / confirmation page after successful capture */}
      {captureSuccess && (() => {
        const brandPrimary = (page.brand_tokens as any)?.["colors-primary"] || "#6c3aed";
        const brandAccent = (page.brand_tokens as any)?.["colors-accent"] || brandPrimary;
        const headingFont = (page.brand_tokens as any)?.["typography-heading"] || "'DM Sans', system-ui, sans-serif";
        const logoText = (page.content_data as any)?.logo_text || "";
        const footerText = (page.content_data as any)?.footer_text || "";
        return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: `linear-gradient(135deg, ${brandPrimary}11 0%, ${brandPrimary}22 50%, ${brandAccent}18 100%)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            textAlign: "center",
            maxWidth: 500,
            width: "90%",
            boxShadow: "0 25px 80px rgba(0,0,0,0.08), 0 4px 20px rgba(0,0,0,0.04)",
            border: `1px solid ${brandPrimary}15`,
          }}>
            {/* Success icon */}
            <div style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: brandPrimary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              boxShadow: `0 8px 30px ${brandPrimary}40`,
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
              fontFamily: `${headingFont}, 'DM Sans', system-ui, sans-serif`,
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
              background: `${brandPrimary}0a`,
              borderRadius: 12,
              border: `1px solid ${brandPrimary}20`,
              marginBottom: 24,
            }}>
              <svg width="20" height="20" fill="none" stroke={brandPrimary} strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span style={{ fontSize: "0.9rem", color: brandPrimary, fontWeight: 600 }}>
                {page.address_form === "vous" ? "V\u00e9rifiez votre bo\u00eete email" : "V\u00e9rifie ta bo\u00eete email"}
              </span>
            </div>

            {/* Optional CTA button (user-configured: link to offer, social, blog, etc.) */}
            {page.thank_you_cta_url && (
              <div style={{ marginBottom: 16 }}>
                <a
                  href={page.thank_you_cta_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "14px 32px",
                    background: brandPrimary,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    cursor: "pointer",
                    boxShadow: `0 4px 16px ${brandPrimary}40`,
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                >
                  {page.thank_you_cta_text || "Continuer"}
                </a>
              </div>
            )}

            {/* Redirect notice (auto-redirect to payment URL) */}
            {page.payment_url && !page.thank_you_cta_url && (
              <p style={{
                color: "#999",
                fontSize: "0.85rem",
                marginTop: 0,
                fontStyle: "italic",
              }}>
                {txt.thanksRedirect}
              </p>
            )}
          </div>

          {/* Footer matching main page */}
          {(logoText || footerText) && (
            <div style={{
              marginTop: 32,
              textAlign: "center",
              color: "#888",
              fontSize: "0.82rem",
              lineHeight: 1.6,
            }}>
              {logoText && <div style={{ fontWeight: 700, marginBottom: 4, color: "#666" }}>{logoText}</div>}
              {footerText && <div>{footerText}</div>}
            </div>
          )}
        </div>
        );
      })()}
    </>
  );
}

// Build tracking pixel snippets (Facebook Pixel + Google Tag)
function buildTrackingSnippets(page: PublicPageData): string {
  let snippets = "";

  if (page.facebook_pixel_id) {
    const pid = page.facebook_pixel_id.replace(/[^a-zA-Z0-9]/g, "");
    snippets += `
<!-- Facebook Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pid}');fbq('track','PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pid}&ev=PageView&noscript=1"/></noscript>`;
  }

  if (page.google_tag_id) {
    const gid = page.google_tag_id.replace(/[^a-zA-Z0-9-]/g, "");
    snippets += `
<!-- Google Tag -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${gid}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gid}');</script>`;
  }

  return snippets;
}

/** Remove a <tag>...</tag> block handling nested tags of the same name. */
function removeDivBlock(html: string, tagStart: number, tagName: string): string {
  const closeTag = `</${tagName}>`;
  const openTag = `<${tagName}`;
  const firstClose = html.indexOf(">", tagStart);
  if (firstClose === -1) return html;
  let depth = 1;
  let pos = firstClose + 1;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf(openTag, pos);
    const nextClose = html.indexOf(closeTag, pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = html.indexOf(">", nextOpen) + 1;
    } else {
      depth--;
      if (depth === 0) return html.slice(0, tagStart) + html.slice(nextClose + closeTag.length);
      pos = nextClose + closeTag.length;
    }
  }
  return html;
}

// Strip any editor artifacts that may have leaked into html_snapshot.
// Uses server-side sanitization + a DOM-based cleanup script as safety net.
function sanitizeEditorArtifacts(html: string): string {
  // ── Import-free server-side cleaning (mirrors lib/sanitizeHtml.ts logic) ──

  // 1. Remove editor script tags by content signatures (NOT just attribute)
  const SCRIPT_SIGS = [
    "data-tipote-injected", "tipote-toolbar", "tipote:text-edit",
    "tipote:sections-list", "tipote:illust-", "tipote:section-click",
    "tipote:element-select",
  ];
  let searchFrom = 0;
  while (true) {
    const scriptStart = html.indexOf("<script", searchFrom);
    if (scriptStart === -1) break;
    const scriptClose = html.indexOf("</script>", scriptStart);
    if (scriptClose === -1) break;
    const chunk = html.slice(scriptStart, scriptClose + "</script>".length);
    if (SCRIPT_SIGS.some(s => chunk.includes(s))) {
      html = html.slice(0, scriptStart) + html.slice(scriptClose + "</script>".length);
      continue;
    }
    searchFrom = scriptClose + "</script>".length;
  }

  // 2. Remove editor overlay divs by class names and z-index patterns
  const DIV_SIGS = [
    'class="tipote-toolbar"', 'class="tipote-illust-overlay"',
    "z-index: 99999", "z-index: 99998", "z-index: 99990", "z-index: 99989",
    "z-index:99999", "z-index:99998", "z-index:99990", "z-index:99989",
    "data-tipote-injected",
  ];
  for (const sig of DIV_SIGS) {
    let pos = 0;
    while (true) {
      const idx = html.indexOf(sig, pos);
      if (idx === -1) break;
      let tagStart = html.lastIndexOf("<", idx);
      if (tagStart === -1) { pos = idx + 1; continue; }
      const tagSlice = html.slice(tagStart, tagStart + 20);
      const tm = tagSlice.match(/^<(\w+)/);
      if (!tm) { pos = idx + 1; continue; }
      const tn = tm[1].toLowerCase();
      if (tn === "div" || tn === "style") {
        const before = html.length;
        html = removeDivBlock(html, tagStart, tn);
        if (html.length < before) continue;
      }
      pos = idx + 1;
    }
  }

  // 3. Clean attributes and styles
  html = html.replace(/\s*data-tp-section-idx="[^"]*"/g, "");
  html = html.replace(/\s*contenteditable="[^"]*"/g, "");
  html = html.replace(/cursor:\s*text;?\s*/g, "");
  html = html.replace(/outline:\s*none;?\s*/g, "");
  html = html.replace(/\s*style="[\s;]*"/g, "");

  // ── CSS safety net ──
  const safetyCSS = `<style>.tipote-toolbar,.tipote-illust-overlay{display:none!important}[data-tipote-injected]{display:none!important}</style>`;
  const headEnd = html.indexOf("</head>");
  if (headEnd !== -1) {
    html = html.slice(0, headEnd) + safetyCSS + html.slice(headEnd);
  }

  // ── DOM-based cleanup script (ultimate safety net) ──
  const cleanupScript = `<script>
(function(){
  function clean(){
    document.querySelectorAll('.tipote-toolbar,.tipote-illust-overlay,[data-tipote-injected]').forEach(function(el){el.remove()});
    var allEls=document.querySelectorAll('body>div[style]');
    allEls.forEach(function(el){var z=el.style.zIndex;if(z==='99999'||z==='99998'||z==='99990'||z==='99989')el.remove()});
    document.querySelectorAll('[data-tp-section-idx]').forEach(function(el){el.removeAttribute('data-tp-section-idx')});
    document.querySelectorAll('[contenteditable]').forEach(function(el){el.removeAttribute('contenteditable');el.style.removeProperty('cursor');el.style.removeProperty('outline')});
    document.querySelectorAll('script').forEach(function(s){if(s.textContent&&s.textContent.indexOf('tipote:text-edit')!==-1)s.remove()});
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',clean)}else{clean()}
  setTimeout(clean,100);setTimeout(clean,500);
})();
</script>`;

  // Inject cleanup script right after <head> (runs before any other scripts)
  const headStart = html.indexOf("<head");
  if (headStart !== -1) {
    const headTagEnd = html.indexOf(">", headStart);
    if (headTagEnd !== -1) {
      html = html.slice(0, headTagEnd + 1) + cleanupScript + html.slice(headTagEnd + 1);
    }
  }

  return html;
}

// Inject a small script into the HTML that intercepts CTA clicks
// and posts a message to the parent to open the capture overlay.
// IMPORTANT: Does NOT re-inject legal footer or capture form (already in html_snapshot from render.ts).
function injectCaptureScript(page: PublicPageData): string {
  let html = sanitizeEditorArtifacts(page.html_snapshot || "");

  // Inject tracking pixels into <head>
  const trackingSnippets = buildTrackingSnippets(page);
  if (trackingSnippets) {
    const headIdx = html.indexOf("</head>");
    if (headIdx !== -1) {
      html = html.slice(0, headIdx) + trackingSnippets + "\n" + html.slice(headIdx);
    } else {
      html = trackingSnippets + "\n" + html;
    }
  }

  // Click tracking script — tracks all CTA clicks (all page types)
  const clickTrackScript = `<script>
(function(){
  var tracked = false;
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a, button, [role="button"], .cta-primary, .cta-button, .tp-cta');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    // Skip pure anchor links (handled separately)
    if (href === '#' || href === '#capture') return;
    if (!tracked || true) {
      try { parent.postMessage('tipote:click', '*'); } catch(ex) {}
    }
  }, true);
})();
</script>`;

  const bodyEnd = html.lastIndexOf("</body>");
  if (bodyEnd !== -1) {
    html = html.slice(0, bodyEnd) + clickTrackScript + "\n" + html.slice(bodyEnd);
  } else {
    html += clickTrackScript;
  }

  if (!page.capture_enabled) {
    // No capture interception needed — page is served as-is
    // Legal footer is already in the html_snapshot from render.ts
    return html;
  }

  const script = `<script>
(function(){
  // Intercept ALL form submissions (template forms + injected forms)
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var email = form.querySelector('input[type="email"]');
    if (email && email.value.trim()) {
      e.preventDefault();
      e.stopPropagation();
      parent.postMessage('tipote:capture:' + JSON.stringify({
        email: email.value.trim(),
        first_name: (form.querySelector('input[name="first_name"]') || form.querySelector('input[type="text"]') || {}).value || ''
      }), '*');
      return false;
    }
  }, true);

  // Intercept all CTA-like button/link clicks (for buttons that open overlay)
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a[href="#"], a[href="#capture"], .cta-primary, .cta-button, [data-capture]');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if (href && href !== '#' && href !== '#capture' && !href.startsWith('#')) return;
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage('tipote:capture', '*');
  }, true);
})();
</script>`;

  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + script;
  return html.slice(0, idx) + script + "\n" + html.slice(idx);
}
