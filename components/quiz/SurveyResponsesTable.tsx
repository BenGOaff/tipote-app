"use client";

// components/quiz/SurveyResponsesTable.tsx (Tipote)
//
// Vue "Réponses" individuelles d'un sondage (style Typeform / Tally) : une
// ligne = un répondant, avec son identité ET sa réponse à chaque question.
// Complète SurveyTrends (qui n'affiche QUE l'agrégat) pour répondre au besoin
// "je veux savoir QUI a donné QUELLE réponse" (drame Béné 26 juin 2026 :
// impossible de récompenser les bonnes réponses car l'export était anonyme).
//
// Marquage (étoile) : pour épingler les répondants à récompenser. Persisté
// via quiz_leads.flagged, remonté en colonne "Marqué" dans tous les exports.
//
// Les libellés de réponse passent par le helper partagé formatSurveyAnswer →
// fini les "Option 1" au lieu de "Oui".
//
// -- LA COLONNE BLANCHE (retour Béné, 5 août 2026) --------------------
//
// "Y'a un bug de présentation dans l'affichage des réponses avec le
// contact en blanc, et c'est pas super ergonomique."
//
// La colonne du répondant est ÉPINGLÉE (`sticky left-0`) pour rester
// lisible quand on fait défiler les questions vers la droite. Une
// colonne épinglée doit être OPAQUE, sinon le texte qui passe dessous se
// superpose au sien. Elle portait donc `bg-background`, une couleur
// écrite en dur : blanc pur, alors que la carte autour est grise et que
// la ligne survolée est teintée. D'où le rectangle blanc.
//
// La correction ne consiste pas à choisir une meilleure couleur, mais à
// n'en choisir AUCUNE : la couleur vit sur la LIGNE (`<tr>`), et les
// cellules épinglées prennent `bg-inherit`. Elles ne peuvent donc plus
// diverger de leur ligne, y compris au survol, y compris en thème
// sombre, y compris si la couleur des lignes change un jour.
//
// -- SUPPRIMER DES RÉPONSES (même retour) -----------------------------
//
// "Pour un user qui teste son sondage mais ne veut pas qu'il soit pris
// en compte." Cases à cocher, sélection multiple, et une confirmation
// qui dit exactement ce qui part et ce qui ne part pas.

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatSurveyAnswer,
  indexAnswers,
  type SurveyAnswerLike,
  type SurveyQuestionLike,
} from "@/lib/survey/format";
import { stripHtml } from "@/lib/richText";

type ResponsesLead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  flagged?: boolean | null;
  answers: SurveyAnswerLike[] | null;
  created_at: string;
};

