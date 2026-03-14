// app/webinars/page.tsx
// Server component: auth check + render client component

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import EventsPageClient from "@/components/webinars/EventsPageClient";

export default async function WebinarsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  return <EventsPageClient />;
}
