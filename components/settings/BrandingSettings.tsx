"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Save,
  Upload,
  X,
  Loader2,
  Palette,
  Type,
  Image as ImageIcon,
  MessageSquare,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// ---------- Font list ----------

type FontGroup = { label: string; fonts: string[] };

const FONT_GROUPS: FontGroup[] = [
  {
    label: "Sans-serif",
    fonts: [
      "Inter",
      "Poppins",
      "Lato",
      "Open Sans",
      "Roboto",
      "Montserrat",
      "Nunito",
      "Raleway",
      "Work Sans",
      "DM Sans",
      "Plus Jakarta Sans",
      "Manrope",
      "Source Sans 3",
      "Outfit",
      "Space Grotesk",
      "Arial",
    ],
  },
  {
    label: "Serif",
    fonts: [
      "Playfair Display",
      "Merriweather",
      "Lora",
      "EB Garamond",
      "Cormorant Garamond",
      "Libre Baskerville",
      "PT Serif",
      "Crimson Text",
      "DM Serif Display",
      "Georgia",
    ],
  },
  {
    label: "Display & Decorative",
    fonts: [
      "Dancing Script",
      "Pacifico",
      "Permanent Marker",
      "Lobster",
      "Indie Flower",
      "Caveat",
      "Satisfy",
      "Great Vibes",
      "Comfortaa",
      "Righteous",
    ],
  },
];

// ---------- Color picker helper ----------

