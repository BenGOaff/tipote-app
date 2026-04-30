"use client";

// Inline rich-text editor used in the quiz editor.
// Click-to-edit with a floating toolbar: bold, italic, underline, alignment
// (left / center / right), link, image. Stores sanitized HTML. Read-only
// renders also go through the same sanitizer to keep the public page XSS-safe.
//
// `singleLine`:
//   - Enter commits the edit instead of inserting a newline
//   - Image insertion is hidden (no room to show one in a single line)
//   - Alignment stays available — it's a purely visual block toggle that works
//     on a one-line title just as well as on a paragraph.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Pencil,
  Sparkles, Loader2,
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
  /**
   * When provided, a ✨ button is shown in the display mode. Clicking it
   * sends the current plain-text value to the genderize API and replaces
   * the field with the folded `{m|f|x}` variant. Formatting is lost.
   */
  onGenderize?: (plainText: string) => Promise<string | null>;
  /**
   * Optional transform applied to `value` ONLY in display mode (not while
   * editing). Used by the quiz editor to substitute {name} / {m|f|x}
   * placeholders with a demo first name so the creator sees what real
   * visitors will see, while still being able to edit the raw template by
   * clicking the field. Identity passthrough when omitted.
   */
  previewTransform?: (value: string) => string;
  /**
   * When provided, a tiny ✨ button appears in display mode. Clicking it
   * sends the current plain-text value to the parent's rewrite handler,
   * which returns 3 reformulations matching the quiz's tone. The user
   * picks one to replace the field, or dismisses. Marie's feedback:
   * "écrire mon idée et cliquer sur les petites étoiles pour qu'il
   * reformule dans le ton du quiz".
   */
  onAIRewrite?: (plainText: string) => Promise<string[] | null>;
}

export function RichTextEdit({
  value, onChange, className, placeholder, style, singleLine, onGenderize,
  previewTransform, onAIRewrite,
}: RichTextEditProps) {
  const t = useTranslations("richTextEditor");
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [genderizing, setGenderizing] = useState(false);
  // AI rewrite state — local to each field so popovers don't collide.
  const [rewriting, setRewriting] = useState(false);
  const [aiProposals, setAiProposals] = useState<string[] | null>(null);

  const handleGenderize = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onGenderize || genderizing) return;
    const plain = stripTagsQuick(value);
    if (!plain) return;
    setGenderizing(true);
    try {
      const folded = await onGenderize(plain);
      if (folded) onChange(folded);
    } finally {
      setGenderizing(false);
    }
  }, [onGenderize, onChange, value, genderizing]);

  const handleAIRewrite = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAIRewrite || rewriting) return;
    const plain = stripTagsQuick(value);
    if (!plain) return;
    setRewriting(true);
    try {
      const proposals = await onAIRewrite(plain);
      setAiProposals(proposals && proposals.length > 0 ? proposals : []);
    } finally {
      setRewriting(false);
    }
  }, [onAIRewrite, value, rewriting]);

  const applyProposal = useCallback((p: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(p);
    setAiProposals(null);
  }, [onChange]);

  const dismissProposals = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setAiProposals(null);
  }, []);

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
    const url = window.prompt(t("promptLink"));
    if (!url) return;
    if (!isSafeUrl(url)) {
      window.alert(t("invalidUrlFull"));
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
    const url = window.prompt(t("promptImage"));
    if (!url) return;
    if (!isSafeUrl(url)) {
      window.alert(t("invalidUrl"));
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
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} title={t("bold")}><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} title={t("italic")}><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("underline"); }} title={t("underline")}><UnderlineIcon className="w-3.5 h-3.5" /></ToolbarBtn>
          <span className="w-px h-4 bg-border mx-0.5" />
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyLeft"); }} title={t("alignLeft")}><AlignLeft className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyCenter"); }} title={t("alignCenter")}><AlignCenter className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyRight"); }} title={t("alignRight")}><AlignRight className="w-3.5 h-3.5" /></ToolbarBtn>
          <span className="w-px h-4 bg-border mx-0.5" />
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); onInsertLink(); }} title={t("addLink")}><LinkIcon className="w-3.5 h-3.5" /></ToolbarBtn>
          {!singleLine && <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); onInsertImage(); }} title={t("insertImage")}><ImageIcon className="w-3.5 h-3.5" /></ToolbarBtn>}
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
  // Render the field + the AI proposals list as siblings inside a shared
  // wrapper. Click-to-edit fires only on the field DIV — clicking a
  // proposal (or dismiss) doesn't accidentally open the editor.
  return (
    <div className="relative">
      <div
        onClick={() => { if (!aiProposals) setEditing(true); }}
        style={style}
        className={`${baseCls} hover:ring-2 hover:ring-primary/20 hover:bg-primary/5 group relative`}
      >
        {isEmpty ? (
          <span className="opacity-40 italic">{placeholder}</span>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(previewTransform ? previewTransform(value) : value) }} />
        )}
        <Pencil className="absolute top-1 right-1 w-3 h-3 text-primary/30 opacity-0 group-hover:opacity-100 transition-opacity" />
        {onGenderize && !isEmpty && (
          <button
            type="button"
            onClick={handleGenderize}
            disabled={genderizing}
            title="Générer les variantes de genre (Il / Elle / Iel)"
            className="absolute top-1 right-6 p-0.5 text-primary/30 opacity-0 group-hover:opacity-100 hover:text-primary disabled:opacity-100 transition-opacity"
          >
            {genderizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          </button>
        )}
        {onAIRewrite && !isEmpty && (
          <button
            type="button"
            onClick={handleAIRewrite}
            disabled={rewriting}
            title={t("aiRewriteTitle")}
            // When both onGenderize and onAIRewrite are passed, shift this
            // one further left so they don't overlap the pencil icon.
            className={`absolute top-1 ${onGenderize ? "right-11" : "right-6"} p-0.5 text-primary/40 opacity-0 group-hover:opacity-100 hover:text-primary disabled:opacity-100 transition-opacity`}
          >
            {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          </button>
        )}
      </div>

      {aiProposals !== null && (
        <div
          className="mt-2 rounded-xl border bg-background shadow-sm p-2 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {aiProposals.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1.5">{t("aiRewriteNoResult")}</p>
          ) : (
            aiProposals.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => applyProposal(p, e)}
                className="block w-full text-left px-3 py-2 text-sm rounded-lg border bg-background hover:bg-primary/5 hover:border-primary/40 transition-colors"
              >
                {p}
              </button>
            ))
          )}
          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={dismissProposals}
              className="text-[11px] text-muted-foreground hover:underline px-2"
            >
              {t("aiRewriteDismiss")}
            </button>
            {aiProposals.length > 0 && (
              <button
                type="button"
                onClick={handleAIRewrite}
                disabled={rewriting}
                className="text-[11px] text-primary hover:underline px-2 inline-flex items-center gap-1"
              >
                {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {t("aiRewriteAgain")}
              </button>
            )}
          </div>
        </div>
      )}
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
