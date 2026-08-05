// scripts/insight-history.mjs
//
// AFFICHE CE QUE NOS IA ONT CONSEILLÉ À QUELQU'UN, ET QUAND.
//
// -- POURQUOI CE SCRIPT EXISTE (5 août 2026) ---------------------------
//
// Le 4 août, Jocelyne nous a dit avoir suivi les conseils du robot
// pendant trois semaines. Pour savoir ce qu'il lui avait RÉELLEMENT
// conseillé, il a fallu reconstituer à partir de ses messages et d'une
// relecture du prompt : une journée entière, et une conclusion qui est
// restée incertaine.
//
// `quizzes.ai_insights` est écrasé à chaque génération, et
// `user_insight_reports` a `user_id` en clé primaire : le rapport qu'elle
// avait lu n'existait plus nulle part. La table `ai_report_history`
// (migration 20260805) le garde ; ce script le relit.
//
// -- USAGE --------------------------------------------------------------
//
//   cd ~/tipote-app
//   node scripts/insight-history.mjs adresse@de-la-cliente.fr
//   node scripts/insight-history.mjs adresse@de-la-cliente.fr 20
//
// Le second argument est le nombre de rapports à afficher (10 par défaut,
// du plus récent au plus ancien).
//
// Pas besoin de sourcer le .env : le script le lit lui-même, et ne
// cherche QUE les deux clés dont il a besoin. La convention
// `set -a; . .env; set +a` demande à bash d'interpréter tout le fichier,
// et une seule valeur contenant un caractère spécial fait échouer le
// chargement entier (arrivé le 4 août sur une clé d'API sans rapport).
//
// AUCUNE DÉPENDANCE, pour la même raison que `login-link.mjs` :
// `createClient` de supabase-js monte un client temps réel qui exige un
// WebSocket natif, absent de Node 20.
//
// -- CE QUE ÇA FAIT, ET CE QUE ÇA NE FAIT PAS --------------------------
//
// Ça LIT. Ça ne modifie rien, ça n'envoie rien, la personne concernée
// n'en sait rien et n'a rien à faire. C'est de la lecture de nos propres
// traces, pas une intrusion dans son compte : pour voir SON écran, c'est
// `login-link.mjs`, avec ses trois règles.

import { readFileSync } from "node:fs";

function readVar(name) {
  const fromEnv = (process.env[name] ?? "").trim();
  if (fromEnv) return fromEnv;
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return "";
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim().replace(/^export\s+/, "");
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0 || t.slice(0, eq).trim() !== name) continue;
    return t.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  }
  return "";
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
const limit = Math.min(Math.max(parseInt(process.argv[3] ?? "10", 10) || 10, 1), 100);
if (!email || !email.includes("@")) {
  console.error("Usage : node scripts/insight-history.mjs <email du compte> [nombre]");
  process.exit(1);
}

const url = readVar("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const key = readVar("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error(
    "Impossible de lire NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Lance le script depuis le dossier de Tipote, à côté de son fichier .env.",
  );
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function api(path) {
  const res = await fetch(`${url}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${body.slice(0, 300)}`);
  }
  return res.json();
}

// 1. L'utilisateur. L'API d'administration filtre mal par email selon les
//    versions : on demande la page et on cherche nous-mêmes, c'est sûr.
let userId = null;
try {
  const page = await api(`/auth/v1/admin/users?page=1&per_page=1000`);
  const list = Array.isArray(page?.users) ? page.users : [];
  const found = list.find((u) => String(u?.email ?? "").toLowerCase() === email);
  userId = found?.id ?? null;
} catch (e) {
  console.error("Lecture des comptes impossible :", e.message);
  process.exit(1);
}
if (!userId) {
  console.error(`Aucun compte Tipote avec l'adresse ${email}.`);
  console.error("Vérifie l'adresse : beaucoup de gens ont une adresse pro et une adresse perso.");
  process.exit(1);
}

// 2. Ses rapports, du plus récent au plus ancien.
let rows = [];
try {
  rows = await api(
    `/rest/v1/ai_report_history?user_id=eq.${userId}` +
      `&select=scope,quiz_id,model,generated_at,report` +
      `&order=generated_at.desc&limit=${limit}`,
  );
} catch (e) {
  console.error("Lecture de l'historique impossible :", e.message);
  console.error(
    "Si le message parle d'une relation inconnue, la migration " +
      "20260805_ai_report_history.sql n'est pas appliquée sur ce Supabase.",
  );
  process.exit(1);
}

if (rows.length === 0) {
  console.log(`Aucun rapport IA enregistré pour ${email}.`);
  console.log(
    "Rien d'anormal si la migration vient d'être appliquée : l'historique " +
      "ne remonte pas dans le passé, il commence à la première analyse suivante.",
  );
  process.exit(0);
}

// 3. Le titre des quiz concernés, pour que ce soit lisible.
const quizIds = [...new Set(rows.map((r) => r.quiz_id).filter(Boolean))];
const titles = new Map();
if (quizIds.length > 0) {
  try {
    const list = await api(
      `/rest/v1/quizzes?id=in.(${quizIds.join(",")})&select=id,title`,
    );
    for (const q of list) titles.set(q.id, String(q.title ?? "").trim());
  } catch {
    // Sans titres, on affiche les identifiants : moins lisible, pas bloquant.
  }
}

const line = (s) => console.log(s);
const rule = () => line("-".repeat(72));

line("");
line(`${rows.length} rapport(s) pour ${email}, du plus récent au plus ancien.`);

for (const r of rows) {
  rule();
  const what =
    r.scope === "account"
      ? "Analyse GLOBALE du compte"
      : `Quiz : ${titles.get(r.quiz_id) || r.quiz_id || "inconnu"}`;
  line(`${new Date(r.generated_at).toLocaleString("fr-FR")}  |  ${what}`);
  if (r.model) line(`modèle : ${r.model}`);
  line("");

  const rep = r.report ?? {};
  // On affiche la PRIORITÉ en premier et en entier : c'est elle que la
  // créatrice a lue et appliquée, et c'est donc elle qu'on cherche quand
  // on retrace ce qui lui a été conseillé.
  if (rep.priority?.title) {
    line("  PRIORITÉ DONNÉE :");
    line(`    ${rep.priority.title}`);
    if (rep.priority.why) line(`    pourquoi : ${rep.priority.why}`);
    if (rep.priority.how) line(`    comment  : ${rep.priority.how}`);
    line("");
  }
  for (const [label, value] of [
    ["résumé", rep.summary],
    ["funnel", rep.funnel],
    ["audience", rep.audience],
  ]) {
    if (value) line(`  ${label} : ${value}`);
  }
  for (const [label, arr] of [
    ["améliorations", rep.improvements],
    ["actions", rep.actions],
    ["ce qui marche", rep.whatWorks],
    ["à corriger", rep.toFix],
    ["prochains mouvements", rep.nextMoves],
  ]) {
    if (Array.isArray(arr) && arr.length > 0) {
      line(`  ${label} :`);
      for (const item of arr) line(`    - ${item}`);
    }
  }
  const stats = rep.stats_at_generation;
  if (stats) {
    line("");
    line(
      `  chiffres au moment du rapport : ` +
        Object.entries(stats)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
    );
  }
}
rule();
line("");
