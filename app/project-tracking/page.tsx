// app/project-tracking/page.tsx
// Page Suivi Projet : enveloppe server-side autour du composant ProjectTrackingPage client

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import ProjectTrackingPageClient from "@/components/ProjectTrackingPage";

export default async function ProjectTrackingPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const userEmail = session.user.email ?? "";

  return (
    <AppShell userEmail={userEmail}>
      <ProjectTrackingPageClient />
    </AppShell>
  );
}
