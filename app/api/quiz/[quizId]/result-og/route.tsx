// app/api/quiz/[quizId]/result-og/route.tsx
// Visuel d'apercu social (1200x630) pour le partage d'un PROFIL de
// resultat : "J'ai obtenu : <profil>" aux couleurs du quiz. Reference
// par og:image des pages publiques quand l'URL porte ?rp=<resultId>
// (retour Jocelyne 28 juillet 2026 : le partage FB montrait le quiz,
// jamais le profil obtenu). Public, lecture seule, aucune donnee perso :
// le profil est un contenu public du quiz.
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";
import { interpolateText } from "@/lib/quizPersonalization";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Mon resultat" dans la langue du quiz (memes valeurs que le viewer).
const LABELS: Record<string, string> = {
  fr: "Mon résultat",
  en: "My result",
  es: "Mi resultado",
  de: "Mein Ergebnis",
  pt: "Meu resultado",
  it: "Il mio risultato",
  ar: "نتيجتي",
};

/** Titre de profil nettoye pour un visuel statique : placeholders {name}
 *  interpoles a vide, variantes de genre resolues, ponctuation orpheline
 *  retiree, premiere lettre capitalisee. */
function titleForVisual(raw: string | null | undefined): string {
  let t = stripHtml(interpolateText(raw, { name: "", gender: "x" })).replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s,;:.!?-]+/, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await params;
  // Sans ?rp= : carte du QUIZ (og:image par defaut des quiz sans vignette
  // uploadee, le debogueur FB alerte "propriete deduite" quand og:image
  // manque, retour Bene 28 juillet 2026). Avec ?rp=<resultId> : carte du
  // profil obtenu (partage de resultat).
  const rp = req.nextUrl.searchParams.get("rp") ?? "";
  if (!UUID_RE.test(quizId) || (rp && !UUID_RE.test(rp))) {
    return new Response("Not found", { status: 404 });
  }

  const [{ data: quiz }, { data: result }] = await Promise.all([
    supabaseAdmin
      .from("quizzes")
      .select("id, title, locale, brand_color_primary, status")
      .eq("id", quizId)
      .maybeSingle(),
    rp
      ? supabaseAdmin
          .from("quiz_results")
          .select("quiz_id, title")
          .eq("id", rp)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!quiz || quiz.status !== "active" || (rp && (!result || result.quiz_id !== quizId))) {
    return new Response("Not found", { status: 404 });
  }

  const primary = String(quiz.brand_color_primary ?? "").trim() || "#4F46E5";
  const locale = String(quiz.locale ?? "fr").split("-")[0];
  const label = rp ? (LABELS[locale] ?? LABELS.fr) : "Quiz";
  const quizTitleClean = titleForVisual(quiz.title as string);
  // Carte profil : titre du profil en grand, titre du quiz en dessous.
  // Carte quiz : titre du quiz en grand, pas de sous-ligne.
  const resultTitle = rp
    ? titleForVisual(result?.title as string) || label
    : quizTitleClean || label;
  const quizTitle = rp ? quizTitleClean : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: primary,
          position: "relative",
        }}
      >
        {/* Cercles decoratifs, memes proportions que la carte PNG du viewer */}
        <div style={{ position: "absolute", top: -140, left: -100, width: 420, height: 420, borderRadius: 9999, backgroundColor: "rgba(255,255,255,0.12)", display: "flex" }} />
        <div style={{ position: "absolute", bottom: -160, right: -120, width: 480, height: 480, borderRadius: 9999, backgroundColor: "rgba(0,0,0,0.10)", display: "flex" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: "#ffffff",
            borderRadius: 36,
            padding: "64px 88px",
            maxWidth: 1020,
            boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, textTransform: "uppercase", color: primary, fontWeight: 700 }}>
            {label}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: resultTitle.length > 40 ? 52 : 66,
              fontWeight: 800,
              color: "#0f172a",
              textAlign: "center",
              lineHeight: 1.15,
            }}
          >
            {resultTitle}
          </div>
          {quizTitle ? (
            <div style={{ display: "flex", marginTop: 28, fontSize: 30, color: "#64748b", textAlign: "center" }}>
              {quizTitle}
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Le visuel ne depend que du contenu du quiz : cacheable cote CDN,
        // court pour suivre les renames de profil sans attendre 24h.
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=3600",
      },
    },
  );
}
