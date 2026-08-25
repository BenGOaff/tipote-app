// app/affiliate/api/auth/signup/route.ts
//
// Inscription d'un affilié, avec OU SANS compte Systeme.io.
//
// Béné, 25 août 2026 : "on est censés avoir NOTRE système d'affiliation ?
// Du coup pourquoi un type sans systeme io ne pourrait pas devenir
// affilié chez nous ??"
//
// Il ne pouvait pas, et ce n'était pas la base : `affiliates.sa` est une
// colonne `text`. C'était CETTE route, qui refusait tout ce qui n'avait
// pas la forme d'un identifiant Systeme.io. Le `sa` est donc devenu
// FACULTATIF : sans lui, on en fabrique un à la même forme
// (`genererSa`), et `origin` garde la trace de sa provenance.
//
// Sécurité / identité :
//   1. Un `sa` FOURNI doit avoir la forme Systeme.io (SA_RE) : c'est
//      celui qui sert à l'attribution des ventes venues de leurs
//      tunnels, et une valeur inventée y créerait des lignes au nom de
//      personne. Un `sa` ABSENT est le cas normal d'une inscription
//      chez nous. On ne valide PAS l'email contre Systeme.io :
//      un affilié est une entité distincte d'un contact, et de toute façon
//      seul le `sa` importe (Béné 14 juillet 2026 : "on s'en fout de l'email
//      Systeme.io, c'est l'ID qui est important").
//   2. Email validé syntaxiquement (sert d'identifiant de connexion au
//      compte affilié, pas de vérification côté Systeme.io).
//   3. Upsert dans `affiliates` (status='active'). Idempotent — un affilié
//      peut re-cliquer le bouton Systeme.io, on update juste.
//   4. Envoie un magic link Supabase pour qu'il puisse se connecter.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendAffiliateMagicLink } from "@/lib/affiliate/sendMagicLink";
import { SA_RE, genererSa, type AffiliateOrigin } from "@/lib/affiliate/saFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La forme vit dans lib/affiliate/saFormat.ts, et nulle part ailleurs :
// elle était recopiée dans quatre routes, et c'est ainsi que commence une
// divergence (le jour où Systeme.io allonge ses identifiants, trois
// endroits l'acceptent et le quatrième le refuse).
function saFourni(sa: unknown): string | null {
  const v = typeof sa === "string" ? sa.trim() : "";
  return v.length > 0 ? v : null;
}

function isEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const ALLOWED_LOCALES = new Set(["fr", "en", "es", "it", "pt", "ar"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    sa?: string;
    email?: string;
    display_name?: string | null;
    locale?: string;
    password?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  // Un identifiant SAISI doit être valide : quelqu'un qui colle un `sa`
  // de travers doit le savoir tout de suite, pas découvrir six mois plus
  // tard que ses ventes Systeme.io ne lui sont jamais attribuées. Un
  // champ VIDE, lui, est le cas normal depuis le 25 août.
  const saSaisi = saFourni(body.sa);
  if (saSaisi !== null && !SA_RE.test(saSaisi)) {
    return NextResponse.json({ ok: false, reason: "invalid_sa" }, { status: 400 });
  }
  if (!isEmail(body.email)) {
    return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }

  const email = body.email.toLowerCase();
  const displayName = typeof body.display_name === "string"
    ? body.display_name.trim().slice(0, 80) || null
    : null;
  const locale = ALLOWED_LOCALES.has(body.locale ?? "") ? (body.locale as string) : "fr";
  const password = typeof body.password === "string" && body.password.length > 0
    ? body.password
    : null;
  if (password !== null && password.length < 8) {
    return NextResponse.json({ ok: false, reason: "weak_password" }, { status: 400 });
  }

  // ── ON REGARDE L'EMAIL AVANT DE FABRIQUER QUOI QUE CE SOIT ────────
  //
  // `affiliates.email` est UNIQUE. Sans cette lecture, une deuxième
  // inscription sans `sa` fabriquerait un nouvel identifiant, taperait
  // dans la contrainte d'unicité, et répondrait une erreur de base à
  // quelqu'un qui essaie juste de revenir. Et si l'unicité n'existait
  // pas, ce serait pire : deux lignes pour la même personne, donc deux
  // codes, deux liens, et des statistiques coupées en deux.
  const { data: existante, error: lookupErr } = await supabaseAdmin
    .from("affiliates")
    .select("sa")
    .eq("email", email)
    .maybeSingle();

  if (lookupErr) {
    // "Je n'ai rien trouvé" et "je n'ai pas pu regarder" sont deux
    // réponses différentes : on ne crée rien sur un contrôle en erreur.
    console.error("[affiliate/signup] lookup error:", lookupErr.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  const saExistant = typeof existante?.sa === "string" ? existante.sa : null;

  // Cette adresse est déjà affiliée sous un AUTRE identifiant, et on
  // nous en donne un nouveau. On refuse, et on le DIT : `sa` est la clé
  // primaire, tout l'historique (clics, conversions, commissions,
  // versements) y est accroché. Le changer en silence orphelinerait de
  // l'argent déjà gagné. C'est un cas pour un humain.
  if (saExistant && saSaisi && saExistant !== saSaisi) {
    return NextResponse.json(
      { ok: false, reason: "email_deja_affiliee" },
      { status: 409 },
    );
  }

  // L'identifiant, dans l'ordre : celui de la ligne existante (retour
  // d'une affiliée), sinon celui qu'elle a collé (Systeme.io), sinon le
  // nôtre. Un identifiant déjà en base ne se régénère JAMAIS.
  const sa = saExistant ?? saSaisi ?? genererSa();
  const origin: AffiliateOrigin = saSaisi ? "systeme_io" : "tipote";

  // Pas de vérification email côté Systeme.io : seul le `sa` compte
  // (Christelle 14 juillet 2026, un affilié n'est PAS forcément un contact).
  // Upsert dans affiliates. Si l'utilisateur existe déjà (re-clic sur le
  // bouton activation), on met juste à jour ses infos.
  const { error: upsertErr } = await supabaseAdmin
    .from("affiliates")
    .upsert(
      {
        sa,
        email,
        display_name: displayName,
        locale,
        status: "active",
        updated_at: new Date().toISOString(),
        // Sur une ligne DÉJÀ là, on ne réécrit pas l'origine : elle a
        // été posée à la création et elle ne change pas parce que
        // quelqu'un recharge le formulaire.
        ...(saExistant ? {} : { origin }),
      },
      { onConflict: "sa" },
    );

  if (upsertErr) {
    // La colonne `origin` peut ne pas être encore appliquée en prod, et
    // PostgREST rejette alors l'écriture ENTIÈRE : sans ce repli, un
    // déploiement en avance sur la migration refuserait TOUTES les
    // inscriptions affiliées (drame `quiz_events.meta`).
    const colonneManquante = /origin/i.test(upsertErr.message);
    if (!colonneManquante) {
      console.error("[affiliate/signup] upsert error:", upsertErr.message);
      return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
    }
    console.error(
      "[affiliate/signup] colonne `origin` absente, migration 20260825_affilies_sans_systeme_io a appliquer :",
      upsertErr.message,
    );
    const { error: repliErr } = await supabaseAdmin
      .from("affiliates")
      .upsert(
        {
          sa,
          email,
          display_name: displayName,
          locale,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sa" },
      );
    if (repliErr) {
      console.error("[affiliate/signup] upsert error:", repliErr.message);
      return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
    }
  }

  // 3a. Si l'user a fourni un mot de passe, on crée/met-à-jour son
  //     compte auth.users via l'admin API et on set le password. Ça
  //     lui permet de se connecter direct sans passer par le magic link.
  if (password) {
    try {
      // Tente de récupérer l'user existant
      const { data: { users }, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers();
      if (listErr) throw listErr;
      const existing = users?.find(
        (u) => (u.email ?? "").toLowerCase() === email,
      );

      if (existing) {
        // Update le password
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
      } else {
        // Crée le compte avec password
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      }
      // Compte créé avec password → l'user peut se connecter direct.
      // Pas besoin d'envoyer un magic link.
      return NextResponse.json({ ok: true, has_password: true });
    } catch (err) {
      console.error("[affiliate/signup] password set error:", err);
      // Fall through au magic link en fallback
    }
  }

  // 3b. Pas de password OU password set a échoué → envoi du magic link
  // via notre helper Resend (template bi-marque, multilang).
  const linkResult = await sendAffiliateMagicLink({
    email,
    intent: "login",
    locale,
    firstName: displayName,
  });
  if (!linkResult.ok) {
    return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
