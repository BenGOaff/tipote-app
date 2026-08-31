// scripts/check-resend.mjs
//
// QUELLE CLÉ RESEND TOURNE, ET QUELS DOMAINES ELLE VOIT.
//
// -- CE QUI A DÉCLENCHÉ CE SCRIPT (31 août 2026) -----------------------
//
// Deux sources se contredisaient, et les deux disaient vrai :
//
//   le tableau de bord de Béné :  tiquiz.fr  ->  Verified
//   le journal du serveur      :  "The tiquiz.fr domain is not verified"
//
// Une clé Resend appartient à un COMPTE (et à une équipe). Le tableau de
// bord montre le compte qu'on REGARDE ; l'API répond pour le compte de
// la clé qu'on ENVOIE. Quand les deux diffèrent, un domaine peut être
// vérifié d'un côté et inconnu de l'autre, et rien à l'écran ne le dit.
//
// Ça a coûté une demi-journée, et pendant ce temps AUCUN email ne
// partait : ni lien de connexion, ni confirmation d'inscription, ni
// accès après un achat.
//
// -- CE QU'IL FAIT -----------------------------------------------------
//
// Il demande à Resend, AVEC LA CLÉ QUE L'APP UTILISE VRAIMENT, la liste
// des domaines qu'elle voit, et il la compare à l'adresse d'expédition
// que l'app va employer. C'est la règle du 31 août : quand un changement
// déplace l'endroit d'où quelque chose est SERVI, la dernière étape
// n'est pas d'écrire la configuration, c'est d'aller lire la réponse.
//
//   npm run check:resend
//
// -- IL N'IMPRIME JAMAIS LA CLÉ ---------------------------------------
//
// Ces rapports finissent dans un terminal, un historique, parfois un
// copier-coller (règle du 22 août). On affiche son PRÉFIXE et sa
// longueur, de quoi reconnaître laquelle est en place sans pouvoir s'en
// servir.

import { readFileSync } from "node:fs";

/** Une variable : l'environnement d'abord, le `.env` du dossier sinon. */
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

/** L'adresse NUE, même si la variable porte déjà un nom devant. */
function adresseNue(brut) {
  const m = String(brut ?? "").match(/<([^>]*)>/);
  return (m ? m[1] : String(brut ?? "")).trim();
}

// LE REPLI DE TIPOTE EST `hello@tipote.com` (lib/email.ts), et il
// n'est PAS forcément utilisable : dans le compte Resend relevé le
// 31 août, c'est `send.tipote.com` qui est vérifié, pas `tipote.com`.
// On ne le change pas ici : quelle adresse Tipote doit employer est une
// décision de Béné, pas une déduction. Ce contrôle est là pour qu'elle
// la prenne en connaissance de cause.
const REPLI = "hello@tipote.com";

const cle = readVar("RESEND_API_KEY");
const brut = readVar("SUPPORT_FROM_EMAIL") || REPLI;
const expediteur = adresseNue(brut) || REPLI;
const domaine = expediteur.slice(expediteur.lastIndexOf("@") + 1).toLowerCase();

console.log("");
console.log("EXPÉDITEUR");
console.log(`  adresse : ${expediteur}`);
console.log(`  domaine : ${domaine}`);
if (!readVar("SUPPORT_FROM_EMAIL")) {
  console.log("  (SUPPORT_FROM_EMAIL absente : c'est le repli du code qui sert)");
}

if (!cle) {
  console.log("");
  console.log("❌ RESEND_API_KEY est absente : aucun email ne peut partir.");
  console.log("   La poser dans le .env, AVANT le build.");
  process.exit(1);
}
console.log("");
console.log("CLÉ");
console.log(`  ${cle.slice(0, 8)}… (${cle.length} caractères)`);

const res = await fetch("https://api.resend.com/domains", {
  headers: { Authorization: `Bearer ${cle}` },
}).catch((e) => {
  console.log(`\n❌ Resend injoignable : ${e?.message ?? e}`);
  process.exit(1);
});

if (res.status === 401 || res.status === 403) {
  // DEUX CAUSES, ET CE CONTRÔLE NE LES DISTINGUE PAS (31 août 2026).
  //
  // Ce message disait "elle est révoquée, mal recopiée, ou elle n'a pas
  // le droit de lire", ce qui met les trois sur le même plan alors que
  // la troisième est un cas NORMAL : une clé Resend "Sending access"
  // sait envoyer et n'a pas le droit de LISTER les domaines. Elle
  // répond donc 401 ici tout en fonctionnant parfaitement.
  //
  // Un contrôle qui ne distingue pas ce qu'il est censé distinguer est
  // pire qu'un contrôle absent (leçon des clés Supabase, 22 août), et
  // je venais de le refaire.
  console.log("");
  console.log(`⚠️  Cette clé ne peut pas LISTER les domaines (${res.status}).`);
  console.log("   Deux causes possibles, et elles n'appellent pas la même correction :");
  console.log("");
  console.log("   1. La clé est en 'Sending access'. C'est NORMAL : elle sait");
  console.log("      envoyer, elle n'a pas le droit de lire la liste. Ce contrôle");
  console.log("      ne peut alors rien dire, et ce n'est pas une panne.");
  console.log("   2. La clé est révoquée ou mal recopiée. Là, aucun email ne part.");
  console.log("");
  console.log("   POUR TRANCHER : https://resend.com/api-keys, colonne Permission.");
  console.log("   Une clé 'Full access' fait répondre ce contrôle pour de bon.");
  console.log("   Et le journal du serveur dit toujours la vérité :");
  console.log("     pm2 logs <app> --nostream --lines 200 | grep -i Resend");
  process.exit(1);
}
if (!res.ok) {
  console.log(`\n❌ Resend répond ${res.status}.`);
  process.exit(1);
}

const corps = await res.json().catch(() => null);
const domaines = Array.isArray(corps?.data) ? corps.data : [];

console.log("");
console.log("DOMAINES QUE CETTE CLÉ VOIT");
if (domaines.length === 0) {
  console.log("  aucun.");
} else {
  for (const d of domaines) {
    console.log(`  ${d.status === "verified" ? "✓" : "✗"} ${d.name} (${d.status})`);
  }
}

const trouve = domaines.find((d) => String(d.name ?? "").toLowerCase() === domaine);
console.log("");
if (trouve && trouve.status === "verified") {
  console.log(`✓ ${domaine} est vérifié POUR CETTE CLÉ : les emails peuvent partir.`);
  process.exit(0);
}

// LE CAS QUI A COÛTÉ LA DEMI-JOURNÉE, et il mérite sa propre phrase :
// le domaine peut être parfaitement vérifié dans le tableau de bord
// qu'on a sous les yeux, et inconnu de la clé qui tourne.
console.log(`❌ ${domaine} n'est PAS utilisable avec cette clé.`);
if (!trouve) {
  console.log("   Ce domaine n'existe pas dans le compte Resend de cette clé.");
  console.log("   S'il est 'Verified' dans ton tableau de bord, c'est que la CLÉ");
  console.log("   vient d'un AUTRE compte ou d'une autre équipe Resend :");
  console.log("   recopier la clé du compte où le domaine est vérifié.");
} else {
  console.log(`   Il y est, mais son état est "${trouve.status}" : finir la vérification`);
  console.log("   (SPF et DKIM à poser dans Cloudflare) sur https://resend.com/domains");
}
console.log("");
console.log("   Tant que ça n'est pas réglé, AUCUN email ne part : ni lien de");
console.log("   connexion, ni confirmation d'inscription, ni accès après un achat.");
process.exit(1);
