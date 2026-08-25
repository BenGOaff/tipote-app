// lib/quiz/partageTextes.ts
//
// LA PAGE QUE VOIT CELUI QUI RECOIT UN QUIZ PARTAGE, DANS SA LANGUE.
//
// Béné, 26 août 2026 : "si je partage à un anglophone, le quiz ne sera
// pas traduit en français quand même ?"
//
// Non, et c'est le point à ne pas inverser : **le CONTENU du quiz ne
// change jamais de langue.** Un quiz écrit en anglais arrive en anglais.
// Ce qui était en français, c'était notre EMBALLAGE autour : le titre,
// le bouton d'installation, la liste de ce qui reste à remplir. Un quiz
// anglais dans une page française, pas cassé, juste bizarre.
//
// -- D'OU VIENT LA LANGUE, ET POURQUOI PAS DU NAVIGATEUR ---------------
//
// De `quizzes.locale`, c'est à dire la langue DU QUIZ PARTAGÉ. C'est
// l'information la plus sûre que nous ayons : celui qui reçoit un quiz
// anglais lit l'anglais, sinon on ne le lui aurait pas envoyé. L'entête
// du navigateur, lui, ment souvent (une Italienne peut très bien avoir
// un Chrome en anglais) : c'est le raisonnement déjà tenu pour le centre
// d'aide, cf. lib/support/locale.ts.
//
// `?lang=` reste accepté et gagne : l'expéditeur qui sait mieux peut
// trancher à la main, comme sur le centre d'aide.
//
// -- POURQUOI UN MODULE ET PAS `messages/` -----------------------------
//
// Cette page doit s'afficher dans une langue qui n'est PAS celle de la
// session : le destinataire n'a pas de compte, donc pas de cookie de
// langue, et la langue voulue est celle du quiz. Passer par next-intl
// obligerait à forcer une locale de requête depuis une valeur lue en
// base, après le rendu. Un module pur répond exactement à la question et
// se teste sans navigateur, comme lib/affiliate/recompenseEmail.ts.

import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/i18n/config";
import type { AFaire } from "./partage";

/**
 * LE SEUL MOT QUI DIFFERE ENTRE LES DEUX JUMEAUX.
 *
 * Le module quiz de Tiquiz porte le meme fichier, a cette ligne pres.
 * Ecrire "Tiquiz" en dur dans les sept langues aurait donne, cote
 * Tiquiz, sept phrases a corriger a la main au premier portage : c'est
 * exactement comme ca qu'une traduction se met a mentir.
 */
const APP = "Tipote";

export type LanguePartage = (typeof SUPPORTED_LOCALES)[number];

/**
 * La langue à servir : ce qui est demandé, sinon celle du quiz, sinon
 * l'anglais.
 *
 * `demande` vient d'une query string, donc de n'importe qui : elle est
 * validée contre la liste, jamais utilisée telle quelle. La casse est
 * libre ("PT-br"), parce qu'un lien se recopie à la main.
 */
export function languePartage(demande: unknown, duQuiz: unknown): LanguePartage {
  for (const brut of [demande, duQuiz]) {
    const v = String(brut ?? "").trim().toLowerCase();
    if (!v) continue;
    const trouve = (SUPPORTED_LOCALES as readonly string[]).find(
      (l) => l.toLowerCase() === v,
    );
    if (trouve) return trouve as LanguePartage;
  }
  return DEFAULT_LOCALE;
}

/** L'arabe s'écrit de droite à gauche : sans ça la page est illisible. */
export function estRtl(langue: LanguePartage): boolean {
  return langue === "ar";
}

export type TextesPartage = {
  /** Au dessus du titre du quiz. */
  surtitre: string;
  installer: string;
  installation: string;
  lecture: string;
  /** "{n} question(s)" et "{n} profil(s) de résultat". */
  questions: (n: number) => string;
  resultats: (n: number) => string;
  toutModifiable: string;
  resteAToi: string;
  compteRequis: string;
  /** Écran d'arrivée. */
  installeTitre: string;
  installeCorps: string;
  avantPublier: string;
  pourquoiVide: string;
  ouvrir: string;
  /** Refus. */
  liensMort: string;
  raisons: Record<
    | "inconnu" | "revoque" | "expire" | "epuise" | "panne"
    | "non_connecte" | "limite_quiz" | "limite_sondage" | "installation_impossible",
    string
  >;
  aFaire: Record<AFaire, string>;
};

