// /quiz/[quizId]/analytics
//
// SSR loads the initial analytics snapshot (default period = 30j) so
// the page renders charts on first paint instead of flashing a
// spinner. The QuizAnalyticsClient takes over for period switches
// and refetches via the same JSON endpoint.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { QuizAnalyticsClient } from "@/components/quiz/QuizAnalyticsClient";

type RouteContext = { params: Promise<{ quizId: string }> };

export const dynamic = "force-dynamic";

export default async function QuizAnalyticsPage({ params }: RouteContext) {
  const { quizId } = await params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/");

  // Confirm ownership server-side. If the quiz isn't theirs, 404 — the
  // analytics endpoint would return 404 anyway, but this lets the
  // server skip the JSON dance.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, hide_response_counts")
    .eq("id", quizId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!quiz) notFound();

  // Reuse the public analytics endpoint so SSR and client refetches
  // are guaranteed to return the exact same shape. No risk of drift
  // between two duplicated query implementations.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const cookie = h.get("cookie") ?? "";
  const res = await fetch(
    `${proto}://${host}/api/quiz/${encodeURIComponent(quizId)}/analytics?period=30`,
    { headers: { cookie }, cache: "no-store" },
  );
  const initial = await res.json().catch(() => null);
  if (!initial?.ok) notFound();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      <QuizAnalyticsClient
        quizId={quizId}
        initial={initial}
        hideCounts={(quiz as { hide_response_counts?: boolean | null }).hide_response_counts === true}
      />
    </div>
  );
}
