// components/tracking/TrackingPixels.tsx
//
// Server-renderable Meta Pixel + Google gtag injection. Utilise
// next/script pour mettre les balises directement dans le HTML
// envoyé au browser (vs injection client useEffect après mount).
//
// Pourquoi server-rendered :
//   1. Pixel Helper (extension Meta) détecte le pixel dès le premier
//      paint. Sans ça, l'extension peut louper le pixel ou afficher
//      "not detected" même quand il marche → c'est exactement ce
//      qu'a vécu Gwenn le 23/05.
//   2. PageView fire AVANT le bundle JS lourd → données plus fiables
//      pour les campagnes Meta Ads (notamment pour les visiteurs
//      qui rebondissent avant la fin du chargement).
//   3. Pas de race condition consent / mount / fbq init.
//
// Strategy "afterInteractive" : Next attend que la page soit
// interactive avant de loader le script. Suffisamment tôt pour le
// tracking, suffisamment tard pour ne pas bloquer LCP.
//
// autoConfig DÉSACTIVÉ (fbq('set','autoConfig',false,...)) : par
// défaut le pixel Meta détecte AUTOMATIQUEMENT les clics de bouton et
// pose des events parasites (SubscribedButtonClick à chaque "Suivant"
// dans le quiz — remonté par Gwenn 23/05). On ne veut QUE nos events
// explicites et propres : PageView (vue), QuizStart (début du quiz),
// Lead (= "Prospect" Meta, soumission du formulaire de capture). Ces
// 3-là suffisent pour optimiser une campagne Meta Ads sur la
// conversion. Le reste est du bruit qui brouille l'algo pub.

import Script from "next/script";

type Props = {
  metaPixelId?: string | null;
  ga4MeasurementId?: string | null;
  googleAdsConversionId?: string | null;
};

export function TrackingPixels({
  metaPixelId,
  ga4MeasurementId,
  googleAdsConversionId,
}: Props) {
  // Sanitize : on accepte que les chars qu'on attend, pour ne pas
  // permettre une injection XSS si le champ contient du HTML.
  const meta = metaPixelId?.replace(/[^a-zA-Z0-9]/g, "") || null;
  const ga4 = ga4MeasurementId?.replace(/[^a-zA-Z0-9-]/g, "") || null;
  const ads = googleAdsConversionId?.replace(/[^a-zA-Z0-9-]/g, "") || null;
  const gtagId = ga4 || ads;

  return (
    <>
      {meta && (
        <>
          <Script
            id="meta-pixel-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('set','autoConfig',false,'${meta}');
fbq('init','${meta}');
fbq('track','PageView');
              `.trim(),
            }}
          />
          {/* Fallback noscript pour les visiteurs sans JS — Pixel
              Helper le détecte aussi. */}
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${meta}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {gtagId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`}
            strategy="afterInteractive"
          />
          <Script
            id="gtag-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
${ga4 ? `gtag('config','${ga4}');` : ""}
${ads ? `gtag('config','${ads}');` : ""}
              `.trim(),
            }}
          />
        </>
      )}
    </>
  );
}