const FR: TextesPartage = {
  surtitre: "Un quiz vous a été partagé",
  installer: "Installer ce quiz chez moi",
  installation: "Installation...",
  lecture: "Lecture du lien...",
  questions: (n) => `${n} question${n > 1 ? "s" : ""}`,
  resultats: (n) => `${n} profil${n > 1 ? "s" : ""} de résultat`,
  toutModifiable: "Tout est modifiable une fois installé.",
  resteAToi: "Ce qui restera à vous :",
  compteRequis:
    `Il faut un compte ${APP}. Si vous n'êtes pas connecté, on vous y emmène et on revient ici.`,
  installeTitre: "Le quiz est chez vous.",
  installeCorps:
    "Il est arrivé en brouillon, avec ses textes, ses images, ses questions et ses profils de résultat. Rien n'est publié tant que vous ne le décidez pas.",
  avantPublier: "Avant de le publier, à vous de remplir :",
  pourquoiVide:
    "Ces champs désignaient le compte de la personne qui vous a envoyé le quiz. Les laisser vous aurait envoyé ses visiteurs, et vos leads dans ses automatisations.",
  ouvrir: "Ouvrir mon quiz",
  liensMort: "Ce lien ne mène nulle part",
  raisons: {
    inconnu: "Ce lien de partage n'existe pas, ou le quiz a été supprimé depuis.",
    revoque: "Ce lien a été désactivé par la personne qui vous l'a envoyé.",
    expire: "Ce lien a expiré. Demandez en un nouveau, ça prend dix secondes.",
    epuise: "Ce lien a déjà servi le nombre de fois prévu.",
    panne: "Impossible de lire ce lien pour le moment. Réessayez dans un instant.",
    non_connecte:
      `Connectez vous à ${APP}, puis revenez sur ce lien : le quiz s'installera.`,
    limite_quiz:
      "Le plan gratuit est limité à 1 quiz. Passez en plan payant, ou supprimez un quiz, puis revenez sur ce lien.",
    limite_sondage:
      "Le plan gratuit est limité à 1 sondage. Passez en plan payant, ou supprimez un sondage, puis revenez sur ce lien.",
    installation_impossible:
      "L'installation n'a pas abouti. Rien n'a été créé, vous pouvez réessayer.",
  },
  aFaire: {
    "tags-systeme-io": "Vos tags Systeme.io (ceux du quiz d'origine ne sont pas repris).",
    "url-bouton": "L'adresse de vos boutons d'action.",
    "politique-confidentialite": "Le lien vers VOTRE politique de confidentialité.",
    tracking: "Vos identifiants de suivi (Meta, Google Analytics, Google Ads).",
    "pied-de-page": "Le texte et le lien de votre pied de page.",
  },
};

const EN: TextesPartage = {
  surtitre: "A quiz has been shared with you",
  installer: "Install this quiz in my account",
  installation: "Installing...",
  lecture: "Reading the link...",
  questions: (n) => `${n} question${n > 1 ? "s" : ""}`,
  resultats: (n) => `${n} result profile${n > 1 ? "s" : ""}`,
  toutModifiable: "Everything stays editable once installed.",
  resteAToi: "What stays yours to set:",
  compteRequis:
    `A ${APP} account is required. If you are not logged in, we take you there and bring you back.`,
  installeTitre: "The quiz is yours.",
  installeCorps:
    "It arrived as a draft, with its texts, images, questions and result profiles. Nothing is published until you decide it is.",
  avantPublier: "Before publishing, these are yours to fill in:",
  pourquoiVide:
    "These fields pointed at the account of the person who sent you the quiz. Leaving them would have sent you their visitors, and your leads into their automations.",
  ouvrir: "Open my quiz",
  liensMort: "This link leads nowhere",
  raisons: {
    inconnu: "This share link does not exist, or the quiz has been deleted since.",
    revoque: "This link was disabled by the person who sent it to you.",
    expire: "This link has expired. Ask for a new one, it takes ten seconds.",
    epuise: "This link has already been used the planned number of times.",
    panne: "The link could not be read right now. Please try again in a moment.",
    non_connecte: `Log in to ${APP}, then come back to this link: the quiz will install.`,
    limite_quiz:
      "The free plan is limited to 1 quiz. Upgrade, or delete a quiz, then come back to this link.",
    limite_sondage:
      "The free plan is limited to 1 survey. Upgrade, or delete a survey, then come back to this link.",
    installation_impossible:
      "The install did not go through. Nothing was created, you can try again.",
  },
  aFaire: {
    "tags-systeme-io": "Your Systeme.io tags (the original quiz's tags do not travel).",
    "url-bouton": "The URL of your action buttons.",
    "politique-confidentialite": "The link to YOUR privacy policy.",
    tracking: "Your tracking IDs (Meta, Google Analytics, Google Ads).",
    "pied-de-page": "Your footer text and link.",
  },
};

