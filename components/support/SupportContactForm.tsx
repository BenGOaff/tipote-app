"use client";

// components/support/SupportContactForm.tsx
//
// ÉCRIRE À UN HUMAIN, DEPUIS LE CENTRE D'AIDE COMMUN.
//
// Béné, 23 août 2026 : "s'il n'a pas reçu ses accès, comment il accède à
// quiz.tipote.com/support ? Je veux un service de ticketing dans le
// centre d'aide commun à toutes les app, essentiellement pour Tiquiz et
// L'Atelier qui sont vendus en ce moment."
//
// Le formulaire de Tiquiz est bien public (aucun compte demandé), mais
// ce n'est pas la question : personne ne devrait avoir à deviner sur
// QUELLE app écrire quand justement rien ne marche. Le centre d'aide est
// l'adresse commune aux trois produits, c'est donc ici que la porte
// s'ouvre.
//
// Il y avait aussi un robot d'aide, et il reste : certaines réponses
// sont dans les 57 articles et arrivent en dix secondes. Ce formulaire
// est l'autre chemin, celui qui ne dépend de rien.
//
// -- LE PRODUIT EST UN CHOIX, PAS UNE DEVINETTE ------------------------
//
// Le lien qui amène ici peut le poser (`?produit=atelier`), et la
// personne peut le changer. Sans lui, tous les tickets tomberaient dans
// le même seau et Béné trierait à la main.

import { useState } from "react";
import { Loader2, Mail, Send, CheckCircle2 } from "lucide-react";

const PRODUITS = [
  { id: "tiquiz", nom: "Tiquiz" },
  { id: "atelier", nom: "L'Atelier du Quiz" },
  { id: "tipote", nom: "Tipote" },
] as const;

const T: Record<string, Record<string, string>> = {
  titre: {
    fr: "Tu n'as pas trouvé ta réponse ?",
    en: "Didn't find your answer?",
    es: "¿No has encontrado tu respuesta?",
    it: "Non hai trovato la risposta?",
    pt: "Não encontraste a tua resposta?",
    "pt-BR": "Não encontrou sua resposta?",
    ar: "لم تجد إجابتك؟",
  },
  sous_titre: {
    fr: "Écris-nous, on répond par email. Pas besoin de compte.",
    en: "Write to us, we reply by email. No account needed.",
    es: "Escríbenos, respondemos por email. No hace falta cuenta.",
    it: "Scrivici, rispondiamo via email. Non serve un account.",
    pt: "Escreve-nos, respondemos por email. Não precisas de conta.",
    "pt-BR": "Escreva para nós, respondemos por email. Não precisa de conta.",
    ar: "اكتب لنا وسنرد عبر البريد. لا حاجة لحساب.",
  },
  produit: {
    fr: "De quel outil s'agit-il ?",
    en: "Which tool is this about?",
    es: "¿De qué herramienta se trata?",
    it: "Di quale strumento si tratta?",
    pt: "De que ferramenta se trata?",
    "pt-BR": "Sobre qual ferramenta?",
    ar: "عن أي أداة؟",
  },
  email: {
    fr: "Ton adresse email",
    en: "Your email address",
    es: "Tu correo electrónico",
    it: "Il tuo indirizzo email",
    pt: "O teu email",
    "pt-BR": "Seu email",
    ar: "بريدك الإلكتروني",
  },
  email_aide: {
    fr: "Celle de ton compte si tu en as un : ça nous permet de retrouver ta commande.",
    en: "The one on your account if you have one: it lets us find your order.",
    es: "La de tu cuenta si tienes una: nos permite encontrar tu pedido.",
    it: "Quella del tuo account se ne hai uno: ci permette di trovare il tuo ordine.",
    pt: "A da tua conta, se tiveres uma: permite-nos encontrar a tua encomenda.",
    "pt-BR": "A da sua conta, se tiver uma: assim encontramos seu pedido.",
    ar: "بريد حسابك إن كان لديك حساب: يساعدنا في العثور على طلبك.",
  },
  sujet: {
    fr: "Sujet (facultatif)",
    en: "Subject (optional)",
    es: "Asunto (opcional)",
    it: "Oggetto (facoltativo)",
    pt: "Assunto (opcional)",
    "pt-BR": "Assunto (opcional)",
    ar: "الموضوع (اختياري)",
  },
  message: {
    fr: "Ta question",
    en: "Your question",
    es: "Tu pregunta",
    it: "La tua domanda",
    pt: "A tua pergunta",
    "pt-BR": "Sua pergunta",
    ar: "سؤالك",
  },
  message_exemple: {
    fr: "Dis-nous ce qui bloque, et ce que tu as déjà essayé.",
    en: "Tell us what is blocking you, and what you already tried.",
    es: "Cuéntanos qué te bloquea y qué has intentado ya.",
    it: "Raccontaci cosa ti blocca e cosa hai già provato.",
    pt: "Diz-nos o que te bloqueia e o que já tentaste.",
    "pt-BR": "Conte o que está travando e o que você já tentou.",
    ar: "أخبرنا بما يعيقك وما جربته بالفعل.",
  },
  envoyer: {
    fr: "Envoyer ma demande",
    en: "Send my request",
    es: "Enviar mi solicitud",
    it: "Invia la mia richiesta",
    pt: "Enviar o meu pedido",
    "pt-BR": "Enviar meu pedido",
    ar: "أرسل طلبي",
  },
  envoi: {
    fr: "Envoi...",
    en: "Sending...",
    es: "Enviando...",
    it: "Invio...",
    pt: "A enviar...",
    "pt-BR": "Enviando...",
    ar: "جاري الإرسال...",
  },
  merci: {
    fr: "C'est envoyé. On te répond par email, à cette adresse.",
    en: "Sent. We will reply by email, to that address.",
    es: "Enviado. Te respondemos por email, a esa dirección.",
    it: "Inviato. Ti rispondiamo via email, a quell'indirizzo.",
    pt: "Enviado. Respondemos por email, para esse endereço.",
    "pt-BR": "Enviado. Respondemos por email, nesse endereço.",
    ar: "تم الإرسال. سنرد عبر البريد على هذا العنوان.",
  },
  err_email: {
    fr: "Cette adresse email ne semble pas valide.",
    en: "This email address does not look valid.",
    es: "Esta dirección de correo no parece válida.",
    it: "Questo indirizzo email non sembra valido.",
    pt: "Este email não parece válido.",
    "pt-BR": "Este email não parece válido.",
    ar: "هذا البريد لا يبدو صحيحا.",
  },
  err_court: {
    fr: "Ajoute quelques mots pour qu'on puisse t'aider vraiment.",
    en: "Add a few words so we can actually help.",
    es: "Añade unas palabras para que podamos ayudarte de verdad.",
    it: "Aggiungi qualche parola per poterti aiutare davvero.",
    pt: "Acrescenta algumas palavras para podermos ajudar mesmo.",
    "pt-BR": "Escreva um pouco mais para podermos ajudar de verdade.",
    ar: "أضف بعض الكلمات حتى نتمكن من مساعدتك فعلا.",
  },
  err_trop: {
    fr: "Tu as déjà envoyé plusieurs demandes. Attends un peu, on les a toutes.",
    en: "You already sent several requests. Give us a moment, we have them all.",
    es: "Ya has enviado varias solicitudes. Espera un poco, las tenemos todas.",
    it: "Hai già inviato più richieste. Aspetta un attimo, le abbiamo tutte.",
    pt: "Já enviaste vários pedidos. Espera um pouco, temos todos.",
    "pt-BR": "Você já enviou vários pedidos. Aguarde um pouco, temos todos.",
    ar: "لقد أرسلت عدة طلبات. انتظر قليلا، وصلتنا كلها.",
  },
  err_generique: {
    fr: "L'envoi n'a pas abouti. Réessaie dans un instant.",
    en: "Sending failed. Try again in a moment.",
    es: "El envío no funcionó. Inténtalo de nuevo en un momento.",
    it: "L'invio non è riuscito. Riprova tra poco.",
    pt: "O envio falhou. Tenta de novo daqui a pouco.",
    "pt-BR": "O envio falhou. Tente de novo em instantes.",
    ar: "فشل الإرسال. حاول مرة أخرى بعد قليل.",
  },
};

