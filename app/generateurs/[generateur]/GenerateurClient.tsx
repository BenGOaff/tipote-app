"use client";

// L'ÉCRAN D'UN GÉNÉRATEUR.
//
// -- IL NE DÉCIDE RIEN -------------------------------------------------
//
// Quel générateur marche sur quel projet, quels morceaux il produit,
// comment se rend le Markdown : tout vit dans `lib/generateurs/`, en
// fonctions pures et testées. Un écran qui recalculerait sa propre règle
// finirait par proposer un générateur qui échoue, ou par afficher un
// nombre d'emails que le serveur n'écrira pas (le défaut sorti six fois
// dans ces dépôts).
//
// -- UN MORCEAU À LA FOIS, ET LA PROGRESSION SE VOIT -------------------
//
// Chaque morceau est un appel court. Ils s'enchaînent, et ce qui est
// déjà écrit reste à l'écran : un morceau qui échoue ne fait pas perdre
// les autres. C'est ce que la roue qui tourne pendant deux minutes ne
// permet pas.
//
// -- ET UN `ok: false` PRODUIT TOUJOURS QUELQUE CHOSE À L'ÉCRAN --------
//
// Règle du 3 août. Le serveur renvoie une RAISON, jamais une phrase :
// l'interface existe en 7 langues.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Lock,
  Megaphone,
  Pencil,
  Sparkles,
  AlertTriangle,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  blocageGenerateur,
  demandeUnProfil,
  demandeUneOffre,
  type BlocageGenerateur,
  type GenerateurId,
} from "@/lib/generateurs/catalogue";
import { FORMATS_OFFRE, type FormatOffre } from "@/lib/generateurs/offre";
import { passeParLesPistes, planFixe } from "@/lib/generateurs/sequences";
import {
  etapesDuParcours,
  peutAvancer,
  precedente,
  suivante,
  type Etape,
} from "@/lib/generateurs/parcours";
import type { Bloc, Piece, Piste } from "@/lib/generateurs/blocs";
import { avancement } from "@/lib/generateurs/avancement";
import { RichTextEdit } from "@/components/ui/rich-text-edit";
// LES QUATRE MODULES DU LABO DE L'ATELIER, PORTÉS À L'OCTET PRÈS.
// `cmp` entre les deux dépôts est le garde-fou : deux copies qui
// divergent, c'est un rendu et un PDF qui ne se ressemblent plus.
import { parseBonusDoc } from "@/lib/bonus/document";
import { markdownToEditorHtml, editorHtmlToMarkdown } from "@/lib/bonus/markdownHtml";
import { buildPrintableHtml } from "@/lib/bonus/printable";
import { BonusDocument } from "@/components/BonusDocument";

/**
 * LE COMPTEUR DE CRÉDITS, quand l'app en a un.
 *
 * `null` chez Tiquiz, qui n'en a pas : ce composant est le MÊME dans les
 * deux dépôts, et une prop optionnelle vaut mieux que deux écrans qui
 * divergeraient au premier correctif. Rien de ce bloc ne s'affiche quand
 * elle est nulle.
 */
export interface CreditsAffiches {
  solde: number;
  coutPistes: number;
  coutParBloc: Record<string, number>;
}

export interface ProjetAffiche {
  id: string;
  titre: string;
  mode: string;
  statut: string;
  nbQuestions: number;
  profils: { titre: string; description: string }[];
}

/**
 * L'ALLURE D'UN DOSSIER, par bloc.
 *
 * Portée de `FOLDERS` dans le labo de l'Atelier : une icône, un fond, et
 * une encre. Les trois blocs du bonus gardent EXACTEMENT ses couleurs
 * (indigo, violet, ambre) ; les emails et les posts, qui n'existent pas
 * là bas, prennent les deux teintes suivantes de la même famille.
 *
 * On assume le branding : ces écrans sont notre espace membre, jamais le
 * quiz public d'une créatrice (c'est la distinction qu'elle a posée le
 * 5 août, et c'est elle qui décide où les couleurs sont permises).
 */
