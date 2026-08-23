// lib/env/supabaseProject.ts
//
// LA CLÉ ET L'URL PARLENT-ELLES DU MÊME PROJET ?
//
// « Invalid API key » est le message que Supabase renvoie quand la clé
// présentée n'appartient pas au projet interrogé. C'est ce qu'a vu Béné
// le 22 août au soir : aucun client côté Tipote, un bandeau rouge, et
// des 500 sur toutes les routes serveur.
//
// LA CAUSE, ET ELLE EST LA SUITE DIRECTE DE LA PANNE DU MATIN.
//
// Son terminal portait encore les variables de Tiquiz. `prebuild` a bien
// REFUSÉ de construire (le garde-fou du matin a fait son travail), mais
// la ligne suivante de son déploiement, `pm2 restart --update-env`, a
// poussé ce terminal pollué DANS le processus. L'app tournait donc avec
// l'URL de l'un et la clé de l'autre.
//
// **Un garde-fou qui protège le build ne protège pas le redémarrage.**
// C'est exactement le trou que ce fichier ferme : la vérification vit
// maintenant au DÉMARRAGE du serveur, là où la variable est réellement
// lue, et pas seulement au moment où elle est gravée.
//
// -- IL N'IMPRIME JAMAIS UNE CLÉ ---------------------------------------
//
// Une clé Supabase historique est un JWT : sa charge utile porte le
// projet (`ref`), le rôle et l'expiration, en clair, et ne révèle rien de
// secret. On n'expose QUE ces trois valeurs. Le diagnostic peut donc
// finir dans un journal PM2, un terminal ou un copier-coller.
//
// Les nouvelles clés (`sb_publishable_...`, `sb_secret_...`) ne portent
// rien de lisible : on le DIT au lieu de faire semblant de savoir.

/** Ce qu'une valeur de clé raconte d'elle même. */
export type LectureCle =
  | { etat: "absente" }
  | { etat: "illisible" }
  | { etat: "opaque" }
  | { etat: "jwt"; ref: string; role: string; expireLe: number | null };