function t(cle: string, locale: string): string {
  return T[cle]?.[locale] ?? T[cle]?.fr ?? "";
}

/** Le serveur renvoie la RAISON, l'écran sait comment la dire. */
const RAISONS: Record<string, string> = {
  invalid_email: "err_email",
  message_trop_court: "err_court",
  trop_de_demandes: "err_trop",
};

export default function SupportContactForm({
  locale,
  produitParDefaut,
}: {
  locale: string;
  produitParDefaut?: string;
}) {
  const [produit, setProduit] = useState(
    PRODUITS.some((p) => p.id === produitParDefaut) ? (produitParDefaut as string) : "tiquiz",
  );
  const [email, setEmail] = useState("");
  const [sujet, setSujet] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (envoi) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          subject: sujet,
          message,
          product: produit,
          locale,
          page: "centre d'aide",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (j.ok) {
        setEnvoye(true);
        return;
      }
      setErreur(t(RAISONS[j.reason ?? ""] ?? "err_generique", locale));
    } catch {
      setErreur(t("err_generique", locale));
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
          {t("merci", locale)}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("titre", locale)}</h2>
          <p className="text-sm text-muted-foreground">{t("sous_titre", locale)}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            {t("produit", locale)}
          </label>
          <div className="flex flex-wrap gap-2">
            {PRODUITS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProduit(p.id)}
                className={
                  produit === p.id
                    ? "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-full border px-4 py-1.5 text-sm text-foreground hover:bg-muted"
                }
              >
                {p.nom}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="support-email" className="mb-1.5 block text-sm font-medium text-foreground">
            {t("email", locale)}
          </label>
          <input
            id="support-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("email_aide", locale)}</p>
        </div>

        <div>
          <label htmlFor="support-sujet" className="mb-1.5 block text-sm font-medium text-foreground">
            {t("sujet", locale)}
          </label>
          <input
            id="support-sujet"
            type="text"
            value={sujet}
            onChange={(e) => setSujet(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label htmlFor="support-message" className="mb-1.5 block text-sm font-medium text-foreground">
            {t("message", locale)}
          </label>
          <textarea
            id="support-message"
            required
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("message_exemple", locale)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {erreur && <p className="text-sm font-medium text-destructive">{erreur}</p>}

        <button
          type="submit"
          disabled={envoi}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {envoi ? t("envoi", locale) : t("envoyer", locale)}
        </button>
      </div>
    </form>
  );
}