const DOSSIER: Record<Bloc, { icone: typeof BookOpen; encre: string; fond: string }> = {
  contenu: {
    icone: FileText,
    encre: "text-violet-600 dark:text-violet-300",
    fond: "bg-violet-50 dark:bg-violet-950/40",
  },
  guide: {
    icone: BookOpen,
    encre: "text-indigo-600 dark:text-indigo-300",
    fond: "bg-indigo-50 dark:bg-indigo-950/40",
  },
  remise: {
    icone: Megaphone,
    encre: "text-amber-600 dark:text-amber-300",
    fond: "bg-amber-50 dark:bg-amber-950/40",
  },
  email: {
    icone: FileText,
    encre: "text-sky-600 dark:text-sky-300",
    fond: "bg-sky-50 dark:bg-sky-950/40",
  },
  post: {
    icone: Megaphone,
    encre: "text-emerald-600 dark:text-emerald-300",
    fond: "bg-emerald-50 dark:bg-emerald-950/40",
  },
};

/**
 * Le nombre de pistes au delà duquel on n'en propose plus.
 *
 * Trois au départ, trois de plus au maximum, comme dans le labo de
 * l'Atelier. Au delà, une liste ne fait plus choisir : elle paralyse, et
 * chaque clic supplémentaire coûte une génération.
 */
const MAX_PISTES = 6;

type Etat = "repos" | "pistes" | "production";

