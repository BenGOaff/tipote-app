"use client";

// components/editor/SessionLostBanner.tsx
//
// "Putain mais t'as foutu quoi ??" (Béné, 4 août 2026)
//
// Sa session était tombée. Elle avait donné ses accès à quelqu'un qui
// gère sa publicité, cette connexion a fait tourner le jeton de
// Supabase, et l'onglet resté ouvert sur son quiz s'est retrouvé avec un
// jeton périmé. À partir de là, chaque appel partait en 401.
//
// Elle l'a découvert dans la console du navigateur. L'écran ne disait
// RIEN, ni le bouton Enregistrer, ni la sauvegarde automatique, qui a
// continué à réessayer une quinzaine de fois dans le vide.
//
// La règle existait depuis la veille, écrite pour le bouton Supprimer :
// une réponse `ok: false` doit TOUJOURS produire quelque chose à
// l'écran. Un échec silencieux coûte plus cher que la panne qu'il
// masque, parce qu'il envoie chercher au mauvais endroit.
//
// Ce bandeau est volontairement bloquant visuellement (fixe, en haut,
// au-dessus de tout) : une session morte n'est pas un détail à côté
// duquel on continue de taper pendant vingt minutes.
//
// Il ne redirige PAS tout seul. Rediriger quelqu'un en train d'écrire
// est brutal, et ce serait la deuxième fois qu'on lui prend son travail
// sans prévenir. Le brouillon est déjà à l'abri en local (cf.
// hooks/use-autosave.ts), donc le clic est sûr : c'est elle qui décide
// du moment.

import { AlertTriangle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { loginHrefFor } from "@/lib/auth/sessionLost";

export function SessionLostBanner({ visible }: { visible: boolean }) {
  const t = useTranslations("quizDetail");
  const pathname = usePathname();
  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-3 shadow-md dark:border-amber-800 dark:bg-amber-950"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <p className="font-semibold">{t("sessionLostTitle")}</p>
            {/* La phrase qui compte : son travail n'est pas perdu. */}
            <p className="text-xs">{t("sessionLostBody")}</p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <a href={loginHrefFor(pathname)}>{t("sessionLostAction")}</a>
        </Button>
      </div>
    </div>
  );
}