const ES: TextesPartage = {
  surtitre: "Te han compartido un quiz",
  installer: "Instalar este quiz en mi cuenta",
  installation: "Instalando...",
  lecture: "Leyendo el enlace...",
  questions: (n) => `${n} pregunta${n > 1 ? "s" : ""}`,
  resultats: (n) => `${n} perfil${n > 1 ? "es" : ""} de resultado`,
  toutModifiable: "Todo se puede modificar una vez instalado.",
  resteAToi: "Lo que tendrás que poner tú:",
  compteRequis:
    `Hace falta una cuenta ${APP}. Si no has iniciado sesión, te llevamos y te traemos de vuelta aquí.`,
  installeTitre: "El quiz ya es tuyo.",
  installeCorps:
    "Ha llegado como borrador, con sus textos, sus imágenes, sus preguntas y sus perfiles de resultado. No se publica nada hasta que tú lo decidas.",
  avantPublier: "Antes de publicarlo, te toca rellenar:",
  pourquoiVide:
    "Estos campos apuntaban a la cuenta de quien te envió el quiz. Dejarlos te habría enviado sus visitantes, y tus leads a sus automatizaciones.",
  ouvrir: "Abrir mi quiz",
  liensMort: "Este enlace no lleva a ninguna parte",
  raisons: {
    inconnu: "Este enlace no existe, o el quiz se ha eliminado desde entonces.",
    revoque: "Este enlace fue desactivado por la persona que te lo envió.",
    expire: "Este enlace ha caducado. Pide uno nuevo, se tarda diez segundos.",
    epuise: "Este enlace ya se ha usado las veces previstas.",
    panne: "No se pudo leer el enlace ahora mismo. Inténtalo de nuevo en un momento.",
    non_connecte:
      `Inicia sesión en ${APP} y vuelve a este enlace: el quiz se instalará.`,
    limite_quiz:
      "El plan gratuito está limitado a 1 quiz. Cambia de plan, o elimina un quiz, y vuelve a este enlace.",
    limite_sondage:
      "El plan gratuito está limitado a 1 encuesta. Cambia de plan, o elimina una encuesta, y vuelve a este enlace.",
    installation_impossible:
      "La instalación no se completó. No se creó nada, puedes volver a intentarlo.",
  },
  aFaire: {
    "tags-systeme-io": "Tus etiquetas de Systeme.io (las del quiz original no viajan).",
    "url-bouton": "La dirección de tus botones de acción.",
    "politique-confidentialite": "El enlace a TU política de privacidad.",
    tracking: "Tus identificadores de seguimiento (Meta, Google Analytics, Google Ads).",
    "pied-de-page": "El texto y el enlace de tu pie de página.",
  },
};

