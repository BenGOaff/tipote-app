// scripts/check-prod.mjs
//
// UN SEUL CONTRÔLE QUI DIT CE QUI MANQUE SUR CE SERVEUR.
//
// Jumeau de celui de Tiquiz, écrit le 26 août 2026 parce qu'il n'existait
// que d'un côté : `npm run check:prod` répondait `Missing script` ici,
// donc la moitié qui porte l'AFFILIATION, c'est à dire l'argent qui SORT,
// était la seule qu'on ne pouvait pas vérifier d'une commande.
//
// -- IL N'IMPRIME JAMAIS UNE VALEUR SECRÈTE ----------------------------
//
// Ce rapport finit dans un terminal, un historique, parfois un
// copier-coller. Il dit "posée" ou "absente", jamais le contenu. Les
// seules valeurs affichées sont les adresses, parce que ce sont elles qui
// rendent un diagnostic évident.
//
// -- ET IL NE SE CONNECTE À RIEN ---------------------------------------
//
// Il lit des fichiers, rien d'autre. Un contrôle qui appellerait Supabase
// pour vérifier une clé pourrait échouer sur une panne réseau et faire
// croire à une clé manquante.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));

/** Lit les `.env` d'un dossier, sans jamais les exporter dans le shell. */
function lireEnvDe(dossier) {
  const valeurs = new Map();
  for (const nom of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const chemin = join(dossier, nom);
    if (!existsSync(chemin)) continue;
    let brut = "";
    try {
      brut = readFileSync(chemin, "utf8");
    } catch {
      continue; // un .env illisible (droits) ne doit pas faire tomber le controle
    }
    for (const ligne of brut.split(/\r?\n/)) {
      const t = ligne.trim();
      if (!t || t.startsWith("#")) continue;
      const sans = t.startsWith("export ") ? t.slice(7).trim() : t;
      const eq = sans.indexOf("=");
      if (eq <= 0) continue;
      const cle = sans.slice(0, eq).trim();
      let v = sans.slice(eq + 1).trim();
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      if (!valeurs.has(cle)) valeurs.set(cle, v);
    }
  }
  return valeurs;
}

const env = lireEnvDe(RACINE);
const lire = (cle) => (env.get(cle) ?? process.env[cle] ?? "").trim();

/** Une clé qu'on ne montre jamais. */
function estSecret(cle) {
  return /(_KEY|_SECRET|_TOKEN|PASSWORD|SERVICE_ROLE|IBAN)/i.test(cle);
}

const lignes = [];
let bloquants = 0;
let avertissements = 0;

function verifier(cle, { requis, quoi, minimum = 1, aussi = [] }) {
  const v = [cle, ...aussi].map(lire).find((x) => x.length >= minimum) ?? lire(cle);
  const ok = v.length >= minimum;
  if (!ok) {
    if (requis) bloquants += 1;
    else avertissements += 1;
  }
  const valeur = ok ? (estSecret(cle) ? "posée" : v) : requis ? "ABSENTE" : "absente";
  lignes.push(`  ${ok ? "ok  " : requis ? "MANQUE" : "-   "} ${cle.padEnd(34)} ${valeur}`);
  if (!ok) lignes.push(`       ${quoi}`);
  return ok;
}

console.log("\n  CE QUI EST POSÉ SUR CE SERVEUR (Tipote)\n");

console.log("  Base et application");
verifier("NEXT_PUBLIC_SUPABASE_URL", {
  requis: true,
  quoi: "L'app ne peut pas démarrer sans elle.",
});
verifier("SUPABASE_SERVICE_ROLE_KEY", {
  requis: true,
  aussi: ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE"],
  quoi: "Sans elle, aucune écriture serveur : ni commission, ni ticket, ni lot de versement.",
});
verifier("NEXT_PUBLIC_APP_URL", {
  requis: true,
  quoi: "Le domaine de l'app. Doit être https://app.tipote.com en production.",
});
console.log(lignes.splice(0).join("\n"));

console.log("\n  Emails");
verifier("RESEND_API_KEY", {
  requis: true,
  quoi: "Sans elle : aucun lien de connexion, aucune alerte, aucune réponse de support.",
});
console.log(lignes.splice(0).join("\n"));

