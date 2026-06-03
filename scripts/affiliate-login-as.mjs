#!/usr/bin/env node
// scripts/affiliate-login-as.mjs (Tipote)
//
// Génère un magic link de connexion pour un email donné, à utiliser
// par Béné pour se connecter à n'importe quel compte affilié sans
// connaître le mdp (impossible à récupérer en clair — bcrypt).
//
// CAS D'USAGE :
//   - Debug visuel d'un user qui se plaint d'un bug spécifique
//     (Monique 3 juin 2026 : page affiliée grisée, impossible de
//     reproduire chez Béné → besoin de voir avec les yeux de Monique)
//   - Vérification ponctuelle d'un état de compte
//
// SÉCURITÉ : nécessite SUPABASE_SERVICE_ROLE_KEY (admin DB Tipote).
// Le lien généré est valide ~1h, à usage unique. Une fois loggée,
// déconnecte-toi immédiatement après debug pour ne pas occuper la
// session (le user pourrait avoir besoin de se reconnecter en
// parallèle, et tes actions seraient confondues avec les siennes).
//
// USAGE :
//   cd ~/tipote-app && set -a; . .env; set +a
//   node scripts/affiliate-login-as.mjs <email>
//
// Ouvre le lien retourné en NAVIGATION PRIVÉE pour ne pas bouffer
// ta session admin habituelle.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_PROJECT_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE ??
  process.env.SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ENV manquantes : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  console.error("Source ton .env d'abord :");
  console.error("  cd ~/tipote-app && set -a; . .env; set +a");
  process.exit(2);
}

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage : node scripts/affiliate-login-as.mjs <email>");
  console.error("Exemple : node scripts/affiliate-login-as.mjs mopulgi@gmail.com");
  process.exit(2);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DASHBOARD_URL = process.env.AFFILIATE_DASHBOARD_URL ?? "https://affiliate.tipote.com";
const redirectTo = `${DASHBOARD_URL}/auth/callback?next=${encodeURIComponent("/")}`;

console.log(`▶ Génération d'un magic link pour ${email}`);
console.log(`  Redirect : ${redirectTo}`);

const { data, error } = await supa.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo },
});

if (error) {
  console.error("\n✗ Erreur :", error.message);
  // Cas typiques : user n'existe pas en auth.users (pas encore inscrit
  // côté affilié), email mal écrit, projet Supabase mal configuré.
  process.exit(1);
}

const link = data?.properties?.action_link;
if (!link) {
  console.error("\n✗ Pas d'action_link dans la réponse :", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\n✓ Magic link prêt — ouvre-le en NAVIGATION PRIVÉE :\n");
console.log(link);
console.log("\n⏰ Valide ~1h, à usage unique.");
console.log("👤 Une fois loggée, déconnecte-toi rapidement après debug.\n");
