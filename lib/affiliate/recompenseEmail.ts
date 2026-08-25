// lib/affiliate/recompenseEmail.ts
//
// L'EMAIL QUI PRÉVIENT AVANT QUE LE PRIX BOUGE.
//
// Béné, 26 août 2026 : "oui il faut le faire."
//
// -- POURQUOI SEULEMENT LA BAISSE ---------------------------------------
//
// Une hausse est une bonne nouvelle qui se découvre sans dommage. Une
// BAISSE de remise est une hausse de prélèvement : sans un mot, il la
// découvre sur son relevé, et de son point de vue c'est nous qui avons
// changé son prix en douce. C'est exactement le silence que le `ok:
// false` du 3 août interdit, transposé à de l'argent qui sort de chez
// quelqu'un d'autre.
//
// -- ON DIT POURQUOI, PAS SEULEMENT QUOI --------------------------------
//
// "Ta remise passe de 20 % à 10 %" tout seul se lit comme une sanction.
// Le nombre de filleuls actifs est la CAUSE, et c'est aussi le levier :
// en le donnant, on transforme une mauvaise nouvelle en quelque chose
// sur quoi il peut agir. C'est la même règle que le funnel (drame
// Jocelyne) : un chiffre sans sa cause envoie chercher au mauvais
// endroit.
//
// -- CE QU'ON NE PROMET PAS ---------------------------------------------
//
// Aucune DATE. Le recalcul tourne le 2, l'application le 3, mais
// l'échéance de chacun tombe le jour de son abonnement. Annoncer "le 3"
// serait faux pour presque tout le monde ; "à partir de ta prochaine
// échéance" est vrai pour tous.
//
// La MÉCANIQUE EST UN PARAMÈTRE (`quoi`), jamais déduite du signe ou du
// montant : une baisse de remise et une baisse de taux ne disent pas la
// même chose, et les confondre annoncerait une hausse de facture à
// quelqu'un dont c'est le revenu qui bouge.

import type { ChangementRecompense } from "./recompense";

/** Les 6 langues de l'espace affilié. */
export type LangueAffilie = "fr" | "en" | "es" | "it" | "pt" | "ar";

const LANGUES: readonly LangueAffilie[] = ["fr", "en", "es", "it", "pt", "ar"];

/** Une locale inconnue lit le français : mieux qu'un email vide. */
export function langueAffilie(brut: unknown): LangueAffilie {
  const v = String(brut ?? "").trim().toLowerCase().slice(0, 2);
  return (LANGUES as readonly string[]).includes(v) ? (v as LangueAffilie) : "fr";
}

export type EmailRecompense = {
  subject: string;
  greeting: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
};

type Textes = {
  sujetAbo: string;
  sujetCom: string;
  salut: (nom: string) => string;
  corpsAbo: (c: ChangementRecompense) => string;
  corpsCom: (c: ChangementRecompense) => string;
  cta: string;
};