const IT: TextesPartage = {
  surtitre: "Ti hanno condiviso un quiz",
  installer: "Installa questo quiz nel mio account",
  installation: "Installazione...",
  lecture: "Lettura del link...",
  questions: (n) => `${n} domanda${n > 1 ? "e" : ""}`,
  resultats: (n) => `${n} profil${n > 1 ? "i" : "o"} di risultato`,
  toutModifiable: "Tutto resta modificabile una volta installato.",
  resteAToi: "Quello che dovrai mettere tu:",
  compteRequis:
    `Serve un account ${APP}. Se non hai effettuato l'accesso, ti ci portiamo e ti riportiamo qui.`,
  installeTitre: "Il quiz è tuo.",
  installeCorps:
    "È arrivato come bozza, con i testi, le immagini, le domande e i profili di risultato. Non viene pubblicato nulla finché non lo decidi tu.",
  avantPublier: "Prima di pubblicarlo, tocca a te compilare:",
  pourquoiVide:
    "Questi campi puntavano all'account di chi ti ha inviato il quiz. Lasciarli ti avrebbe mandato i suoi visitatori, e i tuoi lead nelle sue automazioni.",
  ouvrir: "Apri il mio quiz",
  liensMort: "Questo link non porta da nessuna parte",
  raisons: {
    inconnu: "Questo link non esiste, oppure il quiz è stato eliminato nel frattempo.",
    revoque: "Questo link è stato disattivato da chi te lo ha inviato.",
    expire: "Questo link è scaduto. Chiedine uno nuovo, ci vogliono dieci secondi.",
    epuise: "Questo link è già stato usato il numero di volte previsto.",
    panne: "Non è stato possibile leggere il link adesso. Riprova tra un istante.",
    non_connecte: `Accedi a ${APP}, poi torna su questo link: il quiz si installerà.`,
    limite_quiz:
      "Il piano gratuito è limitato a 1 quiz. Passa a un piano a pagamento, o elimina un quiz, poi torna su questo link.",
    limite_sondage:
      "Il piano gratuito è limitato a 1 sondaggio. Passa a un piano a pagamento, o elimina un sondaggio, poi torna su questo link.",
    installation_impossible:
      "L'installazione non è andata a buon fine. Non è stato creato nulla, puoi riprovare.",
  },
  aFaire: {
    "tags-systeme-io": "I tuoi tag Systeme.io (quelli del quiz originale non viaggiano).",
    "url-bouton": "L'indirizzo dei tuoi pulsanti di azione.",
    "politique-confidentialite": "Il link alla TUA privacy policy.",
    tracking: "I tuoi identificativi di tracciamento (Meta, Google Analytics, Google Ads).",
    "pied-de-page": "Il testo e il link del tuo piè di pagina.",
  },
};

const PT: TextesPartage = {
  surtitre: "Partilharam um quiz consigo",
  installer: "Instalar este quiz na minha conta",
  installation: "A instalar...",
  lecture: "A ler o link...",
  questions: (n) => `${n} pergunta${n > 1 ? "s" : ""}`,
  resultats: (n) => `${n} perfil${n > 1 ? "s" : ""} de resultado`,
  toutModifiable: "Tudo continua editável depois de instalado.",
  resteAToi: "O que ficará por sua conta:",
  compteRequis:
    `É preciso uma conta ${APP}. Se não tiver sessão iniciada, levamos e trazemos de volta a este link.`,
  installeTitre: "O quiz já é seu.",
  installeCorps:
    "Chegou como rascunho, com os textos, as imagens, as perguntas e os perfis de resultado. Nada é publicado enquanto não decidir.",
  avantPublier: "Antes de publicar, falta preencher:",
  pourquoiVide:
    "Estes campos apontavam para a conta de quem lhe enviou o quiz. Mantê-los teria enviado os visitantes dessa pessoa, e os seus leads para as automações dela.",
  ouvrir: "Abrir o meu quiz",
  liensMort: "Este link não leva a lado nenhum",
  raisons: {
    inconnu: "Este link não existe, ou o quiz foi eliminado entretanto.",
    revoque: "Este link foi desativado por quem lho enviou.",
    expire: "Este link expirou. Peça um novo, demora dez segundos.",
    epuise: "Este link já foi usado o número de vezes previsto.",
    panne: "Não foi possível ler o link neste momento. Tente daqui a pouco.",
    non_connecte: `Inicie sessão no ${APP} e volte a este link: o quiz será instalado.`,
    limite_quiz:
      "O plano gratuito está limitado a 1 quiz. Mude de plano, ou elimine um quiz, e volte a este link.",
    limite_sondage:
      "O plano gratuito está limitado a 1 questionário. Mude de plano, ou elimine um questionário, e volte a este link.",
    installation_impossible:
      "A instalação não foi concluída. Nada foi criado, pode tentar de novo.",
  },
  aFaire: {
    "tags-systeme-io": "As suas tags Systeme.io (as do quiz original não viajam).",
    "url-bouton": "O endereço dos seus botões de ação.",
    "politique-confidentialite": "O link para a SUA política de privacidade.",
    tracking: "Os seus identificadores de seguimento (Meta, Google Analytics, Google Ads).",
    "pied-de-page": "O texto e o link do seu rodapé.",
  },
};

