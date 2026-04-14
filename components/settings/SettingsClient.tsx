"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, Palette, Key, Trash2, Loader2, Save,
  CreditCard, Upload, Check, Crown, Zap, Star, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Profile = {
  full_name: string | null;
  email: string | null;
  ui_locale: string | null;
  address_form: string | null;
  privacy_url: string | null;
  sio_user_api_key: string | null;
  sio_api_key_name: string | null;
  plan: string | null;
  brand_logo_url: string | null;
  brand_color_primary: string | null;
  brand_color_accent: string | null;
  brand_font: string | null;
  brand_tone: string | null;
  brand_website_url: string | null;
  target_audience: string | null;
};

const FONTS = ["Inter", "Poppins", "Montserrat", "Playfair Display", "Lato", "Roboto", "Open Sans", "Nunito"];
const TONES = [
  { value: "professionnel", label: "Professionnel" },
  { value: "amical", label: "Amical (tu)" },
  { value: "formel", label: "Formel (vous)" },
  { value: "fun", label: "Fun & décalé" },
  { value: "inspirant", label: "Inspirant" },
];

const PLANS = [
  {
    id: "free",
    name: "Free",
    icon: Zap,
    price: "0€",
    period: "",
    features: ["1 quiz actif", "10 réponses/mois", "Capture d'emails", "Lien de partage"],
    cta: null,
  },
  {
    id: "pro_monthly",
    name: "Pro",
    icon: Star,
    price: "19€",
    period: "/mois",
    features: ["Quiz illimités", "Réponses illimitées", "Viralité & bonus", "Systeme.io", "Branding personnalisé", "Export CSV"],
    cta: "Passer à Pro",
    popular: true,
  },
  {
    id: "pro_yearly",
    name: "Pro Annuel",
    icon: Crown,
    price: "190€",
    period: "/an",
    badge: "−17%",
    features: ["Tout Pro inclus", "2 mois offerts", "Support prioritaire", "Accès anticipé nouveautés"],
    cta: "Passer à Pro Annuel",
  },
];