const T: Record<LangueAffilie, Textes> = {
  fr: {
    sujetAbo: "Ta remise sur ton abonnement change le mois prochain",
    sujetCom: "Ton taux de commission change le mois prochain",
    salut: (n) => `Salut ${n} 👋`,
    corpsAbo: (c) => `
<p>Petit point avant que ça bouge, pour que tu ne le découvres pas sur ton relevé.</p>
<p>Ta remise de fidélité passe de <strong>-${c.avantPct} %</strong> à <strong>-${c.apresPct} %</strong> à partir de ta prochaine échéance. Concrètement, ton abonnement va te coûter un peu plus cher qu'en ce moment.</p>
<p>La raison : la remise se calcule sur tes filleuls qui paient encore leur abonnement. Tu en avais ${c.filleulsAvant} le mois dernier, tu en as ${c.filleulsApres} aujourd'hui.</p>
<p>Rien n'est perdu : le calcul se refait chaque mois, et la remise remonte dès que le compte remonte. Tes commissions déjà gagnées ne sont pas touchées.</p>`,
    corpsCom: (c) => `
<p>Petit point avant que ça bouge.</p>
<p>Ton taux de commission passe de <strong>${c.avantPct} %</strong> à <strong>${c.apresPct} %</strong> sur les ventes à venir.</p>
<p>La raison : le taux se calcule sur tes filleuls qui paient encore leur abonnement. Tu en avais ${c.filleulsAvant} le mois dernier, tu en as ${c.filleulsApres} aujourd'hui.</p>
<p>Ce qui a déjà été gagné reste acquis et sera versé normalement. Le calcul se refait chaque mois, et le taux remonte dès que le compte remonte.</p>`,
    cta: "Voir mon espace affilié",
  },
  en: {
    sujetAbo: "Your subscription discount changes next month",
    sujetCom: "Your commission rate changes next month",
    salut: (n) => `Hi ${n} 👋`,
    corpsAbo: (c) => `
<p>A quick heads up before it changes, so you do not find out on your statement.</p>
<p>Your loyalty discount goes from <strong>-${c.avantPct}%</strong> to <strong>-${c.apresPct}%</strong> from your next billing date. In practice, your subscription will cost a little more than it does now.</p>
<p>Why: the discount is based on the referrals who are still paying for their subscription. You had ${c.filleulsAvant} last month, you have ${c.filleulsApres} today.</p>
<p>Nothing is lost: the calculation runs every month, and the discount goes back up as soon as the count does. Commissions you have already earned are untouched.</p>`,
    corpsCom: (c) => `
<p>A quick heads up before it changes.</p>
<p>Your commission rate goes from <strong>${c.avantPct}%</strong> to <strong>${c.apresPct}%</strong> on upcoming sales.</p>
<p>Why: the rate is based on the referrals who are still paying for their subscription. You had ${c.filleulsAvant} last month, you have ${c.filleulsApres} today.</p>
<p>What you have already earned stays yours and will be paid as usual. The calculation runs every month, and the rate goes back up as soon as the count does.</p>`,
    cta: "Open my affiliate area",
  },
  es: {
    sujetAbo: "Tu descuento de suscripción cambia el mes que viene",
    sujetCom: "Tu porcentaje de comisión cambia el mes que viene",
    salut: (n) => `Hola ${n} 👋`,
    corpsAbo: (c) => `
<p>Un aviso antes de que cambie, para que no lo descubras en tu recibo.</p>
<p>Tu descuento de fidelidad pasa de <strong>-${c.avantPct} %</strong> a <strong>-${c.apresPct} %</strong> a partir de tu próximo cobro. En la práctica, tu suscripción te costará un poco más que ahora.</p>
<p>El motivo: el descuento se calcula sobre las personas que trajiste y que siguen pagando su suscripción. Tenías ${c.filleulsAvant} el mes pasado, hoy tienes ${c.filleulsApres}.</p>
<p>No se pierde nada: el cálculo se rehace cada mes, y el descuento vuelve a subir en cuanto sube la cuenta. Las comisiones ya ganadas no se tocan.</p>`,
    corpsCom: (c) => `
<p>Un aviso antes de que cambie.</p>
<p>Tu porcentaje de comisión pasa de <strong>${c.avantPct} %</strong> a <strong>${c.apresPct} %</strong> en las ventas futuras.</p>
<p>El motivo: el porcentaje se calcula sobre las personas que trajiste y que siguen pagando su suscripción. Tenías ${c.filleulsAvant} el mes pasado, hoy tienes ${c.filleulsApres}.</p>
<p>Lo ya ganado sigue siendo tuyo y se pagará con normalidad. El cálculo se rehace cada mes, y el porcentaje vuelve a subir en cuanto sube la cuenta.</p>`,
    cta: "Ver mi espacio de afiliación",
  },
  it: {
    sujetAbo: "Il tuo sconto sull'abbonamento cambia il mese prossimo",
    sujetCom: "La tua percentuale di commissione cambia il mese prossimo",
    salut: (n) => `Ciao ${n} 👋`,
    corpsAbo: (c) => `
<p>Un avviso prima che cambi, per non scoprirlo sull'estratto conto.</p>
<p>Il tuo sconto fedeltà passa da <strong>-${c.avantPct} %</strong> a <strong>-${c.apresPct} %</strong> dalla prossima scadenza. In pratica, il tuo abbonamento costerà un po' più di adesso.</p>
<p>Il motivo: lo sconto si calcola sulle persone che hai portato e che pagano ancora il loro abbonamento. Ne avevi ${c.filleulsAvant} il mese scorso, oggi ne hai ${c.filleulsApres}.</p>
<p>Nulla è perso: il calcolo si rifà ogni mese, e lo sconto risale appena risale il conteggio. Le commissioni già guadagnate non vengono toccate.</p>`,
    corpsCom: (c) => `
<p>Un avviso prima che cambi.</p>
<p>La tua percentuale di commissione passa da <strong>${c.avantPct} %</strong> a <strong>${c.apresPct} %</strong> sulle vendite future.</p>
<p>Il motivo: la percentuale si calcola sulle persone che hai portato e che pagano ancora il loro abbonamento. Ne avevi ${c.filleulsAvant} il mese scorso, oggi ne hai ${c.filleulsApres}.</p>
<p>Quello che hai già guadagnato resta tuo e verrà versato normalmente. Il calcolo si rifà ogni mese, e la percentuale risale appena risale il conteggio.</p>`,
    cta: "Vai alla mia area affiliazione",
  },
  pt: {
    sujetAbo: "O teu desconto na subscrição muda no próximo mês",
    sujetCom: "A tua percentagem de comissão muda no próximo mês",
    salut: (n) => `Olá ${n} 👋`,
    corpsAbo: (c) => `
<p>Um aviso antes de mudar, para não descobrires no teu extrato.</p>
<p>O teu desconto de fidelidade passa de <strong>-${c.avantPct} %</strong> para <strong>-${c.apresPct} %</strong> a partir da próxima cobrança. Na prática, a tua subscrição vai custar um pouco mais do que agora.</p>
<p>A razão: o desconto calcula-se sobre as pessoas que trouxeste e que continuam a pagar a subscrição. Tinhas ${c.filleulsAvant} no mês passado, tens ${c.filleulsApres} hoje.</p>
<p>Nada se perde: o cálculo repete-se todos os meses, e o desconto volta a subir assim que a contagem subir. As comissões já ganhas não são afetadas.</p>`,
    corpsCom: (c) => `
<p>Um aviso antes de mudar.</p>
<p>A tua percentagem de comissão passa de <strong>${c.avantPct} %</strong> para <strong>${c.apresPct} %</strong> nas vendas futuras.</p>
<p>A razão: a percentagem calcula-se sobre as pessoas que trouxeste e que continuam a pagar a subscrição. Tinhas ${c.filleulsAvant} no mês passado, tens ${c.filleulsApres} hoje.</p>
<p>O que já ganhaste continua teu e será pago normalmente. O cálculo repete-se todos os meses, e a percentagem volta a subir assim que a contagem subir.</p>`,
    cta: "Ver a minha área de afiliação",
  },
  ar: {
    sujetAbo: "خصمك على الاشتراك يتغيّر الشهر المقبل",
    sujetCom: "نسبة عمولتك تتغيّر الشهر المقبل",
    salut: (n) => `مرحبًا ${n} 👋`,
    corpsAbo: (c) => `
<p>تنبيه قبل أن يتغيّر الأمر، حتى لا تكتشفه في كشف حسابك.</p>
<p>خصم الوفاء الخاص بك ينتقل من <strong>-${c.avantPct}%</strong> إلى <strong>-${c.apresPct}%</strong> ابتداءً من موعد الدفع القادم. عمليًا، سيكلّفك اشتراكك أكثر قليلًا مما هو عليه الآن.</p>
<p>السبب: يُحتسب الخصم على من أحضرتهم ولا يزالون يدفعون اشتراكهم. كان لديك ${c.filleulsAvant} الشهر الماضي، ولديك ${c.filleulsApres} اليوم.</p>
<p>لا شيء يضيع: يُعاد الحساب كل شهر، ويعود الخصم للارتفاع فور ارتفاع العدد. أما العمولات التي كسبتها فلا تُمسّ.</p>`,
    corpsCom: (c) => `
<p>تنبيه قبل أن يتغيّر الأمر.</p>
<p>نسبة عمولتك تنتقل من <strong>${c.avantPct}%</strong> إلى <strong>${c.apresPct}%</strong> على المبيعات القادمة.</p>
<p>السبب: تُحتسب النسبة على من أحضرتهم ولا يزالون يدفعون اشتراكهم. كان لديك ${c.filleulsAvant} الشهر الماضي، ولديك ${c.filleulsApres} اليوم.</p>
<p>ما كسبته سابقًا يبقى لك وسيُدفع كالمعتاد. يُعاد الحساب كل شهر، وتعود النسبة للارتفاع فور ارتفاع العدد.</p>`,
    cta: "الذهاب إلى مساحة الإحالة",
  },
};

