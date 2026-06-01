// app/api/quiz/[quizId]/track/route.ts
//
// Lightweight public endpoint to track quiz funnel events. Refonte
// (Adeline, 19 mai 2026) : tous les événements passent par
// `quiz_events` (table log time-series) via la RPC `log_quiz_event`.
// Les compteurs sur `quizzes.*_count` sont auto-bumpés par le trigger
// `trg_quiz_events_bump_counter` (migration 20260521_tracking_foundation).
//
// Avant : start/complete faisaient un UPDATE direct sur le compteur
// sans jamais écrire dans quiz_events → log incomplet → stats
// incohérentes. Maintenant : un seul chemin, source de vérité = le log.
//
// Sécurités ajoutées :
//   - Cookie session HttpOnly 30j (`tquiz_visit`) généré côté serveur
//     au premier load → dedup robuste.
//   - Bot UA filtering via `lib/userAgent.ts:isBot`.
//   - Owner exclusion : si visiteur authentifié = propriétaire du quiz,
//     on skip tout tracking (évite que le créateur compte ses propres
//     previews).
//   - Dedup 24h par (quiz_id, event_type, session_id) sur view/start/
//     complete → un refresh ne crée pas 50 vues.
//
// Tous les retours sont en HTTP 200 avec `{ok, reason}` — un endpoint
// analytics qui balance des 4xx dans la console du visiteur donne
// l'impression d'un bug applicatif (Adeline 18 mai 2026).
//
// Events:
//   - "view"          : visiteur a chargé la page publique. Fired
//                       client-side (pas server-side comme avant) pour
//                       que les bots qui ne JS pas ne soient pas comptés.
//   - "start"         : visiteur clique "Démarrer".
//   - "complete"      : visiteur arrive à l'étape email/capture.
//   - "share"         : visiteur partage (post-capture).
//   - "question_view" : visiteur affiche la question N. Granularité
//                       par question dans `quiz_question_events`.
//   - "question_answer" : idem mais après réponse.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isBot } from "@/lib/userAgent";
import { randomUUID } from "node:crypto";
import { logBusinessEvent } from "@/lib/businessEvents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

const PROJECT_EVENTS = ["view", "start", "complete", "share"] as const;
const QUESTION_EVENTS = ["question_view", "question_answer"] as const;
type ProjectEvent = (typeof PROJECT_EVENTS)[number];
type QuestionEvent = (typeof QUESTION_EVENTS)[number];

const QUESTION_EVENT_DB: Record<QuestionEvent, "view" | "answer"> = {
  question_view: "view",
  question_answer: "answer",
};

// Dedup window pour les événements project-level (view/start/complete).
// 24h : un visiteur qui revient le lendemain compte comme une nouvelle vue
// — c'est la définition standard d'une "session" en analytics web.
const DEDUP_WINDOW_HOURS = 24;
// Cookie session HttpOnly 30j. Nom court neutre (pas tied à user).
const SESSION_COOKIE = "tquiz_visit";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours
const SESSION_ID_RE = /^[a-z0-9-]{8,64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveQuizIdFromSlugOrId(slugOrId: string): Promise<string | null> {
  const needle = slugOrId.trim();
  if (!needle) return null;
  if (UUID_RE.test(needle)) {
    const { data } = await supabaseAdmin
      .from("quizzes")
      .select("id")
      .eq("id", needle)
      .eq("status", "active")
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await supabaseAdmin
    .from("quizzes")
    .select("id")
    .ilike("slug", needle)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
}

function ok(extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...(extra ?? {}) });
}
function silent(reason: string) {
  return NextResponse.json({ ok: false, reason });
}

// Pose le cookie session sur la réponse. Si le cookie existe déjà
// et est valide, on n'override pas (pour préserver la session
// existante). Sinon on en génère un nouveau.
function attachSessionCookie(res: NextResponse, sessionId: string) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

// Vérifie si l'event (quiz, type, session) a déjà été inséré sur
// la fenêtre de dédup. Si oui → on skip (sinon refresh = +1 vue).
async function isDuplicate(
  quizId: string,
  eventType: string,
  sessionId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("quiz_events")
    .select("id")
    .eq("quiz_id", quizId)
    .eq("event_type", eventType)
    .eq("session_id", sessionId)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Log un business_event pour les events visiteurs à forte valeur
 * (complete, share). Fait UN fetch pour récupérer le user_id du
 * créateur du quiz + project_id — ce coût est acceptable car ces
 * events sont rares (1x par visiteur vs view/start qui sont haute
 * fréquence). On NE LOG PAS view/start dans business_events : Wall
 * of Wins les lira directement depuis quiz_events.
 *
 * DedupeKey : <kind>:<quizId>:<sessionId> → idempotent même si le
 * client re-fire l'event ou que le cookie session est partagé.
 */
async function logBusinessEventForQuizFunnel(
  quizId: string,
  event: "complete" | "share",
  sessionId: string,
): Promise<void> {
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("user_id, project_id, title")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz?.user_id) return;
  const kind = event === "complete" ? "quiz_complete" : "quiz_share";
  await logBusinessEvent({
    userId: quiz.user_id as string,
    projectId: (quiz.project_id as string | null) ?? null,
    kind,
    source: "internal",
    payload: {
      quizId,
      quizTitle: (quiz.title as string | null) ?? null,
      sessionId,
    },
    dedupeKey: `${kind}:${quizId}:${sessionId}`,
  });
}

