"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Underline,
  Link2,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Copy,
  Check,
  Undo,
  Redo,
  Eraser,
} from "lucide-react";

type ApplyPayload = {
  html: string;
  text: string;
};

export type ArticleEditorModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Contenu source (souvent ton texte généré actuel). Peut être plain/markdown light (ex: **mot**). */
  initialValue: string;

  /** Si tu veux récupérer le résultat pour remplacer le contenu dans le formulaire (optionnel). */
  onApply?: (payload: ApplyPayload) => void;

  /** Titre affiché au-dessus (optionnel). */
  title?: string;

  /** CTA de validation (optionnel). */
  applyLabel?: string;
};

function escapeHtml(s: string) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Conversion "markdown light" -> HTML (juste ce qu'il faut pour Tipote V1)
 * - **gras** -> <strong>
 * - # / ## -> h1 / h2
 * - lignes vides -> paragraphes
 * - "Partie X —" -> h2
 */
function markdownLightToHtml(input: string) {
  const raw = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "<p></p>";

  const lines = raw.split("\n");
  const htmlLines: string[] = [];

  for (const line of lines) {
    const l = line.trim();

    if (!l) {
      htmlLines.push(""); // paragraphe vide => espace visuel
      continue;
    }

    // H1/H2 markdown
    if (l.startsWith("# ")) {
      htmlLines.push(`<h1>${escapeHtml(l.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (l.startsWith("## ")) {
      htmlLines.push(`<h2>${escapeHtml(l.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }

    // "Partie X — ." => h2
    if (/^partie\s+\d+\s+—/i.test(l)) {
      htmlLines.push(`<h2>${escapeHtml(l)}</h2>`);
      continue;
    }

    // FAQ / Conclusion => h2
    if (/^(faq|conclusion)\b/i.test(l)) {
      htmlLines.push(`<h2>${escapeHtml(l)}</h2>`);
      continue;
    }

    htmlLines.push(`<p>${escapeHtml(l)}</p>`);
  }

  // join en conservant des sauts entre blocs
  let html = htmlLines.map((x) => x || "<p><br/></p>").join("\n");

  // **bold**
  // Remarque: simple et volontaire (pas un parser markdown complet)
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  return html;
}

function getPlainTextFromHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;

  // garder une lecture "article": blocs séparés par double saut
  const text = div.innerText
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * ExecCommand: deprecated mais toujours supporté dans la plupart des navigateurs
 * et parfait ici (zéro dépendance).
 */
function exec(cmd: string, value?: string) {
  try {
    document.execCommand(cmd, false, value);
  } catch {
    // no-op
  }
}

export function ArticleEditorModal({
  open,
  onOpenChange,
  initialValue,
  onApply,
  title = "Modifier & copier",
  applyLabel = "Appliquer",
}: ArticleEditorModalProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  // ✅ IMPORTANT: comme DialogContent est en Portal, le ref peut être null au moment du 1er effect.
  // On garde un state qui se met à jour dès que le div contentEditable est monté.
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);

  const initialHtml = useMemo(
    () => markdownLightToHtml(initialValue),
    [initialValue]
  );

  const [docTitle, setDocTitle] = useState("");
  const [copied, setCopied] = useState(false);

  // on stocke HTML courant
  const [html, setHtml] = useState<string>(initialHtml);

  useEffect(() => {
    if (!open) return;

    setCopied(false);
    setHtml(initialHtml);

    // auto-titre (optionnel) basé sur 1ère ligne
    const firstLine =
      (initialValue ?? "").split("\n").find((x) => x.trim()) ?? "";
    setDocTitle(firstLine.replace(/^#+\s+/, "").trim().slice(0, 120));
  }, [open, initialHtml, initialValue]);

  // ✅ Hydrate editor content quand open + html change ET quand editorEl existe
  useEffect(() => {
    if (!open) return;
    const el = editorEl || editorRef.current;
    if (!el) return;

    // Si déjà identique, ne touche pas (évite de casser la sélection)
    const target = html || "<p></p>";
    if (el.innerHTML !== target) {
      el.innerHTML = target;
    }
  }, [open, html, editorEl]);

  const syncFromEditor = () => {
    const el = editorEl || editorRef.current;
    if (!el) return;
    setHtml(el.innerHTML);
  };

  const ensureFocus = () => {
    (editorEl || editorRef.current)?.focus();
  };

  const insertLink = () => {
    const url = window.prompt("Lien (URL) :");
    if (!url) return;
    exec("createLink", url);
    syncFromEditor();
  };

  const setBlock = (tag: "p" | "h1" | "h2") => {
    exec("formatBlock", `<${tag}>`);
    syncFromEditor();
  };

  const clearFormatting = () => {
    exec("removeFormat");
    syncFromEditor();
  };

  const handleCopy = async () => {
    const el = editorEl || editorRef.current;
    if (!el) return;

    const currentHtml = el.innerHTML;
    const currentText = getPlainTextFromHtml(currentHtml);

    try {
      // @ts-ignore
      if (navigator.clipboard && (window as any).ClipboardItem) {
        // @ts-ignore
        const item = new (window as any).ClipboardItem({
          "text/html": new Blob([currentHtml], { type: "text/html" }),
          "text/plain": new Blob([currentText], { type: "text/plain" }),
        });
        // @ts-ignore
        await navigator.clipboard.write([item]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentText);
      } else {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand("copy");
        sel?.removeAllRanges();
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      try {
        await navigator.clipboard.writeText(currentText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      } catch {
        // no-op
      }
    }
  };

  const apply = () => {
    const el = editorEl || editorRef.current;
    if (!el) return;

    const currentHtml = el.innerHTML;
    const currentText = getPlainTextFromHtml(currentHtml);

    onApply?.({ html: currentHtml, text: currentText });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ✅ Fix UX: le modal ne doit jamais déborder de l'écran */}
      <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* ✅ Le contenu (header+form+éditeur) scrolle, pas la page */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            <div className="text-sm text-muted-foreground">
              Modifie ton article avec une mise en forme (H1/H2/gras/liens) puis
              copie-le en gardant le rendu.
            </div>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2 space-y-2">
                <div className="text-sm font-medium">Titre (optionnel)</div>
                <Input
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Titre"
                />
              </div>

              <div className="md:col-span-1 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    ensureFocus();
                    exec("undo");
                    syncFromEditor();
                  }}
                >
                  <Undo className="w-4 h-4 mr-2" />
                  Annuler
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    ensureFocus();
                    exec("redo");
                    syncFromEditor();
                  }}
                >
                  <Redo className="w-4 h-4 mr-2" />
                  Rétablir
                </Button>
              </div>
            </div>

            <Separator />

            {/* Toolbar */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  setBlock("h1");
                }}
              >
                <Heading1 className="w-4 h-4 mr-2" />
                H1
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  setBlock("h2");
                }}
              >
                <Heading2 className="w-4 h-4 mr-2" />
                H2
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  setBlock("p");
                }}
              >
                Paragraphe
              </Button>

              <Separator orientation="vertical" className="h-9" />

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  exec("bold");
                  syncFromEditor();
                }}
              >
                <Bold className="w-4 h-4 mr-2" />
                Gras
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  exec("underline");
                  syncFromEditor();
                }}
              >
                <Underline className="w-4 h-4 mr-2" />
                Souligner
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  insertLink();
                }}
              >
                <Link2 className="w-4 h-4 mr-2" />
                Lien
              </Button>

              <Separator orientation="vertical" className="h-9" />

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  exec("insertUnorderedList");
                  syncFromEditor();
                }}
              >
                <List className="w-4 h-4 mr-2" />
                Liste
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  exec("insertOrderedList");
                  syncFromEditor();
                }}
              >
                <ListOrdered className="w-4 h-4 mr-2" />
                Numérotée
              </Button>

              <Separator orientation="vertical" className="h-9" />

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  ensureFocus();
                  clearFormatting();
                }}
              >
                <Eraser className="w-4 h-4 mr-2" />
                Nettoyer
              </Button>

              <div className="flex-1" />

              <Button type="button" onClick={handleCopy}>
                {copied ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>

            {/* Editor */}
            <div className="rounded-xl border bg-background">
              <div className="p-4">
                <div
                  ref={(node) => {
                    editorRef.current = node;
                    setEditorEl(node);
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={syncFromEditor}
                  className="outline-none prose prose-sm max-w-none overflow-y-auto min-h-[420px] max-h-[calc(90vh-360px)]"
                  style={{
                    lineHeight: "1.6",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Astuce : si tu colles dans Systeme.io / Notion / Google Docs, le
              bouton “Copier” envoie du HTML (gras, titres, liens). Si une
              plateforme refuse le HTML, elle collera au moins le texte propre.
            </div>
          </div>
        </div>

        {/* ✅ Footer reste visible, le body scrolle au-dessus */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Appliquer = renvoie aussi le texte brut (utile si tu veux sauvegarder
              en DB sans HTML).
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Fermer
              </Button>
              <Button type="button" onClick={apply}>
                {applyLabel}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