/** L'identifiant de projet contenu dans une URL Supabase. */
export function refDepuisUrl(url: string | null | undefined): string | null {
  const m = String(url ?? "")
    .trim()
    .match(/^https?:\/\/([a-z0-9]+)\.supabase\./i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Décode une clé Supabase SANS vérifier sa signature.
 *
 * On ne cherche pas à valider la clé : seul Supabase peut le faire. On
 * cherche à savoir de quel PROJET elle parle, et ça se lit dans la
 * charge utile, qui est du base64 en clair.
 */
export function lireCleSupabase(valeur: string | null | undefined): LectureCle {
  const v = String(valeur ?? "").trim();
  if (!v) return { etat: "absente" };
  if (/^sb_(publishable|secret)_/.test(v)) return { etat: "opaque" };

  const parts = v.split(".");
  if (parts.length !== 3) return { etat: "illisible" };
  try {
    const charge = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { ref?: unknown; role?: unknown; exp?: unknown };
    const ref = typeof charge.ref === "string" ? charge.ref.toLowerCase() : "";
    if (!ref) return { etat: "illisible" };
    return {
      etat: "jwt",
      ref,
      role: typeof charge.role === "string" ? charge.role : "?",
      // `exp` est en SECONDES chez Supabase, pas en millisecondes.
      expireLe: typeof charge.exp === "number" ? charge.exp * 1000 : null,
    };
  } catch {
    return { etat: "illisible" };
  }
}

export type Ecart =
  | { genre: "projet-different"; cle: string; ref: string; attendu: string }
  | { genre: "perimee"; cle: string; expireLe: number }
  | { genre: "absente"; cle: string }
  | { genre: "url-illisible"; cle: string };

export type Diagnostic = {
  /**
   * `croisee` : au moins une clé désigne un autre projet que l'URL. C'est
   *   la panne, et elle est certaine.
   * `indetermine` : rien ne se contredit, mais on n'a pas pu tout lire
   *   (clés au nouveau format, URL absente). On ne conclut pas.
   * `coherent` : tout ce qui était lisible parle du même projet.
   */
  etat: "coherent" | "indetermine" | "croisee";
  ref: string | null;
  ecarts: Ecart[];
};

/**
 * LA MÉCANIQUE EST UN PARAMÈTRE, jamais lue depuis `process.env` ici.
 *
 * Une fonction qui va chercher ses valeurs elle même n'est pas testable,
 * donc pas testée, donc exactement là où les bugs s'installent. Celle ci
 * reçoit ce qu'elle doit comparer, et le point d'entrée (instrumentation)
 * se charge d'aller le chercher.
 */
export function verifierProjetSupabase(
  entrees: { url?: string | null; anon?: string | null; service?: string | null },
  maintenant: number = Date.now(),
): Diagnostic {
  const ref = refDepuisUrl(entrees.url);
  const ecarts: Ecart[] = [];
  let indetermine = false;

  if (!ref) {
    ecarts.push({ genre: "url-illisible", cle: "NEXT_PUBLIC_SUPABASE_URL" });
    indetermine = true;
  }

  const aLire: Array<[string, string | null | undefined]> = [
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", entrees.anon],
    ["SUPABASE_SERVICE_ROLE_KEY", entrees.service],
  ];

  for (const [nom, valeur] of aLire) {
    const lue = lireCleSupabase(valeur);
    if (lue.etat === "absente") {
      ecarts.push({ genre: "absente", cle: nom });
      indetermine = true;
      continue;
    }
    if (lue.etat === "opaque" || lue.etat === "illisible") {
      indetermine = true;
      continue;
    }
    if (ref && lue.ref !== ref) {
      ecarts.push({ genre: "projet-different", cle: nom, ref: lue.ref, attendu: ref });
    }
    if (lue.expireLe !== null && lue.expireLe < maintenant) {
      ecarts.push({ genre: "perimee", cle: nom, expireLe: lue.expireLe });
    }
  }

  const croisee = ecarts.some((e) => e.genre === "projet-different" || e.genre === "perimee");
  return {
    etat: croisee ? "croisee" : indetermine ? "indetermine" : "coherent",
    ref,
    ecarts,
  };
}

/**
 * Le texte qui part dans le journal, et il doit être ACTIONNABLE.
 *
 * Une ligne qui dit "erreur de configuration" envoie chercher au mauvais
 * endroit. Celle ci nomme la variable, les deux projets, et surtout la
 * seule manoeuvre qui corrige : reconstruire depuis un terminal NEUF.
 * Changer le `.env` ne suffit pas, `NEXT_PUBLIC_*` est gravé au build.
 */
export function formaterDiagnostic(d: Diagnostic, app: string): string | null {
  if (d.etat !== "croisee") return null;

  const lignes = [
    "",
    "  ================================================================",
    `  ${app} : LA CLÉ SUPABASE NE PARLE PAS DU MÊME PROJET QUE L'URL.`,
    "  Toutes les requêtes vont répondre « Invalid API key ».",
    "",
  ];

  for (const e of d.ecarts) {
    if (e.genre === "projet-different") {
      lignes.push(`  ${e.cle}`);
      lignes.push(`     désigne le projet ${e.ref}, alors que l'URL dit ${e.attendu}`);
    } else if (e.genre === "perimee") {
      lignes.push(`  ${e.cle}`);
      lignes.push(`     périmée depuis le ${new Date(e.expireLe).toISOString().slice(0, 10)}`);
    }
  }

  lignes.push(
    "",
    "  Ce n'est PAS le fichier .env qu'il faut regarder en premier : une",
    "  variable exportée dans le terminal gagne sur lui, et un",
    "  `pm2 restart --update-env` la pousse dans le processus.",
    "",
    "  Ouvrir un terminal NEUF, puis :  npm run build && pm2 restart <app> --update-env",
    "  ================================================================",
    "",
  );
  return lignes.join("\n");
}
