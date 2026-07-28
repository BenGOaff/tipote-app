// app/connect/formaquiz/page.tsx
// Page de consentement : l'utilisateur Tipote autorise L'Atelier du Quiz a
// lire ses metriques. Necessite d'etre connecte (sinon retour apres login
// via ?redirect=, gere par LoginForm). Miroir de la page cote Tiquiz.
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import ConsentClient from "./ConsentClient";

export const dynamic = "force-dynamic";

export default async function ConnectFormaquizPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state = "" } = await searchParams;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Retour ici apres connexion (la page login "/" lit ?redirect=).
    const back = encodeURIComponent(`/connect/formaquiz?state=${encodeURIComponent(state)}`);
    redirect(`/?redirect=${back}`);
  }

  return <ConsentClient state={state} email={user.email ?? ""} />;
}
