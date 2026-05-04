// Public play page — no auth required. Loads a published popquiz
// via the service-role client (bypasses RLS), 404s otherwise.
// Accepts either a UUID or the custom slug, mirroring /q/[quizId].
//
// Side-effect: every render bumps `views_count` via the
// log_popquiz_event RPC. Fire-and-forget so the response time
// isn't tied to the analytics write; same overcounting story as
// the existing quiz views (bots count too) which we accept until
// a cookie-based dedup ships.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPublishedPopquiz } from "@/lib/popquiz/repo";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PopquizPlayClient from "./PopquizPlayClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ popquizId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { popquizId } = await params;
  const popquiz = await fetchPublishedPopquiz(popquizId);
  if (!popquiz) return { title: "Popquiz" };
  return {
    title: popquiz.title,
    description: popquiz.description ?? undefined,
    openGraph: {
      title: popquiz.title,
      description: popquiz.description ?? undefined,
      ...(popquiz.video.thumbnailUrl
        ? { images: [{ url: popquiz.video.thumbnailUrl }] }
        : {}),
    },
  };
}

export default async function PublicPopquizPage({ params }: Props) {
  const { popquizId } = await params;
  const popquiz = await fetchPublishedPopquiz(popquizId);
  if (!popquiz) notFound();

  // Fire-and-forget view bump. Awaiting would tie response time to
  // the analytics write for no good reason; the RPC is idempotent
  // at the row level so a missed call just costs us one undercounted
  // view, not data corruption.
  void supabaseAdmin.rpc("log_popquiz_event", {
    popquiz_id_input: popquiz.id,
    event_type_input: "view",
  });

  return <PopquizPlayClient popquiz={popquiz} />;
}
