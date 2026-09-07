"use client";

// app/q/[quizId]/error.tsx
//
// L'ECRAN DE PANNE DU QUIZ PUBLIC, et c'est celui qui coute le plus
// cher : c'est la page qu'une creatrice met en publicite payante.
//
// Elle ne rend AUCUN contenu cote serveur (le quiz est monte par le
// navigateur apres un appel a l'API), donc la moindre exception laissait
// une page blanche sans un mot. Retour d'un client anglophone, 7
// septembre 2026 : "the quiz was just showing white".
//
// Le `global-error.tsx` couvre le reste du site ; celui-ci existe parce
// qu'un error boundary de route se declenche SANS remplacer tout le
// document, donc il rattrape aussi une panne survenue apres le montage.

import { messagePanne } from "@/lib/site/messagesPanne";

export default function ErreurQuizPublic({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const m = messagePanne();
  return (
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
  );
}