// ── L'ARGENT QUI SORT ──
//
// C'est la partie que personne ne pouvait vérifier avant ce script, et
// c'est celle qui coûte le plus cher : un versement raté, c'est un
// affilié qui a gagné son argent et ne le reçoit pas.
console.log("\n  Affiliation : payer les affiliés");
const cleIban = verifier("PII_MASTER_KEY", {
  requis: false,
  minimum: 64,
  quoi:
    "64 caractères hexadécimaux (openssl rand -hex 32). Sans elle, AUCUN IBAN\n" +
    "       d'affilié ne peut être enregistré : le chiffrement refuse de démarrer.\n" +
    "       Une fois posée, ne JAMAIS la changer : les IBAN déjà enregistrés\n" +
    "       deviendraient illisibles.",
});
if (cleIban && !/^[0-9a-fA-F]{64}$/.test(lire("PII_MASTER_KEY"))) {
  console.log(lignes.splice(0).join("\n"));
  console.log(
    "\n  ATTENTION : PII_MASTER_KEY est posée mais n'est pas 64 caractères hexadécimaux.\n" +
      "  Le chiffrement des IBAN lèvera au premier enregistrement.\n" +
      "  -> openssl rand -hex 32",
  );
  bloquants += 1;
}
const iban = lire("SEPA_DEBTOR_IBAN").replace(/[\s-]/g, "").toUpperCase();
verifier("SEPA_DEBTOR_IBAN", {
  requis: false,
  minimum: 15,
  quoi:
    "Ton IBAN pro, celui d'où partent les virements. Sans lui, le fichier SEPA\n" +
    "       n'est pas produit et l'écran le DIT (la liste PayPal, elle, se\n" +
    "       télécharge quand même).",
});
verifier("SEPA_DEBTOR_BIC", {
  requis: false,
  quoi: "Seulement si ta banque l'exige : depuis 2016 un virement SEPA se fait avec le seul IBAN.",
});
verifier("SEPA_DEBTOR_NAME", {
  requis: false,
  quoi: "Le nom qui apparaît sur le relevé de l'affilié. Absent, c'est ETHILIFE.",
});
console.log(lignes.splice(0).join("\n"));

// La clé de contrôle (modulo 97) attrape la faute de frappe, qui est le
// cas frequent : un chiffre inverse donne un IBAN plausible et un
// virement rejete trois jours plus tard, apres que le lot soit parti.
if (iban) {
  const forme = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban);
  let reste = 0;
  if (forme) {
    const permute = iban.slice(4) + iban.slice(0, 4);
    let tampon = "";
    for (const c of permute) tampon += /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55);
    // Par morceaux : le nombre entier fait jusqu'a 38 chiffres, bien au
    // dela de ce qu'un `number` porte sans perdre en precision.
    for (const chiffre of tampon) reste = (reste * 10 + Number(chiffre)) % 97;
  }
  if (!forme || reste !== 1) {
    console.log(
      "\n  ATTENTION : SEPA_DEBTOR_IBAN ne passe pas sa clé de contrôle.\n" +
        "  La banque refuserait le fichier, et on ne l'apprendrait que trois jours\n" +
        "  après le dépôt. Vérifier la saisie, chiffre par chiffre.",
    );
    bloquants += 1;
  }
}

console.log("\n  Affiliation : suivre les clics et les commissions");
verifier("AFFILIATE_INTERNAL_SECRET", {
  requis: false,
  quoi:
    "Sans elle, Tiquiz ne peut enregistrer AUCUNE commission, et une inscription\n" +
    "       gratuite n'est rattachée à personne. Doit être IDENTIQUE sur Tiquiz.",
});
verifier("AFFILIATE_IP_HASH_SECRET", {
  requis: false,
  minimum: 16,
  quoi:
    "Le sel qui anonymise les IP des clics. Absente, le code retombe sur une\n" +
    "       valeur écrite en clair dans le dépôt : n'importe qui peut refaire le calcul.",
});
verifier("AFFILIATE_DASHBOARD_URL", {
  requis: false,
  quoi: "Absente, les liens vers l'espace affilié retombent sur le domaine canonique.",
});
console.log(lignes.splice(0).join("\n"));

console.log("\n  Liaison avec Tiquiz et l'Atelier");
verifier("PARTNER_SHARED_SECRET", {
  requis: false,
  quoi:
    "Sans elle, les tickets du centre d'aide ne partent pas dans la file de Tiquiz\n" +
    "       et retombent dans l'ancienne table locale. Doit être IDENTIQUE sur les 3 serveurs.",
});
verifier("TIQUIZ_SUPABASE_URL", {
  requis: false,
  quoi: "Sans elle, le mois d'essai affilié ne peut pas s'activer côté Tiquiz.",
});
verifier("TIQUIZ_SUPABASE_SERVICE_ROLE_KEY", {
  requis: false,
  quoi: "La clé de service du projet TIQUIZ (pas celui d'ici). Même usage que ci dessus.",
});
console.log(lignes.splice(0).join("\n"));

