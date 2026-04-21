"use client";

// Inline rich-text editor used in the quiz editor.
// Click-to-edit with a floating toolbar: bold, italic, underline, alignment,
// link, image. Stores sanitized HTML. Read-only renders also go through the
// same sanitizer to keep the public page XSS-safe.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Pencil,
} from "lucide-react";
import { sanitizeRichText, isSafeUrl } from "@/lib/richText";

interface RichTextEditProps {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  /** Single-line behaviour: Enter saves, block formatting disabled. */
  singleLine?: boolean;
}

export function RichTextEdit({
  value, onChange, className, placeholder, style, singleLine,
}: RichTextEditProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);

  // Keep the contenteditable in sync when the parent updates `value` while not editing.
  useEffect(() => {
    if (!editing && ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = sanitizeRichText(value);
    }
  }, [value, editing]);

  // When entering edit mode, populate the fresh contenteditable node and place
  // the caret at the end so the user can start typing/modifying right away.
  // We intentionally don't depend on `value` here — re-seeding while the user
  // is typing would wipe their cursor position.
  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.innerHTML = sanitizeRichText(value);
    ref.current.focus();
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && typeof document !== "undefined") {
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const exec = useCallback((cmd: string, arg?: string) => {
    if (typeof document === "undefined") return;
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
  }, []);

  const commit = useCallback(() => {
    if (!ref.current) return;
    const clean = sanitizeRichText(ref.current.innerHTML);
    if (clean !== value) onChange(clean);
    setEditing(false);
  }, [onChange, value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (singleLine && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  const onInsertLink = () => {
    const url = window.prompt("URL du lien (https://…, mailto:…)");
    if (!url) return;
    if (!isSafeUrl(url)) {
      window.alert("URL invalide : seuls https, mailto, tel et chemins relatifs sont autorisés.");
      return;
    }
    exec("createLink", url);
    // Force target=_blank rel=noopener on freshly inserted links
    const el = ref.current;
    if (el) {
      el.querySelectorAll("a").forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      });
    }
  };

  const onInsertImage = () => {
    const url = window.prompt("URL de l'image (https://… ou /chemin)");
    if (!url) return;
    if (!isSafeUrl(url)) {
      window.alert("URL invalide.");
      return;
    }
    exec("insertImage", url);
    const el = ref.current;
    if (el) {
      el.querySelectorAll("img").forEach((img) => {
        img.style.maxWidth = "100%";
        img.style.height = "auto";
      });
    }
  };

  const baseCls = `${className || ""} cursor-text rounded-lg px-2 py-1 transition-all min-h-[1.2em]`;

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border bg-background p-1 shadow-sm sticky top-2 z-20">
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} title="Gras"><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} title="Italique"><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("underline"); }} title="Souligné"><UnderlineIcon className="w-3.5 h-3.5" /></ToolbarBtn>
          <span className="w-px h-4 bg-border mx-0.5" />
          {!singleLine && <>
            <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyLeft"); }} title="Aligner à gauche"><AlignLeft className="w-3.5 h-3.5" /></ToolbarBtn>
            <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyCenter"); }} title="Centrer"><AlignCenter className="w-3.5 h-3.5" /></ToolbarBtn>
            <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyRight"); }} title="Aligner à droite"><AlignRight className="w-3.5 h-3.5" /></ToolbarBtn>
            <span className="w-px h-4 bg-border mx-0.5" />
          </>}
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); onInsertLink(); }} title="Ajouter un lien"><LinkIcon className="w-3.5 h-3.5" /></ToolbarBtn>
          {!singleLine && <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); onInsertImage(); }} title="Insérer une image"><ImageIcon className="w-3.5 h-3.5" /></ToolbarBtn>}
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onBlur={commit}
          onKeyDown={onKeyDown}
          className={`${baseCls} w-full bg-white/90 border-2 border-primary/40 outline-none`}
          style={style}
          data-placeholder={placeholder}
        />
      </div>
    );
  }

  const isEmpty = !value || stripTagsQuick(value).length === 0;
  return (
    <div
      onClick={() => setEditing(true)}
      style={style}
      className={`${baseCls} hover:ring-2 hover:ring-primary/20 hover:bg-primary/5 group relative`}
    >
      {isEmpty ? (
        <span className="opacity-40 italic">{placeholder}</span>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }} />
      )}
      <Pencil className="absolute top-1 right-1 w-3 h-3 text-primary/30 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function stripTagsQuick(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function ToolbarBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  const { className, children, ...rest } = props;
  return (
    <button
      type="button"
      className={`p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
