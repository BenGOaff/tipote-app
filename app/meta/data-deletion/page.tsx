// app/meta/data-deletion/page.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: { code?: string };
};

export default async function MetaDataDeletionStatusPage({ searchParams }: Props) {
  const code = searchParams?.code;
  const t = await getTranslations("meta");

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>{t("dataDeletionTitle")}</h1>

      <p style={{ lineHeight: 1.6 }}>
        {t("dataDeletionIntro")}
      </p>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 6 }}>{t("dataDeletionCodeLabel")}</div>
        <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-all" }}>
          {code ?? "—"}
        </div>
      </div>

      <p style={{ marginTop: 16, lineHeight: 1.6 }}>
        {t("dataDeletionHelp")}
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          {t("dataDeletionBack")}
        </Link>
      </p>
    </main>
  );
}
