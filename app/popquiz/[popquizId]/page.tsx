// Server entry for the popquiz editor (edit mode). Loads the
// existing popquiz via the RLS-aware client (so only the owner
// can reach it), 404s otherwise, and ships everything to the
// client component for rendering.

import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { fetchOwnedPopquiz } from "@/lib/popquiz/repo";
import PopquizEditClient from "./PopquizEditClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modifier le popquiz – Tiquiz" };

type Props = { params: Promise<{ popquizId: string }> };

export default async function EditPopquizPage({ params }: Props) {
  const { popquizId } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const popquiz = await fetchOwnedPopquiz(supabase, popquizId);
  if (!popquiz) notFound();

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <PopquizEditClient
      userEmail={user.email ?? ""}
      popquiz={popquiz}
      quizzes={quizzes ?? []}
    />
  );
}
