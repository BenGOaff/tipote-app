// app/affiliate/layout.tsx
//
// Layout imbriqué du dashboard affiliation. Le root layout fournit
// déjà <html>/<body> + Providers + thème, donc on rajoute juste un
// wrapper qui :
//   1. Lit la locale de la session affilié (DB) et la passe au context
//      i18n affilié (toutes les pages enfants peuvent traduire).
//   2. Met direction="rtl" sur le wrapper si la locale est arabe.
//
// La metadata par-page override le title/icons du root layout.

import type { Metadata } from "next";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { normaliseLocale, getDict } from "./i18n";
import { AffiliateI18nProvider } from "./i18n/context";
import { AffiliateSidebar } from "./components/AffiliateSidebar";

export async function generateMetadata(): Promise<Metadata> {
  // Pour la metadata, on lit la locale de la session si dispo, sinon FR.
  // Le SSR de la metadata se fait avant que les children rendent, donc
  // c'est l'endroit le plus tôt où on peut lire la session.
  const session = await getAffiliateSession();
  const locale = normaliseLocale(session?.locale ?? "fr");
  const t = getDict(locale);
  return {
    title: {
      default: t.layout.page_title,
      template: `%s · ${t.layout.page_title}`,
    },
    description: t.layout.page_description,
    icons: {
      icon: [{ url: "/favicon.png", sizes: "any" }],
      shortcut: "/favicon.png",
      apple: "/favicon.png",
    },
  };
}

export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const session = await getAffiliateSession();
  const locale = normaliseLocale(session?.locale ?? "fr");
  // Pour l'arabe, on impose direction RTL sur le contenu affilié sans
  // toucher au root layout (qui reste LTR pour app.tipote.com).
  const dir = locale === "ar" ? "rtl" : "ltr";

  // Shell avec sidebar gauche pour les pages authentifiées (cohérent
  // avec l'app principale). Sur /login, /signup, /auth/callback la
  // session est nulle → on rend les enfants pleine largeur (ces pages
  // ont leur propre mise en page centrée).
  const displayName = session
    ? session.display_name ?? session.email.split("@")[0]
    : "";

  return (
    <AffiliateI18nProvider locale={locale}>
      <div dir={dir}>
        {session ? (
          <div className="min-h-screen lg:flex bg-background">
            <AffiliateSidebar displayName={displayName} />
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </AffiliateI18nProvider>
  );
}
