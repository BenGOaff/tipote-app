// scripts/login-link.mjs
//
// GÉNÈRE UN LIEN DE CONNEXION POUR UN COMPTE TIPOTE, ET L'AFFICHE
// DANS LE TERMINAL. Aucun email n'est envoyé.
//
// -- POURQUOI CE SCRIPT EXISTE (4 août 2026) ---------------------------
//
// Jocelyne signalait un problème qu'aucun écran ne reproduisait de notre
// côté. On a diagnostiqué à l'aveugle, on lui a fait faire une manip qui
// n'a rien donné, et il a fallu quatre allers-retours pour comprendre que
// son Atelier était relié au mauvais compte Tiquiz. Voir SON écran aurait
// tranché en dix secondes.
//
// -- CE QUE ÇA FAIT, ET CE QUE ÇA NE FAIT PAS --------------------------
//
// L'API d'administration fabrique un lien de connexion à usage unique et
// à durée limitée. Elle N'ENVOIE RIEN : c'est l'application qui poste
// l'email dans le flux normal (le flux de connexion normal). La
// personne concernée ne reçoit donc aucune notification.
//
// Ça ne touche NI son mot de passe, NI sa session en cours. Contrairement
// à une réinitialisation de mot de passe, qui la mettrait dehors de son
// propre compte.
//
// -- LES TROIS RÈGLES ---------------------------------------------------
//
// 1. FENÊTRE PRIVÉE, toujours. Dans un navigateur normal, ouvrir ce lien
//    REMPLACE ta propre session Tipote par la sienne. Tu te
//    retrouves connectée à sa place sans t'en rendre compte.
// 2. On REGARDE, on ne touche à rien. Toute modification faite là serait
//    faite en son nom, sans qu'elle le sache.
// 3. On ferme la fenêtre privée en partant.
//
// -- USAGE --------------------------------------------------------------
//
//   cd ~/tipote-app
//   node scripts/login-link.mjs adresse@de-la-cliente.fr
//
// Pas besoin de sourcer le .env : le script le lit lui-même (voir plus bas).
//
// -- DEUX CHOIX TECHNIQUES, ET LEURS RAISONS ---------------------------
//
// AUCUNE DÉPENDANCE. `createClient` de supabase-js instancie un client
// temps réel qui exige un WebSocket natif, absent de Node 20. Le script
// plantait avant même d'avoir rien fait. On appelle donc l'API
// d'administration en direct avec `fetch`, présent nativement.
//
// ON LIT LE .env NOUS-MÊMES, ET SEULEMENT DEUX LIGNES. La convention
// `set -a; . .env; set +a` demande à bash d'INTERPRÉTER tout le fichier :
// une seule valeur contenant un caractère spécial fait échouer le
// chargement entier, et c'est ce qui est arrivé le 4 août sur une clé
// d'API sans rapport. En ne cherchant que les deux clés nécessaires, le
// reste du fichier ne peut plus rien casser.

import { readFileSync } from "node:fs";

// Domaine canonique de Tipote, écrit en dur ET PAS LU DANS L'ENV.
//
// En prod, NEXT_PUBLIC_APP_URL vaut `http://localhost:3000` : c'est ce qui
// avait envoyé les liens de mot de passe de Véronique sur sa propre
// machine (2 août 2026). Un lien de connexion construit sur cette variable
// mènerait exactement au même mur.
const APP_URL = "https://app.tipote.com";

/**
 * Récupère UNE variable : l'environnement d'abord, le fichier .env sinon.
 *
 * Le parsing est volontairement minimal et tolérant : on cherche la ligne
 * qui commence par `NOM=`, on prend ce qui suit, on retire les guillemets
 * éventuels. Toute autre ligne, même malformée, est ignorée.
 */
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
    return t
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2")
      .trim();
  }
  return "";
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage : node scripts/login-link.mjs <email du compte>");
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

let res;
try {
  res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "magiclink",
      email,
      // `/auth/callback` consomme les jetons présents dans le hash et
      // ouvre la session (cf. app/auth/callback/CallbackClient.tsx,
      // branche implicite `#access_token=...`).
      redirect_to: `${APP_URL}/auth/callback`,
    }),
  });
} catch (e) {
  // Une pile d'erreurs Node de vingt lignes n'aide personne à 23h.
  console.error(`Impossible de joindre ${url}.`);
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

const json = await res.json().catch(() => null);
const link = json?.action_link ?? json?.properties?.action_link ?? null;

if (!res.ok || !link) {
  // Le cas le plus fréquent : aucun compte ne porte cette adresse. On le
  // dit franchement plutôt que de laisser chercher.
  console.error(`Impossible de générer le lien pour ${email}.`);
  console.error(json?.msg ?? json?.error_description ?? json?.message ?? `HTTP ${res.status}`);
  console.error("Vérifie que ce compte existe bien sur Tipote.");
  process.exit(1);
}

console.log("");
console.log(`Lien de connexion pour ${email} :`);
console.log("");
console.log(link);
console.log("");
console.log("À OUVRIR EN FENÊTRE PRIVÉE.");
console.log("Dans un onglet normal, tu remplaces ta propre session par la sienne.");
console.log("Usage unique, courte durée. On regarde, on ne modifie rien, on ferme en partant.");
console.log("");