function ColorInput({
  value,
  onChange,
  label,
  id,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  id: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          id={id}
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 font-mono text-sm"
          maxLength={30}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ---------- Image upload helper ----------

function ImageUpload({
  value,
  onChange,
  label,
  id,
  description,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  id: string;
  description: string;
  disabled?: boolean;
}) {
  const t = useTranslations("branding");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("contentId", "branding");

        const res = await fetch("/api/upload/image", {
          method: "POST",
          body: fd,
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || t("upload.errorTitle"));

        onChange(json.url);
        toast({ title: t("upload.success") });
      } catch (e: any) {
        toast({
          title: t("upload.errorTitle"),
          description: e?.message ?? t("upload.errorUnknown"),
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [onChange, toast, t],
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt={label}
            className="h-24 w-24 rounded-lg border object-cover"
          />
          <button
            type="button"
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white shadow hover:bg-destructive/90"
            onClick={() => onChange("")}
            disabled={disabled}
            aria-label={t("upload.deleteAria")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        className="hidden"
        id={id}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {!value && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? t("upload.uploading") : t("upload.choose")}
        </Button>
      )}
    </div>
  );
}

// ---------- Types ----------

export type BrandingData = {
  brand_font?: string | null;
  brand_color_base?: string | null;
  brand_color_accent?: string | null;
  brand_logo_url?: string | null;
  brand_author_photo_url?: string | null;
  brand_tone_of_voice?: string | null;
  // Fallback from onboarding
  preferred_tone?: string | null;
};

type Props = {
  initial: BrandingData | null;
  loading: boolean;
  onSaved?: (data: BrandingData) => void;
};

// ---------- Component ----------

export default function BrandingSettings({ initial, loading, onSaved }: Props) {
  const t = useTranslations("branding");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [font, setFont] = useState(initial?.brand_font ?? "");
  const [colorBase, setColorBase] = useState(initial?.brand_color_base ?? "#000000");
  const [colorAccent, setColorAccent] = useState(initial?.brand_color_accent ?? "#6366f1");
  const [logoUrl, setLogoUrl] = useState(initial?.brand_logo_url ?? "");
  const [authorPhotoUrl, setAuthorPhotoUrl] = useState(initial?.brand_author_photo_url ?? "");
  const [toneOfVoice, setToneOfVoice] = useState(initial?.brand_tone_of_voice ?? initial?.preferred_tone ?? "");

  // Sync from parent when initial changes (e.g. profile loaded)
  useEffect(() => {
    if (!initial) return;
    setFont(initial.brand_font ?? "");
    setColorBase(initial.brand_color_base ?? "#000000");
    setColorAccent(initial.brand_color_accent ?? "#6366f1");
    setLogoUrl(initial.brand_logo_url ?? "");
    setAuthorPhotoUrl(initial.brand_author_photo_url ?? "");
    setToneOfVoice(initial.brand_tone_of_voice ?? initial.preferred_tone ?? "");
  }, [initial]);

  const dirty = useMemo(() => {
    const i = initial;
    return (
      (i?.brand_font ?? "") !== font ||
      (i?.brand_color_base ?? "#000000") !== colorBase ||
      (i?.brand_color_accent ?? "#6366f1") !== colorAccent ||
      (i?.brand_logo_url ?? "") !== logoUrl ||
      (i?.brand_author_photo_url ?? "") !== authorPhotoUrl ||
      (i?.brand_tone_of_voice ?? "") !== toneOfVoice
    );
  }, [initial, font, colorBase, colorAccent, logoUrl, authorPhotoUrl, toneOfVoice]);

  const save = () => {
    startTransition(async () => {
      try {
        const body: Record<string, string> = {};
        if ((initial?.brand_font ?? "") !== font) body.brand_font = font;
        if ((initial?.brand_color_base ?? "#000000") !== colorBase) body.brand_color_base = colorBase;
        if ((initial?.brand_color_accent ?? "#6366f1") !== colorAccent) body.brand_color_accent = colorAccent;
        if ((initial?.brand_logo_url ?? "") !== logoUrl) body.brand_logo_url = logoUrl;
        if ((initial?.brand_author_photo_url ?? "") !== authorPhotoUrl) body.brand_author_photo_url = authorPhotoUrl;
        if ((initial?.brand_tone_of_voice ?? "") !== toneOfVoice) body.brand_tone_of_voice = toneOfVoice;

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || t("errorUnknown"));

        toast({ title: t("saved") });
        onSaved?.(json.profile ?? null);
      } catch (e: any) {
        toast({
          title: t("errorTitle"),
          description: e?.message ?? t("errorUnknown"),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Typographie */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Type className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-bold">{t("typography.title")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("typography.desc")}
        </p>

        <div className="space-y-2 max-w-sm">
          <Label htmlFor="brand-font">{t("typography.fontLabel")}</Label>
          <Select value={font} onValueChange={setFont} disabled={loading}>
            <SelectTrigger id="brand-font">
              <SelectValue placeholder={t("typography.fontPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {FONT_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </div>
                  {group.fonts.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        {font && (
          <div className="mt-4 rounded-lg border bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground mb-2">{t("preview")}</p>
            <link
              href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;700&display=swap`}
              rel="stylesheet"
            />
            <p style={{ fontFamily: `'${font}', sans-serif` }} className="text-2xl font-bold">
              {t("brandWith", { font })}
            </p>
            <p style={{ fontFamily: `'${font}', sans-serif` }} className="text-base mt-1">
              {t("brandParagraph")}
            </p>
          </div>
        )}
      </Card>

      {/* Palette de couleurs */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-bold">{t("colors.title")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("colors.desc")}
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <ColorInput
            id="brand-color-base"
            label={t("colors.base")}
            value={colorBase}
            onChange={setColorBase}
            disabled={loading}
          />
          <ColorInput
            id="brand-color-accent"
            label={t("colors.accent")}
            value={colorAccent}
            onChange={setColorAccent}
            disabled={loading}
          />
        </div>

        {/* Preview swatch */}
        <div className="mt-4 rounded-lg border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground mb-2">{t("preview")}</p>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 rounded-lg border shadow-sm"
                style={{ backgroundColor: colorBase }}
              />
              <span className="text-xs text-muted-foreground">{t("previewBase")}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 rounded-lg border shadow-sm"
                style={{ backgroundColor: colorAccent }}
              />
              <span className="text-xs text-muted-foreground">{t("previewAccent")}</span>
            </div>
            <div className="ml-4 flex-1 rounded-lg overflow-hidden border">
              <div
                className="px-4 py-2 text-sm font-bold"
                style={{ backgroundColor: colorBase, color: "#fff" }}
              >
                {t("previewSection")}
              </div>
              <div className="px-4 py-3 bg-white">
                <span
                  className="inline-block rounded px-3 py-1.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: colorAccent }}
                >
                  {t("previewButton")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Images de marque */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-bold">{t("images.title")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("images.desc")}
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <ImageUpload
            id="brand-logo"
            label={t("images.logoLabel")}
            description={t("images.logoDesc")}
            value={logoUrl}
            onChange={setLogoUrl}
            disabled={loading}
          />
          <ImageUpload
            id="brand-author-photo"
            label={t("images.photoLabel")}
            description={t("images.photoDesc")}
            value={authorPhotoUrl}
            onChange={setAuthorPhotoUrl}
            disabled={loading}
          />
        </div>
      </Card>

      {/* Tone of voice */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-bold">{t("tone.title")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("tone.desc")}
        </p>

        <div className="space-y-2">
          <Label htmlFor="brand-tone">{t("tone.label")}</Label>
          <Textarea
            id="brand-tone"
            value={toneOfVoice}
            onChange={(e) => setToneOfVoice(e.target.value)}
            placeholder={t("tone.placeholder")}
            rows={3}
            className="resize-none"
            disabled={loading}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            {t("tone.chars", { n: toneOfVoice.length })}
          </p>
        </div>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || pending || loading} className="gap-2">
          <Save className="w-4 h-4" />
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
