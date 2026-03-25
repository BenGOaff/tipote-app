// app/api/onboarding/complete/route.ts
// Mark onboarding as completed (business_profiles.onboarding_completed)
// V2: also sets onboarding_version="v2" (routing) + optional diagnostic_completed
// Best-effort: also closes onboarding_sessions if sessionId provided (fail-open on schema diffs)
//
// ✅ PATCH (suite logique onboarding 3.0) :
// - Fix boucle /onboarding si business_profiles row n'existe pas encore : update THEN insert (fail-open)
// - Conserve la compat colonne onboarding_version (si absente, retry sans)
// - Ne casse rien : aucune nouvelle route, aucun changement front requis
//
// ✅ MULTI-PROJETS : accepte `project_id` dans le body pour scoper l'onboarding au projet actif.
//
// ✅ HARDENING (prod) :
// - Auth via cookies (getSupabaseServerClient)
// - Writes via service_role (supabaseAdmin) pour éviter les edge cases RLS/politiques

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    m.includes("schema cache") ||
    m.includes("pgrst") ||
    (m.includes("column") && (m.includes("exist") || m.includes("unknown")))
  );
}

async function updateThenInsertBusinessProfile(
  supabase: any,
  userId: string,
  patch: Record<string, unknown>,
  projectId?: string | null,
) {
  const now = new Date().toISOString();

  // On garde l'update d'abord (anti-régression)
  let updQuery = supabase
    .from("business_profiles")
    .update({ ...patch, updated_at: now } as any)
    .eq("user_id", userId);

  // Toujours scoper par project_id pour éviter d'écraser les données d'autres projets
  if (projectId) {
    updQuery = updQuery.eq("project_id", projectId);
  } else {
    updQuery = updQuery.is("project_id", null);
  }

  const upd = await updQuery.select("id");

  if (!upd.error) {
    if (Array.isArray(upd.data) && upd.data.length > 0) return { ok: true, error: null as any };
  }

  // Si erreur "colonne manquante", on laisse caller gérer (retry sans colonne).
  if (upd.error && isMissingColumnError(upd.error.message)) {
    return { ok: false, error: upd.error };
  }

  // Si 0 row (ou autre cas), insert best-effort
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    ...patch,
    created_at: now,
    updated_at: now,
  };
  if (projectId) insertPayload.project_id = projectId;

  const ins = await supabase.from("business_profiles").insert(insertPayload as any);

  if (ins.error && isMissingColumnError(ins.error.message)) {
    // On retente sans created_at/updated_at si jamais ces colonnes diffèrent (fail-open)
    const retryPayload: Record<string, unknown> = { user_id: userId, ...patch };
    if (projectId) retryPayload.project_id = projectId;

    const ins2 = await supabase.from("business_profiles").insert(retryPayload as any);
    return { ok: !ins2.error, error: ins2.error };
  }

  return { ok: !ins.error, error: ins.error };
}

