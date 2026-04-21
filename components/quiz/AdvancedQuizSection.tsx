// components/quiz/AdvancedQuizSection.tsx
// Tiquiz-parity: advanced customization block for the quiz editor.
// Exposes the new nullable columns added by migration 20260422_tiquiz_parity.sql.
// Every field is optional — leaving it empty falls back to business_profiles
// branding / translated defaults / previous behavior for pre-existing quizzes.
"use client";

import { useState, useCallback } from "react";
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
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left font-bold"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Personnalisation avancée
        <span className="text-xs font-normal text-muted-foreground ml-2">
          branding · URL · footer · partage · Systeme.io
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
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Palette className="w-4 h-4" /> Branding du quiz
      </h4>
      <p className="text-xs text-muted-foreground">
        Laisser vide pour utiliser le branding du profil (fallback automatique).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="brand-font" className="text-xs">Police</Label>
          <select
            id="brand-font"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={brandFont}
            onChange={(e) => setBrandFont(e.target.value)}
          >
            <option value="">(profil / défaut)</option>
            {BRAND_FONT_CHOICES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-primary" className="text-xs">Couleur principale</Label>
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
          <Label htmlFor="brand-bg" className="text-xs">Fond de page</Label>
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
  const check = useCallback(async (raw: string) => {
    const cleaned = sanitizeSlug(raw);
    if (!cleaned) {
      setSlugError(raw.trim() ? "Slug invalide (a-z, 0-9, -, 3-50 caractères)" : null);
      return;
    }
    try {
      const res = await fetch(`/api/quiz/${quizId}/slug-available?slug=${encodeURIComponent(cleaned)}`);
      const json = await res.json();
      if (json?.ok && json.available === false) {
        setSlugError("Ce slug est déjà utilisé");
      } else {
        setSlugError(null);
      }
    } catch {
      // Soft fail — the real uniqueness check happens on save.
      setSlugError(null);
    }
  }, [quizId, setSlugError]);

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Link2 className="w-4 h-4" /> URL personnalisée
      </h4>
      <div className="space-y-1.5">
        <Label htmlFor="quiz-slug" className="text-xs">Slug</Label>
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
            {slug ? `/q/${sanitizeSlug(slug) ?? slug}` : `/q/{uuid} (pas de slug)`}
          </p>
        )}
      </div>
    </section>
  );
}

function TextsBlock({ startButtonText, setStartButtonText, resultInsightHeading, setResultInsightHeading, resultProjectionHeading, setResultProjectionHeading, ogDescription, setOgDescription }: AdvancedQuizSectionProps) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Megaphone className="w-4 h-4" /> Textes personnalisés
      </h4>
      <p className="text-xs text-muted-foreground">
        Laisser vide pour utiliser les textes traduits par défaut (selon la locale du quiz).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start-btn" className="text-xs">CTA intro</Label>
          <Input id="start-btn" type="text" value={startButtonText} onChange={(e) => setStartButtonText(e.target.value)} placeholder="Commencer le test" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="insight-h" className="text-xs">Titre bloc "Prise de conscience"</Label>
          <Input id="insight-h" type="text" value={resultInsightHeading} onChange={(e) => setResultInsightHeading(e.target.value)} placeholder="Prise de conscience" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="projection-h" className="text-xs">Titre bloc "Et si..."</Label>
          <Input id="projection-h" type="text" value={resultProjectionHeading} onChange={(e) => setResultProjectionHeading(e.target.value)} placeholder="Et si..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="og-desc" className="text-xs">Description OG (partages sociaux)</Label>
          <Textarea id="og-desc" value={ogDescription} onChange={(e) => setOgDescription(e.target.value)} rows={2} placeholder="Utilisée si définie, sinon: intro du quiz" />
        </div>
      </div>
    </section>
  );
}

function FooterBlock({ customFooterText, setCustomFooterText, customFooterUrl, setCustomFooterUrl }: AdvancedQuizSectionProps) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Footer personnalisé</h4>
      <p className="text-xs text-muted-foreground">
        Si rempli, remplace "Ce quiz vous est offert par Tipote" sur la page publique.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="footer-text" className="text-xs">Texte du footer</Label>
          <Input id="footer-text" type="text" value={customFooterText} onChange={(e) => setCustomFooterText(e.target.value)} placeholder="Propulsé par Mon Business" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="footer-url" className="text-xs">URL du footer</Label>
          <Input id="footer-url" type="url" value={customFooterUrl} onChange={(e) => setCustomFooterUrl(e.target.value)} placeholder="https://mon-site.com" />
        </div>
      </div>
    </section>
  );
}

function BonusBlock({ bonusImageUrl, setBonusImageUrl }: AdvancedQuizSectionProps) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Gift className="w-4 h-4" /> Bonus viralité
      </h4>
      <div className="space-y-1.5">
        <Label htmlFor="bonus-img" className="text-xs">Image du bonus (URL)</Label>
        <Input id="bonus-img" type="url" value={bonusImageUrl} onChange={(e) => setBonusImageUrl(e.target.value)} placeholder="https://..." />
        <p className="text-xs text-muted-foreground">
          Affichée sur l'étape "Partage pour débloquer" quand la viralité est active.
        </p>
      </div>
    </section>
  );
}

function ShareNetworksBlock({ shareNetworks, setShareNetworks }: AdvancedQuizSectionProps) {
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
        <Share2 className="w-4 h-4" /> Réseaux de partage autorisés
      </h4>
      <p className="text-xs text-muted-foreground">
        Si aucune case cochée, tous les réseaux par défaut sont proposés au visiteur.
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
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Tag className="w-4 h-4" /> Systeme.io — Tag capture
      </h4>
      <div className="space-y-1.5">
        <Label htmlFor="sio-capture" className="text-xs">Tag appliqué à chaque lead capturé</Label>
        <Input id="sio-capture" type="text" value={sioCaptureTag} onChange={(e) => setSioCaptureTag(e.target.value)} placeholder="quiz-x-captured" />
        <p className="text-xs text-muted-foreground">
          Séparé des tags de résultat : ce tag est appliqué à chaque email (quel que soit le résultat).
        </p>
      </div>
    </section>
  );
}