export function SurveyResponsesTable({
  quizId,
  questions,
  leads,
  locale,
  onToggleFlag,
  onDelete,
}: {
  quizId: string;
  questions: SurveyQuestionLike[];
  leads: ResponsesLead[];
  locale?: string | null;
  onToggleFlag?: (leadId: string, flagged: boolean) => void;
  /** Rend les ids VRAIMENT supprimés. Absent = suppression indisponible. */
  onDelete?: (leadIds: string[]) => Promise<string[]>;
}) {
  const t = useTranslations("survey");
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Pré-calcule chaque ligne (identité + réponses formatées) une seule fois,
  // puis filtre par recherche texte sur l'ensemble (identité + réponses).
  const rows = useMemo(() => {
    return leads.map((l) => {
      const byQ = indexAnswers(l.answers, questions);
      const cells = questions.map((q, qi) => formatSurveyAnswer(q, byQ.get(qi), locale));
      const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
      const haystack = [name, l.email, l.phone, l.country, ...cells]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return { lead: l, name, cells, haystack };
    });
  }, [leads, questions, locale]);

  const flaggedCount = useMemo(() => rows.filter((r) => r.lead.flagged).length, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyFlagged && !r.lead.flagged) return false;
      if (q && !r.haystack.includes(q)) return false;
      return true;
    });
  }, [rows, query, onlyFlagged]);

  // UNE SÉLECTION NE SURVIT PAS À CE QU'ELLE DÉSIGNE. Sans ça, filtrer
  // puis supprimer effacerait des lignes cochées avant le filtre, donc
  // invisibles au moment du clic : la pire façon de perdre une donnée.
  const visibleIds = useMemo(() => new Set(filtered.map((r) => r.lead.id)), [filtered]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const selectedCount = selected.size;
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.lead.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((r) => r.lead.id)));
  }

  async function confirmDelete() {
    if (!onDelete || selectedCount === 0) return;
    setDeleting(true);
    try {
      const removed = await onDelete([...selected]);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  const handleExportCsv = () => {
    window.location.href = `/api/quiz/${quizId}/survey-results?format=csv`;
  };
  const handleExportExcel = () => {
    window.location.href = `/api/quiz/${quizId}/survey-results?format=xlsx`;
  };

  if (leads.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground">{t("responsesEmpty")}</Card>
    );
  }

  const colCount = questions.length + (onDelete ? 4 : 3);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("responsesSearchPlaceholder")}
            className="w-full h-9 pl-8 pr-3 rounded-lg border bg-background text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyFlagged((v) => !v)}
          aria-pressed={onlyFlagged}
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm transition-colors ${onlyFlagged ? "border-amber-400 bg-amber-50 text-amber-700" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Star className={`w-4 h-4 ${onlyFlagged ? "fill-amber-400 text-amber-400" : ""}`} />
          {t("responsesFlaggedOnly")}
          {flaggedCount > 0 ? ` (${flaggedCount})` : ""}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length}/{rows.length}
        </span>
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download className="w-4 h-4 mr-1.5" />
          {t("exportCsv")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download className="w-4 h-4 mr-1.5" />
          {t("exportExcel")}
        </Button>
      </div>

      {/* La barre d'action n'apparaît QUE quand une ligne est cochée : un
          bouton Supprimer toujours visible, à côté des exports, est une
          invitation permanente à une action irréversible. */}
      {onDelete && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <span className="text-sm font-medium">{t("responsesSelected", { count: selectedCount })}</span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("responsesClearSelection")}
          </button>
          <span className="flex-1" />
          <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 className="w-4 h-4 mr-1.5" />
            {t("responsesDelete")}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        {/* Défilement dans les DEUX sens, et un en-tête qui reste :
            au delà d'une vingtaine de réponses, les questions sortaient de
            l'écran et il fallait remonter pour savoir quelle colonne on
            lisait. */}
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm border-collapse">
            <thead>
              {/* La couleur vit sur la LIGNE : les cellules épinglées la
                  reprennent avec `bg-inherit` au lieu d'en choisir une. */}
              <tr className="border-b bg-muted text-left [&>th]:sticky [&>th]:top-0 [&>th]:bg-inherit [&>th]:z-20">
                {onDelete && (
                  <th className="px-2 py-2 w-9 left-0 !z-30">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label={t("responsesSelectAll")}
                      className="size-4 cursor-pointer accent-[var(--primary)] align-middle"
                    />
                  </th>
                )}
                <th className="px-2 py-2 w-9" aria-label={t("responsesFlaggedOnly")} />
                <th
                  className={`px-3 py-2 font-semibold whitespace-nowrap !sticky ${onDelete ? "left-[4.5rem]" : "left-9"} !z-30 border-r`}
                >
                  {t("colRespondent")}
                </th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">{t("colDate")}</th>
                {questions.map((q, qi) => (
                  <th
                    key={qi}
                    className="px-3 py-2 font-semibold min-w-[180px] max-w-[280px] align-bottom leading-snug"
                  >
                    {stripHtml(String(q.question_text ?? "")).trim() || `Q${qi + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ lead, name, cells }) => {
                const isSelected = selected.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={`border-b last:border-0 align-top ${isSelected ? "bg-primary/10" : "bg-card hover:bg-muted/40"}`}
                  >
                    {onDelete && (
                      <td className="px-2 py-2 sticky left-0 bg-inherit z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(lead.id)}
                          aria-label={t("responsesSelectOne")}
                          className="size-4 cursor-pointer accent-[var(--primary)] align-middle"
                        />
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => onToggleFlag?.(lead.id, !lead.flagged)}
                        disabled={!onToggleFlag}
                        aria-pressed={!!lead.flagged}
                        title={t(lead.flagged ? "unflagAction" : "flagAction")}
                        className="p-0.5 rounded hover:bg-muted disabled:opacity-40"
                      >
                        <Star
                          className={`w-4 h-4 ${lead.flagged ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                        />
                      </button>
                    </td>
                    <td
                      className={`px-3 py-2 whitespace-nowrap sticky ${onDelete ? "left-[4.5rem]" : "left-9"} bg-inherit z-10 border-r`}
                    >
                      <div className="font-medium">{name || t("responsesAnonymous")}</div>
                      {lead.email && (
                        <div className="text-xs text-muted-foreground">{lead.email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                    {cells.map((cell, qi) => (
                      <td key={qi} className="px-3 py-2 max-w-[280px] whitespace-pre-wrap break-words">
                        {cell || <span className="text-muted-foreground/50">-</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground">
                    {t("responsesNoMatch")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* LA CONFIRMATION DIT CE QUI PART **ET** CE QUI RESTE. Une
          créatrice qui supprime 3 réponses et voit le compteur de
          complétions inchangé sur la page Stats chercherait un bug qui
          n'existe pas : ces compteurs viennent du suivi de navigation,
          pas des réponses. */}
      <Dialog open={confirming} onOpenChange={(o) => !deleting && setConfirming(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("responsesDeleteTitle", { count: selectedCount })}</DialogTitle>
            <DialogDescription>{t("responsesDeleteBody")}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("responsesDeleteStatsNote")}</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>
              {t("responsesDeleteCancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              {t("responsesDeleteConfirm", { count: selectedCount })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
