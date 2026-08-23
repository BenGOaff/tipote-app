"use client";

// components/support/SupportFooter.tsx
//
// LES LIENS LÉGAUX S'OUVRENT DANS UN NOUVEL ONGLET, TOUJOURS.
//
// Béné, 24 août 2026 : "un lien vers la politique de confi etc. doit
// s'ouvrir dans un nouvel onglet et JAMAIS faire quitter la page à un
// visiteur !!"
//
// Ce pied de page est celui du CENTRE D'AIDE, qui porte le formulaire de
// contact. Quelqu'un qui vient d'écrire dix lignes pour décrire son
// problème et qui clique sur "Confidentialité" perdait tout son message,
// et repartait sans jamais l'envoyer. C'est la personne qui a le plus
// besoin d'aide qui payait le plus cher.
//
// Et les deux liens pointaient sur des pages qui N'EXISTENT PAS :
// `/legal/conditions-utilisation` et `/legal/politique-confidentialite`
// ne sont pas dans `VALID_SLUGS` (cgu, cgv, privacy, mentions, cookies),
// donc la route dynamique répondait `notFound()`. Un 404 depuis le
// centre d'aide, sur la page où on demande de faire confiance.

import { useTranslations } from "next-intl";

export default function SupportFooter() {
  const t = useTranslations("supportFooter");
  return (
    <footer className="bg-card border-t border-border/50 mt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 text-center">
        <p className="text-foreground/70 font-medium mb-1">
          {t("contact")}
        </p>
        <a
          href="mailto:hello@tipote.com"
          className="text-primary hover:text-primary/80 font-medium text-sm"
        >
          {t("contactCta")}
        </a>

        <div className="mt-8 pt-6 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Tipote. {t("rights")}.</span>
          <div className="flex items-center gap-4">
            <a
              href="/legal/cgu"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {t("terms")}
            </a>
            <a
              href="/legal/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {t("privacy")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
