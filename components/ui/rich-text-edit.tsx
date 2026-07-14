"use client";

// Inline rich-text editor used everywhere in the quiz editor.
// Click-to-edit with a floating toolbar: bold / italic / underline / alignment
// (left / center / right) / bullet list / numbered list / link / image.
// Stores sanitized HTML. Read-only renders also go through the same sanitizer
// to keep the public page XSS-safe.
//
// `singleLine`:
//   - Enter commits the edit instead of inserting a newline
//   - Block-level tools (lists) are hidden (they don't make sense on a one-line
//     field) — alignment is kept because it's a purely visual toggle that works
//     on a single line too.
//
// Paste handling: every paste is forced to plain text (Word, Google Docs,
// Notion all dump their own fonts/colors/sizes into contentEditable
// otherwise). The user keeps their typed text; the editor's typography wins.
// Combined with the toolbar, that gives the same outcome as a Tally / Typeform
// paste flow.
//
// CSS: the contentEditable surface inherits the public renderer's
// `.tiquiz-rich` class so bullet / numbered list bullets are visible while
// editing (matches what visitors will see).

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon, Pencil,
  Sparkles, Loader2,
  Palette, Eraser, Wand2,
} from "lucide-react";
import { sanitizeRichText, isSafeUrl } from "@/lib/richText";
import { HexColorPicker } from "react-colorful";
import { QuizVarInserter, type QuizVarFlags } from "@/components/quiz/QuizVarInserter";
import { useUserPalettes } from "@/components/editor/PalettesContext";
import { useEditorPreviewDevice } from "@/components/editor/EditorPreviewDeviceContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Tailles de police au niveau du champ (px). Source de verite partagee
// avec le sanitizer (lib/richText.ts FIELD_ALLOWED_SIZES) et le CSS
// (.rt-field-fs). Une seule taille par champ et par device, jamais par
// mot. Drame Bene 8 juin 2026 : tailles mobile/desktop independantes.
const FIELD_FONT_SIZES = [
  "14px", "16px", "18px", "20px", "24px", "28px", "32px", "40px", "48px", "56px", "64px",
] as const;

// Validation d'un code hex (#abc ou #aabbcc) pour l'input couleur perso.
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

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
   * Personalization placeholders the user can insert at the caret. Driven
   * by the quiz's ask_first_name / ask_gender flags. When provided and at
   * least one is true, "+ {name}" / "+ {m|f|x}" chips show up next to
   * the formatting toolbar in edit mode.
   */
  availableVars?: QuizVarFlags;
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
   * sends the current plain-text value (placeholders preserved) to the
   * parent's rewrite handler, which returns 3 reformulations. The user
   * picks one to replace the field value, or dismisses. Marie's feedback
   * #4: "écrire mon idée et cliquer sur les petites étoiles pour qu'il
   * reformule dans le ton du quiz".
   */
  onAIRewrite?: (plainText: string) => Promise<string[] | null>;
  /**
   * Drag-and-drop file upload (Adeline, 18 mai 2026 : "possible de drag
   * and drop à l'emplacement voulu"). When provided, dropping an image
   * file onto the editing surface triggers an upload via this callback,
   * and the returned URL is inserted as <img> at the drop position.
   * Without this callback, drops fall back to the browser default
   * (typically a navigation), so we explicitly block that.
   */
  onImageUpload?: (file: File) => Promise<string | null>;
}