export async function POST(req: Request) {
  try {
    // Client auth (cookies)
    const supabaseAuth = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabaseAuth.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Writes via service_role (durable)
    const supabase = supabaseAdmin;

    const body = (await req.json().catch(() => ({}))) as {
      diagnosticCompleted?: boolean;
      diagnostic_completed?: boolean; // compat
      sessionId?: string;
      project_id?: string; // multi-projets
    };

    const diagnosticCompleted = !!(body?.diagnosticCompleted ?? (body as any)?.diagnostic_completed);

    // ✅ Résoudre le project_id (body > cookie > default)
    let projectId: string | null = typeof body?.project_id === "string" ? body.project_id.trim() : "";
    if (!projectId) {
      // lecture via client auth (cookies)
      projectId = await getActiveProjectId(supabaseAuth, userId);
    }

    // ✅ Validate minimum viable data before allowing completion
    // Without at least niche or main_goal, strategy generation produces empty results
    // ✅ Skip validation if `force` flag is set (emergency fallback from onboarding questionnaire)
    const forceComplete = !!(body as any)?.force || !!(body as any)?.diagnosticCompleted;
    if (!forceComplete) {
      try {
        let bpQuery = supabase.from("business_profiles").select("niche,main_goal,mission").eq("user_id", userId);
        if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
        const { data: bpCheck } = await bpQuery.maybeSingle();

        const hasNiche = typeof bpCheck?.niche === "string" && bpCheck.niche.trim().length > 0;
        const hasGoal = typeof bpCheck?.main_goal === "string" && bpCheck.main_goal.trim().length > 0;
        const hasMission = typeof bpCheck?.mission === "string" && bpCheck.mission.trim().length > 0;

        if (!hasNiche && !hasGoal && !hasMission) {
          return NextResponse.json(
            { ok: false, error: "insufficient_data", message: "Il manque des informations essentielles pour générer ta stratégie. Reviens au diagnostic pour compléter." },
            { status: 422 },
          );
        }
      } catch {
        // best-effort: if the check fails, allow completion anyway (fail-open)
      }
    }

    // 1) business_profiles = source de vérité UI
    // (fail-open si la colonne onboarding_version n'existe pas encore)
    // ✅ Always set diagnostic_completed=true when completing onboarding (v2 is always diagnostic-based)
    const patch: Record<string, unknown> = {
      onboarding_completed: true,
      onboarding_version: "v2",
      diagnostic_completed: true,
    };

    const r1 = await updateThenInsertBusinessProfile(supabase, userId, patch, projectId);

    if (!r1.ok && r1.error && isMissingColumnError(r1.error.message)) {
      // Retry sans onboarding_version si colonne absente
      const patch2: Record<string, unknown> = { onboarding_completed: true };
      if (diagnosticCompleted) patch2.diagnostic_completed = true;

      const r2 = await updateThenInsertBusinessProfile(supabase, userId, patch2, projectId);
      if (!r2.ok) {
        return NextResponse.json(
          { ok: false, error: r2.error?.message ?? "Failed to complete onboarding" },
          { status: 400 },
        );
      }
    } else if (!r1.ok) {
      return NextResponse.json(
        { ok: false, error: r1.error?.message ?? "Failed to complete onboarding" },
        { status: 400 },
      );
    }

    // 2) best-effort: fermer la session si fournie (ne jamais casser si schema différent)
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (sessionId) {
      // Try with completed_at if present, else fallback
      const withCompletedAt = await supabase
        .from("onboarding_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", sessionId)
        .eq("user_id", userId);

      if (withCompletedAt.error && isMissingColumnError(withCompletedAt.error.message)) {
        await supabase
          .from("onboarding_sessions")
          .update({ status: "completed" } as any)
          .eq("id", sessionId)
          .eq("user_id", userId);
      }
    }

    // ✅ Send welcome email (best-effort, non-blocking)
    sendWelcomeEmail(userId).catch((err) =>
      console.error("[onboarding/complete] Welcome email failed:", err),
    );

    // ✅ Set project cookie in response to prevent middleware loop
    const response = NextResponse.json({ ok: true });
    if (projectId) {
      response.cookies.set("tipote_active_project", projectId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return response;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── Welcome email (best-effort) ──

async function sendWelcomeEmail(userId: string) {
  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!user?.email) return;

  const { data: profile } = await supabaseAdmin
    .from("business_profiles")
    .select("first_name, content_locale")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const locale = profile?.content_locale || "fr";
  const name = profile?.first_name || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";

  const greetings: Record<string, string> = {
    fr: name ? `${name}, bienvenue sur Tipote !` : "Bienvenue sur Tipote !",
    en: name ? `${name}, welcome to Tipote!` : "Welcome to Tipote!",
    es: name ? `${name}, bienvenido/a a Tipote!` : "¡Bienvenido/a a Tipote!",
    it: name ? `${name}, benvenuto/a su Tipote!` : "Benvenuto/a su Tipote!",
    ar: name ? `${name}، مرحبًا بك في Tipote!` : "!مرحبًا بك في Tipote",
  };

  const subjects: Record<string, string> = {
    fr: "🚀 Bienvenue sur Tipote — tes premiers pas",
    en: "🚀 Welcome to Tipote — your first steps",
    es: "🚀 Bienvenido/a a Tipote — tus primeros pasos",
    it: "🚀 Benvenuto/a su Tipote — i tuoi primi passi",
    ar: "🚀 مرحبًا بك في Tipote — خطواتك الأولى",
  };

  const bodies: Record<string, string> = {
    fr: `Ton diagnostic est terminé et ton espace est prêt.<br/><br/>
Voici tes 3 prochaines étapes pour démarrer du bon pied :<br/><br/>
<strong>1. Connecte un réseau social</strong><br/>
Pour programmer tes publications automatiquement.<br/><br/>
<strong>2. Génère ta stratégie</strong><br/>
L'IA analyse ton profil et te propose un plan d'action sur 90 jours.<br/><br/>
<strong>3. Crée ton premier contenu</strong><br/>
Post, email, page de capture… tout est généré pour toi en quelques clics.<br/><br/>
On est là pour t'accompagner à chaque étape.`,
    en: `Your diagnostic is complete and your workspace is ready.<br/><br/>
Here are your 3 next steps to get started:<br/><br/>
<strong>1. Connect a social network</strong><br/>
To schedule your posts automatically.<br/><br/>
<strong>2. Generate your strategy</strong><br/>
AI analyzes your profile and suggests a 90-day action plan.<br/><br/>
<strong>3. Create your first content</strong><br/>
Post, email, landing page… everything is generated for you in a few clicks.<br/><br/>
We're here to support you every step of the way.`,
    es: `Tu diagnóstico está completo y tu espacio está listo.<br/><br/>
Aquí tienes tus 3 próximos pasos:<br/><br/>
<strong>1. Conecta una red social</strong><br/>
<strong>2. Genera tu estrategia</strong><br/>
<strong>3. Crea tu primer contenido</strong><br/><br/>
Estamos aquí para acompañarte.`,
    it: `La tua diagnosi è completa e il tuo spazio è pronto.<br/><br/>
Ecco i tuoi 3 prossimi passi:<br/><br/>
<strong>1. Collega un social network</strong><br/>
<strong>2. Genera la tua strategia</strong><br/>
<strong>3. Crea il tuo primo contenuto</strong><br/><br/>
Siamo qui per accompagnarti.`,
    ar: `تشخيصك مكتمل ومساحتك جاهزة.<br/><br/>
<strong>1. اربط شبكة اجتماعية</strong><br/>
<strong>2. أنشئ استراتيجيتك</strong><br/>
<strong>3. أنشئ أول محتوى لك</strong>`,
  };

  const ctaLabels: Record<string, string> = {
    fr: "Commencer maintenant",
    en: "Get started now",
    es: "Empezar ahora",
    it: "Inizia ora",
    ar: "ابدأ الآن",
  };

  await sendEmail({
    to: user.email,
    subject: subjects[locale] || subjects.fr,
    greeting: greetings[locale] || greetings.fr,
    body: bodies[locale] || bodies.fr,
    ctaLabel: ctaLabels[locale] || ctaLabels.fr,
    ctaUrl: `${appUrl}/dashboard`,
    locale,
  });
}