export default function SettingsClient() {
  const t = useTranslations("settings");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "general";
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  // General
  const [addressForm, setAddressForm] = useState("tu");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [targetAudience, setTargetAudience] = useState("");

  // Branding
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandColorPrimary, setBrandColorPrimary] = useState("#5D6CDB");
  const [brandColorAccent, setBrandColorAccent] = useState("#20BBE6");
  const [brandFont, setBrandFont] = useState("Inter");
  const [brandTone, setBrandTone] = useState("professionnel");
  const [brandWebsiteUrl, setBrandWebsiteUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // SIO
  const [sioKey, setSioKey] = useState("");
  const [sioKeyName, setSioKeyName] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.profile) {
          const p = data.profile;
          setProfile(p);
          setAddressForm(p.address_form ?? "tu");
          setPrivacyUrl(p.privacy_url ?? "");
          setTargetAudience(p.target_audience ?? "");
          setSioKey(p.sio_user_api_key ?? "");
          setSioKeyName(p.sio_api_key_name ?? "");
          setBrandLogoUrl(p.brand_logo_url ?? "");
          setBrandColorPrimary(p.brand_color_primary ?? "#5D6CDB");
          setBrandColorAccent(p.brand_color_accent ?? "#20BBE6");
          setBrandFont(p.brand_font ?? "Inter");
          setBrandTone(p.brand_tone ?? "professionnel");
          setBrandWebsiteUrl(p.brand_website_url ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_form: addressForm,
          privacy_url: privacyUrl.trim() || null,
          target_audience: targetAudience.trim() || null,
          sio_user_api_key: sioKey.trim() || null,
          sio_api_key_name: sioKeyName.trim() || null,
          brand_logo_url: brandLogoUrl.trim() || null,
          brand_color_primary: brandColorPrimary,
          brand_color_accent: brandColorAccent,
          brand_font: brandFont,
          brand_tone: brandTone,
          brand_website_url: brandWebsiteUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) toast.success(t("saved"));
      else toast.error(data.error ?? "Erreur");
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Fichier image uniquement");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image trop lourde (max 2 Mo)");
      return;
    }
    setUploadingLogo(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const ext = file.name.split(".").pop() ?? "png";
      const path = `logos/${user.id}/logo.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
      setBrandLogoUrl(urlData.publicUrl);
      toast.success("Logo chargé");
    } catch {
      toast.error("Erreur lors du chargement du logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleDeleteAccount() {
    if (!confirm("Es-tu sûr de vouloir supprimer ton compte ? Cette action est irréversible.")) return;
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (res.ok) {
        const supabase = getSupabaseBrowserClient();
        await supabase.auth.signOut();
        router.push("/");
      }
    } catch {
      toast.error("Erreur");
    }
  }

  if (loading) return null;

  const currentPlan = profile?.plan ?? "free";

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="gradient-primary rounded-xl px-5 py-4 md:px-6 md:py-5 flex items-center gap-4 text-white">
        <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
          <Settings className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="text-sm text-white/70">Configure ton compte et tes préférences</p>
        </div>
        <Button onClick={handleSave} disabled={saving} variant="secondary" className="shrink-0 rounded-full">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer
        </Button>
      </div>

      {/* Tabs — sticky below banner */}
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto sticky top-14 z-10 bg-background">
          <TabsTrigger value="general"><Settings className="h-4 w-4 mr-1.5" />Général</TabsTrigger>
          <TabsTrigger value="branding"><Palette className="h-4 w-4 mr-1.5" />Branding</TabsTrigger>
          <TabsTrigger value="systemeio"><Key className="h-4 w-4 mr-1.5" />Systeme.io</TabsTrigger>
          <TabsTrigger value="pricing"><CreditCard className="h-4 w-4 mr-1.5" />Tarifs</TabsTrigger>
          <TabsTrigger value="account"><Trash2 className="h-4 w-4 mr-1.5" />Compte</TabsTrigger>
        </TabsList>

        {/* ── General ── */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("languageTitle")}</CardTitle>
              <CardDescription>{t("languageDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <LanguageSwitcher />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Forme d&apos;adresse</CardTitle>
              <CardDescription>Tutoiement ou vouvoiement dans les quiz</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                value={addressForm}
                onChange={(e) => setAddressForm(e.target.value)}
                className="text-sm border border-input rounded-lg px-3 py-2 bg-background w-full sm:w-auto"
              >
                <option value="tu">Tutoiement (tu)</option>
                <option value="vous">Vouvoiement (vous)</option>
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public cible</CardTitle>
              <CardDescription>Décris ton audience — pré-rempli dans la création de quiz IA</CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Ex : J'aide les mampreneures à vendre via Instagram"
                className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background min-h-[60px] resize-y"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Politique de confidentialité</CardTitle>
              <CardDescription>URL par défaut utilisée dans tes quiz</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={privacyUrl}
                onChange={(e) => setPrivacyUrl(e.target.value)}
                placeholder="https://monsite.com/confidentialite"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Branding ── */}
        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>Charge ton logo ou colle une URL</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4">
                {brandLogoUrl ? (
                  <img src={brandLogoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-lg border bg-white p-1" />
                ) : (
                  <div className="h-14 w-14 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                    <Upload className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {uploadingLogo ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                      Charger une image
                    </Button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoUpload(f);
                      }}
                    />
                  </div>
                  <Input
                    value={brandLogoUrl}
                    onChange={(e) => setBrandLogoUrl(e.target.value)}
                    placeholder="ou colle l'URL de ton logo"
                    className="text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Couleurs</CardTitle>
              <CardDescription>Couleurs de marque pour tes quiz</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Couleur principale</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={brandColorPrimary}
                      onChange={(e) => setBrandColorPrimary(e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={brandColorPrimary}
                      onChange={(e) => setBrandColorPrimary(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label>Couleur d&apos;accent</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={brandColorAccent}
                      onChange={(e) => setBrandColorAccent(e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={brandColorAccent}
                      onChange={(e) => setBrandColorAccent(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Typographie & ton</CardTitle>
              <CardDescription>Police et style de communication</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Police</Label>
                  <select
                    value={brandFont}
                    onChange={(e) => setBrandFont(e.target.value)}
                    className="mt-1.5 w-full text-sm border border-input rounded-lg px-3 py-2 bg-background"
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Ton de voix</Label>
                  <select
                    value={brandTone}
                    onChange={(e) => setBrandTone(e.target.value)}
                    className="mt-1.5 w-full text-sm border border-input rounded-lg px-3 py-2 bg-background"
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Site web</CardTitle>
              <CardDescription>URL de ton site (affiché dans les quiz)</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={brandWebsiteUrl}
                onChange={(e) => setBrandWebsiteUrl(e.target.value)}
                placeholder="https://monsite.com"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Systeme.io ── */}
        <TabsContent value="systemeio" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clé API Systeme.io</CardTitle>
              <CardDescription>
                Connecte ton compte Systeme.io pour synchroniser automatiquement les leads.
                Tu peux trouver ta clé API dans Systeme.io &gt; Paramètres &gt; API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nom de la connexion</Label>
                <Input
                  value={sioKeyName}
                  onChange={(e) => setSioKeyName(e.target.value)}
                  placeholder="Mon projet"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Clé API</Label>
                <Input
                  value={sioKey}
                  onChange={(e) => setSioKey(e.target.value)}
                  placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                  type="password"
                  className="mt-1.5 font-mono"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pricing ── */}
        <TabsContent value="pricing" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = currentPlan === plan.id || (currentPlan === "free" && plan.id === "free");
              const isPro = plan.id.startsWith("pro");
              return (
                <Card key={plan.id} className={`relative ${plan.popular ? "border-primary ring-1 ring-primary" : ""}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">
                      Populaire
                    </div>
                  )}
                  <CardContent className="pt-6 pb-5 px-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${plan.popular ? "bg-primary/10" : "bg-muted"}`}>
                        <plan.icon className={`h-4 w-4 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <h3 className="font-bold">{plan.name}</h3>
                        {plan.badge && (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{plan.badge}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                    </div>
                    <ul className="space-y-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <div className="text-center text-sm font-medium text-muted-foreground py-2 border rounded-full">
                        Plan actuel
                      </div>
                    ) : plan.cta ? (
                      <Button className="w-full rounded-full" variant={plan.popular ? "default" : "outline"}>
                        {plan.cta} <ArrowRight className="h-4 w-4 ml-1.5" />
                      </Button>
                    ) : null}
                    {isCurrent && isPro && (
                      <button
                        type="button"
                        className="w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => toast.info("Contacte le support pour changer de plan.")}
                      >
                        Downgrader vers Free
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Les paiements sont gérés par Stripe. Tu peux changer de plan à tout moment.
          </p>
        </TabsContent>

        {/* ── Account ── */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan actuel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold capitalize">{currentPlan}</span>
                {currentPlan === "free" && (
                  <span className="text-sm text-muted-foreground">— 1 quiz, 10 réponses/mois</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Zone de danger</CardTitle>
              <CardDescription>Ces actions sont irréversibles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Supprimer mon compte</p>
                  <p className="text-sm text-muted-foreground">Supprime toutes tes données, quiz et leads</p>
                </div>
                <Button variant="destructive" size="sm" className="rounded-full" onClick={handleDeleteAccount}>
                  <Trash2 className="h-4 w-4 mr-2" />Supprimer
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
