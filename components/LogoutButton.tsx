// components/LogoutButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    try {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      // Clear le cookie projet actif pour repartir sur le default à la prochaine connexion
      document.cookie = "tipote_active_project=;path=/;max-age=0;samesite=lax";
      await supabase.auth.signOut();
      router.push("/");
    } catch (error) {
      console.error("[LogoutButton] signOut error", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      disabled={loading}
    >
      {loading ? "Déconnexion…" : "Se déconnecter"}
    </Button>
  );
}
