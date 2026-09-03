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
  Check,
  Copy,
  Loader2,
  Lock,
  Sparkles,
  AlertTriangle,
  RefreshCw,
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
import type { Piece, Piste } from "@/lib/generateurs/blocs";
import { markdownVersHtml } from "@/lib/generateurs/markdown";

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

  async function toutEcrire(piste: Piste) {
    setChoisie(piste);
    setEtape("contenus");
    setEtat("production");
    setContenus({});
    // EN SÉRIE, jamais en parallèle : trois appels simultanés sur un
    // compte Anthropic, c'est un 429, et deux morceaux sur trois qui
    // ressortent vides (drame Fabienne, Atelier, 4 août).
    for (let i = 0; i < piste.pieces.length; i++) {
      const ok = await ecrireUn(piste, i);
      // Un morceau qui échoue n'emporte pas les suivants : on continue,
      // et ce qui est déjà écrit reste à l'écran.
      if (!ok && i === 0) break;
    }
    setEtat("repos");
  }

  const faits = choisie
    ? choisie.pieces.filter((p) => contenus[cle(p)]).length
    : 0;

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-sm">{t("etapes.pistes")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("pistes.aide")}</p>
            </div>
            <Button
              size="sm"
              onClick={demanderPistes}
              disabled={!autorise || !pretPourPistes || etat === "pistes" || Boolean(enCours)}
            >
              {etat === "pistes" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              {etat === "pistes"
                ? t("pistes.encours")
                : pistes.length
                  ? t("pistes.relancer")
                  : t("pistes.lancer")}
            </Button>
          </div>

          {/* LE COÛT SE DIT AVANT DE LANCER, pas après. Et il se redit
              ici parce que "Proposer trois autres pistes" REFACTURE :
              une relance gratuite en apparence est la meilleure façon
              de vider un compteur sans comprendre pourquoi. */}
          {credits ? (
            <p className="text-xs text-muted-foreground">
              {t("credits.coutPistes", { count: credits.coutPistes })}
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
                    onClick={() => void toutEcrire(p)}
                  >
                    {choisie?.titre === p.titre ? t("pistes.choisie") : t("pistes.choisir")}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {pistes.length > 0 && pourquoiRecommandee ? (
            <p className="text-xs text-muted-foreground">{pourquoiRecommandee}</p>
          ) : null}
        </section>
      ) : null}

      {/* ── LES CONTENUS ── */}
      {/* Le BONUS arrive ici en ayant DÉJÀ choisi sa piste : ce bloc de
          lancement est celui des générateurs à séquence fixe. */}
      {etape === "contenus" && !choisie && !passeParLesPistes(generateur) ? (
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-sm">{t("etapes.contenus")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(`parcours.lancer.${generateur}`)}
            </p>
          </div>
          {/* LE COÛT SE DIT AVANT DE LANCER, jamais après. */}
          {credits ? (
            <p className="text-xs font-semibold text-muted-foreground">
              {t("credits.cout", { count: coutPiste(pisteDuPlanFixe()) })}
            </p>
          ) : null}
          <Button
            onClick={() => void toutEcrire(pisteDuPlanFixe())}
            disabled={!autorise || !pretPourPistes || etat === "production" || Boolean(enCours)}
          >
            {etat === "production" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            {t(`parcours.lancerCta.${generateur}`)}
          </Button>
        </section>
      ) : null}

      {etape === "contenus" && !choisie && passeParLesPistes(generateur) ? (
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <p className="text-sm text-muted-foreground">{t("parcours.choisirPiste")}</p>
          <Button variant="outline" size="sm" onClick={() => setEtape("pistes")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {t("parcours.retourPistes")}
          </Button>
        </section>
      ) : null}

      {etape === "contenus" && choisie ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display font-bold text-sm">{t("etapes.contenus")}</h2>
            {enCours ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("production.encours", { fait: faits, total: choisie.pieces.length })}
              </span>
            ) : null}
          </div>

          {choisie.pieces.map((piece, i) => (
            <CarteContenu
              key={cle(piece)}
              // LE RÔLE TRADUIT, jamais l'intention brute : sur un plan
              // fixe, `resume` porte la consigne envoyée au modèle, et
              // elle est en français dans un écran qui existe en 7
              // langues (c'est le "Résultat 4" du 1er septembre).
              titre={
                piece.cle
                  ? `${piece.index}. ${t(`temps.${piece.cle}`)}`
                  : t(`blocs.${piece.bloc}`, { index: piece.index })
              }
              resume={piece.cle ? "" : piece.resume}
              contenu={contenus[cle(piece)] ?? null}
              enCours={enCours === cle(piece)}
              onRefaire={() => void ecrireUn(choisie, i)}
              bloque={!autorise || Boolean(enCours)}
            />
          ))}
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
            {/* Sur l'étape des pistes, on avance en CHOISISSANT une
                piste : un bouton "Suivant" à côté mènerait à un écran
                de contenus sans rien à écrire. */}
            {apres && etape !== "pistes" ? (
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
 * UN MORCEAU. Le rendu s'affiche, le Markdown reste copiable à côté :
 * c'est LUI qu'elle colle dans Systeme.io, pas le HTML.
 */
function CarteContenu({
  titre,
  resume,
  contenu,
  enCours,
  onRefaire,
  bloque,
}: {
  titre: string;
  resume: string;
  contenu: { markdown: string; tronque: boolean } | null;
  enCours: boolean;
  onRefaire: () => void;
  bloque: boolean;
}) {
  const t = useTranslations("generateurs");
  const [brut, setBrut] = useState(false);
  const [copie, setCopie] = useState(false);

  async function copier() {
    if (!contenu) return;
    try {
      await navigator.clipboard.writeText(contenu.markdown);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Un échec de copie SE DIT : un bouton qui ne fait rien envoie
      // chercher au mauvais endroit (règle du 1er août sur le partage).
      toast.error(t("erreurs.generic"));
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{titre}</h3>
          {resume ? <p className="text-xs text-muted-foreground mt-0.5">{resume}</p> : null}
        </div>
        {contenu ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => setBrut((b) => !b)}>
              {brut ? t("production.rendu") : t("production.brut")}
            </Button>
            <Button size="sm" variant="outline" onClick={copier}>
              {copie ? (
                <Check className="h-4 w-4 mr-1.5" />
              ) : (
                <Copy className="h-4 w-4 mr-1.5" />
              )}
              {copie ? t("production.copie") : t("production.copier")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onRefaire} disabled={bloque}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {contenu?.tronque ? (
        <p className="text-xs flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {t("production.tronque")}
        </p>
      ) : null}

      {enCours ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
        </p>
      ) : contenu ? (
        brut ? (
          <pre className="text-xs whitespace-pre-wrap break-words bg-muted/50 rounded-lg p-3 max-h-[60vh] overflow-auto">
            {contenu.markdown}
          </pre>
        ) : (
          <div
            className="gen-rendu text-sm leading-relaxed space-y-3"
            dangerouslySetInnerHTML={{ __html: markdownVersHtml(contenu.markdown) }}
          />
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t("production.vide")}</p>
      )}
    </div>
  );
}
