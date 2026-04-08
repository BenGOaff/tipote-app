// components/settings/CompetitorAnalysisSection.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  Trash2,
  Save,
  Upload,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  FileText,
  Loader2,
  AlertCircle,
  Zap,
  MessageSquare,
  ShoppingBag,
  Users,
  CheckCircle2,
  XCircle,
  Download,
  Pencil,
  X,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AIGeneratingOverlay } from "@/components/ui/ai-generating-overlay";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CompetitorInput = {
  name: string;
  website: string;
  notes: string;
};

type CompetitorDetail = {
  // Profile
  positioning?: string;
  value_proposition?: string;
  main_offers?: Array<{ name: string; price: string; description: string }>;
  strengths?: string[];
  weaknesses?: string[];
  channels?: string[];
  target_audience?: string;
  content_strategy?: string;
  keywords?: string[];
  missing_info?: string[];
  // Face-à-face
  user_advantages?: string[];
  user_disadvantages?: string[];
  key_differences_summary?: string;
  // Actions
  differentiation_strategy?: string;
  communication_focus?: string[];
  offer_improvements?: string[];
};

type AnalysisData = {
  competitors?: CompetitorInput[];
  competitor_details?: Record<string, CompetitorDetail>;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  opportunities?: string[];
  positioning_matrix?: string;
  uploaded_document_summary?: string;
  status?: string;
  updated_at?: string;
};

// ─── Positioning matrix formatter ───────────────────────────────────────────────

/**
 * Converts flat positioning matrix text into a markdown table.
 * Handles legacy data stored as "Matrice: Prix -> X; Fonctionnalités -> Y; ..."
 * If already a markdown table (contains "|"), returns as-is.
 */
