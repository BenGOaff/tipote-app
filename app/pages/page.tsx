// app/pages/page.tsx
// Protected page for managing hosted pages (capture & sales).

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import PagesClient from "@/components/pages/PagesClient";

export default async function PagesPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return <PagesClient />;
}
