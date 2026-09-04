// app/api/generateurs/route.ts
//
// LES TROIS GÉNÉRATEURS : le bonus post-quiz, la séquence d'emails
// post-quiz, et les contenus qui font passer le quiz.
//
// Béné, 1er septembre 2026 : "pour les générateurs oui on va le faire
// pour les membres + et les beta/lifetime, ça doit être visible pour les
// membres gratuits et sans plus. On doit le faire bien."
//
// -- CHEZ TIPOTE : TOUT COMPTE PAYANT, ET ÇA CONSOMME DES CRÉDITS ------
//
// Béné a tranché le 1er septembre : "dispo pour tout le monde qui paye,
// mais consomme des crédits."
//
// Le gate est donc `isPaidPlan`, et pas une fonctionnalité de palier :
// c'est littéralement ce qu'elle dit, et cette fonction est PERMISSIVE
// par construction (tout ce qui n'est pas `free` passe), donc un palier
// ajouté en base demain n'enferme personne dehors par accident.
//
// Le barème vit dans `lib/generateurs/credits.ts`, avec le calcul qui
// l'a produit. Deux règles ici :
//   - ON VÉRIFIE LE SOLDE AVANT D'APPELER ANTHROPIC. L'inverse, c'est
//     payer un appel pour refuser ensuite.
//   - ON DÉBITE APRÈS LE SUCCÈS. Débiter d'avance, c'est facturer une
//     génération qui n'a rien rendu, et c'est le genre d'écart qu'une
//     cliente ne pardonne pas sur un compteur.
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
import { isPaidPlan } from "@/lib/planLimits";
import { consumeCredits, ensureUserCredits } from "@/lib/credits";
import { COUT_PISTES, coutMorceau } from "@/lib/generateurs/credits";
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
import {
  BLOCS,
  MAX_PIECES,
  morceauParProfil,
  piecesDeLaPiste,
  type Piste,
} from "@/lib/generateurs/blocs";
import { passeParLesPistes } from "@/lib/generateurs/sequences";
import { MAX_TRANCHES, longueurDuMorceau } from "@/lib/generateurs/longueurSortie";
import { rangerMorceau } from "@/lib/generateurs/contenusStore";
import {
  FORMATS_OFFRE,
  PLANS_BONUS,
  DECLENCHEURS,
  couvertureDesOffres,
  type Offre,
} from "@/lib/generateurs/offre";
import { construireBriefQuiz, type BriefQuiz } from "@/lib/generateurs/briefQuiz";
import { SOCLE_GENERATEURS } from "@/lib/prompts/generateurs/socle";
import {
  consigneDuQuiz,
  consignePistes,
  consigneUnePisteDePlus,
  consigneProduction,
  lienQuizAutorise,
  messagePourLeModele,
} from "@/lib/prompts/generateurs/consignes";
import { cleAnthropic } from "@/lib/ai/cleAnthropic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const offreSchema = z.object({
  promesse: z.string().max(600).default(""),
  format: z.enum(FORMATS_OFFRE).default("formation"),
  prix: z.string().max(120).default(""),
  /** Les profils que CETTE offre sert. Vide hors du plan à offres multiples. */
  profils: z.array(z.number().int().min(0).max(29)).max(30).default([]),
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
  /**
   * LES OFFRES. Plusieurs, une par profil, depuis le 3 septembre 2026
   * (Béné : "exactement la même chose sur l'atelier et sur tiquiz").
   */
  offres: z.array(offreSchema).max(12).optional(),
  plan: z.enum(PLANS_BONUS).default("commun"),
  declencheur: z.enum(DECLENCHEURS).default("completion"),
  /** 0-based, dans l'ordre des profils du quiz. */
  profilIndex: z.number().int().min(0).max(29).optional(),
};

