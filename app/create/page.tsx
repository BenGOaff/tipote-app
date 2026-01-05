// app/create/page.tsx

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import CreateLovableClient from "@/components/create/CreateLovableClient";

export default async function CreatePage() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) redirect("/");

  return <CreateLovableClient />;
}
