// app/meta/data-deletion/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: { code?: string };
};

export default function MetaDataDeletionStatusPage({ searchParams }: Props) {
  const code = searchParams?.code;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Suppression des données — Demande reçue</h1>

      <p style={{ lineHeight: 1.6 }}>
        Ta demande de suppression des données associées à Meta a bien été enregistrée.
      </p>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 6 }}>Code de confirmation</div>
        <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-all" }}>
          {code ?? "—"}
        </div>
      </div>

      <p style={{ marginTop: 16, lineHeight: 1.6 }}>
        Si tu as besoin d’accélérer ou de vérifier l’état de traitement, contacte le support en indiquant ce code.
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          Retour à Tipote
        </Link>
      </p>
    </main>
  );
}