const schema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("pistes"), ...communSchema }),
  z.object({
    // UNE PISTE DE PLUS. `connues` part dans le prompt : une génération
    // payée pour un doublon de ce qu'elle a déjà sous les yeux serait la
    // pire dépense possible.
    step: z.literal("encore"),
    ...communSchema,
    connues: z
      .array(z.object({ format: z.string().max(200), titre: z.string().max(300) }))
      .max(12),
  }),
  z.object({
    step: z.literal("produire"),
    ...communSchema,
    /**
     * La piste choisie. ABSENTE sur les générateurs à plan fixe (emails,
     * promotion) : là il n'y a pas de piste, il y a une séquence.
     */
    piste: pisteSchema.optional(),
    /**
     * TOUTES les pistes proposées, pour pouvoir REPRENDRE le projet
     * depuis la bibliothèque. Elles ne partent pas au modèle : elles
     * sont enregistrées avec le morceau, sinon rouvrir un contenu
     * afficherait une étape des pistes vide et il faudrait les repayer.
     */
    pistes: z.array(pisteSchema).max(6).optional(),
    /** Le rang du morceau DANS la piste, 0-based. */
    pieceIndex: z.number().int().min(0).max(19),
    /**
     * LE TEXTE DÉJÀ ÉCRIT, quand on demande la SUITE.
     *
     * Béné, 4 septembre 2026 : "rien ne doit tronqué ni annulé". Un
     * morceau plus long qu'une tranche ne se coupe donc pas : le modèle
     * reprend exactement là où il s'est arrêté, et on recolle.
     *
     * C'est le client qui le renvoie, parce que c'est le serveur qui
     * vient de le lui écrire : il repart dans SON prompt, sur SON
     * compte. On le borne en taille, c'est tout.
     */
    suiteDe: z.string().max(120_000).optional(),
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

  // La cle se lit par `cleAnthropic()`, qui essaie les trois noms qui
  // circulent dans ce depot. Cette route ne lisait que
  // `ANTHROPIC_API_KEY` : elle etait la SEULE fonction IA incapable de
  // trouver une cle posee sous un autre nom, et elle annoncait "pas
  // disponible pour le moment".
  const apiKey = cleAnthropic();
  if (!apiKey) {
    console.error("[generateurs] aucune cle Anthropic posee sur le serveur");
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
  if (!isPaidPlan(plan)) {
    return NextResponse.json({ ok: false, reason: "plan_required" }, { status: 403 });
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
  let offres: Offre[] = [];
  if (demandeUneOffre(id)) {
    const brutes = (input.offres ?? []).filter((o) => o.promesse.trim().length > 0);
    if (brutes.length === 0) return refus("offre_manquante");
    offres = brutes.map((o) => ({
      promesse: o.promesse,
      format: o.format,
      prix: o.prix,
      profils: o.profils,
    }));

    // CHAQUE PROFIL DOIT ÊTRE RELIÉ À UNE OFFRE, ET LE SERVEUR TRANCHE.
    //
    // L'écran prévient déjà, mais un bonus écrit pour un profil qui ne
    // mène nulle part fait travailler la créatrice pour rien : mieux
    // vaut un refus qui dit quoi corriger. Même geste que l'Atelier
    // (`analyzeOfferCoverage` puis 409).
    const couverture = couvertureDesOffres(input.plan, offres, brief.profils.length);
    if (!couverture.ok) {
      return refus("couverture_offres", {
        sansOffre: couverture.sansOffre,
        enDouble: couverture.enDouble,
      });
    }
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

  async function appelUnique(
    fixe: string,
    variable: string,
    message: string,
    maxTokens: number,
    /**
     * LE TEXTE DÉJÀ ÉCRIT, quand on demande la SUITE.
     *
     * Posé en dernier message `assistant`, le modèle REPREND là où ça
     * s'arrête au lieu de recommencer. C'est ce qui permet de rendre un
     * contenu plus long qu'une tranche sans le couper ni le jeter.
     *
     * L'API refuse un prefill qui finit par une espace : d'où le
     * `trimEnd` chez l'appelant.
     */
    prefill?: string,
  ): Promise<Sortie> {
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
            // ── TROIS BLOCS, DU PLUS STABLE AU MOINS STABLE ──
            //
            // Le cache d'Anthropic est un préfixe EXACT : le premier
            // octet qui change invalide tout ce qui suit. L'ordre n'est
            // donc pas une préférence de lecture, c'est ce qui décide de
            // ce qui se met en cache.
            //
            //   1. LE SOCLE. Le même pour les trois générateurs, pour
            //      toutes les créatrices, dans toutes les langues.
            //      2841 jetons, UNE entrée de cache pour tout le monde.
            //   2. LA CONSIGNE FIXE. Ce qu'on demande d'écrire, sans un
            //      seul fait dedans : il y en a 21 en tout (3 blocs du
            //      bonus, 5 emails, 7 contenus de promo, 3+3 pour les
            //      pistes). Chacune est la MÊME pour tout le monde.
            //   3. LA LANGUE ET LE TON. Des règles, mais qui dépendent
            //      de SON quiz : après le dernier point de cache. Les
            //      mettre avant multiplierait les entrées par les 100
            //      langues du catalogue pour gagner 74 jetons.
            //
            // Les FAITS (son brief, ses offres, le profil, la piste
            // qu'elle a choisie, l'adresse de son quiz) vivent dans le
            // MESSAGE, pas ici. C'est ce qui rend le bloc 2 identique
            // d'une créatrice à l'autre, donc cachable : avant le
            // 4 septembre il portait la piste et le profil, donc AUCUNE
            // des 21 consignes n'était la même deux fois.
            //
            // TTL : 5 minutes, le défaut, et c'est un choix. Une lecture
            // RELANCE le compteur sans rien coûter : dès que deux appels
            // qui partagent le préfixe partent à moins de 5 minutes
            // d'écart, l'entrée ne meurt jamais. Le TTL d'une heure
            // coûte 2x à l'écriture au lieu de 1,25x et n'achète rien
            // dans ce cas là. Il ne se justifierait que sur un trafic
            // CREUX (moins d'un appel toutes les 5 minutes) ET avec au
            // moins 3 lectures par entrée : à mesurer avant de changer,
            // jamais par principe.
            system: [
              {
                type: "text",
                text: SOCLE_GENERATEURS,
                cache_control: { type: "ephemeral" },
              },
              {
                type: "text",
                text: fixe,
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: variable },
            ],
            messages: prefill
              ? [
                  { role: "user", content: message },
                  { role: "assistant", content: prefill },
                ]
              : [{ role: "user", content: message }],
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

    // ON NE ROGNE PAS UNE SUITE. Sur une continuation, le modèle rend
    // souvent le saut de ligne qui ouvre le paragraphe suivant : le
    // `trim` le mangerait et recollerait "...fin de phrase.## Titre".
    const assemble = (data?.content ?? []).map((c) => c.text ?? "").join("");
    const brut = prefill ? assemble.replace(/\s+$/, "") : assemble.trim();
    if (!brut) {
      console.error("[generateurs] reponse vide", data?.stop_reason ?? "");
      return { ok: false, failure: "empty" };
    }
    return { ok: true, texte: brut, tronque: data?.stop_reason === "max_tokens" };
  }

  /** Le même appel, avec les reprises sur saturation. */
  async function appeler(
    fixe: string,
    variable: string,
    message: string,
    maxTokens: number,
    prefill?: string,
  ): Promise<Sortie> {
    let out = await appelUnique(fixe, variable, message, maxTokens, prefill);
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      if (out.ok || !isRetryable(out.failure)) return out;
      const wait = retryDelayMs(attempt, out.retryAfter);
      // 45 s : ce qu'il faut au morceau le plus long pour aboutir.
      // Relancer plus tard, c'est une coupure sans une seule ligne.
      if (budgetLeft() < wait + 45_000) return out;
      console.warn("[generateurs] sature, reprise dans", wait, "ms");
      await new Promise((r) => setTimeout(r, wait));
      out = await appelUnique(fixe, variable, message, maxTokens, prefill);
    }
    return out;
  }

  // ── LES CRÉDITS ──
  //
  // On VÉRIFIE avant d'appeler Anthropic, on DÉBITE après le succès.
  // Entre les deux, rien n'est réservé : deux onglets ouverts peuvent
  // donc passer le contrôle et débiter deux fois. C'est assumé, et c'est
  // le bon sens de l'erreur : une réservation qu'un plantage laisserait
  // en place retirerait des crédits pour une génération qui n'a jamais
  // eu lieu, et personne ne saurait les rendre.
  async function soldeSuffisant(cout: number): Promise<boolean> {
    try {
      const solde = await ensureUserCredits(user!.id);
      return solde.total_remaining >= cout;
    } catch (err) {
      // On ne BLOQUE PAS sur une panne du compteur : elle a payé son
      // abonnement, et lui refuser l'outil parce qu'une table ne répond
      // pas serait la punir d'une panne qui n'est pas la sienne. Ça crie
      // dans le journal.
      console.error("[generateurs] lecture des credits impossible :", err);
      return true;
    }
  }

  async function debiter(cout: number, contexte: Record<string, unknown>) {
    try {
      await consumeCredits(user!.id, cout, { feature: "generateurs", ...contexte });
    } catch (err) {
      // Le contenu est déjà écrit et il part à l'écran : un débit raté
      // ne le retient pas. On perd quelques crédits, pas un livrable.
      console.error("[generateurs] debit impossible :", err);
    }
  }

  // ── ÉTAPE 1 : les pistes ──
  if (input.step === "pistes") {
    // ELLES N'EXISTENT QUE POUR LE BONUS (Béné, 2 septembre 2026 : "le
    // générateur d'emails ne génère pas 'des pistes' mais des emails").
    // Un écran resté sur l'ancienne version dépenserait des CRÉDITS
    // pour rien : on refuse AVANT de regarder le solde.
    if (!passeParLesPistes(id)) return refus("pas_de_pistes");
    if (!(await soldeSuffisant(COUT_PISTES))) {
      return refus("credits", { requis: COUT_PISTES });
    }
    const out = await appeler(
      consignePistes(id),
      consigneDuQuiz(brief),
      messagePourLeModele({
        brief,
        offres,
        plan: input.plan,
        declencheur: input.declencheur,
        // À L'ÉTAPE DES PISTES ON N'ÉCRIT POUR PERSONNE ENCORE : on
        // montre la carte complète des offres, pour que le format
        // proposé tienne pour tous les profils.
        profilIndex: null,
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
    await debiter(COUT_PISTES, { step: "pistes", generateur: id, quiz_id: input.quizId });
    return NextResponse.json({ ok: true, ...pistes, credits: COUT_PISTES });
  }

  // ── ÉTAPE 1 BIS : une piste de PLUS ──
  //
  // Elle s'AJOUTE aux trois, elle ne les remplace pas. Remplacer, c'est
  // faire cliquer quelqu'un qui craint de perdre ce qu'il a sous les
  // yeux, donc c'est un bouton sur lequel on ne clique jamais.
  if (input.step === "encore") {
    if (!passeParLesPistes(id)) return refus("pas_de_pistes");
    // ON VÉRIFIE LE SOLDE AVANT D'APPELER ANTHROPIC, et on débite APRÈS
    // le succès : l'inverse facture une génération qui n'a rien rendu.
    if (!(await soldeSuffisant(COUT_PISTES))) {
      return refus("credits", { requis: COUT_PISTES });
    }
    const out = await appeler(
      // LA PARTIE FIXE EST CELLE DES PISTES, à l'octet près : les deux
      // étapes partagent donc une seule entrée de cache. Ce qu'elle a
      // déjà sous les yeux est un FAIT, il part avec le reste.
      consignePistes(id),
      [consigneDuQuiz(brief), consigneUnePisteDePlus(id, input.connues)].join("\n\n"),
      messagePourLeModele({
        brief,
        offres,
        plan: input.plan,
        declencheur: input.declencheur,
        profilIndex: null,
        demande: "Propose moi UNE piste de plus, différente des précédentes.",
      }),
      // 800 et pas 2200 : on rend une piste, pas trois. Le budget de
      // sortie est la moitié du levier "limiter la conso", l'autre
      // moitié étant le déclenchement au clic.
      800,
    );
    if (!out.ok) return refus(out.failure);

    const lues = lirePistes(id, `{"pistes":[${extraireObjet(out.texte)}]}`);
    const piste = lues?.pistes[0];
    if (!piste) {
      // ON N'AFFICHE JAMAIS DE JSON À UNE CRÉATRICE (règle du 3 août).
      console.error("[generateurs] piste supplementaire illisible :", out.texte.slice(0, 1500));
      return refus("unreadable");
    }
    await debiter(COUT_PISTES, { step: "encore", generateur: id, quiz_id: input.quizId });
    return NextResponse.json({ ok: true, piste, credits: COUT_PISTES });
  }

  // ── ÉTAPE 2 : un morceau ──
  // Sur un générateur à plan fixe, `piecesDeLaPiste` ignore ce que
  // l'écran déclare et rend la séquence.
  const piste: Piste = {
    titre: input.piste?.titre ?? "",
    format: input.piste?.format ?? "",
    punchline: input.piste?.punchline ?? "",
    pourquoi: input.piste?.pourquoi ?? "",
    tempsParPersonne: "",
    pieces: piecesDeLaPiste(id, input.piste?.pieces),
  };
  const piece = piste.pieces[input.pieceIndex];
  if (!piece) return refus("piece_inconnue");

  // ── LE BONUS DÉCLINÉ ÉCRIT SON CONTENU POUR UN PROFIL ──
  //
  // `demandeUnProfil` répond non pour le bonus, et c'est juste : le
  // profil ne se choisit pas dans les réglages, il se choisit dans le
  // DOSSIER, morceau par morceau. Mais le CONTENU d'un bonus décliné
  // s'écrit une fois par profil, et le serveur l'ignorait : il rendait
  // trois fois le même texte pendant que l'écran le rangeait sous trois
  // clés différentes. Trois clics, trois générations, un seul contenu.
  const morceauPourUnProfil = morceauParProfil(id, input.plan, piece.bloc);
  if (morceauPourUnProfil) {
    const i = input.profilIndex ?? -1;
    profilChoisi = brief.profils[i] ?? null;
    if (!profilChoisi) return refus("profil_manquant");
  }

  // ── UNE SUITE N'EST PAS UN NOUVEAU MORCEAU, DONC ELLE NE SE PAIE PAS ──
  //
  // Un morceau long s'écrit en plusieurs tranches (voir plus bas). Le
  // faire payer à chaque tranche reviendrait à facturer la longueur,
  // c'est à dire à punir un contenu riche : elle a demandé UN morceau,
  // elle en paie UN. On ne réclame donc le solde qu'à la première.
  const suiteDemandee = Boolean(input.suiteDe && input.suiteDe.trim());
  const cout = coutMorceau(piece.bloc);
  if (!suiteDemandee && !(await soldeSuffisant(cout))) {
    return refus("credits", { requis: cout });
  }

  // ── LA LONGUEUR VIT DANS `longueurSortie.ts`, ET ELLE NE RABOTE RIEN ──
  //
  // La fourchette de mots est une consigne ÉDITORIALE (un email de
  // 250 mots doit faire 250 mots parce que c'est la bonne longueur d'un
  // email), et `trancheMax` est la taille d'UNE tranche d'écriture, pas
  // la longueur du contenu. Ce qui dépasse s'écrit dans la tranche
  // suivante.
  const longueur = longueurDuMorceau(id, piece.bloc);

  const consigneFixe = consigneProduction({ id, piece });
  const consigneVariable = consigneDuQuiz(brief);
  const message = messagePourLeModele({
    brief,
    offres,
    plan: input.plan,
    declencheur: input.declencheur,
    // ICI on écrit pour UN profil, donc c'est SON offre qui part.
    profilIndex: typeof input.profilIndex === "number" ? input.profilIndex : null,
    profil: profilChoisi,
    // L'ADRESSE DU QUIZ NE SORT QUE LÀ OÙ ELLE DOIT APPARAÎTRE : le
    // contenu d'un bonus se lit hors ligne, y coller le lien
    // renverrait le lecteur vers le quiz qu'il vient de finir.
    lienQuiz: lienQuizAutorise(id, piece.bloc) ? brief.urlPublique : "",
    piste: piste.titre || piste.format || piste.punchline ? piste : null,
    demande: "Produis ce morceau, et rien d'autre.",
  });

  // ── RIEN N'EST TRONQUÉ, RIEN N'EST ANNULÉ ──
  //
  // Béné, 4 septembre 2026 : "si la sortie doit faire 20000 mots ben
  // elle en 20000 c'est tout. Un email qui demande à faire XX mots ben
  // il sort XX mots, on ne détruit jamais la qualité."
  //
  // Un morceau plus long qu'une tranche ne se coupe donc pas et ne se
  // refuse pas : le modèle REPREND là où il s'est arrêté (le texte déjà
  // écrit part en dernier message `assistant`) et on recolle. La limite
  // n'est pas une limite de contenu : c'est le temps qu'une requête a
  // le droit de durer.
  //
  // `suiteDe` : la SUITE demandée par l'écran quand une tranche n'a pas
  // suffi. Ce qui a déjà été écrit n'est jamais réécrit, donc jamais
  // repayé.
  const dejaEcrit = (input.suiteDe ?? "").replace(/\s+$/, "");
  let texte = dejaEcrit;
  let complet = false;

  for (let tranche = 0; tranche < MAX_TRANCHES; tranche++) {
    const out = await appeler(
      consigneFixe,
      consigneVariable,
      message,
      longueur.trancheMax,
      texte || undefined,
    );
    // UN ÉCHEC NE JETTE PAS CE QUI EST DÉJÀ ÉCRIT. Sur la première
    // tranche il n'y a rien à sauver, on dit ce qui s'est passé ; sur
    // une suite, on rend ce qu'on a et l'écran propose de continuer.
    if (!out.ok) {
      if (!texte) return refus(out.failure);
      break;
    }
    texte += out.texte;
    if (!out.tronque) {
      complet = true;
      break;
    }
    // Une tranche de plus dans la MÊME requête seulement s'il reste de
    // quoi l'écrire : sinon elle sortirait vide, et c'est l'écran qui
    // enchaîne, sans rien perdre.
    if (budgetLeft() < 45_000) break;
    console.warn("[generateurs] le morceau continue, tranche suivante");
  }

  // ON NE DÉBITE QUE LA PREMIÈRE TRANCHE. Une suite prolonge un morceau
  // déjà payé ; la facturer reviendrait à faire payer la longueur.
  if (!suiteDemandee) {
    await debiter(cout, {
      step: "produire",
      generateur: id,
      quiz_id: input.quizId,
      bloc: piece.bloc,
    });
  }

  const markdown = sanitizeAiText(texte);

  // ── ON RANGE LE MORCEAU TOUT DE SUITE ──
  //
  // Un contenu généré ne vivait que dans l'onglet : un rafraîchissement,
  // et le travail était perdu ET FACTURÉ EN CRÉDITS. On enregistre APRÈS
  // chaque morceau et pas à la fin : une génération dure une minute et
  // demie, et l'onglet fermé au septième ne doit pas tout emporter.
  //
  // ET ON RANGE DE QUOI REPRENDRE (3 septembre 2026). Sans le brief ni
  // la piste, la bibliothèque LISAIT le travail sans pouvoir le
  // continuer : corriger un email ou écrire le contenu du 3e profil
  // demandait de tout resaisir et de REPAYER les pistes, donc des
  // crédits.
  await rangerMorceau(
    {
      userId: user.id,
      projectId: (quiz as { project_id?: string | null }).project_id ?? null,
      generateur: id,
      quizId: input.quizId,
      quizTitre: brief.titre,
      titre: piste.titre,
      // LA LIGNE EST LE PROJET, PAS LE PROFIL, dès que le générateur ne
      // choisit pas son profil dans ses réglages. Sur un bonus décliné,
      // mettre le contenu dans une ligne par profil séparerait un guide
      // de son contenu, et la reprise rouvrirait un projet à moitié. Le
      // profil vit donc sur le MORCEAU.
      profilIndex: demandeUnProfil(id) ? (input.profilIndex ?? null) : null,
      profilTitre: profilChoisi?.titre ?? "",
      projet: {
        brief: { plan: input.plan, declencheur: input.declencheur, offres },
        pistes: (input.pistes ?? []).map((p) => ({ ...p, tempsParPersonne: "" })),
        piste: input.piste ? { ...input.piste, tempsParPersonne: "" } : null,
      },
    },
    {
      bloc: piece.bloc,
      index: piece.index,
      cle: piece.cle,
      markdown,
      // `tronque` veut dire "il reste de la suite à écrire", plus "on
      // t'a rendu un texte coupé" : l'écran enchaîne tout seul, et le
      // morceau enregistré porte toujours TOUT ce qui a été écrit.
      tronque: !complet,
      profil: morceauPourUnProfil ? (input.profilIndex ?? null) : null,
    },
  );

  return NextResponse.json({
    ok: true,
    bloc: piece.bloc,
    index: piece.index,
    cle: piece.cle,
    credits: cout,
    markdown,
    // IL RESTE DE LA SUITE : l'écran rappelle la route avec `suiteDe`
    // et le texte grandit. Rien n'est perdu entre deux tranches, le
    // morceau est déjà enregistré avec tout ce qui a été écrit.
    complet,
    tronque: !complet,
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
/**
 * Le JSON d'une réponse, dégagé de ce qui l'entoure.
 *
 * Un modèle enrobe volontiers son objet d'un bloc de code ou d'une
 * phrase de politesse, malgré la consigne. Ce dégrossissage vivait dans
 * `lirePistes` ; il est sorti pour que la relance le partage, plutôt que
 * d'en écrire une deuxième copie qui divergerait.
 */
function extraireObjet(brut: string): string {
  let json = brut.trim();
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) json = fence[1]!.trim();
  if (!json.startsWith("{")) {
    const s = json.indexOf("{");
    const e = json.lastIndexOf("}");
    if (s >= 0 && e > s) json = json.slice(s, e + 1);
  }
  return json;
}

function lirePistes(
  id: GenerateurId,
  brut: string,
): { pistes: Piste[]; recommandee: number; pourquoiRecommandee: string } | null {
  const json = extraireObjet(brut);

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
          // VIDE dans le cas normal : le socle interdit déjà ce qui
          // demande son temps par personne. Quand ce n'est pas vide, la
          // carte l'affiche en avertissement.
          tempsParPersonne: txt(o.tempsParPersonne),
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
