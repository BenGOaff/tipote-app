// app/settings/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import SettingsClient from "@/components/settings/SettingsClient";

export const metadata = { title: "Paramètres – Tiquiz" };

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <SettingsClient />;
}
