// app/api/generateurs/route.ts
//
// LES TROIS GÉNÉRATEURS : le bonus post-quiz, la séquence d'emails
// post-quiz, et les contenus qui font passer le quiz.
//
// Béné, 1er septembre 2026 : "pour les générateurs oui on va le faire
// pour les membres + et les beta/lifetime, ça doit être visible pour les
// membres gratuits et sans plus. On doit le faire bien."
//
// -- LE PALIER N'EST PAS LE MÊME QUE CHEZ TIQUIZ, ET C'EST À TRANCHER --
//
// Sa phrase parle des plans "PLUS", qui sont le vocabulaire de Tiquiz.
// Tipote n'en a pas : ses paliers sont free / basic / pro / elite / beta,
// et il n'est pas encore en vente. On gate donc sur `analyseStatistiques`,
// c'est à dire EXACTEMENT le palier qui ouvre déjà l'analyse IA des
// statistiques : gratuit exclu, tout ce qui est payant inclus.
//
// Deux choses restent à décider par Béné, pas par le code :
//   - si les générateurs doivent consommer des CRÉDITS IA (Tipote en a,
//     Tiquiz non). Ils n'en consomment aucun aujourd'hui ;
//   - si elle veut les réserver à un palier plus haut (pro, elite).
//
// -- CE QUE LE CLIENT N'ENVOIE PAS, ET C'EST L'ESSENTIEL --------------
//
// Il envoie un `quizId`, une offre et une piste. Le TITRE du quiz, son
// intro, son ton, sa langue, ses profils et son adresse publique sont
// relus ICI, à chaque appel. Sans ça, n'importe qui pourrait annoncer un
// autre quiz que le sien et faire écrire du contenu sur des profils qui
// ne lui appartiennent pas, et deux générateurs lancés sur le même quiz
// partiraient de faits différents.
//
// -- DEUX ÉTAPES, ET UN MORCEAU À LA FOIS -----------------------------
//
// Voir `lib/generateurs/blocs.ts` : une campagne demandée d'un seul coup
// est sortie EN JSON BRUT devant des élèves de l'Atelier le 3 août, la
// réponse ayant été coupée à la limite de tokens.
//
// -- LES REFUS RÉPONDENT 200, ET LA RAISON EST DANS LE CORPS ----------
//
// Cloudflare sert nos six domaines et REMPLACE le corps d'un 5xx par sa
// propre page : `res.json()` échoue côté navigateur, `reason` vaut
// `undefined`, et l'écran retombe sur sa phrase générique (mesuré deux
// fois le 31 août). Écrire `lib/aiFailure.ts` pour rien, autrement dit.
// Les 4xx restent : ils passent intacts et ils disent la bonne chose.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveAnthropicModel } from "@/lib/anthropicModel";
import { buildClaudeMessageBody } from "@/lib/claudeRequest";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";
import { checkRateLimit } from "@/lib/aiRateLimit";
import { MAX_ATTEMPTS, retryDelayMs } from "@/lib/aiRetry";
import {
  classifyThrown,
  classifyUpstream,
  isRetryable,
  type AiFailure,
} from "@/lib/aiFailure";
import { resolveAppUrl } from "@/lib/authLinks";
import { getPlanLimits, isPaidPlan } from "@/lib/planLimits";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { echapperMotifLike } from "@/lib/db/motifLike";
import { sanitizeSlug } from "@/lib/quizBranding";
import { urlPubliqueProjet } from "@/lib/quiz/urlPublique";
import {
  GENERATEURS,
  blocageGenerateur,
  demandeUnProfil,
  demandeUneOffre,
  type GenerateurId,
} from "@/lib/generateurs/catalogue";
import { BLOCS, MAX_PIECES, piecesDeLaPiste, type Piste } from "@/lib/generateurs/blocs";
import { FORMATS_OFFRE, type Offre } from "@/lib/generateurs/offre";
import { construireBriefQuiz, type BriefQuiz } from "@/lib/generateurs/briefQuiz";
import { SOCLE_GENERATEURS } from "@/lib/prompts/generateurs/socle";
import {
  consignePistes,
  consigneProduction,
  messagePourLeModele,
} from "@/lib/prompts/generateurs/consignes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const offreSchema = z.object({
  promesse: z.string().max(600).default(""),
  format: z.enum(FORMATS_OFFRE).default("formation"),
  prix: z.string().max(120).default(""),
});