/** L'adresse de l'espace affilié. Écrite ICI et nulle part ailleurs. */
export const URL_ESPACE_AFFILIE = "https://affiliate.tipote.com/";

/**
 * Le message à envoyer, ou `null` quand il n'y a rien à annoncer.
 *
 * On ne rend quelque chose QUE sur une baisse : une hausse se découvre
 * sans dommage, et un email de plus par mois pour une bonne nouvelle
 * finit en dossier spam.
 */
export function emailRecompense(
  changement: ChangementRecompense,
  destinataire: { nom?: string | null; locale?: unknown },
): EmailRecompense | null {
  if (changement.sens !== "baisse") return null;

  const t = T[langueAffilie(destinataire.locale)];
  const nom = String(destinataire.nom ?? "").trim();
  const abo = changement.quoi === "abonnement";

  return {
    subject: abo ? t.sujetAbo : t.sujetCom,
    // Sans prénom, "Salut  👋" se resserre en "Salut 👋". On salue
    // toujours : un email qui commence par le montant se lit comme un
    // avis d'huissier.
    greeting: t.salut(nom).replace(/\s+/g, " ").trim(),
    body: (abo ? t.corpsAbo(changement) : t.corpsCom(changement)).trim(),
    ctaLabel: t.cta,
    ctaUrl: URL_ESPACE_AFFILIE,
  };
}
