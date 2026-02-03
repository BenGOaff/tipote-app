// app/templates/page.tsx
// Page "Templates" : prévisualisation + import templates Systeme.io (pixel-perfect Lovable)
// - Protégé par auth Supabase (server)
// - UI 1:1 via component client TemplatesLovableClient

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import TemplatesLovableClient from "@/components/templates/TemplatesLovableClient";

export default async function TemplatesPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  return <TemplatesLovableClient />;
}
