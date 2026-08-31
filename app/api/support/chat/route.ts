// app/api/support/chat/route.ts
//
// LE BOT DU CENTRE D'AIDE, POUR TIPOTE **ET** TIQUIZ.
//
// Béné, 6 août 2026 : "que le bot de l'aide sache exactement quoi
// répondre parce qu'il connaît par coeur le code de chaque app, où
// trouver, quoi répondre, comment guider."
//
// Sa base de connaissances (lib/support/knowledgeBase.ts) contient
// maintenant le TEXTE COMPLET des articles, pas seulement leurs titres.
// Avant, il avait un sommaire et aucun texte : on lui interdisait
// d'inventer tout en ne lui donnant rien, d'où ses réponses évasives.
//
// Pas d'authentification. Limité en débit pour éviter les abus.
//
// -- LA LANGUE NE FAIT JAMAIS ÉCHOUER UNE QUESTION (31 août 2026) -----
//
// Le corps était validé par `z.enum(["fr","en","es","it","ar"])`, cinq
// langues, alors que l'app en sert SEPT (`i18n/config.ts`). Le widget
// envoie la langue résolue par `resolveHelpLocale`, qui rend très bien
// `pt` ou `pt-BR` : zod refusait le corps ENTIER, la route répondait
// 400, et le widget affichait son message d'erreur générique.
//
// **Le robot d'aide était donc mort en portugais**, à chaque message, et
// le symptôme ne disait rien de la cause : ni "langue non gérée", ni une
// trace côté serveur, juste "une erreur est survenue".
//
// Deux corrections, et la deuxième est la vraie :
//
//   1. la langue est un `string` NORMALISÉ, plus un `enum`. Une
//      préférence d'affichage ne doit jamais faire échouer une question :
//      on retombe sur le français au lieu de refuser, et la huitième
//      langue ajoutée un jour ne cassera plus rien ;
//   2. une langue SANS prompt à elle reçoit le prompt ANGLAIS plus une
//      consigne de langue explicite. Le repli d'avant était le prompt
//      FRANÇAIS, qui dit "Réponds toujours en français" : un lecteur
//      portugais aurait été servi en français, ce qui est pire qu'une
//      erreur parce que ça a l'air de marcher.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";
import { buildSupportKnowledgeBase } from "@/lib/support/knowledgeBase";
import { checkRateLimit } from "@/lib/aiRateLimit";
import { normaliserLangueAide } from "@/lib/support/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(10)
    .optional(),
  // Un `string` et pas un `enum` : voir l'en-tête. Une langue inconnue
  // est NORMALISÉE, jamais refusée.
  // Un `string` et pas un `enum` : voir l'en-tête. Une langue inconnue
  // est NORMALISÉE, jamais refusée.
  locale: z.string().trim().max(10).optional(),
});