const pisteSchema = z.object({
  titre: z.string().max(300),
  format: z.string().max(160).default(""),
  punchline: z.string().max(600).default(""),
  pourquoi: z.string().max(600).default(""),
  pieces: z
    .array(
      z.object({
        bloc: z.enum(BLOCS),
        index: z.number().int().min(1).max(20),
        resume: z.string().max(400).default(""),
      }),
    )
    .max(20)
    .default([]),
});

const communSchema = {
  generateur: z.enum(GENERATEURS),
  quizId: z.string().uuid(),
  offre: offreSchema.optional(),
  /** 0-based, dans l'ordre des profils du quiz. */
  profilIndex: z.number().int().min(0).max(29).optional(),
};

const schema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("pistes"), ...communSchema }),
  z.object({
    step: z.literal("produire"),
    ...communSchema,
    piste: pisteSchema,
    /** Le rang du morceau DANS la piste, 0-based. */
    pieceIndex: z.number().int().min(0).max(19),
  }),
]);

/** Un refus métier : 200, la raison dans le corps (cf. l'en-tête). */
function refus(reason: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, reason, ...(extra ?? {}) });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("[generateurs] ANTHROPIC_API_KEY absente");
    return refus("not_configured");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "bad_input" }, { status: 400 });
  }
  const input = parsed.data;
  const id: GenerateurId = input.generateur;

  // ── LE PLAN ──
  //
  // "Visible pour les membres gratuits et sans plus, s'ils veulent s'en
  // servir on leur propose d'upgrader" : l'ÉCRAN montre, la ROUTE
  // refuse. Un gate posé seulement à l'écran laisse la porte ouverte,
  // et c'est par l'API qu'on récupère le contenu.
  // DEUX TABLES, ET C'EST LA DIFFÉRENCE AVEC TIQUIZ : chez Tipote le
  // palier vit dans `profiles` et la forme d'adresse par défaut dans
  // `business_profiles`. Les demander ensemble ferait échouer TOUT le
  // select sur une colonne inconnue, donc répondre "introuvable" sur un
  // quiz qui existe.
  const [{ data: profil }, { data: bp }] = await Promise.all([
    supabaseAdmin.from("profiles").select("plan").eq("user_id", user.id).maybeSingle(),
    supabaseAdmin
      .from("business_profiles")
      .select("address_form")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const plan = (profil as { plan?: string | null } | null)?.plan ?? null;
  if (!getPlanLimits(plan).analyseStatistiques) {
    return NextResponse.json(
      { ok: false, reason: "plan_required", showUpsell: !isPaidPlan(plan) },
      { status: 403 },
    );
  }

  // ── LA LIMITE ──
  //
  // Une génération complète, c'est un appel de pistes plus jusqu'à huit
  // morceaux. La fenêtre est donc large en NOMBRE mais courte en temps :
  // elle attrape la boucle, pas le travail normal d'un après-midi.
  const verdict = checkRateLimit({
    key: `generateurs:${user.id}`,
    limit: 40,
    windowMs: 60 * 60 * 1000,
  });
  if (!verdict.ok) {
    return refus("rate_limited", { retryAfterSec: verdict.retryAfterSec });
  }

  // ── LE QUIZ, RELU CÔTÉ SERVEUR ──
  // `select("*")` ET PAS UNE LISTE DE COLONNES, et c'est délibéré.
  //
  // Le brief lit des colonnes venues de migrations différentes. Nommer
  // celles ci ferait échouer la requête ENTIÈRE si l'une n'est pas encore
  // passée en prod (PostgREST rejette tout le select), donc répondre
  // "introuvable" sur un quiz qui existe et qui tourne. C'est le
  // raisonnement de la fiche affilié (31 août).
  //
  // Rien de cette ligne ne repart vers le navigateur : `construireBriefQuiz`
  // pioche les champs un par un. Aucun spread, jamais.
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("id", input.quizId)
    .maybeSingle();
  if (!quiz || (quiz as { user_id?: string }).user_id !== user.id) {
    // On ne distingue pas "supprimé" de "pas à toi" : ça révélerait
    // qu'un projet existe (règle du 1er septembre).
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const [{ data: resultats }, { count: nbQuestions }] = await Promise.all([
    supabaseAdmin
      .from("quiz_results")
      .select("title, description, sio_tag_name, sio_tag_names")
      .eq("quiz_id", input.quizId)
      .order("sort_order")
      .order("id"),
    supabaseAdmin
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", input.quizId),
  ]);

  const profils = (resultats ?? []) as {
    title?: string | null;
    description?: string | null;
  }[];

  // ── CE GÉNÉRATEUR PEUT-IL TOURNER SUR CE PROJET ? ──
  //
  // L'écran le dit déjà, mais un écran ne protège de rien : sans ce
  // contrôle, une séquence d'emails demandée sur un sondage ferait
  // inventer au modèle des profils qui n'existent pas.
  const blocage = blocageGenerateur(id, {
    mode: (quiz as { mode?: string | null }).mode,
    profils: profils.map((r) => ({ titre: r.title, description: r.description })),
    nbQuestions: nbQuestions ?? 0,
  });
  if (blocage) return refus(`blocage:${blocage}`);

  // ── L'ADRESSE PUBLIQUE ──
  //
  // Le domaine perso de la créatrice gagne : c'est celui qu'elle
  // partage, et un contenu de promotion qui porte le nôtre enverrait ses
  // lecteurs ailleurs que sur sa page. La règle du chemin vit dans
  // `lib/quiz/urlPublique.ts`, la même que l'éditeur.
  const { data: domaines } = await supabaseAdmin
    .from("custom_domains")
    .select("hostname, status")
    .eq("user_id", user.id)
    .ilike("status", echapperMotifLike("verified"))
    .order("created_at", { ascending: true })
    .limit(1);
  const domainePerso = String(
    (domaines ?? [])[0]?.hostname ?? "",
  ).trim();
  const slugBrut = String((quiz as { slug?: string | null }).slug ?? "").trim();
  const segment = (slugBrut ? sanitizeSlug(slugBrut) : null) ?? input.quizId;
  const urlPublique = urlPubliqueProjet({
    origine: domainePerso
      ? `https://${domainePerso}`
      : resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL, req.nextUrl.origin),
    kind: "q",
    segment,
    surDomainePerso: Boolean(domainePerso),
  });

  const brief: BriefQuiz = construireBriefQuiz({
    quiz: quiz as Parameters<typeof construireBriefQuiz>[0]["quiz"],
    resultats: (resultats ?? []) as Parameters<typeof construireBriefQuiz>[0]["resultats"],
    questions: new Array(nbQuestions ?? 0),
    urlPublique,
    adresseParDefaut: (bp as { address_form?: string | null } | null)?.address_form ?? null,
  });

  // ── LE PROFIL, QUAND LE GÉNÉRATEUR EN DEMANDE UN ──
  let profilChoisi = null as BriefQuiz["profils"][number] | null;
  if (demandeUnProfil(id)) {
    const i = input.profilIndex ?? -1;
    profilChoisi = brief.profils[i] ?? null;
    if (!profilChoisi) return refus("profil_manquant");
  }

  // ── L'OFFRE ──
  //
  // C'est la SEULE chose qu'elle saisit, et sans elle le bonus et la
  // séquence mènent nulle part : le modèle inventerait une offre qui
  // n'existe pas, et elle publierait une promesse qu'elle ne tient pas.
  let offre: Offre | null = null;
  if (demandeUneOffre(id)) {
    const brute = input.offre;
    if (!brute || !brute.promesse.trim()) return refus("offre_manquante");
    offre = { promesse: brute.promesse, format: brute.format, prix: brute.prix };
  }

  const model = resolveAnthropicModel(process.env.ANTHROPIC_MODEL, "sonnet");

  // UN BUDGET POUR TOUTE LA REQUÊTE, PAS PAR APPEL. Cloudflare coupe
  // vers 100 s et rend une page qu'on ne contrôle pas : deux minuteurs
  // bout à bout donneraient exactement ça.
  const deadline = Date.now() + 85_000;
  const budgetLeft = () => deadline - Date.now();

  type Sortie =
    | { ok: true; texte: string; tronque: boolean }
    | { ok: false; failure: AiFailure; retryAfter?: string | null };

  async function appelUnique(variable: string, message: string, maxTokens: number): Promise<Sortie> {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          buildClaudeMessageBody({
            model,
            max_tokens: maxTokens,
            temperature: 0.8,
            // LE SOCLE D'ABORD, MARQUÉ POUR LE CACHE, LA CONSIGNE
            // ENSUITE. Le cache d'Anthropic est un préfixe EXACT :
            // inverser les deux blocs ne cacherait plus rien, en
            // silence et à plein tarif.
            system: [
              {
                type: "text",
                text: SOCLE_GENERATEURS,
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: variable },
            ],
            messages: [{ role: "user", content: message }],
          }),
        ),
        signal: AbortSignal.timeout(Math.max(1_000, budgetLeft())),
      });
    } catch (err) {
      const failure = classifyThrown(err);
      console.error("[generateurs] appel interrompu :", failure, err);
      return { ok: false, failure };
    }

    if (!res.ok) {
      console.error("[generateurs] Anthropic", res.status, await res.text().catch(() => ""));
      return {
        ok: false,
        failure: classifyUpstream(res.status),
        retryAfter: res.headers.get("retry-after"),
      };
    }

    const data = (await res.json().catch(() => null)) as {
      content?: Array<{ text?: string }>;
      stop_reason?: string;
      usage?: {
        input_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    } | null;

    // LE CACHE SE VÉRIFIE, IL NE SE SUPPOSE PAS. Anthropic ne renvoie
    // AUCUNE erreur quand un préfixe est trop court ou qu'il a bougé :
    // il facture plein tarif, en silence. `write` non nul au premier
    // appel, puis `read` non nul sur les suivants. Si `read` reste à 0,
    // le socle a bougé, et on paie 1,25 fois le prix pour rien.
    const u = data?.usage;
    if (u) {
      console.log(
        `[generateurs] tokens entree=${u.input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
      );
    }

    const brut = (data?.content ?? []).map((c) => c.text ?? "").join("").trim();
    if (!brut) {
      console.error("[generateurs] reponse vide", data?.stop_reason ?? "");
      return { ok: false, failure: "empty" };
    }
    return { ok: true, texte: brut, tronque: data?.stop_reason === "max_tokens" };
  }

  /** Le même appel, avec les reprises sur saturation. */
  async function appeler(variable: string, message: string, maxTokens: number): Promise<Sortie> {
    let out = await appelUnique(variable, message, maxTokens);
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      if (out.ok || !isRetryable(out.failure)) return out;
      const wait = retryDelayMs(attempt, out.retryAfter);
      // 45 s : ce qu'il faut au morceau le plus long pour aboutir.
      // Relancer plus tard, c'est une coupure sans une seule ligne.
      if (budgetLeft() < wait + 45_000) return out;
      console.warn("[generateurs] sature, reprise dans", wait, "ms");
      await new Promise((r) => setTimeout(r, wait));
      out = await appelUnique(variable, message, maxTokens);
    }
    return out;
  }

  // ── ÉTAPE 1 : les pistes ──
  if (input.step === "pistes") {
    const out = await appeler(
      consignePistes(id, brief),
      messagePourLeModele({
        brief,
        offre,
        demande: "Propose moi les trois pistes maintenant.",
      }),
      2200,
    );
    if (!out.ok) return refus(out.failure);

    const pistes = lirePistes(id, out.texte);
    if (!pistes) {
      // ON N'AFFICHE JAMAIS DE JSON À UNE CRÉATRICE (règle du 3 août) :
      // le texte brut part dans le journal, l'écran dit que ça n'a pas
      // abouti et propose de relancer.
      console.error("[generateurs] pistes illisibles :", out.texte.slice(0, 1500));
      return refus("unreadable");
    }
    return NextResponse.json({ ok: true, ...pistes });
  }

  // ── ÉTAPE 2 : un morceau ──
  const piste: Piste = {
    ...input.piste,
    pieces: piecesDeLaPiste(id, input.piste.pieces),
  };
  const piece = piste.pieces[input.pieceIndex];
  if (!piece) return refus("piece_inconnue");

  // Le bonus est le plus long des trois ; les emails et les posts
  // tiennent largement en dessous, et un budget trop large ne rend pas
  // un texte meilleur, il rend un texte plus long.
  const maxTokens = piece.bloc === "contenu" ? 4200 : piece.bloc === "post" ? 900 : 1800;

  const out = await appeler(
    consigneProduction({ id, brief, piece, piste, profil: profilChoisi }),
    messagePourLeModele({
      brief,
      offre,
      demande: "Produis ce morceau, et rien d'autre.",
    }),
    maxTokens,
  );
  if (!out.ok) return refus(out.failure);

  return NextResponse.json({
    ok: true,
    bloc: piece.bloc,
    index: piece.index,
    markdown: sanitizeAiText(out.texte),
    // Un texte coupé à la limite reste utilisable : on le rend, mais on
    // le DIT. En silence, c'est une créatrice qui publie un contenu qui
    // s'arrête au milieu d'une phrase sans comprendre pourquoi.
    tronque: out.tronque,
  });
}

/**
 * Lit les pistes. `null` si on ne peut pas : l'appelant dit alors
 * franchement que ça n'a pas abouti.
 *
 * Tolérant sur la FORME (bloc de code, texte autour) : le modèle rend
 * parfois du Markdown malgré la consigne, et une piste jetée pour un
 * accent grave, c'est une génération payée pour rien.
 */
function lirePistes(
  id: GenerateurId,
  brut: string,
): { pistes: Piste[]; recommandee: number; pourquoiRecommandee: string } | null {
  let json = brut.trim();
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) json = fence[1].trim();
  if (!json.startsWith("{")) {
    const s = json.indexOf("{");
    const e = json.lastIndexOf("}");
    if (s >= 0 && e > s) json = json.slice(s, e + 1);
  }

  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const brutes = Array.isArray(obj.pistes) ? obj.pistes : [];
    const txt = (v: unknown) => (typeof v === "string" ? sanitizeAiText(v.trim()) : "");

    const pistes: Piste[] = brutes
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          titre: txt(o.titre),
          format: txt(o.format),
          punchline: txt(o.punchline),
          pourquoi: txt(o.pourquoi),
          pieces: piecesDeLaPiste(
            id,
            (Array.isArray(o.pieces) ? o.pieces : []) as { bloc?: unknown; resume?: unknown }[],
          ),
        };
      })
      // Sans titre, ce n'est pas une piste : mieux vaut le dire que
      // d'ajouter une carte vide à l'écran.
      .filter((p) => p.titre && p.pieces.length > 0 && p.pieces.length <= MAX_PIECES[id])
      // Trois, jamais plus : un modèle qui déborde ne doit pas pouvoir
      // assommer la créatrice.
      .slice(0, 3);

    if (pistes.length === 0) return null;
    const rec = Number(obj.recommandee);
    return {
      pistes,
      recommandee: Number.isInteger(rec) && rec >= 0 && rec < pistes.length ? rec : 0,
      pourquoiRecommandee: txt(obj.pourquoiRecommandee),
    };
  } catch {
    return null;
  }
}