function formatPositioningMatrix(text: string): string {
  if (!text?.trim()) return text;
  // Already a markdown table
  if (text.includes("|")) return text;
  // Already has markdown formatting (headers, lists)
  if (/^##?\s/m.test(text) || /^\s*[-*]\s/m.test(text)) return text;

  // Try to parse "Key = value" or "Key -> value" patterns separated by ";"
  // e.g. "Matrice: Prix -> Moyen; ... Nach: Jasper = IA + templates; ChatGPT = IA générale; ..."
  const parts = text.split(/\s*;\s*/);
  if (parts.length < 3) return text;

  // Detect competitor entries: "Name = description" pattern
  const competitorEntries: { name: string; desc: string }[] = [];
  const axisEntries: { axis: string; value: string }[] = [];

  for (const part of parts) {
    const cleaned = part.replace(/^Matrice\s*:\s*/i, "").replace(/^Nach\s*:\s*/i, "").trim();
    if (!cleaned) continue;

    const arrowMatch = cleaned.match(/^(.+?)\s*->\s*(.+)$/);
    const equalMatch = cleaned.match(/^(.+?)\s*=\s*(.+)$/);

    if (arrowMatch) {
      axisEntries.push({ axis: arrowMatch[1].trim(), value: arrowMatch[2].trim() });
    } else if (equalMatch) {
      competitorEntries.push({ name: equalMatch[1].trim(), desc: equalMatch[2].trim() });
    }
  }

  // Build a simple markdown table
  if (competitorEntries.length > 0) {
    const lines: string[] = [];
    // Header with axis names if available
    if (axisEntries.length > 0) {
      lines.push(`| Critère | Valeur |`);
      lines.push(`|---|---|`);
      for (const a of axisEntries) {
        lines.push(`| **${a.axis}** | ${a.value} |`);
      }
      lines.push("");
    }
    lines.push(`| Concurrent | Positionnement |`);
    lines.push(`|---|---|`);
    for (const c of competitorEntries) {
      lines.push(`| **${c.name}** | ${c.desc} |`);
    }
    return lines.join("\n");
  }

  // Fallback: all axis entries
  if (axisEntries.length > 0) {
    const lines: string[] = [];
    lines.push(`| Critère | Valeur |`);
    lines.push(`|---|---|`);
    for (const a of axisEntries) {
      lines.push(`| **${a.axis}** | ${a.value} |`);
    }
    return lines.join("\n");
  }

  return text;
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>,
  );
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text?.trim()) return null;
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let listItems: string[] = [];
  let tableLines: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    result.push(
      <ul key={key++} className="space-y-1 mb-3 ml-1">
        {listItems.map((item, i) => (
          <li key={i} className="text-sm flex gap-2 items-start">
            <span className="text-primary mt-0.5 flex-shrink-0 font-bold">•</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    // Filter out separator rows (|---|---|) and parse header + data rows
    const rows = tableLines
      .filter((l) => !/^\s*\|[\s\-:]+\|/.test(l))
      .map((l) =>
        l
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((cell) => cell.trim()),
      );

    if (rows.length > 0) {
      const [headerRow, ...dataRows] = rows;
      result.push(
        <div key={key++} className="overflow-x-auto mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/60">
                {headerRow.map((cell, ci) => (
                  <th
                    key={ci}
                    className="border border-border px-3 py-2 text-left font-semibold text-foreground"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-border px-3 py-2 text-muted-foreground">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    tableLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      flushList();
      tableLines.push(line);
    } else if (line.startsWith("## ")) {
      flushList();
      flushTable();
      result.push(
        <h4 key={key++} className="font-bold text-sm mt-5 mb-1.5 first:mt-0 text-foreground border-b pb-1">
          {line.slice(3)}
        </h4>,
      );
    } else if (line.startsWith("# ")) {
      flushList();
      flushTable();
      result.push(
        <h3 key={key++} className="font-bold text-base mt-4 mb-2 first:mt-0">
          {line.slice(2)}
        </h3>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flushTable();
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
      flushTable();
    } else {
      flushList();
      flushTable();
      result.push(
        <p key={key++} className="text-sm leading-relaxed mb-2">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();
  flushTable();
  return <div className="space-y-0">{result}</div>;
}

// ─── Download helper ───────────────────────────────────────────────────────────

function buildMarkdownExport(analysis: AnalysisData): string {
  const date = analysis.updated_at
    ? new Date(analysis.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "";

  let md = `# Analyse Concurrentielle${date ? ` — ${date}` : ""}\n\n`;

  if (analysis.summary) md += `## Synthèse\n\n${analysis.summary}\n\n`;

  if (analysis.strengths?.length)
    md += `## Forces\n${analysis.strengths.map((s) => `- ${s}`).join("\n")}\n\n`;
  if (analysis.weaknesses?.length)
    md += `## À améliorer\n${analysis.weaknesses.map((w) => `- ${w}`).join("\n")}\n\n`;
  if (analysis.opportunities?.length)
    md += `## Opportunités\n${analysis.opportunities.map((o) => `- ${o}`).join("\n")}\n\n`;
  if (analysis.positioning_matrix)
    md += `## Matrice de positionnement\n\n${analysis.positioning_matrix}\n\n`;

  if (analysis.competitor_details && Object.keys(analysis.competitor_details).length > 0) {
    md += `---\n\n## Détail par concurrent\n\n`;
    for (const [name, d] of Object.entries(analysis.competitor_details)) {
      const det = d as CompetitorDetail;
      md += `### ${name}\n\n`;
      if (det.positioning) md += `**Positionnement :** ${det.positioning}\n\n`;
      if (det.target_audience) md += `**Audience :** ${det.target_audience}\n\n`;
      if (det.key_differences_summary) md += `**Différences clés :** ${det.key_differences_summary}\n\n`;
      if (det.user_advantages?.length)
        md += `**Tu fais mieux :**\n${det.user_advantages.map((a) => `- ${a}`).join("\n")}\n\n`;
      if (det.user_disadvantages?.length)
        md += `**Ils font mieux :**\n${det.user_disadvantages.map((a) => `- ${a}`).join("\n")}\n\n`;
      if (det.differentiation_strategy)
        md += `**Stratégie de différenciation :** ${det.differentiation_strategy}\n\n`;
      if (det.communication_focus?.length)
        md += `**À mettre en avant :**\n${det.communication_focus.map((m) => `- ${m}`).join("\n")}\n\n`;
      if (det.offer_improvements?.length)
        md += `**Améliorations d'offre :**\n${det.offer_improvements.map((i) => `- ${i}`).join("\n")}\n\n`;
    }
  }

  return md;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompetitorAnalysisSection() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([
    { name: "", website: "", notes: "" },
  ]);
  const [researching, startResearchTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [savingSummary, startSummarySave] = useTransition();

  // Editable list states for SWOT
  const [editingStrengths, setEditingStrengths] = useState(false);
  const [editedStrengths, setEditedStrengths] = useState<string[]>([]);
  const [editingWeaknesses, setEditingWeaknesses] = useState(false);
  const [editedWeaknesses, setEditedWeaknesses] = useState<string[]>([]);
  const [editingOpportunities, setEditingOpportunities] = useState(false);
  const [editedOpportunities, setEditedOpportunities] = useState<string[]>([]);
  const [savingSwot, startSwotSave] = useTransition();

  // Editable positioning matrix
  const [editingMatrix, setEditingMatrix] = useState(false);
  const [editedMatrix, setEditedMatrix] = useState("");
  const [savingMatrix, startMatrixSave] = useTransition();

  // Editable competitor details
  const [editingDetail, setEditingDetail] = useState<string | null>(null);
  const [editedDetail, setEditedDetail] = useState<CompetitorDetail>({});
  const [savingDetail, startDetailSave] = useTransition();

  // Load existing analysis
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/competitor-analysis", { method: "GET" });
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;
        if (json?.ok && json.analysis) {
          setAnalysis(json.analysis);
          if (Array.isArray(json.analysis.competitors) && json.analysis.competitors.length >= 1) {
            setCompetitors(json.analysis.competitors);
          }
          if (json.analysis.status === "completed") setShowResults(true);
        }
      } catch (e: any) {
        if (!cancelled) console.error("Failed to load competitor analysis:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Competitor input management
  const addCompetitor = () => {
    if (competitors.length >= 5) return;
    setCompetitors((prev) => [...prev, { name: "", website: "", notes: "" }]);
  };
  const removeCompetitor = (idx: number) => {
    if (competitors.length <= 1) return;
    setCompetitors((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateCompetitor = (idx: number, field: keyof CompetitorInput, value: string) => {
    setCompetitors((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const canResearch = useMemo(
    () => competitors.filter((c) => c.name.trim().length > 0).length >= 1,
    [competitors],
  );

  const [progressMsg, setProgressMsg] = useState("");

  // Launch AI research
  const launchResearch = () => {
    startResearchTransition(async () => {
      try {
        const cleaned = competitors.filter((c) => c.name.trim());
        setProgressMsg("Lancement de l'analyse...");

        const res = await fetch("/api/competitor-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitors: cleaned }),
        });

        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const json = await res.json();
          if (json?.error === "NO_CREDITS") {
            toast({ title: "Crédits insuffisants", description: "L'analyse concurrentielle coûte 1 crédit.", variant: "destructive" });
            return;
          }
          throw new Error(json?.error || "Erreur");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Stream non disponible");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: any = null;
        let finalError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const eventBlock of events) {
            const lines = eventBlock.split("\n");
            let eventType = "";
            let eventData = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              if (line.startsWith("data: ")) eventData = line.slice(6);
            }
            if (!eventData) continue;
            try {
              const parsed = JSON.parse(eventData);
              if (eventType === "progress") setProgressMsg(parsed.step || "Analyse en cours...");
              else if (eventType === "result") finalResult = parsed;
              else if (eventType === "error") finalError = parsed.error || "Erreur inconnue";
            } catch { /* skip malformed */ }
          }
        }

        setProgressMsg("");
        if (finalError) {
          if (finalError === "NO_CREDITS") {
            toast({ title: "Crédits insuffisants", description: "L'analyse concurrentielle coûte 1 crédit.", variant: "destructive" });
            return;
          }
          throw new Error(finalError);
        }
        if (finalResult?.ok && finalResult.analysis) {
          setAnalysis(finalResult.analysis);
          setShowResults(true);
          toast({ title: "Analyse concurrentielle terminée ✓" });
        } else {
          throw new Error("Aucun résultat reçu");
        }
      } catch (e: any) {
        setProgressMsg("");
        toast({ title: "Erreur lors de l'analyse", description: e?.message ?? "Erreur inconnue", variant: "destructive" });
      }
    });
  };

  // Upload document
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/competitor-analysis/upload", { method: "POST", body: formData });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) {
          if (json?.error === "NO_CREDITS") {
            toast({ title: "Crédits insuffisants", description: "L'import de document coûte 1 crédit.", variant: "destructive" });
            return;
          }
          throw new Error(json?.error || "Erreur");
        }
        setAnalysis(json.analysis);
        if (Array.isArray(json.analysis?.competitors) && json.analysis.competitors.length >= 2) {
          setCompetitors(json.analysis.competitors);
        }
        setShowResults(false);
        toast({ title: "Document importé ✓", description: "Concurrents pré-remplis depuis le doc. Lance l'analyse IA pour obtenir ton rapport." });
      } catch (err: any) {
        toast({ title: "Erreur lors de l'import", description: err?.message ?? "Erreur inconnue", variant: "destructive" });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [toast],
  );

  // Save summary
  const saveSummary = () => {
    startSummarySave(async () => {
      try {
        const res = await fetch("/api/competitor-analysis", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: editedSummary }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");
        setAnalysis((prev) => (prev ? { ...prev, summary: editedSummary } : prev));
        setEditingSummary(false);
        toast({ title: "Résumé mis à jour" });
      } catch (e: any) {
        toast({ title: "Erreur", description: e?.message ?? "Impossible de sauvegarder", variant: "destructive" });
      }
    });
  };

  // Save SWOT field
  const saveSwotField = (field: "strengths" | "weaknesses" | "opportunities", items: string[]) => {
    const cleaned = items.filter((s) => s.trim());
    startSwotSave(async () => {
      try {
        const res = await fetch("/api/competitor-analysis", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: cleaned }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");
        setAnalysis((prev) => (prev ? { ...prev, [field]: cleaned } : prev));
        if (field === "strengths") setEditingStrengths(false);
        if (field === "weaknesses") setEditingWeaknesses(false);
        if (field === "opportunities") setEditingOpportunities(false);
        toast({ title: "Mis à jour" });
      } catch (e: any) {
        toast({ title: "Erreur", description: e?.message ?? "Impossible de sauvegarder", variant: "destructive" });
      }
    });
  };

  // Save positioning matrix
  const saveMatrix = () => {
    startMatrixSave(async () => {
      try {
        const res = await fetch("/api/competitor-analysis", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positioning_matrix: editedMatrix }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");
        setAnalysis((prev) => (prev ? { ...prev, positioning_matrix: editedMatrix } : prev));
        setEditingMatrix(false);
        toast({ title: "Matrice mise à jour" });
      } catch (e: any) {
        toast({ title: "Erreur", description: e?.message ?? "Impossible de sauvegarder", variant: "destructive" });
      }
    });
  };

  // Save competitor detail
  const saveCompetitorDetail = (name: string) => {
    startDetailSave(async () => {
      try {
        const updatedDetails = { ...analysis?.competitor_details, [name]: editedDetail };
        const res = await fetch("/api/competitor-analysis", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitor_details: updatedDetails }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");
        setAnalysis((prev) => (prev ? { ...prev, competitor_details: updatedDetails } : prev));
        setEditingDetail(null);
        toast({ title: `${name} mis à jour` });
      } catch (e: any) {
        toast({ title: "Erreur", description: e?.message ?? "Impossible de sauvegarder", variant: "destructive" });
      }
    });
  };

  // Download analysis as PDF
  const downloadAnalysis = async () => {
    if (!analysis) return;
    const md = buildMarkdownExport(analysis);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 20;
    const marginTop = 25;
    const marginBottom = 20;
    const usableWidth = pageWidth - marginX * 2;
    const bodyLineH = 5.5;
    const h1LineH = 10;
    const h2LineH = 8;
    const h3LineH = 7;

    let y = marginTop;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
      }
    };

    for (const rawLine of md.split("\n")) {
      const line = rawLine.trimEnd();

      // --- (horizontal rule)
      if (/^-{3,}$/.test(line.trim())) {
        y += 3;
        ensureSpace(bodyLineH);
        doc.setDrawColor(200, 200, 200);
        doc.line(marginX, y, pageWidth - marginX, y);
        y += 4;
        continue;
      }

      // # H1
      if (line.startsWith("# ") && !line.startsWith("## ")) {
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        const text = line.replace(/^# /, "");
        const wrapped = doc.splitTextToSize(text, usableWidth) as string[];
        for (const wl of wrapped) {
          ensureSpace(h1LineH);
          doc.text(wl, marginX, y);
          y += h1LineH;
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        continue;
      }

      // ## H2
      if (line.startsWith("## ")) {
        y += 3;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        const text = line.replace(/^## /, "");
        const wrapped = doc.splitTextToSize(text, usableWidth) as string[];
        for (const wl of wrapped) {
          ensureSpace(h2LineH);
          doc.text(wl, marginX, y);
          y += h2LineH;
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        continue;
      }

      // ### H3
      if (line.startsWith("### ")) {
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        const text = line.replace(/^### /, "");
        const wrapped = doc.splitTextToSize(text, usableWidth) as string[];
        for (const wl of wrapped) {
          ensureSpace(h3LineH);
          doc.text(wl, marginX, y);
          y += h3LineH;
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        continue;
      }

      // Empty line
      if (line.trim() === "") {
        y += bodyLineH * 0.5;
        continue;
      }

      // Bullet point
      if (line.startsWith("- ")) {
        doc.setFontSize(10);
        const text = line.replace(/^- /, "");
        const wrapped = doc.splitTextToSize(text, usableWidth - 6) as string[];
        for (let i = 0; i < wrapped.length; i++) {
          ensureSpace(bodyLineH);
          if (i === 0) {
            doc.text("\u2022", marginX, y);
          }
          doc.text(wrapped[i], marginX + 6, y);
          y += bodyLineH;
        }
        continue;
      }

      // **Bold label:** value  (e.g. "**Positionnement :** ...")
      const boldMatch = line.match(/^\*\*(.+?)\*\*\s*(.*)/);
      if (boldMatch) {
        doc.setFontSize(10);
        const label = boldMatch[1];
        const rest = boldMatch[2] || "";
        const fullText = rest ? `${label} ${rest}` : label;
        // Render label bold, rest normal
        ensureSpace(bodyLineH);
        const labelWidth = doc.getStringUnitWidth(label) * 10 / doc.internal.scaleFactor;
        doc.setFont("helvetica", "bold");
        doc.text(label, marginX, y);
        if (rest) {
          doc.setFont("helvetica", "normal");
          const wrapped = doc.splitTextToSize(rest, usableWidth - labelWidth - 1) as string[];
          if (wrapped.length <= 1) {
            doc.text(` ${rest}`, marginX + labelWidth, y);
            y += bodyLineH;
          } else {
            // First chunk on same line, rest wrapped full-width
            doc.text(` ${wrapped[0]}`, marginX + labelWidth, y);
            y += bodyLineH;
            const remaining = doc.splitTextToSize(wrapped.slice(1).join(" "), usableWidth) as string[];
            for (const rl of remaining) {
              ensureSpace(bodyLineH);
              doc.text(rl, marginX, y);
              y += bodyLineH;
            }
          }
        } else {
          y += bodyLineH;
        }
        doc.setFont("helvetica", "normal");
        continue;
      }

      // Markdown table lines — render as plain text
      // Regular text
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(line, usableWidth) as string[];
      for (const wl of wrapped) {
        ensureSpace(bodyLineH);
        doc.text(wl, marginX, y);
        y += bodyLineH;
      }
    }

    doc.save("analyse-concurrentielle.pdf");
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement de l&apos;analyse concurrentielle...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Competitor Input Form ── */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">Analyse des concurrents</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Renseigne de 2 à 5 concurrents. L&apos;IA analysera leur positionnement, offres et stratégie
          pour t&apos;aider à te différencier et identifier tes avantages concurrentiels.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {competitors.map((comp, idx) => {
            const aiInfo = analysis?.competitor_details?.[comp.name];
            return (
              <div key={idx} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium text-sm">Concurrent {idx + 1}</Label>
                  {competitors.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCompetitor(idx)}
                      className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nom *</Label>
                    <Input
                      placeholder="Ex: Jasper AI..."
                      value={comp.name}
                      onChange={(e) => updateCompetitor(idx, "name", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Site web</Label>
                    <Input
                      placeholder="https://..."
                      value={comp.website}
                      onChange={(e) => updateCompetitor(idx, "website", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ce que tu sais du concurrent</Label>
                    <Textarea
                      placeholder="Prix, points forts, points faibles, ce que tu sais déjà..."
                      value={comp.notes}
                      onChange={(e) => updateCompetitor(idx, "notes", e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>

                  {/* AI-generated info from last analysis */}
                  {aiInfo && (
                    <div className="pt-2 border-t space-y-2 mt-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Zap className="w-3 h-3 text-primary" />
                        Infos IA (dernière analyse)
                      </p>
                      {aiInfo.positioning && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Positionnement</Label>
                          <p className="text-xs mt-0.5 leading-relaxed">{aiInfo.positioning}</p>
                        </div>
                      )}
                      {aiInfo.strengths && aiInfo.strengths.length > 0 && (
                        <div>
                          <Label className="text-xs text-green-600">Points forts</Label>
                          <ul className="mt-0.5 space-y-0.5">
                            {aiInfo.strengths.map((s, i) => (
                              <li key={i} className="text-xs text-green-700 flex gap-1 items-start">
                                <span className="flex-shrink-0">+</span><span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiInfo.weaknesses && aiInfo.weaknesses.length > 0 && (
                        <div>
                          <Label className="text-xs text-orange-600">Points faibles</Label>
                          <ul className="mt-0.5 space-y-0.5">
                            {aiInfo.weaknesses.map((w, i) => (
                              <li key={i} className="text-xs text-orange-700 flex gap-1 items-start">
                                <span className="flex-shrink-0">-</span><span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {competitors.length < 5 && (
            <div className="flex items-center justify-center border border-dashed rounded-lg min-h-[200px]">
              <Button variant="ghost" size="sm" onClick={addCompetitor} className="gap-1 text-muted-foreground">
                <Plus className="w-4 h-4" />
                Ajouter un concurrent
              </Button>
            </div>
          )}
        </div>

        {/* Document imported indicator */}
        {analysis?.uploaded_document_summary && analysis?.status === "draft" && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                Document importé — contexte chargé ✓
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
                L&apos;analyse IA utilisera le contenu de ton document en plus des informations saisies ci-dessus.
              </p>
            </div>
          </div>
        )}

        {/* AI generating overlay dialog */}
        <Dialog open={researching}>
          <DialogContent className="sm:max-w-md [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()}>
            <AIGeneratingOverlay />
          </DialogContent>
        </Dialog>

        <div className="flex flex-wrap gap-3 mt-6">
          <Button onClick={launchResearch} disabled={!canResearch || researching} className="gap-2">
            {researching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {researching ? (progressMsg || "Analyse en cours...") : "Lancer l'analyse IA"}
          </Button>

          <div className="relative">
            <input
              type="file"
              accept=".txt,.pdf,.docx,.md"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            <Button variant="outline" className="gap-2" disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Import en cours..." : "Importer un document"}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Coût : 1 crédit par analyse. Formats acceptés : TXT, PDF, DOCX, MD (max 5 Mo).
        </p>
      </Card>

      {/* ── Results ── */}
      {analysis && showResults && (
        <>
          {/* Summary */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold">Synthèse concurrentielle</h3>
              </div>
              <div className="flex items-center gap-2">
                {analysis.updated_at && (
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    Mis à jour le{" "}
                    {new Date(analysis.updated_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadAnalysis}>
                  <Download className="w-3.5 h-3.5" />
                  Télécharger
                </Button>
              </div>
            </div>

            {editingSummary ? (
              <div className="space-y-3">
                <Textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={10}
                  className="resize-none font-mono text-sm"
                  placeholder="Tu peux utiliser ## Titre, **gras**, et - liste"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveSummary} disabled={savingSummary}>
                    <Save className="w-4 h-4 mr-1" />
                    {savingSummary ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingSummary(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {analysis.summary
                  ? renderMarkdown(analysis.summary)
                  : <p className="text-sm text-muted-foreground">Aucune synthèse disponible.</p>}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-muted-foreground"
                  onClick={() => {
                    setEditedSummary(analysis.summary || "");
                    setEditingSummary(true);
                  }}
                >
                  Modifier la synthèse
                </Button>
              </div>
            )}

            {analysis.uploaded_document_summary && analysis.status === "completed" && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">Document importé :</p>
                <p className="text-sm">{analysis.uploaded_document_summary}</p>
              </div>
            )}
          </Card>

          {/* SWOT-style cards — editable */}
          <div className="grid md:grid-cols-3 gap-4">
            {analysis.strengths && analysis.strengths.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <h4 className="font-semibold text-green-700">Tes forces</h4>
                  </div>
                  {!editingStrengths && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => { setEditedStrengths([...analysis.strengths!]); setEditingStrengths(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                {editingStrengths ? (
                  <div className="space-y-2">
                    {editedStrengths.map((s, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <Input value={s} onChange={(e) => setEditedStrengths((prev) => prev.map((v, j) => j === i ? e.target.value : v))} className="text-sm h-8" />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => setEditedStrengths((prev) => prev.filter((_, j) => j !== i))}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setEditedStrengths((prev) => [...prev, ""])}>
                      <Plus className="w-3 h-3" /> Ajouter
                    </Button>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveSwotField("strengths", editedStrengths)} disabled={savingSwot}>
                        <Save className="w-3 h-3 mr-1" />{savingSwot ? "..." : "Sauver"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingStrengths(false)}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-green-500 mt-0.5 flex-shrink-0">+</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {analysis.weaknesses && analysis.weaknesses.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-orange-600" />
                    <h4 className="font-semibold text-orange-700">À améliorer</h4>
                  </div>
                  {!editingWeaknesses && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => { setEditedWeaknesses([...analysis.weaknesses!]); setEditingWeaknesses(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                {editingWeaknesses ? (
                  <div className="space-y-2">
                    {editedWeaknesses.map((w, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <Input value={w} onChange={(e) => setEditedWeaknesses((prev) => prev.map((v, j) => j === i ? e.target.value : v))} className="text-sm h-8" />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => setEditedWeaknesses((prev) => prev.filter((_, j) => j !== i))}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setEditedWeaknesses((prev) => [...prev, ""])}>
                      <Plus className="w-3 h-3" /> Ajouter
                    </Button>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveSwotField("weaknesses", editedWeaknesses)} disabled={savingSwot}>
                        <Save className="w-3 h-3 mr-1" />{savingSwot ? "..." : "Sauver"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingWeaknesses(false)}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {analysis.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-orange-500 mt-0.5 flex-shrink-0">-</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {analysis.opportunities && analysis.opportunities.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-blue-600" />
                    <h4 className="font-semibold text-blue-700">Opportunités</h4>
                  </div>
                  {!editingOpportunities && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => { setEditedOpportunities([...analysis.opportunities!]); setEditingOpportunities(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                {editingOpportunities ? (
                  <div className="space-y-2">
                    {editedOpportunities.map((o, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <Input value={o} onChange={(e) => setEditedOpportunities((prev) => prev.map((v, j) => j === i ? e.target.value : v))} className="text-sm h-8" />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => setEditedOpportunities((prev) => prev.filter((_, j) => j !== i))}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setEditedOpportunities((prev) => [...prev, ""])}>
                      <Plus className="w-3 h-3" /> Ajouter
                    </Button>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveSwotField("opportunities", editedOpportunities)} disabled={savingSwot}>
                        <Save className="w-3 h-3 mr-1" />{savingSwot ? "..." : "Sauver"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingOpportunities(false)}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {analysis.opportunities.map((o, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-blue-500 mt-0.5 flex-shrink-0">*</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          {/* Positioning Matrix — editable */}
          {analysis.positioning_matrix && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">Matrice de positionnement</h4>
                {!editingMatrix && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => { setEditedMatrix(analysis.positioning_matrix!); setEditingMatrix(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {editingMatrix ? (
                <div className="space-y-3">
                  <Textarea
                    value={editedMatrix}
                    onChange={(e) => setEditedMatrix(e.target.value)}
                    rows={12}
                    className="resize-y font-mono text-sm min-h-[200px]"
                    placeholder="Markdown table ou texte..."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveMatrix} disabled={savingMatrix}>
                      <Save className="w-4 h-4 mr-1" />
                      {savingMatrix ? "Sauvegarde..." : "Sauvegarder"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingMatrix(false)}>Annuler</Button>
                  </div>
                </div>
              ) : (
                renderMarkdown(formatPositioningMatrix(analysis.positioning_matrix))
              )}
            </Card>
          )}

          {/* Per-Competitor Detail Cards — editable */}
          {analysis.competitor_details && Object.keys(analysis.competitor_details).length > 0 && (
            <div className="space-y-4">
              <h4 className="font-semibold text-base px-1">Analyse par concurrent</h4>
              {Object.entries(analysis.competitor_details).map(([name, detail]) => {
                const d = detail as CompetitorDetail;
                const isExpanded = expandedCompetitor === name;
                const isEditing = editingDetail === name;
                const ed = isEditing ? editedDetail : d;

                const updateDetailField = (field: keyof CompetitorDetail, value: any) => {
                  setEditedDetail((prev) => ({ ...prev, [field]: value }));
                };
                const updateDetailListItem = (field: keyof CompetitorDetail, idx: number, value: string) => {
                  setEditedDetail((prev) => {
                    const arr = [...((prev[field] as string[]) || [])];
                    arr[idx] = value;
                    return { ...prev, [field]: arr };
                  });
                };
                const removeDetailListItem = (field: keyof CompetitorDetail, idx: number) => {
                  setEditedDetail((prev) => {
                    const arr = ((prev[field] as string[]) || []).filter((_: any, i: number) => i !== idx);
                    return { ...prev, [field]: arr };
                  });
                };
                const addDetailListItem = (field: keyof CompetitorDetail) => {
                  setEditedDetail((prev) => {
                    const arr = [...((prev[field] as string[]) || []), ""];
                    return { ...prev, [field]: arr };
                  });
                };

                return (
                  <Card key={name} className="overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedCompetitor(isExpanded ? null : name)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <span className="font-semibold">{name}</span>
                          {d.target_audience && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {d.target_audience}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.user_advantages && d.user_advantages.length > 0 && (
                          <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs hidden sm:flex">
                            +{d.user_advantages.length} avantages
                          </Badge>
                        )}
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t">
                        {/* Edit / Save bar */}
                        <div className="flex justify-end gap-2 px-5 pt-3">
                          {isEditing ? (
                            <>
                              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => saveCompetitorDetail(name)} disabled={savingDetail}>
                                <Save className="w-3 h-3" />{savingDetail ? "..." : "Sauvegarder"}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingDetail(null)}>Annuler</Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setEditedDetail({ ...d }); setEditingDetail(name); }}>
                              <Pencil className="w-3 h-3" /> Modifier
                            </Button>
                          )}
                        </div>

                        {/* Section 1 — Leur profil */}
                        <div className="p-5 space-y-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Target className="w-4 h-4 text-muted-foreground" />
                            <h5 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                              Leur profil
                            </h5>
                          </div>
                          {(ed.positioning || isEditing) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Positionnement</Label>
                              {isEditing ? (
                                <Textarea value={ed.positioning || ""} onChange={(e) => updateDetailField("positioning", e.target.value)} rows={2} className="mt-1 text-sm resize-y" />
                              ) : (
                                <p className="text-sm mt-1">{d.positioning}</p>
                              )}
                            </div>
                          )}
                          {(ed.value_proposition || isEditing) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Proposition de valeur</Label>
                              {isEditing ? (
                                <Textarea value={ed.value_proposition || ""} onChange={(e) => updateDetailField("value_proposition", e.target.value)} rows={2} className="mt-1 text-sm resize-y" />
                              ) : (
                                <p className="text-sm mt-1">{d.value_proposition}</p>
                              )}
                            </div>
                          )}
                          {(ed.target_audience || isEditing) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Audience cible</Label>
                              {isEditing ? (
                                <Input value={ed.target_audience || ""} onChange={(e) => updateDetailField("target_audience", e.target.value)} className="mt-1 text-sm h-8" />
                              ) : (
                                <p className="text-sm mt-1">{d.target_audience}</p>
                              )}
                            </div>
                          )}
                          {((ed.main_offers && ed.main_offers.length > 0) || isEditing) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Offres principales</Label>
                              {isEditing ? (
                                <div className="space-y-2 mt-1">
                                  {(ed.main_offers || []).map((offer, i) => (
                                    <div key={i} className="flex gap-1.5 items-center">
                                      <Input value={offer.name} placeholder="Nom" onChange={(e) => { const arr = [...(ed.main_offers || [])]; arr[i] = { ...arr[i], name: e.target.value }; updateDetailField("main_offers", arr); }} className="text-sm h-8 flex-1" />
                                      <Input value={offer.price} placeholder="Prix" onChange={(e) => { const arr = [...(ed.main_offers || [])]; arr[i] = { ...arr[i], price: e.target.value }; updateDetailField("main_offers", arr); }} className="text-sm h-8 w-24" />
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => { const arr = (ed.main_offers || []).filter((_: any, j: number) => j !== i); updateDetailField("main_offers", arr); }}>
                                        <X className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => updateDetailField("main_offers", [...(ed.main_offers || []), { name: "", price: "", description: "" }])}>
                                    <Plus className="w-3 h-3" /> Ajouter une offre
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-1.5 mt-1">
                                  {d.main_offers!.map((offer, i) => (
                                    <div key={i} className="text-sm flex items-start gap-2">
                                      <Badge variant="outline" className="text-xs mt-0.5 flex-shrink-0">{offer.price || "?"}</Badge>
                                      <div>
                                        <span className="font-medium">{offer.name}</span>
                                        {offer.description && <span className="text-muted-foreground"> — {offer.description}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="grid sm:grid-cols-2 gap-4">
                            {((ed.strengths && ed.strengths.length > 0) || isEditing) && (
                              <div>
                                <Label className="text-xs text-green-600">Points forts</Label>
                                {isEditing ? (
                                  <div className="space-y-1 mt-1">
                                    {(ed.strengths || []).map((s, i) => (
                                      <div key={i} className="flex gap-1 items-center">
                                        <Input value={s} onChange={(e) => updateDetailListItem("strengths", i, e.target.value)} className="text-sm h-7" />
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => removeDetailListItem("strengths", i)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ))}
                                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6" onClick={() => addDetailListItem("strengths")}><Plus className="w-3 h-3" /> Ajouter</Button>
                                  </div>
                                ) : (
                                  <ul className="text-sm space-y-1 mt-1">
                                    {d.strengths!.map((s, i) => (
                                      <li key={i} className="flex gap-1.5"><span className="text-green-500 flex-shrink-0">+</span><span>{s}</span></li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                            {((ed.weaknesses && ed.weaknesses.length > 0) || isEditing) && (
                              <div>
                                <Label className="text-xs text-orange-600">Points faibles</Label>
                                {isEditing ? (
                                  <div className="space-y-1 mt-1">
                                    {(ed.weaknesses || []).map((w, i) => (
                                      <div key={i} className="flex gap-1 items-center">
                                        <Input value={w} onChange={(e) => updateDetailListItem("weaknesses", i, e.target.value)} className="text-sm h-7" />
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => removeDetailListItem("weaknesses", i)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ))}
                                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6" onClick={() => addDetailListItem("weaknesses")}><Plus className="w-3 h-3" /> Ajouter</Button>
                                  </div>
                                ) : (
                                  <ul className="text-sm space-y-1 mt-1">
                                    {d.weaknesses!.map((w, i) => (
                                      <li key={i} className="flex gap-1.5"><span className="text-orange-500 flex-shrink-0">-</span><span>{w}</span></li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                          {((ed.channels && ed.channels.length > 0) || isEditing) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Canaux</Label>
                              {isEditing ? (
                                <div className="space-y-1 mt-1">
                                  {(ed.channels || []).map((ch, i) => (
                                    <div key={i} className="flex gap-1 items-center">
                                      <Input value={ch} onChange={(e) => updateDetailListItem("channels", i, e.target.value)} className="text-sm h-7" />
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => removeDetailListItem("channels", i)}><X className="w-3 h-3" /></Button>
                                    </div>
                                  ))}
                                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6" onClick={() => addDetailListItem("channels")}><Plus className="w-3 h-3" /> Ajouter</Button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {d.channels!.map((ch, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">{ch}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {(ed.content_strategy || isEditing) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Stratégie de contenu</Label>
                              {isEditing ? (
                                <Textarea value={ed.content_strategy || ""} onChange={(e) => updateDetailField("content_strategy", e.target.value)} rows={2} className="mt-1 text-sm resize-y" />
                              ) : (
                                <p className="text-sm mt-1">{d.content_strategy}</p>
                              )}
                            </div>
                          )}
                          {d.missing_info && d.missing_info.length > 0 && !isEditing && (
                            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                              <div className="flex items-center gap-1.5 mb-1">
                                <AlertCircle className="w-3.5 h-3.5 text-yellow-600" />
                                <Label className="text-xs text-yellow-700 font-medium">
                                  Informations manquantes
                                </Label>
                              </div>
                              <ul className="text-xs text-yellow-700 space-y-0.5">
                                {d.missing_info.map((m, i) => <li key={i}>- {m}</li>)}
                              </ul>
                              <p className="text-xs text-yellow-600 mt-2">
                                Complète ces infos dans les notes ci-dessus et relance l&apos;analyse.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Section 2 — Face-à-face */}
                        {(ed.user_advantages?.length || ed.user_disadvantages?.length || ed.key_differences_summary || isEditing) && (
                          <div className="p-5 space-y-4 border-t bg-slate-50/50 dark:bg-slate-900/30">
                            <div className="flex items-center gap-2 mb-1">
                              <TrendingUp className="w-4 h-4 text-primary" />
                              <h5 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                                Face-à-face vs toi
                              </h5>
                            </div>
                            {(ed.key_differences_summary || isEditing) && (
                              isEditing ? (
                                <div>
                                  <Label className="text-xs text-muted-foreground">Résumé des différences</Label>
                                  <Textarea value={ed.key_differences_summary || ""} onChange={(e) => updateDetailField("key_differences_summary", e.target.value)} rows={3} className="mt-1 text-sm resize-y" />
                                </div>
                              ) : d.key_differences_summary ? (
                                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-sm leading-relaxed">
                                  {d.key_differences_summary}
                                </div>
                              ) : null
                            )}
                            <div className="grid sm:grid-cols-2 gap-4">
                              {((ed.user_advantages && ed.user_advantages.length > 0) || isEditing) && (
                                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    <Label className="text-xs font-semibold text-green-700 dark:text-green-400">Tu fais mieux</Label>
                                  </div>
                                  {isEditing ? (
                                    <div className="space-y-1">
                                      {(ed.user_advantages || []).map((adv, i) => (
                                        <div key={i} className="flex gap-1 items-center">
                                          <Input value={adv} onChange={(e) => updateDetailListItem("user_advantages", i, e.target.value)} className="text-sm h-7" />
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeDetailListItem("user_advantages", i)}><X className="w-3 h-3" /></Button>
                                        </div>
                                      ))}
                                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6" onClick={() => addDetailListItem("user_advantages")}><Plus className="w-3 h-3" /> Ajouter</Button>
                                    </div>
                                  ) : (
                                    <ul className="space-y-1.5">
                                      {(d.user_advantages || []).map((adv, i) => (
                                        <li key={i} className="text-sm text-green-800 dark:text-green-300 flex gap-1.5">
                                          <span className="flex-shrink-0 mt-0.5">✓</span><span>{adv}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                              {((ed.user_disadvantages && ed.user_disadvantages.length > 0) || isEditing) && (
                                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <XCircle className="w-4 h-4 text-orange-600" />
                                    <Label className="text-xs font-semibold text-orange-700 dark:text-orange-400">Ils font mieux</Label>
                                  </div>
                                  {isEditing ? (
                                    <div className="space-y-1">
                                      {(ed.user_disadvantages || []).map((dis, i) => (
                                        <div key={i} className="flex gap-1 items-center">
                                          <Input value={dis} onChange={(e) => updateDetailListItem("user_disadvantages", i, e.target.value)} className="text-sm h-7" />
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeDetailListItem("user_disadvantages", i)}><X className="w-3 h-3" /></Button>
                                        </div>
                                      ))}
                                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6" onClick={() => addDetailListItem("user_disadvantages")}><Plus className="w-3 h-3" /> Ajouter</Button>
                                    </div>
                                  ) : (
                                    <ul className="space-y-1.5">
                                      {(d.user_disadvantages || []).map((dis, i) => (
                                        <li key={i} className="text-sm text-orange-800 dark:text-orange-300 flex gap-1.5">
                                          <span className="flex-shrink-0 mt-0.5">!</span><span>{dis}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Section 3 — Mes actions */}
                        {(ed.differentiation_strategy || ed.communication_focus?.length || ed.offer_improvements?.length || isEditing) && (
                          <div className="p-5 space-y-4 border-t bg-primary/5">
                            <div className="flex items-center gap-2 mb-1">
                              <Zap className="w-4 h-4 text-primary" />
                              <h5 className="font-semibold text-sm text-primary uppercase tracking-wide">Mes actions</h5>
                            </div>
                            {(ed.differentiation_strategy || isEditing) && (
                              <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Target className="w-3.5 h-3.5 text-primary" />
                                  <Label className="text-xs font-semibold text-primary">Stratégie de différenciation</Label>
                                </div>
                                {isEditing ? (
                                  <Textarea value={ed.differentiation_strategy || ""} onChange={(e) => updateDetailField("differentiation_strategy", e.target.value)} rows={3} className="text-sm resize-y" />
                                ) : (
                                  <p className="text-sm leading-relaxed">{d.differentiation_strategy}</p>
                                )}
                              </div>
                            )}
                            {((ed.communication_focus && ed.communication_focus.length > 0) || isEditing) && (
                              <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                  <Label className="text-xs font-semibold text-primary">Ce que je dois mettre en avant</Label>
                                </div>
                                {isEditing ? (
                                  <div className="space-y-1">
                                    {(ed.communication_focus || []).map((msg, i) => (
                                      <div key={i} className="flex gap-1 items-center">
                                        <Input value={msg} onChange={(e) => updateDetailListItem("communication_focus", i, e.target.value)} className="text-sm h-7" />
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeDetailListItem("communication_focus", i)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ))}
                                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6" onClick={() => addDetailListItem("communication_focus")}><Plus className="w-3 h-3" /> Ajouter</Button>
                                  </div>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {(d.communication_focus || []).map((msg, i) => (
                                      <li key={i} className="text-sm flex gap-2 p-2 bg-white dark:bg-slate-900 rounded border">
                                        <span className="text-primary font-bold flex-shrink-0">{i + 1}.</span>
                                        <span>{msg}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                            {((ed.offer_improvements && ed.offer_improvements.length > 0) || isEditing) && (
                              <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                                  <Label className="text-xs font-semibold text-primary">Améliorations à apporter à mon offre</Label>
                                </div>
                                {isEditing ? (
                                  <div className="space-y-1">
                                    {(ed.offer_improvements || []).map((imp, i) => (
                                      <div key={i} className="flex gap-1 items-center">
                                        <Input value={imp} onChange={(e) => updateDetailListItem("offer_improvements", i, e.target.value)} className="text-sm h-7" />
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeDetailListItem("offer_improvements", i)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ))}
                                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6" onClick={() => addDetailListItem("offer_improvements")}><Plus className="w-3 h-3" /> Ajouter</Button>
                                  </div>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {(d.offer_improvements || []).map((imp, i) => (
                                      <li key={i} className="text-sm flex gap-2">
                                        <span className="text-primary flex-shrink-0 mt-0.5">→</span>
                                        <span>{imp}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Bottom save bar when editing */}
                        {isEditing && (
                          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-muted/30">
                            <Button size="sm" className="gap-1" onClick={() => saveCompetitorDetail(name)} disabled={savingDetail}>
                              <Save className="w-3.5 h-3.5" />{savingDetail ? "Sauvegarde..." : "Sauvegarder"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingDetail(null)}>Annuler</Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