// 20 messages par adresse et par tranche de 5 minutes.
//
// C'est `lib/aiRateLimit.ts` et plus une Map locale : celle-ci n'avait
// AUCUN ramasse-miettes, donc elle gardait une entrée par adresse vue
// depuis le démarrage du processus, pour toujours. Sur une page PUBLIQUE
// (le centre d'aide n'exige aucun compte), c'est une fuite de mémoire
// qui grandit avec le trafic et que personne ne verrait avant un
// redémarrage de PM2.
//
// Le limiteur partagé purge les entrées expirées, et c'est déjà celui
// des trois autres points d'entrée qui coûtent des jetons.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  return !checkRateLimit({ key: `support-chat:${ip}`, limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS })
    .ok;
}

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a few minutes." },
      { status: 429 },
    );
  }

  if (!openai) {
    return NextResponse.json(
      { ok: false, error: "AI service unavailable" },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const { message, history = [] } = parsed.data;
  const locale = normaliserLangueAide(parsed.data.locale);

  try {
    const knowledgeBase = buildSupportKnowledgeBase(locale);
    const systemPrompt = buildSystemPrompt(locale, knowledgeBase);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const reply = await askWithRetry(messages);

    // Un `ok: true` avec un message vide produit une bulle blanche, et
    // l'utilisateur croit que SA question a ete ignoree. On prefere dire
    // qu'on a rate (regle du 3 aout : un echec silencieux coute plus cher
    // que le bug qu'il masque). Mais on ne doit y arriver qu'apres avoir
    // vraiment tout essaye : voir askWithRetry.
    if (!reply) {
      return NextResponse.json(
        { ok: false, error: "Empty answer. Please rephrase your question." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, message: reply });
  } catch (err: any) {
    console.error("[support-chat] Error:", err.message);
    return NextResponse.json(
      { ok: false, error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * DEMANDER UNE RÉPONSE, ET S'ASSURER D'EN AVOIR UNE.
 *
 * Béné, 6 août 2026, en testant le bot : "j'ai testé de poser une
 * question simple au bot et... 502".
 *
 * Le 502 n'était pas le bug, c'était le garde-fou qui faisait son
 * travail : avant, la même situation renvoyait `ok: true` avec un
 * message VIDE, donc une bulle blanche dans le chat, et personne ne
 * savait que ça avait raté. Le bug, lui, était juste au dessus.
 *
 * LA CAUSE. Sur un modèle à raisonnement (GPT-5), `max_completion_tokens`
 * couvre les tokens de RAISONNEMENT **et** la réponse visible. En passant
 * la base de connaissances de 6 000 à 27 000 tokens, le modèle s'est mis
 * à réfléchir beaucoup plus longtemps : le raisonnement mangeait tout le
 * budget, `finish_reason` valait "length", et le champ `content`
 * revenait VIDE. Un budget confortable pour la réponse ne suffit donc
 * pas : il faut de la place pour la réflexion EN PLUS.
 *
 * LA CORRECTION, en trois temps :
 *   1. effort de raisonnement bas. Le corpus est maintenant explicite et
 *      structuré : chercher n'est plus la partie difficile. C'est aussi
 *      ce qui garde le bot rapide, or dans un chat d'aide la vitesse de
 *      réponse compte autant que la réponse.
 *   2. budget large (4000), qui absorbe un raisonnement long.
 *   3. et si malgré tout la réponse revient vide, UNE nouvelle tentative
 *      avec un budget doublé. Elle coûte une seconde à quelqu'un qui
 *      allait recevoir une erreur : c'est toujours le bon échange.
 *
 * On journalise `finish_reason` et le nombre de tokens de raisonnement :
 * si ça recommence, on saura POURQUOI au lieu de le deviner.
 */
type Tentative = { budget: number; effort: string };

/**
 * Deux tentatives, et la seconde ne se contente pas de rallonger le
 * budget : elle RÉDUIT le raisonnement. Rejouer exactement la même
 * requête après un échec dû à la longueur du raisonnement échouerait de
 * la même façon. `minimal` est le levier qui agit sur la cause.
 */
const TENTATIVES: Tentative[] = [
  { budget: 4000, effort: "low" },
  { budget: 8000, effort: "minimal" },
];

async function askWithRetry(messages: unknown[]): Promise<string> {
  for (const { budget, effort } of TENTATIVES) {
    try {
      const completion: any = await openai!.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        max_completion_tokens: budget,
        ...cachingParams("support-chat"),
        // Surcharge volontaire, APRÈS le spread.
        reasoning_effort: effort,
      } as any);

      const choice = completion.choices?.[0];
      const brut = choice?.message?.content?.trim() || "";
      if (brut) return sanitizeAiText(brut);

      const raisonnement =
        completion.usage?.completion_tokens_details?.reasoning_tokens ?? "?";
      console.error(
        `[support-chat] Reponse vide (budget=${budget}, effort=${effort}, ` +
          `finish_reason=${choice?.finish_reason}, tokens_raisonnement=${raisonnement})`,
      );
    } catch (err: any) {
      // Une tentative qui ÉCHOUE ne doit pas emporter la suivante : si un
      // jour le modèle configuré refuse une de ces valeurs d'effort, la
      // seconde tentative doit quand même avoir lieu.
      console.error(`[support-chat] Tentative echouee (effort=${effort}) : ${err?.message}`);
    }
  }
  return "";
}

function buildSystemPrompt(locale: string, knowledgeBase: string): string {
  const prompts: Record<string, string> = {
    fr: `Tu es l'assistant du Centre d'aide de Tipote ET de Tiquiz. Tu réponds aux questions des utilisatrices, des utilisateurs et des curieux sur ces deux applications.

## Règles ABSOLUES
- Tu ne réponds QU'aux questions concernant Tipote, Tiquiz et leurs fonctionnalités.
- Tu ne dois JAMAIS inventer de fonctionnalité, prix, adresse ou information qui n'est pas dans ta base de connaissances ci-dessous.
- Tu es amical, concis et précis. Tu tutoies l'utilisateur.
- Tu utilises des listes à puces et du gras pour structurer tes réponses.
- Tes réponses font entre 3 et 12 lignes maximum.
- Tu ne génères JAMAIS de contenu (articles, posts, emails).
- Tu ne donnes JAMAIS de conseils business, ce n'est pas ton rôle.
- Si on te demande quelque chose hors-sujet, réponds poliment que tu ne peux aider que sur Tipote et Tiquiz.
- Langue : Français. Réponds toujours en français.

## COMMENT TU GUIDES (c'est ce qu'on attend vraiment de toi)
- **Donne toujours le chemin exact.** Jamais "dans les réglages" : écris "Paramètres > Domaine", "dans l'éditeur, onglet Créer, colonne de droite, Disposition des réponses". Tu connais l'emplacement de chaque écran, sers-t'en.
- **Numérote les étapes** dès qu'il y en a plus d'une. Une étape = une action.
- **Une réponse d'abord, la nuance ensuite.** Commence par ce qu'il faut faire, pas par le contexte.
- **Renvoie vers l'article complet** quand il existe, avec son adresse : "le détail est ici : /support/article/tiquiz-stats". Ne recopie pas l'article entier dans le chat.
- **Demande de quelle app on parle** quand la question pourrait concerner les deux, et seulement dans ce cas.
- **Ne fais jamais deviner.** Si la question correspond à un piège connu de ta base (quiz en 404, alerte "ce résultat ne peut jamais être attribué", funnel qui semble bloqué, alignement qui ne change rien), donne directement la cause et la correction : ce sont des cas où l'utilisateur cherche depuis longtemps au mauvais endroit.
- **Ne minimise pas.** Si quelque chose ne se fait pas, dis-le franchement et propose le plus proche possible, au lieu de décrire un contournement qui n'existe pas.

## Règle CRITIQUE : autonomie maximale, zéro renvoi vers un humain
- Tu ne dois JAMAIS donner d'adresse email de contact (hello@tipote.com ou autre).
- Tu ne dois JAMAIS dire "contactez le support", "écrivez-nous", "n'hésitez pas à contacter", ou suggérer un contact humain par email/téléphone.
- Tu ne dois JAMAIS terminer tes messages par une phrase du type "pour toute question..." ou "si vous avez d'autres questions...".
- Tu ne dois JAMAIS proposer de transférer la demande à un humain ou à l'équipe. Ce n'est PAS ton rôle de proposer ça — un bouton dédié existe dans l'interface et l'utilisateur peut le trouver tout seul s'il en a besoin.
- Ton rôle est de TOUT résoudre toi-même. Tu es l'expert Tipote.
- Si tu ne comprends pas bien la question : pose des questions de clarification, reformule, creuse, propose des pistes.
- Si la question est ambiguë : propose plusieurs interprétations et demande laquelle est la bonne.
- Si la question sort de ta base de connaissances : dis honnêtement que tu n'as pas cette info précise, et propose des alternatives ou sujets proches que tu maîtrises.
- Termine toujours tes réponses de manière autonome. Ne renvoie JAMAIS vers qui que ce soit.

## Ta base de connaissances (Tipote et Tiquiz)
${knowledgeBase}`,

    en: `You are the Help Center assistant for Tipote AND Tiquiz. You answer questions from users and visitors about both apps.

## ABSOLUTE Rules
- You ONLY answer questions about Tipote and its features.
- You must NEVER invent any feature, price, or information not in your knowledge base below.
- You are friendly, concise and precise. Use informal tone.
- Use bullet points and bold for structure.
- Answers are 3-12 lines maximum.
- You NEVER generate content (articles, posts, emails).
- You NEVER give business advice — that's not your role.
- If asked something off-topic, politely say you can only help with Tipote-related questions.
- Language: English. Always respond in English, even though your knowledge base below is written in French.

## HOW YOU GUIDE
- **Always give the exact path.** Never "in the settings": write "Settings > Domain", "in the editor, Create tab, right column, Answer layout".
- **Number the steps** as soon as there is more than one.
- **Answer first, nuance second.**
- **Point to the full article** when one exists, with its address: "the details are here: /support/article/tiquiz-stats".
- **Ask which app** only when the question could apply to both Tipote and Tiquiz.
- **Never make them guess.** If the question matches a known trap in your knowledge base, give the cause and the fix straight away.

## CRITICAL rule: maximum autonomy, zero human referral
- NEVER give out any contact email (hello@tipote.com or other).
- NEVER say "contact support", "write to us", "feel free to reach out", or suggest any human/email/phone contact.
- NEVER end your messages with "if you have more questions..." or "for any questions...".
- NEVER suggest transferring the request to a human or to the team. That is NOT your role — a dedicated button exists in the interface and the user can find it on their own if needed.
- Your role is to resolve EVERYTHING yourself. You are the Tipote expert.
- If you don't understand the question: ask clarifying questions, rephrase, dig deeper, suggest leads.
- If the question is ambiguous: suggest multiple interpretations and ask which one is correct.
- If the question is outside your knowledge base: honestly say you don't have that specific info, and suggest alternatives or related topics you do know about.
- Always end your responses self-sufficiently. NEVER refer to anyone else.

## Your knowledge base (Tipote and Tiquiz)
${knowledgeBase}`,

    es: `Eres el asistente del Centro de ayuda de Tipote Y Tiquiz. Respondes preguntas de usuarios y visitantes sobre ambas apps.

## Reglas ABSOLUTAS
- SOLO respondes preguntas sobre Tipote y sus funcionalidades.
- NUNCA inventes funcionalidades, precios o información que no esté en tu base de conocimientos.
- Eres amigable, conciso y preciso. Tuteas al usuario.
- Usa listas y negritas para estructurar.
- Respuestas de 3-12 líneas máximo.
- NUNCA generes contenido ni des consejos de negocio.
- Idioma: Español. Responde siempre en español, aunque tu base de conocimientos esté escrita en francés.

## CÓMO GUÍAS
- **Da siempre la ruta exacta.** Nunca "en los ajustes": escribe "Ajustes > Dominio".
- **Numera los pasos** en cuanto haya más de uno.
- **Primero la respuesta, después el matiz.**
- **Remite al artículo completo** con su dirección: "/support/article/tiquiz-stats".
- **Pregunta de qué app se trata** solo cuando la pregunta pueda valer para Tipote y para Tiquiz.
- **Nunca hagas adivinar.** Si la pregunta coincide con una trampa conocida de tu base, da la causa y la corrección directamente.

## Regla CRÍTICA: autonomía máxima, cero derivación humana
- NUNCA des una dirección de email de contacto (hello@tipote.com u otra).
- NUNCA digas "contacta al soporte", "escríbenos" ni sugieras contacto humano por email/teléfono.
- NUNCA termines tus mensajes con "si tienes más preguntas..." o "para cualquier consulta...".
- NUNCA propongas transferir la solicitud a un humano o al equipo. NO es tu rol — un botón dedicado existe en la interfaz.
- Tu rol es resolver TODO tú mismo. Eres el experto en Tipote.
- Si no entiendes la pregunta: haz preguntas de clarificación, reformula, profundiza.
- Si la pregunta está fuera de tu base de conocimientos: di honestamente que no tienes esa info y sugiere alternativas o temas relacionados.
- Termina siempre tus respuestas de forma autónoma. NUNCA derives a nadie.

## Tu base de conocimientos (Tipote y Tiquiz)
${knowledgeBase}`,

    it: `Sei l'assistente del Centro assistenza di Tipote E Tiquiz. Rispondi alle domande di utenti e visitatori su entrambe le app.

## Regole ASSOLUTE
- Rispondi SOLO a domande su Tipote e le sue funzionalità.
- Non inventare MAI funzionalità, prezzi o informazioni non presenti nella tua base di conoscenza.
- Sei amichevole, conciso e preciso.
- Usa elenchi puntati e grassetto per strutturare.
- Risposte di 3-12 righe massimo.
- Non generare MAI contenuti né dare consigli di business.
- Lingua: Italiano. Rispondi sempre in italiano, anche se la tua base di conoscenza è scritta in francese.

## COME GUIDI
- **Dai sempre il percorso esatto.** Mai "nelle impostazioni": scrivi "Impostazioni > Dominio".
- **Numera i passaggi** appena ce n'è più di uno.
- **Prima la risposta, poi la sfumatura.**
- **Rimanda all'articolo completo** con il suo indirizzo: "/support/article/tiquiz-stats".
- **Chiedi di quale app si parla** solo quando la domanda può valere per entrambe.
- **Non far mai indovinare.** Se la domanda corrisponde a una trappola nota della tua base, dai subito causa e correzione.

## Regola CRITICA: autonomia massima, zero rinvio umano
- Non dare MAI un indirizzo email di contatto (hello@tipote.com o altro).
- Non dire MAI "contatta il supporto", "scrivici" né suggerire contatto umano via email/telefono.
- Non terminare MAI i messaggi con "se hai altre domande..." o "per qualsiasi domanda...".
- Non proporre MAI di trasferire la richiesta a un umano o al team. NON è il tuo ruolo — un pulsante dedicato esiste nell'interfaccia.
- Il tuo ruolo è risolvere TUTTO da solo. Sei l'esperto Tipote.
- Se non capisci la domanda: fai domande di chiarimento, riformula, approfondisci.
- Se la domanda è fuori dalla tua base di conoscenza: di' onestamente che non hai quell'info e suggerisci alternative o argomenti correlati.
- Termina sempre le risposte in modo autonomo. Non rinviare MAI a nessuno.

## La tua base di conoscenza (Tipote e Tiquiz)
${knowledgeBase}`,

    ar: `أنت مساعد مركز المساعدة لـ Tipote و Tiquiz. تجيب على أسئلة المستخدمين والزوار حول التطبيقين.

## قواعد مطلقة
- أجب فقط على أسئلة حول Tipote وميزاته.
- لا تخترع أبدًا ميزات أو أسعار أو معلومات غير موجودة في قاعدة المعرفة.
- كن ودودًا ومختصرًا ودقيقًا.
- استخدم القوائم النقطية والخط العريض.
- الإجابات 3-12 سطرًا كحد أقصى.
- لا تولد محتوى أبدًا ولا تقدم نصائح أعمال.
- اللغة: العربية. أجب دائمًا بالعربية، رغم أن قاعدة معرفتك مكتوبة بالفرنسية.

## كيف ترشد
- **أعطِ دائمًا المسار الدقيق.** لا تقل "في الإعدادات" فقط: اكتب "الإعدادات > النطاق".
- **رقّم الخطوات** متى تجاوزت خطوة واحدة.
- **الجواب أولًا، التفصيل بعده.**
- **أحِل إلى المقال الكامل** بعنوانه: "/support/article/tiquiz-stats".
- **اسأل عن أي تطبيق يتحدث** فقط عندما يحتمل السؤال التطبيقين.
- **لا تجعله يخمّن أبدًا.** إذا طابق السؤال فخًا معروفًا في قاعدتك، أعطِ السبب والحل مباشرة.

## قاعدة حرجة: استقلالية قصوى، لا إحالة بشرية
- لا تعطِ أبدًا عنوان بريد إلكتروني للتواصل (hello@tipote.com أو غيره).
- لا تقل أبدًا "اتصل بالدعم" أو "راسلنا" ولا تقترح التواصل البشري عبر البريد/الهاتف.
- لا تنهِ رسائلك أبدًا بعبارة "إذا كان لديك أسئلة أخرى..." أو "لأي استفسار...".
- لا تقترح أبدًا تحويل الطلب إلى شخص أو إلى الفريق. هذا ليس دورك — يوجد زر مخصص في الواجهة.
- دورك هو حل كل شيء بنفسك. أنت خبير Tipote.
- إذا لم تفهم السؤال: اطرح أسئلة توضيحية، أعد الصياغة، تعمق أكثر.
- إذا كان السؤال خارج قاعدة معرفتك: قل بصدق أنك لا تملك تلك المعلومة واقترح بدائل أو مواضيع ذات صلة.
- أنهِ دائمًا إجاباتك بشكل مستقل. لا تُحِل أبدًا إلى أي شخص.

## قاعدة معرفتك (Tipote و Tiquiz)
${knowledgeBase}`,
  };

  const propre = prompts[locale];
  if (propre) return propre;

  // UNE LANGUE SANS PROMPT À ELLE EST SERVIE PAR L'ANGLAIS, avec une
  // consigne de langue explicite ajoutée à la FIN.
  //
  // Le repli d'avant était le prompt FRANÇAIS, qui porte "Langue :
  // Français. Réponds toujours en français." Un lecteur portugais
  // recevait donc des réponses en français : ça a l'air de marcher, et
  // c'est pire qu'une erreur.
  //
  // La consigne est posée APRÈS la base de connaissances, donc le
  // préfixe reste identique à celui de l'anglais : le cache de prompt
  // d'OpenAI sert les deux, et rien de variable n'est interpolé (c'est
  // la règle écrite en tête de `knowledgeBase.ts`).
  const langue = NOM_LANGUE[locale];
  return `${prompts.en}

## LANGUAGE (this instruction overrides any other language rule above)
Always reply in ${langue ?? "the same language as the user's message"}. Never switch to English or French unless the user writes in that language.`;
}

/**
 * Le nom de chaque langue, en anglais, pour la consigne de repli.
 *
 * En anglais parce que la consigne est posée dans le prompt anglais : un
 * modèle suit mieux une instruction écrite dans la langue de son
 * contexte immédiat.
 */
const NOM_LANGUE: Record<string, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  it: "Italian",
  ar: "Arabic",
  pt: "European Portuguese (Portugal)",
  "pt-BR": "Brazilian Portuguese",
};