const PT_BR: TextesPartage = {
  ...PT,
  surtitre: "Compartilharam um quiz com você",
  installer: "Instalar este quiz na minha conta",
  installation: "Instalando...",
  lecture: "Lendo o link...",
  toutModifiable: "Tudo continua editável depois de instalado.",
  resteAToi: "O que ficará por sua conta:",
  compteRequis:
    `É preciso uma conta ${APP}. Se você não estiver conectado, levamos você e trazemos de volta a este link.`,
  installeCorps:
    "Chegou como rascunho, com os textos, as imagens, as perguntas e os perfis de resultado. Nada é publicado enquanto você não decidir.",
  avantPublier: "Antes de publicar, falta você preencher:",
  pourquoiVide:
    "Estes campos apontavam para a conta de quem enviou o quiz. Mantê-los teria mandado os visitantes dessa pessoa, e os seus leads para as automações dela.",
  raisons: {
    ...PT.raisons,
    non_connecte: `Entre no ${APP} e volte a este link: o quiz será instalado.`,
    limite_sondage:
      "O plano gratuito está limitado a 1 pesquisa. Mude de plano, ou exclua uma pesquisa, e volte a este link.",
  },
};

const AR: TextesPartage = {
  surtitre: "تمت مشاركة اختبار معك",
  installer: "تثبيت هذا الاختبار في حسابي",
  installation: "جارٍ التثبيت...",
  lecture: "جارٍ قراءة الرابط...",
  questions: (n) => `${n} سؤال`,
  resultats: (n) => `${n} ملف نتيجة`,
  toutModifiable: "كل شيء يبقى قابلًا للتعديل بعد التثبيت.",
  resteAToi: "ما سيبقى عليك ضبطه:",
  compteRequis:
    `يلزم حساب ${APP}. إن لم تكن متصلًا، نأخذك لتسجيل الدخول ثم نعيدك إلى هنا.`,
  installeTitre: "الاختبار أصبح عندك.",
  installeCorps:
    "وصل كمسودة، بنصوصه وصوره وأسئلته وملفات نتائجه. لا يُنشر شيء حتى تقرر أنت.",
  avantPublier: "قبل النشر، عليك ملء ما يلي:",
  pourquoiVide:
    "كانت هذه الحقول تشير إلى حساب من أرسل لك الاختبار. لو بقيت لأرسلت إليه زواره، ولأدخلت عملاءك في أتمتاته.",
  ouvrir: "فتح اختباري",
  liensMort: "هذا الرابط لا يؤدي إلى شيء",
  raisons: {
    inconnu: "هذا الرابط غير موجود، أو أن الاختبار حُذف منذ ذلك الحين.",
    revoque: "عُطّل هذا الرابط من قِبَل من أرسله إليك.",
    expire: "انتهت صلاحية هذا الرابط. اطلب رابطًا جديدًا، لا يستغرق سوى ثوانٍ.",
    epuise: "استُخدم هذا الرابط العدد المحدد من المرات.",
    panne: "تعذّرت قراءة الرابط الآن. حاول بعد قليل.",
    non_connecte: `سجّل الدخول إلى ${APP} ثم عد إلى هذا الرابط: سيُثبَّت الاختبار.`,
    limite_quiz:
      "الخطة المجانية محدودة باختبار واحد. غيّر خطتك أو احذف اختبارًا، ثم عد إلى هذا الرابط.",
    limite_sondage:
      "الخطة المجانية محدودة باستبيان واحد. غيّر خطتك أو احذف استبيانًا، ثم عد إلى هذا الرابط.",
    installation_impossible: "لم يكتمل التثبيت. لم يُنشأ أي شيء، يمكنك المحاولة مجددًا.",
  },
  aFaire: {
    "tags-systeme-io": "وسوم Systeme.io الخاصة بك (وسوم الاختبار الأصلي لا تنتقل).",
    "url-bouton": "عناوين أزرار الإجراء لديك.",
    "politique-confidentialite": "الرابط إلى سياسة الخصوصية الخاصة بك.",
    tracking: "معرّفات التتبع لديك (Meta وGoogle Analytics وGoogle Ads).",
    "pied-de-page": "نص ورابط تذييل صفحتك.",
  },
};

const PAR_LANGUE: Record<LanguePartage, TextesPartage> = {
  fr: FR,
  en: EN,
  es: ES,
  it: IT,
  pt: PT,
  "pt-BR": PT_BR,
  ar: AR,
};

/** Les textes de la page, dans la langue résolue. */
export function textesPartage(langue: LanguePartage): TextesPartage {
  return PAR_LANGUE[langue] ?? EN;
}