console.log("\n  Ventes Systeme.io et taches planifiees");
verifier("SYSTEME_IO_WEBHOOK_SECRET", {
  requis: false,
  quoi: "Sans elle, les ventes Systeme.io n'ouvrent plus d'accès.",
});
verifier("SYSTEME_IO_FREE_WEBHOOK_SECRET", {
  requis: false,
  quoi: "Sans elle, les inscriptions gratuites ne créent plus de compte.",
});
verifier("CRON_SECRET", {
  requis: false,
  minimum: 16,
  quoi: "Sans elle, aucune tâche planifiée ne peut s'exécuter.",
});
console.log(lignes.splice(0).join("\n"));

// ── LES SECRETS QUI DOIVENT ÊTRE LES MÊMES AILLEURS ──
//
// C'est le seul contrôle qu'aucune des deux apps ne pouvait faire toute
// seule, et c'est celui qui compte : deux valeurs POSÉES des deux côtés
// mais DIFFÉRENTES se lisent "ok" partout, et la liaison échoue en
// silence. Un 401 sur une porte partenaire ne dit jamais "vos deux
// secrets ne sont pas les mêmes".
const PARTAGES = [
  { cle: "PARTNER_SHARED_SECRET", avec: ["tiquiz-app", "formaquiz"] },
  { cle: "AFFILIATE_INTERNAL_SECRET", avec: ["tiquiz-app"] },
];

function trouverVoisin(nom) {
  const parent = dirname(RACINE);
  // Les noms de dossiers changent d'une machine a l'autre (le serveur a
  // `tiquiz-app`, une machine de dev peut avoir `tiquiz`). On essaie les
  // deux, et on le DIT quand on ne trouve rien : "pas compare" n'est pas
  // "identique".
  const candidats = [nom, nom.replace(/-app$/, ""), `${nom}-app`];
  for (const c of candidats) {
    const chemin = join(parent, c);
    if (c !== basename(RACINE) && existsSync(join(chemin, "package.json"))) return chemin;
  }
  return null;
}

console.log("\n  Les secrets partagés avec les autres apps");
let comparaisons = 0;
for (const { cle, avec } of PARTAGES) {
  const ici = lire(cle);
  for (const nom of avec) {
    const dossier = trouverVoisin(nom);
    if (!dossier) {
      console.log(`  -    ${cle.padEnd(30)} ${nom.padEnd(12)} dossier introuvable, RIEN COMPARÉ`);
      continue;
    }
    comparaisons += 1;
    const laBas = (lireEnvDe(dossier).get(cle) ?? "").trim();
    let verdict;
    if (!ici && !laBas) verdict = "absente des deux côtés";
    else if (!ici) verdict = "ABSENTE ICI, posée là-bas";
    else if (!laBas) verdict = "posée ici, ABSENTE là-bas";
    else if (ici === laBas) verdict = "identique";
    else verdict = "DIFFÉRENTE des deux côtés";
    const grave = verdict.includes("ABSENTE") || verdict.startsWith("DIFFÉRENTE");
    if (grave) bloquants += 1;
    // "absente des deux cotes" n'est pas un desaccord, mais ce n'est pas
    // un "ok" non plus : la ligne du dessus l'a deja signalee, celle ci
    // ne doit pas venir rassurer par dessus.
    const marque = grave ? "ALERTE" : verdict.startsWith("absente") ? "-   " : "ok  ";
    console.log(`  ${marque} ${cle.padEnd(30)} ${nom.padEnd(12)} ${verdict}`);
  }
}
if (comparaisons === 0) {
  console.log(
    "\n  Aucune autre app trouvée à côté de ce dossier : cette section n'a rien\n" +
      "  vérifié. Sur le serveur, les trois dépôts sont voisins dans /home/tipote.",
  );
}

// ── LES MIGRATIONS ──
console.log("\n  Les 5 dernières migrations écrites (simple rappel, PAS une alerte)");
const dossier = join(RACINE, "supabase", "migrations");
const recentes = existsSync(dossier)
  ? readdirSync(dossier)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .slice(-5)
  : [];
for (const f of recentes) console.log(`      ${f}`);
console.log(
  "\n      Ce controle NE SE CONNECTE PAS a la base : il liste des fichiers, il\n" +
    "      ne sait pas ce qui est applique. Seul `npm run check:migrations-pending`\n" +
    "      interroge la prod et repond. Tant qu'il dit 0 manquant, ces lignes ne\n" +
    "      demandent rien.",
);

console.log(
  `\n  ${bloquants} chose${bloquants > 1 ? "s" : ""} bloquante${bloquants > 1 ? "s" : ""}, ` +
    `${avertissements} optionnelle${avertissements > 1 ? "s" : ""} non posée${avertissements > 1 ? "s" : ""}.\n`,
);
process.exit(bloquants > 0 ? 1 : 0);
