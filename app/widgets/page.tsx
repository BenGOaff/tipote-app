// app/widgets/page.tsx — Widgets dashboard (server component for auth)
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import ToastWidgetsClient from "@/components/widgets/ToastWidgetsClient";

export default async function WidgetsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/");

  return <ToastWidgetsClient />;
}
