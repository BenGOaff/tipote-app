// Embed-optimised play page. Loaded inside an <iframe> on a third-
// party site (WordPress, Systeme.io…) so we keep zero chrome:
// no logo above, no footer, no padding. Just the player flush
// against the iframe edges, ready to inherit whatever 16:9 aspect
// ratio the embedding snippet sets up.
//
// Same view-bump as /p/[id] — an embed render counts as a view so
// creators see traffic regardless of where the popquiz is consumed.

import { notFound } from "next/navigation";
import { fetchPublishedPopquiz } from "@/lib/popquiz/repo";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import EmbedPopquizPlayClient from "./EmbedPopquizPlayClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ popquizId: string }> };

export const metadata = { title: "Popquiz" };

export default async function EmbedPopquizPage({ params }: Props) {
  const { popquizId } = await params;
  const popquiz = await fetchPublishedPopquiz(popquizId);
  if (!popquiz) notFound();

  void supabaseAdmin.rpc("log_popquiz_event", {
    popquiz_id_input: popquiz.id,
    event_type_input: "view",
  });

  return <EmbedPopquizPlayClient popquiz={popquiz} />;
}