export function RichTextEdit({
  value, onChange, className, placeholder, style, singleLine, onGenderize, availableVars,
  previewTransform, onAIRewrite, onImageUpload,
}: RichTextEditProps) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [genderizing, setGenderizing] = useState(false);
  // Palettes utilisateur — alimentées par UserPalettesProvider quand
  // l'éditeur est monté dans un écran qui les a chargées (quiz, sondage,
  // popquiz). Sinon `[]` → la section "Mes palettes" est masquée, la
  // palette curée seule reste affichée.
  const userPalettes = useUserPalettes();
  // Device courant choisi par l'user via le toggle Monitor/Smartphone des
  // editeurs parents (QuizDetailClient / SurveyDetailClient). Pilote a
  // quelle CSS variable la toolbar font-size ecrit (--rt-fs-m mobile,
  // --rt-fs-d desktop). Drame Bene 8 juin 2026 : tailles independantes
  // par device, editables en passant d'un mode a l'autre.
  const previewDevice = useEditorPreviewDevice();
  // AI rewrite state: a small popover-like list of proposals shown right
  // under the field after the creator clicks ✨. We keep it local to the
  // component so each field manages its own popover independently.
  const [rewriting, setRewriting] = useState(false);
  const [aiProposals, setAiProposals] = useState<string[] | null>(null);
  // Color picker state. We snapshot the current selection range BEFORE
  // opening the picker because clicking inside the popover blurs the
  // contentEditable, and `restoreSelection` puts the caret back exactly
  // where the user left it before applying foreColor.
  const [colorOpen, setColorOpen] = useState(false);
  // Couleur perso (HSV in-app). On NE PASSE PLUS par <input type="color">
  // natif : ouvrir le dialog OS faisait blur du contentEditable -> onBlur
  // -> commit() -> setEditing(false) -> le popover etait demonte AVANT que
  // la couleur choisie soit appliquee. Bug couleur recurrent. react-colorful
  // reste dans le DOM (aucune fenetre OS), donc plus de blur, plus de bug.
  const [customColor, setCustomColor] = useState("#000000");
  // Wrapper (bouton palette + popover) pour le click-out du picker couleur.
  const colorWrapRef = useRef<HTMLDivElement>(null);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  // Image selectionnee pour resize. On track le <img> courant dans le
  // contentEditable et on affiche un popover avec une dropdown de tailles
  // (drame Christelle 8 juin 2026 : "impossible de redimensionner le GIF").
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

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

  useEffect(() => {
    if (!editing && ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = sanitizeRichText(value);
    }
  }, [value, editing]);

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
    // Defense couleur (Gwenn 14 juillet 2026 : "la couleur saute quand je
    // centre") : execCommand peut restructurer le contenu et emettre un
    // <font> deprecie que le sanitizer stripperait -> perte de couleur. On
    // normalise tout <font> en <span style> apres CHAQUE commande.
    const el = ref.current;
    if (el) {
      el.querySelectorAll("font").forEach((f) => {
        const span = document.createElement("span");
        const c = f.getAttribute("color");
        if (c) span.style.color = c;
        const inline = f.getAttribute("style");
        if (inline) span.setAttribute("style", `${span.getAttribute("style") ?? ""};${inline}`);
        while (f.firstChild) span.appendChild(f.firstChild);
        f.replaceWith(span);
      });
    }
    ref.current?.focus();
  }, []);

  const saveSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (typeof window === "undefined" || !ref.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (savedRangeRef.current) {
      sel.addRange(savedRangeRef.current);
    } else {
      // No saved range (e.g. user clicked the palette without selecting
      // text first) → place the caret at the end of the field so the
      // foreColor still has a target context.
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel.addRange(range);
    }
    ref.current.focus();
  }, []);

  const applyColor = useCallback(
    (color: string | null) => {
      if (typeof document === "undefined") return;
      restoreSelection();
      // styleWithCSS=true makes Chromium emit `<span style="color: …">`
      // instead of `<font color="…">`. The latter would be stripped by
      // sanitizeRichText (no `font` in ALLOWED_TAGS), so we'd lose the
      // colour on next save. styleWithCSS keeps the formatting safely
      // inside an allowed `span` element.
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        /* old browsers ignore this — fallback path below also covers it */
      }
      if (color) {
        document.execCommand("foreColor", false, color);
        // execCommand("foreColor") emet de facon erratique (selon le
        // contexte de selection) un <font color> deprecie au lieu d'un
        // <span style="color">. Or `font` est stripped par le sanitizer
        // -> la couleur etait perdue au prochain commit / re-render (drame
        // Gwenn 12 juillet 2026 : centrer un titre "enlevait" sa couleur
        // pour la remettre en bleu par defaut). On convertit tout <font>
        // en <span style> dans le DOM live pour garantir la persistance
        // immediate (le sanitizer fait la meme conversion cote save).
        const el = ref.current;
        if (el) {
          el.querySelectorAll("font").forEach((f) => {
            const span = document.createElement("span");
            const c = f.getAttribute("color");
            if (c) span.style.color = c;
            const inline = f.getAttribute("style");
            if (inline) span.setAttribute("style", `${span.getAttribute("style") ?? ""};${inline}`);
            while (f.firstChild) span.appendChild(f.firstChild);
            f.replaceWith(span);
          });
        }
      } else {
        // "Remove formatting" path — strips inline color styles. We use
        // removeFormat which also drops bold/italic, so we follow up by
        // re-applying nothing (the call is the cheapest correct way).
        document.execCommand("removeFormat", false);
      }
      // styleWithCSS est un flag DOCUMENT-GLOBAL persistant. On le remet a
      // false pour qu'il ne "fuite" pas dans les commandes suivantes.
      try {
        document.execCommand("styleWithCSS", false, "false");
      } catch {
        /* noop */
      }
      setColorOpen(false);
      dialogPausedRef.current = false;
      ref.current?.focus();
    },
    [restoreSelection],
  );

  // Curated swatch palette — neutrals first (most useful for contrast
  // against branded backgrounds), then primary pop colours. Ordered for
  // grid layout; the "+" custom picker below extends the range.
  const SWATCHES: Array<{ hex: string; label: string }> = [
    { hex: "#000000", label: "Noir" },
    { hex: "#ffffff", label: "Blanc" },
    { hex: "#6b7280", label: "Gris" },
    { hex: "#ef4444", label: "Rouge" },
    { hex: "#f59e0b", label: "Orange" },
    { hex: "#10b981", label: "Vert" },
    { hex: "#3b82f6", label: "Bleu" },
    { hex: "#8b5cf6", label: "Violet" },
    { hex: "#ec4899", label: "Rose" },
    { hex: "#0ea5e9", label: "Cyan" },
  ];

  // Applique une largeur (en %) a l'image actuellement selectionnee.
  // Drame Christelle 8 juin 2026 : impossible de redimensionner le GIF.
  // Le sanitizer accepte width sur <img> en px ou % (cf. richText.ts).
  // Le commit du nouveau HTML se fait au prochain onBlur (commit paresseux).
  const applyImageWidth = useCallback(
    (widthPct: string | null) => {
      if (!selectedImg) return;
      if (widthPct === null) {
        selectedImg.style.width = "";
      } else {
        selectedImg.style.width = widthPct;
      }
    },
    [selectedImg],
  );

  // Commit IMMEDIAT (live) : sanitize l'innerHTML courant et remonte au
  // parent sans attendre le blur. Utilise par la taille de police pour
  // que le changement soit persiste en WYSIWYG des le clic.
  const commitNow = useCallback(() => {
    if (!ref.current) return;
    const clean = sanitizeRichText(ref.current.innerHTML);
    if (clean !== value) onChange(clean);
  }, [onChange, value]);

  // ─── Taille de police FIELD-LEVEL, INDEPENDANTE MOBILE/DESKTOP ─────
  // Drame Bene 8 juin 2026 : "je veux pouvoir editer la taille mobile
  // et la taille PC separement". On enveloppe l'integralite du contenu
  // dans un UNIQUE <div class="rt-field-fs" style="--rt-fs-m: Xpx;
  // --rt-fs-d: Ypx">. Le device courant (du toggle Monitor/Smartphone)
  // decide a quelle variable on ecrit. Le CSS (globals.css) picke la
  // bonne variable selon la media query + l'override data-device-preview.
  const FIELD_FS_CLASS = "rt-field-fs";
  const FS_VAR = previewDevice === "mobile" ? "--rt-fs-m" : "--rt-fs-d";

  const getCurrentFieldSize = useCallback((): string | null => {
    const el = ref.current;
    if (!el) return null;
    const wrapper = el.querySelector<HTMLElement>(`:scope > .${FIELD_FS_CLASS}`);
    const v = wrapper?.style.getPropertyValue(FS_VAR).trim();
    return v || null;
  }, [FS_VAR]);

  const applyFieldFontSize = useCallback(
    (sizePx: string | null) => {
      const el = ref.current;
      if (!el) {
        setFontSizeOpen(false);
        return;
      }
      let wrapper = el.querySelector<HTMLElement>(`:scope > .${FIELD_FS_CLASS}`);
      if (sizePx === null) {
        // Reset UNIQUEMENT le device courant. Si l'autre device a
        // toujours une valeur, on garde le wrapper. Sinon, on degage
        // -> retour au defaut responsive du design system.
        if (wrapper) {
          wrapper.style.removeProperty(FS_VAR);
          const other = previewDevice === "mobile" ? "--rt-fs-d" : "--rt-fs-m";
          const hasOther = wrapper.style.getPropertyValue(other).trim();
          if (!hasOther) {
            while (wrapper.firstChild) el.insertBefore(wrapper.firstChild, wrapper);
            el.removeChild(wrapper);
          }
        }
      } else {
        if (!wrapper) {
          // Premiere taille : on enveloppe TOUT le contenu existant dans
          // un seul div. Si le champ est vide, on cree un wrapper vide
          // (la frappe suivante ira dedans).
          wrapper = document.createElement("div");
          wrapper.className = FIELD_FS_CLASS;
          while (el.firstChild) wrapper.appendChild(el.firstChild);
          el.appendChild(wrapper);
        }
        wrapper.style.setProperty(FS_VAR, sizePx);
      }
      setFontSizeOpen(false);
      // Commit live : le parent enregistre le nouveau HTML immediatement
      // (WYSIWYG + persistance sans attendre le blur).
      commitNow();
      ref.current?.focus();
    },
    [commitNow, FS_VAR, previewDevice],
  );

  // Bug Adeline (18 mai 2026) : "j'ai du cliquer plusieurs fois pour
  // insérer un lien". Quand Radix Dialog mount, il vole le focus du
  // contentEditable → onBlur → commit() → setEditing(false) → champ
  // démonté avant que commitLink() ait pu poser son <a>. Fix : ref
  // gate `dialogPausedRef` flippé sync AVANT l'ouverture du dialog.
  const dialogPausedRef = useRef(false);
  const commit = useCallback(() => {
    if (dialogPausedRef.current) return;
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

  // Click-out du picker couleur : ferme le popover et leve la pause commit.
  // Si le clic tombe HORS du champ editable, on committe (le blur reel a
  // ete neutralise par la pause, il faut donc persister explicitement).
  useEffect(() => {
    if (!colorOpen) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (colorWrapRef.current?.contains(target)) return;
      setColorOpen(false);
      dialogPausedRef.current = false;
      if (ref.current && !ref.current.contains(target)) commit();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colorOpen, commit]);

  // Force every paste to plain text. The browser's contentEditable
  // default eagerly accepts inline styles from Word, Google Docs and
  // Notion (font-family, sizes, colors, borders…) which then fight
  // with Tiquiz's typography. The author keeps the toolbar to apply
  // bold / italic / lists explicitly — same model as Tally / Typeform.
  // Bonus: this also kills weird whitespace artefacts (NBSP runs,
  // smart-paragraph breaks) that were eating French typography
  // (e.g. spaces before `:`).
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    if (typeof document !== "undefined") {
      document.execCommand("insertText", false, text);
    }
  };

  // Drag-and-drop image upload (Adeline, mai 2026). On capture le drop
  // sur la surface contentEditable et on intercepte les fichiers image
  // pour les uploader via le callback parent. Le drop par défaut du
  // navigateur essaie de naviguer vers le fichier (ou de l'embarquer
  // en base64 monstrueux), on bloque les deux. Caret repositionné sur
  // le point de drop avant insertImage pour respecter "à l'emplacement
  // voulu". Sans onImageUpload (champ non lié à un upload), on laisse
  // remonter pour ne pas casser un éventuel drag-and-drop natif d'un
  // composant parent.
  const [dropping, setDropping] = useState(false);
  const [uploadingDrop, setUploadingDrop] = useState(false);
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!onImageUpload) return;
    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
    e.preventDefault();
    setDropping(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!onImageUpload) return;
    e.preventDefault();
    setDropping(false);
  };
  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!onImageUpload) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    const image = files.find((f) => f.type.startsWith("image/"));
    if (!image) return;
    e.preventDefault();
    setDropping(false);
    // Pose le caret là où le user a lâché le fichier — Firefox &
    // Chromium n'exposent pas la même API alors on essaie les deux.
    type CaretHost = Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const doc = document as CaretHost;
    if (typeof doc.caretRangeFromPoint === "function") {
      const range = doc.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      }
    } else if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      }
    }
    setUploadingDrop(true);
    try {
      const url = await onImageUpload(image);
      if (!url) return;
      exec("insertImage", url);
      const el = ref.current;
      if (el) {
        el.querySelectorAll("img").forEach((img) => {
          img.style.maxWidth = "100%";
          img.style.height = "auto";
        });
      }
    } finally {
      setUploadingDrop(false);
    }
  };

  // Link / image insertion via styled Dialog (Adeline, 18 mai 2026 :
  // "le texte surligné pour insérer un lien c'est moche, respecte le
  // branding tiquiz tipote, pas les fenêtres moches par défaut").
  // window.prompt() était une dialogue navigateur (titre "quiz.tipote.com
  // indique", boutons OK/Annuler stylés OS) → on passe sur le Dialog
  // Radix du design-system. On snapshot le range AVANT d'ouvrir parce
  // que Radix steal le focus du contentEditable et perd la sélection.
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDraftUrl, setLinkDraftUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageDraftUrl, setImageDraftUrl] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);

  const onInsertLink = () => {
    saveSelection();
    dialogPausedRef.current = true;
    setLinkDraftUrl("");
    setLinkError(null);
    setLinkDialogOpen(true);
  };

  const commitLink = () => {
    const url = linkDraftUrl.trim();
    if (!url) { setLinkError(t("rteLinkInvalid")); return; }
    if (!isSafeUrl(url)) { setLinkError(t("rteLinkInvalid")); return; }
    setLinkDialogOpen(false);
    dialogPausedRef.current = false;
    restoreSelection();
    exec("createLink", url);
    const el = ref.current;
    if (el) {
      el.querySelectorAll("a").forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      });
    }
  };

  // Toolbar Image button (Adeline, 18 mai 2026 : "je ne vois pas où
  // ajouter une image sur le résultat"). Quand un onImageUpload est
  // fourni → on ouvre un file picker direct (UX visible + immédiate
  // pour les utilisateurs qui ne pensent pas au drag-and-drop). Sinon
  // → fallback Dialog URL pour les champs non liés à un upload.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onInsertImage = () => {
    saveSelection();
    if (onImageUpload) {
      fileInputRef.current?.click();
      return;
    }
    dialogPausedRef.current = true;
    setImageDraftUrl("");
    setImageError(null);
    setImageDialogOpen(true);
  };

  const onPickedImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking same file fires onChange
    if (!file || !onImageUpload) return;
    if (!file.type.startsWith("image/")) return;
    setUploadingDrop(true);
    try {
      const url = await onImageUpload(file);
      if (!url) return;
      restoreSelection();
      exec("insertImage", url);
      const el = ref.current;
      if (el) {
        el.querySelectorAll("img").forEach((img) => {
          img.style.maxWidth = "100%";
          img.style.height = "auto";
        });
      }
    } finally {
      setUploadingDrop(false);
    }
  };

  const commitImage = () => {
    const url = imageDraftUrl.trim();
    if (!url) { setImageError(t("rteUrlInvalid")); return; }
    if (!isSafeUrl(url)) { setImageError(t("rteUrlInvalid")); return; }
    setImageDialogOpen(false);
    dialogPausedRef.current = false;
    restoreSelection();
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
  const hasVars = availableVars && (availableVars.name || availableVars.gender);

  // Link / image dialogs — déclarés AVANT le branchement editing/display
  // pour pouvoir les rendre dans les DEUX branches. Bug Adeline (18 mai
  // 2026, V2 retour) : "L'ajout du lien dans la case à cocher ne
  // fonctionne pas du tout. Rien ne se passe quand je sélectionne le
  // texte et que je clique sur le lien." Cause racine : avant ce
  // refactor, les <Dialog> n'étaient rendus QUE dans la branche
  // non-editing. Or le bouton link de la toolbar n'existe que quand
  // editing=true → quand l'user cliquait dessus, setLinkDialogOpen
  // flippait mais le composant Dialog n'était jamais monté dans le
  // tree React, donc rien ne s'affichait.
  const dialogs = (
    <>
      <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) dialogPausedRef.current = false; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("rteLinkDialogTitle")}</DialogTitle>
            <DialogDescription>{t("rteLinkDialogHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="url"
              autoFocus
              value={linkDraftUrl}
              placeholder="https://…"
              onChange={(e) => { setLinkDraftUrl(e.target.value); setLinkError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLink(); } }}
            />
            {linkError && <p className="text-xs text-destructive">{linkError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              {t("rteDialogCancel")}
            </Button>
            <Button onClick={commitLink}>{t("rteDialogConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageDialogOpen} onOpenChange={(open) => { setImageDialogOpen(open); if (!open) dialogPausedRef.current = false; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("rteImageDialogTitle")}</DialogTitle>
            <DialogDescription>{t("rteImageDialogHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="url"
              autoFocus
              value={imageDraftUrl}
              placeholder="https://…"
              onChange={(e) => { setImageDraftUrl(e.target.value); setImageError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitImage(); } }}
            />
            {imageError && <p className="text-xs text-destructive">{imageError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageDialogOpen(false)}>
              {t("rteDialogCancel")}
            </Button>
            <Button onClick={commitImage}>{t("rteDialogConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (editing) {
    return (
      <>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border bg-background p-1 shadow-sm sticky top-2 z-20">
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} title={t("rteBold")}><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} title={t("rteItalic")}><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("underline"); }} title={t("rteUnderline")}><UnderlineIcon className="w-3.5 h-3.5" /></ToolbarBtn>
          <span className="w-px h-4 bg-border mx-0.5" />
          {/* Color picker — saves the current selection so it survives
              the click on the popover (which would otherwise blur the
              contentEditable). styleWithCSS in applyColor ensures the
              output is a `<span style="color:…">` that DOMPurify keeps. */}
          <div className="relative" ref={colorWrapRef}>
            <ToolbarBtn
              onMouseDown={(e) => {
                e.preventDefault();
                if (colorOpen) {
                  setColorOpen(false);
                  dialogPausedRef.current = false;
                } else {
                  // On snapshot la selection AVANT d'ouvrir + on met le
                  // commit-on-blur en pause : l'input hex (focusable) fait
                  // blur du contentEditable, sans la pause le champ se
                  // committerait et demonterait le popover.
                  saveSelection();
                  dialogPausedRef.current = true;
                  setColorOpen(true);
                }
              }}
              title="Couleur du texte"
            >
              <Palette className="w-3.5 h-3.5" />
            </ToolbarBtn>
            {colorOpen && (
              <div
                className="absolute z-30 top-full left-0 mt-1 w-56 rounded-lg border bg-background shadow-lg p-2 space-y-2"
                onMouseDown={(e) => e.preventDefault()}
              >
                {/* Palettes user, surfacées en TÊTE quand l'écran les
                    a chargées — c'est la valeur ajoutée vs le picker
                    natif du browser : le user retrouve sa charte sans
                    rouvrir le panneau Design. */}
                {userPalettes.length > 0 && userPalettes.some((p) => p.colors.length > 0) && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {t("rteMyPalettes")}
                    </div>
                    <div className="space-y-1">
                      {userPalettes.map((p) => (
                        p.colors.length > 0 ? (
                          <div key={p.id} className="flex items-center gap-1.5">
                            <span
                              className="text-[10px] text-muted-foreground truncate max-w-[80px]"
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            <div className="flex gap-1">
                              {p.colors.map((c, i) => (
                                <button
                                  key={`${p.id}-${i}`}
                                  type="button"
                                  onClick={() => applyColor(c)}
                                  title={c}
                                  className="w-7 h-7 rounded-md border border-border/60 hover:scale-110 transition-transform"
                                  style={{ backgroundColor: c }}
                                  aria-label={c}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1">
                  {SWATCHES.map((s) => (
                    <button
                      key={s.hex}
                      type="button"
                      onClick={() => applyColor(s.hex)}
                      title={s.label}
                      className="w-8 h-8 rounded-md border border-border/60 hover:scale-110 transition-transform"
                      style={{ backgroundColor: s.hex }}
                      aria-label={s.label}
                    />
                  ))}
                </div>
                {/* Couleur perso : carre HSV in-app (react-colorful).
                    On applique au RELACHEMENT du pointeur (pointerUp) pour
                    eviter un foreColor a chaque pixel de drag. La selection
                    du contentEditable est preservee (le popover preventDefault
                    le mousedown) puis restauree par applyColor. */}
                {/* Couleur perso : carre HSV + input code hex + bouton
                    Appliquer. Drame Gwenn 12 juillet 2026 : l'ancien picker
                    appliquait au premier pointerUp (couleur perimee) et
                    FERMAIT le popover ("quand on clique dessus ca ferme la
                    petite fenetre"), et n'avait AUCUN champ code couleur.
                    Ici HSV + input mettent a jour `customColor` (aperçu),
                    "Appliquer" (ou Entree) pose la couleur ; le popover
                    reste ouvert pendant le reglage. */}
                <div className="pt-1 border-t space-y-2">
                  <div className="rcw" aria-label={t("customColor")}>
                    <HexColorPicker color={HEX_RE.test(customColor) ? customColor : "#000000"} onChange={setCustomColor} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-6 h-6 shrink-0 rounded border border-border/60"
                      style={{ backgroundColor: HEX_RE.test(customColor) ? customColor : "transparent" }}
                      aria-hidden
                    />
                    <span className="text-xs text-muted-foreground">#</span>
                    <input
                      type="text"
                      value={customColor.startsWith("#") ? customColor.slice(1) : customColor}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setCustomColor("#" + e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (HEX_RE.test(customColor)) applyColor(customColor);
                        }
                      }}
                      placeholder="7ed321"
                      spellCheck={false}
                      className="flex-1 min-w-0 h-7 rounded border bg-background px-2 text-xs font-mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => { if (HEX_RE.test(customColor)) applyColor(customColor); }}
                      disabled={!HEX_RE.test(customColor)}
                      className="h-7 px-2.5 shrink-0 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t("rteApply")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyColor(null)}
                    className="w-full text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                    title="Retirer la couleur"
                  >
                    <Eraser className="w-3 h-3" />
                    {t("rteReset")}
                  </button>
                </div>
                <style jsx global>{`
                  .rcw .react-colorful { width: 100%; height: 140px; }
                  .rcw .react-colorful__saturation { border-radius: 6px 6px 0 0; }
                  .rcw .react-colorful__hue { height: 14px; border-radius: 0 0 6px 6px; }
                `}</style>
              </div>
            )}
          </div>
          <span className="w-px h-4 bg-border mx-0.5" />
          {/* Taille de police FIELD-LEVEL, INDEPENDANTE mobile/desktop
              (drame Bene 8 juin 2026). UNE taille pour tout le bloc par
              device. Live + WYSIWYG. */}
          <div className="relative">
            <ToolbarBtn
              onMouseDown={(e) => { e.preventDefault(); setFontSizeOpen((v) => !v); }}
              title={t("rteFontSize")}
            >
              <span className="text-[11px] font-bold leading-none">A<span className="text-[8px]">A</span></span>
            </ToolbarBtn>
            {fontSizeOpen && (
              <div
                className="absolute z-30 top-full left-0 mt-1 w-40 rounded-lg border bg-background shadow-lg py-1 max-h-64 overflow-y-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                {/* Indicateur du device courant. La taille modifiee
                    s'applique UNIQUEMENT a ce device. Toggle Monitor/
                    Smartphone (en haut de l'editeur) bascule entre les
                    deux modes. */}
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b mb-1">
                  {previewDevice === "mobile" ? t("rteFontSizeForMobile") : t("rteFontSizeForDesktop")}
                </div>
                <button
                  type="button"
                  onClick={() => applyFieldFontSize(null)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${getCurrentFieldSize() === null ? "font-semibold text-primary" : ""}`}
                >
                  {t("rteFontSizeAuto")}
                </button>
                <div className="border-t my-1" />
                {FIELD_FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => applyFieldFontSize(size)}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted tabular-nums ${getCurrentFieldSize() === size ? "font-semibold text-primary" : ""}`}
                  >
                    {size.replace("px", "")} px
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="w-px h-4 bg-border mx-0.5" />
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyLeft"); }} title={t("rteAlignLeft")}><AlignLeft className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyCenter"); }} title={t("rteAlignCenter")}><AlignCenter className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("justifyRight"); }} title={t("rteAlignRight")}><AlignRight className="w-3.5 h-3.5" /></ToolbarBtn>
          {!singleLine && <>
            <span className="w-px h-4 bg-border mx-0.5" />
            <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }} title={t("rteBulletList")}><List className="w-3.5 h-3.5" /></ToolbarBtn>
            <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }} title={t("rteNumberedList")}><ListOrdered className="w-3.5 h-3.5" /></ToolbarBtn>
          </>}
          <span className="w-px h-4 bg-border mx-0.5" />
          <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); onInsertLink(); }} title={t("rteInsertLink")}><LinkIcon className="w-3.5 h-3.5" /></ToolbarBtn>
          {!singleLine && <ToolbarBtn onMouseDown={(e) => { e.preventDefault(); onInsertImage(); }} title={onImageUpload ? t("rteUploadImage") : t("rteInsertImage")}>{uploadingDrop ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}</ToolbarBtn>}
          <input ref={fileInputRef} type="file" accept="image/*,image/gif" className="sr-only" onChange={onPickedImageFile} />
          {/* Resize image popover - apparait UNIQUEMENT quand une <img>
              est selectionnee. 5 tailles curees (25/40/60/80/100%) +
              reset. Drame Christelle 8 juin 2026 : "impossible de
              redimensionner le GIF d'intro". */}
          {selectedImg && !singleLine && (
            <>
              <span className="w-px h-4 bg-border mx-0.5" />
              <span className="text-[10px] text-muted-foreground">{t("rteImageSize")}</span>
              {["25%", "40%", "60%", "80%", "100%"].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyImageWidth(pct); }}
                  className="text-[10px] px-1.5 py-0.5 rounded hover:bg-muted border border-border/50"
                  title={pct}
                >
                  {pct}
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyImageWidth(null); }}
                className="text-[10px] px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground"
                title={t("rteImageSizeReset")}
              >
                {t("rteReset")}
              </button>
            </>
          )}
          {hasVars && (
            <>
              <span className="w-px h-4 bg-border mx-0.5" />
              <QuizVarInserter
                vars={availableVars!}
                compact
                // execCommand keeps the caret position inside the
                // contentEditable — exactly what we need to drop the
                // placeholder where the cursor sits.
                onInsert={(placeholder) => exec("insertText", placeholder)}
              />
            </>
          )}
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onBlur={commit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          // Click sur une <img> : track la cible pour afficher le popover
          // de resize. Click ailleurs : reset. Bubbling natif suffit.
          onClick={(e) => {
            const target = e.target as HTMLElement | null;
            if (target && target.tagName === "IMG") {
              setSelectedImg(target as HTMLImageElement);
            } else {
              setSelectedImg(null);
            }
          }}
          // Bug récurrent (Béné) : sur les CTA blancs avec backgroundColor
          // sombre passés via className/style (text-white sur fond
          // primaire), le mode édition affichait du blanc-sur-blanc et
          // l'utilisateur ne voyait pas ce qu'il tapait. On override en
          // !text-foreground pendant l'édition pour garantir un contraste
          // lisible avec le bg-white/90, peu importe la couleur héritée.
          className={`${baseCls} tiquiz-rich w-full bg-white/90 !text-foreground border-2 outline-none ${dropping ? "border-primary border-dashed bg-primary/5" : "border-primary/40"}`}
          // Le `style` du parent peut contenir un `color: white` (ex.
          // CTA blanc) — on l'override aussi via inline style pour
          // doubler la garantie de contraste.
          style={{ ...(style ?? {}), color: "hsl(var(--foreground))" }}
          data-placeholder={placeholder}
        />
      </div>
      {dialogs}
      </>
    );
  }

  const isEmpty = !value || stripTagsQuick(value).length === 0;
  // We render the field + the AI proposals list as siblings inside a shared
  // wrapper. Click-to-edit is bound on the field DIV only, so clicking a
  // proposal (or the dismiss button) doesn't accidentally open the editor.
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
          <div className="tiquiz-rich" dangerouslySetInnerHTML={{ __html: sanitizeRichText(previewTransform ? previewTransform(value) : value) }} />
        )}
        <Pencil className="absolute top-1 right-1 w-3 h-3 text-primary/30 opacity-0 group-hover:opacity-100 transition-opacity" />
        {/* Deux boutons IA distincts visuellement (cf. confusion Adeline,
            17 mai 2026 : "j'ai deux étoiles dans les réponses comment
            savoir lequel est quoi ?") :
            - ✨ Sparkles → Genderize (génère les variantes Il/Elle/Iel)
            - 🪄 Wand2    → AI Rewrite (propose 3 reformulations)
            Le tooltip `title` reste explicite pour chaque action. */}
        {onGenderize && !isEmpty && (
          <button
            type="button"
            onClick={handleGenderize}
            disabled={genderizing}
            title={t("genderizeTitle")}
            className="absolute top-1 right-6 p-0.5 text-primary/40 opacity-0 group-hover:opacity-100 hover:text-primary disabled:opacity-100 transition-opacity"
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
            // Position in the gap between pencil and (optional) genderize button.
            // When both onGenderize and onAIRewrite are provided we shift this
            // one further right.
            className={`absolute top-1 ${onGenderize ? "right-11" : "right-6"} p-0.5 text-primary/40 opacity-0 group-hover:opacity-100 hover:text-primary disabled:opacity-100 transition-opacity`}
          >
            {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
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

      {dialogs}
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