// Si le visiteur est authentifié et qu'il est propriétaire du quiz,
// on skip tout tracking. Évite que le créateur gonfle ses stats en
// previewant son propre quiz. Retourne true si l'utilisateur est le
// owner ; false sinon (ou erreur d'auth → false, mieux vaut tracker
// par défaut qu'oublier de tracker un vrai visiteur).
async function isQuizOwner(quizId: string): Promise<boolean> {
  try {
    const supa = await getSupabaseServerClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return false;
    const { data: quiz } = await supabaseAdmin
      .from("quizzes")
      .select("user_id")
      .eq("id", quizId)
      .maybeSingle();
    return quiz?.user_id === user.id;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId: slugOrId } = await context.params;
    const quizId = await resolveQuizIdFromSlugOrId(slugOrId);
    if (!quizId) return silent("quiz_not_found");

    // Bot filter — on ne compte pas Googlebot, ChatGPT, etc.
    const ua = req.headers.get("user-agent");
    if (isBot(ua)) return silent("bot_filtered");

    // Owner exclusion — créateur qui preview son propre quiz ne compte pas.
    if (await isQuizOwner(quizId)) return silent("owner_excluded");

    let body: { event?: string; questionIndex?: number; meta?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return silent("bad_json");
    }

    const event = String(body.event ?? "").trim();

    // Resolve session id : on lit le cookie si présent, sinon on en
    // génère un nouveau qu'on attachera à la réponse. Le client n'a
    // pas besoin de gérer ça — le browser pose le cookie au premier
    // appel et le renvoie automatiquement aux suivants.
    const existingCookie = req.cookies.get(SESSION_COOKIE)?.value;
    const sessionId = existingCookie && SESSION_ID_RE.test(existingCookie)
      ? existingCookie
      : randomUUID();
    const needSetCookie = sessionId !== existingCookie;

    // ─── Project-level events (view, start, complete, share) ────────
    if ((PROJECT_EVENTS as readonly string[]).includes(event)) {
      // Dedup 24h
      if (await isDuplicate(quizId, event, sessionId)) {
        const res = silent("duplicate_event");
        if (needSetCookie) attachSessionCookie(res, sessionId);
        return res;
      }
      // INSERT direct dans quiz_events → le trigger trg_quiz_events_bump_counter
      // bumpe le compteur. On NE passe PLUS par la RPC log_quiz_event : un
      // insert direct ne dépend pas de la signature/surcharge de la fonction
      // et son erreur est lue (la RPC awaitée sans lire `error` masquait les
      // échecs). MÊME chemin fiable que quiz_question_events.
      const { error: insErr } = await supabaseAdmin.from("quiz_events").insert({
        quiz_id: quizId,
        event_type: event as ProjectEvent,
        meta: body.meta ?? null,
        session_id: sessionId,
      });
      if (insErr) console.error("[track] quiz_events insert failed", event, insErr);

      // Log business_event pour les events à forte valeur (complete,
      // share). On NE LOG PAS view/start (très haute fréquence — Wall
      // of Wins les lit directement depuis quiz_events). Fire-and-forget,
      // strictement non-bloquant pour le visiteur. Cf. ROADMAP_RETENTION
      // phase 1.5.
      if ((event === "complete" || event === "share") && !insErr) {
        void logBusinessEventForQuizFunnel(quizId, event, sessionId).catch(
          (err) => {
            console.error("[track] logBusinessEvent failed", event, err);
          },
        );
      }

      const res = ok({ event });
      if (needSetCookie) attachSessionCookie(res, sessionId);
      return res;
    }

    // ─── Per-question events (granularité funnel) ────────────────────
    if ((QUESTION_EVENTS as readonly string[]).includes(event)) {
      const qIdx = Number(body.questionIndex);
      if (!Number.isInteger(qIdx) || qIdx < 0 || qIdx >= 200) {
        return silent("bad_question_index");
      }
      // Pas de dédup ici : on veut voir chaque vue de question (un
      // visiteur qui revient en arrière puis re-avance produit 2
      // vues sur Q3, et c'est légitime).
      await supabaseAdmin.from("quiz_question_events").insert({
        quiz_id: quizId,
        question_index: qIdx,
        session_id: sessionId,
        event: QUESTION_EVENT_DB[event as QuestionEvent],
      });
      const res = ok({ event, q: qIdx });
      if (needSetCookie) attachSessionCookie(res, sessionId);
      return res;
    }

    return silent("unknown_event");
  } catch (e) {
    // Best-effort analytics — never fail the visitor experience.
    // On logge serveur pour pouvoir diagnostiquer si le tracking
    // ne marche plus, mais on retourne 200 au client.
    console.error("[track POST] unhandled exception", e);
    return ok({ degraded: true });
  }
}
