// Fil d'Ariane + carte de dossier de l'espace Contenu. Même logique de
// navigation que "Mes projets" côté Tiquiz : on descend dans des dossiers,
// on remonte par le fil d'Ariane.
//
// Ces deux composants restent des composants SERVEUR, et ce n'est pas un
// oubli : ils n'ont ni état ni gestionnaire d'événement, et les pages leur
// passent une ICÔNE, c'est-à-dire une référence de composant React. Une
// référence de fonction ne traverse pas la frontière serveur vers client.
// Marqués côté client, /contenus et /contenus/[produit] plantaient en
// production sur "An error occurred in the Server Components render"
// (1er août 2026). Si un jour ce fichier a besoin d'interactivité, isoler
// la partie interactive dans un composant client dédié plutôt que de
// marquer tout le fichier.

import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ContentBreadcrumb({
  trail,
}: {
  /** Du plus haut au plus bas. Le dernier élément n'est pas cliquable. */
  trail: { label: string; href?: string }[];
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {trail.map((item, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            {item.href && !last ? (
              <Link
                href={item.href}
                className="hover:text-foreground hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className={last ? "font-medium text-foreground" : ""}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function FolderCard({
  href,
  icon: Icon = Folder,
  title,
  description,
  meta,
  badge,
  highlight = false,
}: {
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Compteur affiché en bas de carte ("15 emails"). */
  meta?: string;
  /** Pastille de droite (taux de commission). */
  badge?: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="group block focus:outline-none">
      <Card
        className={`h-full transition-colors group-hover:border-primary/60 group-focus-visible:border-primary ${
          highlight ? "border-primary bg-primary/5" : ""
        }`}
      >
        <CardContent className="flex h-full flex-col gap-3 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
                highlight ? "bg-primary/15" : "bg-muted"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${highlight ? "text-primary" : "text-muted-foreground"}`}
              />
            </div>
            {badge && (
              <Badge
                variant={highlight ? "default" : "secondary"}
                className="px-2.5 text-sm"
              >
                {badge}
              </Badge>
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold leading-tight">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          {meta && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {meta}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
