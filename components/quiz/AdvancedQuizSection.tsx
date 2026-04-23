// components/quiz/AdvancedQuizSection.tsx
// Tiquiz-parity: advanced customization block for the quiz editor.
// Exposes the new nullable columns added by migration 20260422_tiquiz_parity.sql.
// Every field is optional — leaving it empty falls back to business_profiles
// branding / translated defaults / previous behavior for pre-existing quizzes.
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, Palette, Link2, Share2, Gift, Megaphone, Tag } from "lucide-react";
import {
  BRAND_FONT_CHOICES,
  DEFAULT_BRAND_COLOR_PRIMARY,
  DEFAULT_BRAND_COLOR_BACKGROUND,
  ALLOWED_SHARE_NETWORKS,
  sanitizeSlug,
} from "@/lib/quizBranding";

interface AdvancedQuizSectionProps {
  quizId: string;
  slug: string;
  setSlug: (v: string) => void;
  slugError: string | null;
  setSlugError: (v: string | null) => void;
  startButtonText: string;
  setStartButtonText: (v: string) => void;
  bonusImageUrl: string;
  setBonusImageUrl: (v: string) => void;
  shareNetworks: string[];
  setShareNetworks: (v: string[]) => void;
  ogDescription: string;
  setOgDescription: (v: string) => void;
  customFooterText: string;
  setCustomFooterText: (v: string) => void;
  customFooterUrl: string;
  setCustomFooterUrl: (v: string) => void;
  resultInsightHeading: string;
  setResultInsightHeading: (v: string) => void;
  resultProjectionHeading: string;
  setResultProjectionHeading: (v: string) => void;
  sioCaptureTag: string;
  setSioCaptureTag: (v: string) => void;
  brandFont: string;
  setBrandFont: (v: string) => void;
  brandColorPrimary: string;
  setBrandColorPrimary: (v: string) => void;
  brandColorBackground: string;
  setBrandColorBackground: (v: string) => void;
}

export default function AdvancedQuizSection(props: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left font-bold"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {t("header")}
        <span className="text-xs font-normal text-muted-foreground ml-2">
          {t("headerSub")}
        </span>
      </button>

      {open && (
        <div className="space-y-6 pt-2">
          <BrandingBlock {...props} />
          <SlugBlock {...props} />
          <TextsBlock {...props} />
          <FooterBlock {...props} />
          <BonusBlock {...props} />
          <ShareNetworksBlock {...props} />
          <SioBlock {...props} />
        </div>
      )}
    </Card>
  );
}

