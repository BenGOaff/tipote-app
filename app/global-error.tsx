"use client";

// app/global-error.tsx
//
// LE DERNIER FILET : sans lui, une exception cote client laisse une page
// BLANCHE. Retour d'un client anglophone, 7 septembre 2026 : "the quiz
// was just showing white, including the demo on the Tiquiz website...
// this made me lose the most confidence in the solution."
//
// Mesure du meme jour : il n'existait AUCUN `error.tsx` ni
// `global-error.tsx` dans tout `app/`. La regle du 3 aout dit qu'un
// echec produit toujours quelque chose a l'ecran ; elle ne couvrait que
// le serveur, et le navigateur n'avait rien.
//
// TOUT EST EN STYLE INLINE, et rien n'est importe d'un composant d'UI :
// cet ecran s'affiche quand quelque chose a deja echoue, y compris,
// peut etre, la feuille de style ou un fragment JS.

import { messagePanne } from "@/lib/site/messagesPanne";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const m = messagePanne();
  return (
    <html>
      <body style={{ margin: 0, background: "#ffffff" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "24px",
            textAlign: "center",
            font: "16px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
            color: "#3B3B3B",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#2B3264" }}>{m.titre}</h1>
          <p style={{ margin: 0, maxWidth: 460 }}>{m.corps}</p>
          <button
            type="button"
            onClick={() => { reset(); if (typeof window !== "undefined") window.location.reload(); }}
            style={{
              border: 0, cursor: "pointer", borderRadius: 999,
              padding: "12px 22px", fontSize: 15, fontWeight: 700,
              background: "#5A6EF6", color: "#ffffff",
            }}
          >
            {m.recharger}
          </button>
        </div>
      </body>
    </html>
  );
}