export default function GenerateurClient({
  userEmail,
  generateur,
  projets,
  autorise,
  lienPlans,
  credits = null,
}: {
  userEmail: string;
  generateur: GenerateurId;
  projets: ProjetAffiche[];
  autorise: boolean;
  /** Où mène "Voir les formules" (l'onglet diffère selon le dépôt). */
  lienPlans: string;
  credits?: CreditsAffiches | null;
}) {
  const t = useTranslations("generateurs");

  // LE SOLDE SUIT LES GÉNÉRATIONS, sinon il ment jusqu'au prochain
  // rechargement : la créatrice lance trois contenus et croit n'avoir
  // rien payé. Le serveur renvoie ce qu'il a débité, on le retire ici.
  const [solde, setSolde] = useState<number | null>(credits?.solde ?? null);
  const coutDe = (bloc: string) => credits?.coutParBloc[bloc] ?? 0;
  const coutPiste = (p: Piste) => p.pieces.reduce((n, x) => n + coutDe(x.bloc), 0);
  function retirer(data: { credits?: unknown } | null) {
    const n = Number(data?.credits ?? 0);
    if (credits && Number.isFinite(n) && n > 0) setSolde((s) => Math.max(0, (s ?? 0) - n));
  }

  const [projetId, setProjetId] = useState<string>("");
  const [profilIndex, setProfilIndex] = useState<number>(0);
  const [promesse, setPromesse] = useState("");
  const [format, setFormat] = useState<FormatOffre>("formation");
  const [prix, setPrix] = useState("");

  const [etat, setEtat] = useState<Etat>("repos");
  const [pistes, setPistes] = useState<Piste[]>([]);
  const [recommandee, setRecommandee] = useState(0);
  const [pourquoiRecommandee, setPourquoiRecommandee] = useState("");
  const [choisie, setChoisie] = useState<Piste | null>(null);
  const [contenus, setContenus] = useState<Record<string, { markdown: string; tronque: boolean }>>(
    {},
  );
  const [enCours, setEnCours] = useState<string | null>(null);
  // LE DOSSIER OUVERT, ET RIEN D'AUTRE À L'ÉCRAN.
  // "Ces 3 blocs qui s'enchaînent ça fait beaucoup scroller, on voit mal
  // la limite entre chacun" (Béné, Atelier, 5 août 2026). `null` = la
  // grille des dossiers ; une clé = un seul document long affiché.
  const [ouvert, setOuvert] = useState<string | null>(null);
  // UN TEXTE GÉNÉRÉ EST UN BROUILLON, PAS UN LIVRABLE : elle corrige sur
  // place, et le PDF reprend SA version.
  const [edition, setEdition] = useState<string | null>(null);

  const projet = useMemo(
    () => projets.find((p) => p.id === projetId) ?? null,
    [projets, projetId],
  );

  // CE QUI EST VRAIMENT CHOISISSABLE. `projets.length === 0` ne
  // distinguait pas "tu n'as aucun projet" de "aucun de tes projets ne
  // peut servir a ce generateur", alors que la phrase affichee dit la
  // SECONDE. Avec un menu deroulant, la difference se voit : une liste
  // ou toutes les options sont grisees est un cul-de-sac muet.
  const utilisables = useMemo(
    () =>
      projets.filter(
        (p) =>
          !blocageGenerateur(generateur, {
            mode: p.mode,
            profils: p.profils,
            nbQuestions: p.nbQuestions,
          }),
      ),
    [projets, generateur],
  );
  const blocage: BlocageGenerateur | null = projet
    ? blocageGenerateur(generateur, {
        mode: projet.mode,
        profils: projet.profils,
        nbQuestions: projet.nbQuestions,
      })
    : null;

  const veutProfil = demandeUnProfil(generateur);
  const veutOffre = demandeUneOffre(generateur);
  const pretPourPistes =
    Boolean(projet) &&
    !blocage &&
    (!veutOffre || promesse.trim().length > 0) &&
    (!veutProfil || Boolean(projet?.profils[profilIndex]));

  // ── LE PARCOURS ──
  //
  // Une étape à la fois, comme le labo de l'Atelier. Les étapes elles
  // mêmes dépendent du générateur : la promo ne demande ni profil ni
  // offre, et seuls les BONUS passent par des pistes (`sequences.ts`).
  const parcours = useMemo(() => etapesDuParcours(generateur), [generateur]);
  const [etape, setEtape] = useState<Etape>(parcours[0]!);
  const etatParcours = {
    projetPret: Boolean(projet) && !blocage,
    profilPret: !veutProfil || Boolean(projet?.profils[profilIndex]),
    offrePrete: !veutOffre || promesse.trim().length > 0,
    pistesPretes: pistes.length > 0,
  };
  const avant = precedente(generateur, etape);
  const apres = suivante(generateur, etape);
  const peutPasser = peutAvancer(etape, etatParcours);

  /** Le serveur dit la RAISON, l'écran dit comment la dire. */
  function direLErreur(reason: unknown) {
    const cle = String(reason ?? "generic");
    // Une raison qu'on ne connaît pas ne doit pas produire un écran
    // muet : on retombe sur une phrase qui dit quoi faire.
    const connues = [
      "busy",
      "too_long",
      "refused",
      "unreachable",
      "empty",
      "unreadable",
      "rate_limited",
      "not_configured",
      "plan_required",
      "offre_manquante",
      "profil_manquant",
      "not_found",
      "credits",
    ];
    toast.error(t(`erreurs.${connues.includes(cle) ? cle : "generic"}`));
  }

  function corpsCommun() {
    return {
      generateur,
      quizId: projetId,
      ...(veutOffre ? { offre: { promesse, format, prix } } : {}),
      ...(veutProfil ? { profilIndex } : {}),
    };
  }

  async function demanderPistes() {
    if (!pretPourPistes) return;
    setEtat("pistes");
    setPistes([]);
    setChoisie(null);
    setContenus({});
    try {
      const res = await fetch("/api/generateurs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "pistes", ...corpsCommun() }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        direLErreur(data?.reason);
        setEtat("repos");
        return;
      }
      retirer(data);
      setPistes(data.pistes ?? []);
      setRecommandee(Number(data.recommandee ?? 0));
      setPourquoiRecommandee(String(data.pourquoiRecommandee ?? ""));
      setEtat("repos");
      // ON LANCE DEPUIS LES RÉGLAGES, ON ATTERRIT SUR LES PISTES.
      // C'est ce que fait le labo de l'Atelier (`askPistes` puis
      // `setStep("pistes")`) : l'étape des pistes n'a jamais d'écran
      // vide avec un bouton, elle MONTRE les trois pistes.
      setEtape("pistes");
    } catch {
      direLErreur("unreachable");
      setEtat("repos");
    }
  }

  /**
   * UNE PISTE DE PLUS, ET LES TROIS RESTENT.
   *
   * Béné, Atelier, 6 août 2026 : "aucune ne te convainc ?" Le bouton dit
   * ce qu'il coûte et ce qu'il rend, une idée et pas une nouvelle
   * fournée. Sans ça, on clique en craignant de perdre les trois qui
   * sont à l'écran, donc on ne clique pas.
   */
  async function unePisteDePlus() {
    if (pistes.length >= MAX_PISTES || etat === "pistes") return;
    setEtat("pistes");
    try {
      const res = await fetch("/api/generateurs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "encore",
          ...corpsCommun(),
          // CE QU'ELLE A DÉJÀ SOUS LES YEUX : sans ça, on paie une
          // génération pour un doublon.
          connues: pistes.map((p) => ({ format: p.format, titre: p.titre })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok || !data.piste) {
        direLErreur(data?.reason);
        setEtat("repos");
        return;
      }
      retirer(data);
      setPistes((l) => [...l, data.piste as Piste]);
      setEtat("repos");
    } catch {
      direLErreur("unreachable");
      setEtat("repos");
    }
  }

  const cle = (p: Piece) => `${p.bloc}-${p.index}`;

  async function ecrireUn(piste: Piste, pieceIndex: number): Promise<boolean> {
    const piece = piste.pieces[pieceIndex];
    if (!piece) return false;
    setEnCours(cle(piece));
    try {
      const res = await fetch("/api/generateurs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "produire",
          ...corpsCommun(),
          piste,
          pieceIndex,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        direLErreur(data?.reason);
        return false;
      }
      retirer(data);
      setContenus((c) => ({
        ...c,
        [cle(piece)]: {
          markdown: String(data.markdown ?? ""),
          tronque: Boolean(data.tronque),
        },
      }));
      return true;
    } catch {
      direLErreur("unreachable");
      return false;
    } finally {
      setEnCours(null);
    }
  }

  /**
   * ÉCRIRE SANS PISTE : la séquence est fixe (emails, promo).
   *
   * Béné, 2 septembre 2026 : "le générateur d'emails ne génère pas 'des
   * pistes' mais des emails putain t'as fait n'imp." Le serveur ignore
   * ce qu'on lui déclare et rend le plan de `sequences.ts` ; on
   * construit donc ici la même liste, pour que l'écran sache combien de
   * morceaux annoncer AVANT de lancer.
   */
  function pisteDuPlanFixe(): Piste {
    const plan = planFixe(generateur) ?? [];
    const compteurs = new Map<string, number>();
    return {
      titre: "",
      format: "",
      punchline: "",
      pourquoi: "",
      pieces: plan.map((temps) => {
        const n = (compteurs.get(temps.bloc) ?? 0) + 1;
        compteurs.set(temps.bloc, n);
        return { bloc: temps.bloc, index: n, resume: temps.intention, cle: temps.cle };
      }),
    };
  }

  /**
   * CHOISIR UNE PISTE N'ÉCRIT RIEN.
   *
   * Le labo de l'Atelier fait exactement ça : choisir mène aux dossiers,
   * et chaque dossier porte SON bouton "Générer". On écrivait tout d'un
   * coup, donc on facturait sept contenus à quelqu'un qui en voulait
   * peut être deux, et on lui imposait deux minutes d'attente avant de
   * voir quoi que ce soit.
   */
  function choisirPiste(piste: Piste) {
    setChoisie(piste);
    setContenus({});
    setOuvert(null);
    setEdition(null);
    setEtape("contenus");
  }

  /** Le titre d'un morceau, traduit. Jamais l'intention brute. */
  function titrePiece(piece: Piece): string {
    // Sur un plan fixe, `resume` porte la consigne envoyée au modèle, et
    // elle est en français dans un écran qui existe en 7 langues (c'est
    // le "Résultat 4" du 1er septembre).
    return piece.cle
      ? `${piece.index}. ${t(`temps.${piece.cle}`)}`
      : t(`blocs.${piece.bloc}`, { index: piece.index });
  }

  /**
   * LE PDF : une page autonome, imprimée par le navigateur.
   *
   * Aucune dépendance ajoutée, exactement comme dans l'Atelier : une
   * bibliothèque de PDF coûterait un paquet dans le `package-lock`, et
   * `npm ci` casse en prod si le lock n'est pas commité avec.
   */
  function exporterPdf(piece: Piece) {
    const ecrit = contenus[cle(piece)];
    if (!ecrit) return;
    const fen = window.open("", "_blank");
    if (!fen) {
      // Une fenêtre bloquée SE DIT : un bouton qui ne fait rien envoie
      // chercher au mauvais endroit.
      toast.error(t("production.popupBloquee"));
      return;
    }
    const doc = parseBonusDoc(ecrit.markdown);
    fen.document.write(
      buildPrintableHtml(doc, { title: doc.title || titrePiece(piece) }),
    );
    fen.document.close();
    fen.focus();
  }

  /**
   * CE QU'ON EST EN TRAIN D'ÉCRIRE.
   *
   * Le bonus le tient d'une piste CHOISIE ; les deux autres l'ont d'un
   * plan fixe, donc rien à choisir et rien à attendre. C'est un
   * PARAMÈTRE de la mécanique (`passeParLesPistes`), jamais une
   * déduction de la présence d'une piste : déduire marcherait
   * aujourd'hui et casserait au premier générateur qui aurait les deux.
   */
  const travail: Piste | null = passeParLesPistes(generateur)
    ? choisie
    : pisteDuPlanFixe();

  const clesDuTravail = travail ? travail.pieces.map(cle) : [];
  const av = avancement(clesDuTravail, contenus);
  const phraseAvancement =
    av.etat === "rien"
      ? t("production.avancement.rien")
      : av.etat === "complet"
        ? t("production.avancement.complet")
        : t("production.avancement.partiel", { faits: av.faits, total: av.total });

  const indexOuvert = travail ? travail.pieces.findIndex((x) => cle(x) === ouvert) : -1;
  const ouvertPiece = indexOuvert >= 0 ? travail!.pieces[indexOuvert]! : null;
  const contenuOuvert = ouvert ? (contenus[ouvert] ?? null) : null;

  const [copie, setCopie] = useState(false);
  async function copierOuvert() {
    if (!contenuOuvert) return;
    try {
      await navigator.clipboard.writeText(contenuOuvert.markdown);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Un échec de copie SE DIT : un bouton qui ne fait rien envoie
      // chercher au mauvais endroit (règle du 1er août sur le partage).
      toast.error(t("erreurs.generic"));
    }
  }

  return (
    <AppShell userEmail={userEmail} headerTitle={t(`cartes.${generateur}.titre`)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/generateurs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("retour")}
        </Link>
        {credits && solde !== null ? (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("credits.solde", { count: solde })}
          </span>
        ) : null}
      </div>

      {!autorise ? (
        <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Lock className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t("verrou.badge")}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{t("verrou.corps")}</p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href={lienPlans}>{t("verrou.cta")}</Link>
          </Button>
        </div>
      ) : null}

      {/* ── LE FIL DES ÉTAPES ──
          Il dit où on en est ET où on va. Une étape déjà franchie se
          reclique : revenir en arrière doit être aussi facile que
          d'avancer, sinon on recommence tout pour corriger un mot. */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {parcours.map((e, i) => {
          const rang = parcours.indexOf(etape);
          const franchie = i < rang;
          const active = e === etape;
          return (
            <li key={e} className="flex items-center gap-2">
              {i > 0 ? <span className="text-muted-foreground/50">›</span> : null}
              <button
                type="button"
                disabled={!franchie && !active}
                onClick={() => setEtape(e)}
                className={
                  active
                    ? "font-bold text-foreground"
                    : franchie
                      ? "text-primary hover:underline"
                      : "text-muted-foreground/60 cursor-default"
                }
                aria-current={active ? "step" : undefined}
              >
                {i + 1}. {t(`parcours.${e}`)}
              </button>
            </li>
          );
        })}
      </ol>

      {/* ── 1. LE PROJET ── */}
      {etape === "projet" ? (
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div>
          <h2 className="font-display font-bold text-sm">{t("etapes.projet")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("projet.aide")}</p>
        </div>

        {/* UN MENU DEROULANT, PAS UNE GRILLE DE CARTES (Béné,
            3 septembre 2026). Une carte par projet donne une page
            interminable des qu'on en a vingt, et le geste ici est un
            CHOIX dans une liste, pas une exploration.

            CE QUI NE DOIT PAS SE PERDRE EN CHEMIN : un projet bloqué
            DIT pourquoi. Le griser sans un mot se lit comme un bug, et
            la créatrice cherche (règle du 22 août). Une <option> tient
            sur une ligne, donc la raison y est dite en version COURTE
            (`projet.bloqueCourt`), la version longue restant celle des
            écrans qui ont la place. */}
        {utilisables.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>{t("projet.aucun")}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/quiz/new">{t("projet.aucunCta")}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <select
              value={projetId}
              onChange={(e) => {
                setProjetId(e.target.value);
                setProfilIndex(0);
                setPistes([]);
                setChoisie(null);
                setContenus({});
              }}
              className="w-full h-9 rounded-lg border bg-background border-input px-2 text-sm"
            >
              <option value="">{t("projet.choisir")}</option>
              {projets.map((p) => {
                const b = blocageGenerateur(generateur, {
                  mode: p.mode,
                  profils: p.profils,
                  nbQuestions: p.nbQuestions,
                });
                const titre = p.titre || "...";
                return (
                  <option key={p.id} value={p.id} disabled={Boolean(b)}>
                    {b
                      ? t("projet.indisponible", {
                          titre,
                          raison: t(`projet.bloqueCourt.${b}`),
                        })
                      : titre}
                  </option>
                );
              })}
            </select>

            {/* Ce que la carte disait et que le menu ne peut pas dire :
                la taille du projet choisi. */}
            {projet ? (
              <p className="text-xs text-muted-foreground">
                {t("projet.questions", { count: projet.nbQuestions })}
              </p>
            ) : null}
          </div>
        )}
      </section>
      ) : null}

      {/* ── 2. LE PROFIL ── */}
      {etape === "reglages" && projet && !blocage && veutProfil ? (
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <div>
            <h2 className="font-display font-bold text-sm">{t("etapes.profil")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("profil.aide")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {projet.profils.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setProfilIndex(i);
                  setPistes([]);
                  setChoisie(null);
                  setContenus({});
                }}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  i === profilIndex ? "border-primary bg-primary/5" : "hover:border-primary/50"
                }`}
              >
                <span className="block font-semibold text-sm truncate">
                  {p.titre || t("profil.sansTitre", { rang: i + 1 })}
                </span>
                {p.description ? (
                  <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {p.description}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── L'OFFRE ── */}
      {etape === "reglages" && projet && !blocage && veutOffre ? (
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-sm">{t("etapes.offre")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("offre.aide")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-promesse">{t("offre.promesse")}</Label>
            <Textarea
              id="gen-promesse"
              rows={2}
              maxLength={600}
              value={promesse}
              onChange={(e) => setPromesse(e.target.value)}
              placeholder={t("offre.promessePlaceholder")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gen-format">{t("offre.format")}</Label>
              <select
                id="gen-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as FormatOffre)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                {FORMATS_OFFRE.map((f) => (
                  <option key={f} value={f}>
                    {t(`offre.formats.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-prix">{t("offre.prix")}</Label>
              <Input
                id="gen-prix"
                value={prix}
                maxLength={120}
                onChange={(e) => setPrix(e.target.value)}
                placeholder={t("offre.prixPlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground">{t("offre.prixAide")}</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── LES PISTES ── (le BONUS seulement : voir `sequences.ts`) */}
      {etape === "pistes" && projet && !blocage ? (
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-sm">{t("pistes.titre")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("pistes.aide")}</p>
          </div>

          {/* LA RECOMMANDATION PASSE AU DESSUS DES CARTES, comme dans
              l'Atelier. En dessous, on l'a déjà lue trop tard : elle
              sert à ORIENTER le choix, pas à le commenter. */}
          {pistes.length > 0 && pourquoiRecommandee ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <strong>{t("pistes.recommandation", { rang: recommandee + 1 })}</strong>{" "}
              {pourquoiRecommandee}
            </p>
          ) : null}

          {pistes.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-3 items-start">
              {pistes.map((p, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-4 flex flex-col gap-2 ${
                    choisie?.titre === p.titre ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  {i === recommandee ? (
                    <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
                      {t("pistes.recommandee")}
                    </span>
                  ) : null}
                  <h3 className="font-semibold text-sm leading-snug">{p.titre}</h3>
                  {p.format ? (
                    <span className="text-[11px] text-muted-foreground">{p.format}</span>
                  ) : null}
                  {p.punchline ? <p className="text-sm">{p.punchline}</p> : null}
                  {p.pourquoi ? (
                    <p className="text-xs text-muted-foreground">{p.pourquoi}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground mt-auto pt-2 border-t">
                    {t("pistes.morceaux", { count: p.pieces.length })}
                    {credits ? (
                      <>
                        {" "}
                        {/* LE TOTAL, pas le prix d'un morceau : annoncer
                            l'unité, c'est laisser découvrir l'addition
                            en cours de route. */}
                        <span className="font-semibold">
                          {t("credits.cout", { count: coutPiste(p) })}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <Button
                    size="sm"
                    variant={choisie?.titre === p.titre ? "default" : "outline"}
                    disabled={!autorise || etat === "production" || Boolean(enCours)}
                    onClick={() => choisirPiste(p)}
                  >
                    {choisie?.titre === p.titre ? t("pistes.choisie") : t("pistes.choisir")}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {/* UNE DE PLUS, ET LES TROIS RESTENT. Le bouton dit ce qu'il
              rend et ce qu'il coûte : une relance gratuite en apparence
              est la meilleure façon de vider un compteur sans comprendre
              pourquoi, et une relance qui REMPLACE est un bouton sur
              lequel on ne clique jamais. */}
          {pistes.length > 0 && pistes.length < MAX_PISTES ? (
            <div className="flex flex-col items-start gap-1.5 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={unePisteDePlus}
                disabled={!autorise || !pretPourPistes || etat === "pistes" || Boolean(enCours)}
              >
                {etat === "pistes" ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                {etat === "pistes" ? t("pistes.encours") : t("pistes.uneDePlus")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("pistes.uneDePlusAide")}
                {credits ? ` ${t("credits.coutPistes", { count: credits.coutPistes })}` : ""}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── LES CONTENUS : DES DOSSIERS, PAS UNE PILE ──
          Béné, Atelier, 5 août 2026 : "ces 3 blocs qui s'enchaînent ça
          fait beaucoup scroller, on voit mal la limite entre chacun. On
          peut faire 3 dossiers comme les dossiers quiz / sondages ?"
          Oui, et c'est le même mécanisme : une grille de cartes, un clic
          ouvre, une flèche remonte. Un seul contenu long à l'écran. */}

      {etape === "contenus" && travail && ouvert === null ? (
        <section className="space-y-4">
          {/* LA FLÈCHE REMONTE D'UN CRAN DE HIÉRARCHIE, jamais dans
              l'historique : la piste pour le bonus, les réglages pour un
              plan fixe. Sans elle, l'écran de production est un
              cul-de-sac, puisque le pied de parcours ne s'y affiche
              pas. */}
          {avant ? (
            <button
              type="button"
              onClick={() => setEtape(avant)}
              className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t(`parcours.${avant}`)}
            </button>
          ) : null}
          <div>
            {/* LE TITRE DE L'ÉCRAN EST CELUI DE LA PISTE, avec sa
                punchline et l'avancement dessous : "Les contenus" ne
                disait ni ce qu'on fabrique, ni ce qu'il reste à faire. */}
            <h2 className="font-display text-xl font-bold">
              {travail.titre || t("etapes.contenus")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {[travail.punchline, phraseAvancement].filter(Boolean).join(" . ")}
            </p>
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-3">
            {travail.pieces.map((piece) => {
              const k = cle(piece);
              const d = DOSSIER[piece.bloc];
              const Icone = d.icone;
              const ecrit = Boolean(contenus[k]);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOuvert(k)}
                  className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/50"
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${d.fond}`}
                  >
                    <Icone className={`h-5 w-5 ${d.encre}`} />
                  </span>
                  <span className="font-display font-semibold leading-snug text-sm">
                    {titrePiece(piece)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {piece.cle ? t(`temps.${piece.cle}`) : piece.resume}
                  </span>
                  <span className="mt-auto pt-1 text-xs font-medium text-muted-foreground">
                    {enCours === k
                      ? t("production.enCoursCourt")
                      : ecrit
                        ? t("production.pret")
                        : t("production.aGenerer")}
                    {!ecrit && credits ? ` . ${t("credits.cout", { count: coutDe(piece.bloc) })}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── UN DOSSIER OUVERT : UN SEUL DOCUMENT ── */}
      {etape === "contenus" && travail && ouvertPiece ? (
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setOuvert(null);
              setEdition(null);
            }}
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("production.retourDossiers")}
          </button>
          <div>
            <h2 className="font-display text-xl font-bold">{titrePiece(ouvertPiece)}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {ouvertPiece.cle ? t(`temps.${ouvertPiece.cle}`) : ouvertPiece.resume}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={contenuOuvert ? "outline" : "default"}
              disabled={!autorise || Boolean(enCours)}
              onClick={() => void ecrireUn(travail!, indexOuvert)}
            >
              {enCours === ouvert ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-1.5" />
              )}
              {contenuOuvert ? t("production.refaire") : t("production.generer")}
            </Button>
            {contenuOuvert ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEdition(edition === ouvert ? null : ouvert)}
                >
                  {edition === ouvert ? (
                    <Check className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Pencil className="h-4 w-4 mr-1.5" />
                  )}
                  {edition === ouvert ? t("production.termine") : t("production.modifier")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void copierOuvert()}>
                  {copie ? (
                    <Check className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1.5" />
                  )}
                  {copie ? t("production.copie") : t("production.copier")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => exporterPdf(ouvertPiece)}>
                  <Download className="h-4 w-4 mr-1.5" />
                  {t("production.pdf")}
                </Button>
              </>
            ) : null}
            {!contenuOuvert && credits ? (
              <span className="self-center text-xs text-muted-foreground">
                {t("credits.cout", { count: coutDe(ouvertPiece.bloc) })}
              </span>
            ) : null}
          </div>

          {contenuOuvert?.tronque ? (
            <p className="text-xs flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {t("production.tronque")}
            </p>
          ) : null}

          {/* LE MARKDOWN RESTE LA SOURCE DE VÉRITÉ, l'éditeur n'est
              qu'un pont (`lib/bonus/markdownHtml.ts`) : le rendu et le
              PDF ne changent pas d'un pixel. */}
          {contenuOuvert && edition === ouvert ? (
            <RichTextEdit
              key={ouvert}
              value={markdownToEditorHtml(contenuOuvert.markdown)}
              onChange={(html) =>
                setContenus((c) => ({
                  ...c,
                  [ouvert!]: { markdown: editorHtmlToMarkdown(html), tronque: false },
                }))
              }
              className="rounded-xl border bg-card p-5 text-sm leading-relaxed"
            />
          ) : null}

          {contenuOuvert && edition !== ouvert ? (
            <RenduGenere markdown={contenuOuvert.markdown} />
          ) : null}

          {!contenuOuvert ? (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {enCours === ouvert ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("production.enCoursCourt")}
                </span>
              ) : (
                t("production.vide")
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── AVANCER, OU REVENIR ──
          Une étape qui ne peut pas être franchie le DIT, elle ne se
          contente pas d'un bouton gris : sans la raison, on cherche ce
          qu'on a mal fait (règle du 22 août, "un bouton absent se
          justifie sur la ligne"). */}
      {etape !== "contenus" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {avant ? (
            <Button variant="ghost" size="sm" onClick={() => setEtape(avant)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {t("parcours.precedent")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {!peutPasser ? (
              <span className="text-xs text-muted-foreground">
                {t(`parcours.manque.${etape}`)}
              </span>
            ) : null}
            {/* L'ÉTAPE DES PISTES N'A PAS DE BOUTON "SUIVANT" DU TOUT.
                On y arrive parce qu'on a lancé, on en sort en
                CHOISISSANT une piste. */}
            {apres === "pistes" ? (
              <>
                {/* LE BOUTON QUI LANCE LES PISTES EST ICI, au pied des
                    réglages, et pas sur l'écran d'après. Un "Suivant"
                    qui mène à un écran vide portant un bouton fait
                    payer DEUX clics pour un seul geste : c'est ce que
                    Béné a vu le 3 septembre ("cette étape est inutile :
                    autant générer les trois pistes directement"), et
                    c'est ce que le labo de l'Atelier n'a jamais fait. */}
                <Button
                  size="sm"
                  disabled={!peutPasser || etat === "pistes" || Boolean(enCours)}
                  onClick={demanderPistes}
                >
                  {etat === "pistes" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1.5" />
                  )}
                  {etat === "pistes" ? t("pistes.encours") : t("pistes.lancer")}
                </Button>
                {credits ? (
                  <span className="text-xs text-muted-foreground">
                    {t("credits.coutPistes", { count: credits.coutPistes })}
                  </span>
                ) : null}
              </>
            ) : apres && etape !== "pistes" ? (
              <Button size="sm" disabled={!peutPasser} onClick={() => setEtape(apres)}>
                {t("parcours.suivant")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

/**
 * LE RENDU D'UN DOCUMENT GÉNÉRÉ.
 *
 * La STRUCTURE vient de `lib/bonus/document.ts` et les COULEURS de
 * `lib/bonus/accents.ts`, les deux portés à l'octet près du labo de
 * l'Atelier. Ce composant ne relit jamais le markdown lui même : c'est
 * ce qui garantit que le PDF, qui lit les mêmes modules, ressemble à
 * l'écran.
 *
 * Un texte sans aucune section retombe sur un rendu simple : forcer une
 * carte unique qui contient tout n'apporterait rien.
 */
function RenduGenere({ markdown }: { markdown: string }) {
  // PAS DE REPLI : voir l'entête ci dessus.
  return <BonusDocument doc={parseBonusDoc(markdown)} />;
}