function BrandingBlock({ brandFont, setBrandFont, brandColorPrimary, setBrandColorPrimary, brandColorBackground, setBrandColorBackground }: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Palette className="w-4 h-4" /> {t("brandingTitle")}
      </h4>
      <p className="text-xs text-muted-foreground">
        {t("brandingHint")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="brand-font" className="text-xs">{t("font")}</Label>
          <select
            id="brand-font"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={brandFont}
            onChange={(e) => setBrandFont(e.target.value)}
          >
            <option value="">{t("fontDefault")}</option>
            {BRAND_FONT_CHOICES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-primary" className="text-xs">{t("primaryColor")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="brand-primary"
              type="text"
              placeholder={DEFAULT_BRAND_COLOR_PRIMARY}
              value={brandColorPrimary}
              onChange={(e) => setBrandColorPrimary(e.target.value)}
              className="h-10 font-mono"
            />
            {/^#[0-9a-fA-F]{3,6}$/.test(brandColorPrimary) && (
              <span className="inline-block w-8 h-8 rounded border" style={{ backgroundColor: brandColorPrimary }} />
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-bg" className="text-xs">{t("pageBg")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="brand-bg"
              type="text"
              placeholder={DEFAULT_BRAND_COLOR_BACKGROUND}
              value={brandColorBackground}
              onChange={(e) => setBrandColorBackground(e.target.value)}
              className="h-10 font-mono"
            />
            {/^#[0-9a-fA-F]{3,6}$/.test(brandColorBackground) && (
              <span className="inline-block w-8 h-8 rounded border" style={{ backgroundColor: brandColorBackground }} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SlugBlock({ slug, setSlug, slugError, setSlugError, quizId }: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  const check = useCallback(async (raw: string) => {
    const cleaned = sanitizeSlug(raw);
    if (!cleaned) {
      setSlugError(raw.trim() ? t("slugInvalid") : null);
      return;
    }
    try {
      const res = await fetch(`/api/quiz/${quizId}/slug-available?slug=${encodeURIComponent(cleaned)}`);
      const json = await res.json();
      if (json?.ok && json.available === false) {
        setSlugError(t("slugTaken"));
      } else {
        setSlugError(null);
      }
    } catch {
      // Soft fail — the real uniqueness check happens on save.
      setSlugError(null);
    }
  }, [quizId, setSlugError, t]);

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Link2 className="w-4 h-4" /> {t("urlTitle")}
      </h4>
      <div className="space-y-1.5">
        <Label htmlFor="quiz-slug" className="text-xs">{t("slugLabel")}</Label>
        <Input
          id="quiz-slug"
          type="text"
          placeholder="mon-quiz"
          value={slug}
          onChange={(e) => {
            const v = e.target.value;
            setSlug(v);
            void check(v);
          }}
          className="h-10"
        />
        {slugError ? (
          <p className="text-xs text-red-600">{slugError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {slug ? `/q/${sanitizeSlug(slug) ?? slug}` : t("slugNonePreview", { id: "{uuid}" })}
          </p>
        )}
      </div>
    </section>
  );
}

function TextsBlock({ startButtonText, setStartButtonText, resultInsightHeading, setResultInsightHeading, resultProjectionHeading, setResultProjectionHeading, ogDescription, setOgDescription }: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Megaphone className="w-4 h-4" /> {t("textsTitle")}
      </h4>
      <p className="text-xs text-muted-foreground">
        {t("textsHint")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start-btn" className="text-xs">{t("ctaIntro")}</Label>
          <Input id="start-btn" type="text" value={startButtonText} onChange={(e) => setStartButtonText(e.target.value)} placeholder={t("ctaIntroPh")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="insight-h" className="text-xs">{t("insightHeading")}</Label>
          <Input id="insight-h" type="text" value={resultInsightHeading} onChange={(e) => setResultInsightHeading(e.target.value)} placeholder={t("insightHeadingPh")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="projection-h" className="text-xs">{t("projectionHeading")}</Label>
          <Input id="projection-h" type="text" value={resultProjectionHeading} onChange={(e) => setResultProjectionHeading(e.target.value)} placeholder={t("projectionHeadingPh")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="og-desc" className="text-xs">{t("ogDesc")}</Label>
          <Textarea id="og-desc" value={ogDescription} onChange={(e) => setOgDescription(e.target.value)} rows={2} placeholder={t("ogDescPh")} />
        </div>
      </div>
    </section>
  );
}

function FooterBlock({ customFooterText, setCustomFooterText, customFooterUrl, setCustomFooterUrl }: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">{t("footerTitle")}</h4>
      <p className="text-xs text-muted-foreground">
        {t("footerHint")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="footer-text" className="text-xs">{t("footerText")}</Label>
          <Input id="footer-text" type="text" value={customFooterText} onChange={(e) => setCustomFooterText(e.target.value)} placeholder={t("footerTextPh")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="footer-url" className="text-xs">{t("footerUrl")}</Label>
          <Input id="footer-url" type="url" value={customFooterUrl} onChange={(e) => setCustomFooterUrl(e.target.value)} placeholder="https://mon-site.com" />
        </div>
      </div>
    </section>
  );
}

function BonusBlock({ bonusImageUrl, setBonusImageUrl }: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Gift className="w-4 h-4" /> {t("bonusTitle")}
      </h4>
      <div className="space-y-1.5">
        <Label htmlFor="bonus-img" className="text-xs">{t("bonusImg")}</Label>
        <Input id="bonus-img" type="url" value={bonusImageUrl} onChange={(e) => setBonusImageUrl(e.target.value)} placeholder="https://..." />
        <p className="text-xs text-muted-foreground">
          {t("bonusImgHint")}
        </p>
      </div>
    </section>
  );
}

function ShareNetworksBlock({ shareNetworks, setShareNetworks }: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  const toggle = (net: string) => {
    setShareNetworks(
      shareNetworks.includes(net)
        ? shareNetworks.filter((n) => n !== net)
        : [...shareNetworks, net],
    );
  };
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Share2 className="w-4 h-4" /> {t("shareTitle")}
      </h4>
      <p className="text-xs text-muted-foreground">
        {t("shareHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        {ALLOWED_SHARE_NETWORKS.map((net) => {
          const on = shareNetworks.includes(net);
          return (
            <button
              key={net}
              type="button"
              onClick={() => toggle(net)}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${
                on ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground"
              }`}
            >
              {net}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SioBlock({ sioCaptureTag, setSioCaptureTag }: AdvancedQuizSectionProps) {
  const t = useTranslations("advancedQuiz");
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Tag className="w-4 h-4" /> {t("sioTitle")}
      </h4>
      <div className="space-y-1.5">
        <Label htmlFor="sio-capture" className="text-xs">{t("sioTag")}</Label>
        <Input id="sio-capture" type="text" value={sioCaptureTag} onChange={(e) => setSioCaptureTag(e.target.value)} placeholder="quiz-x-captured" />
        <p className="text-xs text-muted-foreground">
          {t("sioTagHint")}
        </p>
      </div>
    </section>
  );
}
