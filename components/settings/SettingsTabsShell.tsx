// components/settings/SettingsTabsShell.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Globe,
  Brain,
  CreditCard,
  Save,
  Linkedin,
  Instagram,
  Youtube,
  Link as LinkIcon,
  AlertTriangle,
  RotateCcw,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Shield,
  Key,
} from "lucide-react";

import AiCreditsPanel from "@/components/settings/AiCreditsPanel";
import CompetitorAnalysisSection from "@/components/settings/CompetitorAnalysisSection";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";
import SetPasswordForm from "@/components/SetPasswordForm";
import BillingSection from "@/components/settings/BillingSection";

type TabKey = "profile" | "settings" | "ai" | "pricing";

type Props = {
  userEmail: string;
  activeTab: TabKey;
};

function normalizeTab(v: string | null): TabKey {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "profile" || s === "settings" || s === "ai") return s;
  // compat ancien: tab=billing
  if (s === "billing" || s === "pricing") return "pricing";
  return "profile";
}

type OfferItem = {
  name: string;
  price: string;
  link: string;
  promise: string;
  description: string;
  target: string;
  format: string;
};

type ProfileRow = {
  first_name?: string | null;
  niche?: string | null;
  mission?: string | null;
  offers?: OfferItem[] | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  cgv_url?: string | null;
  sio_user_api_key?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  website_url?: string | null;
};

export default function SettingsTabsShell({ userEmail, activeTab }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>(activeTab);
  useEffect(() => setTab(activeTab), [activeTab]);

  const queryBase = useMemo(() => {
    const params = new URLSearchParams();
    sp.forEach((value, key) => {
      if (key === "tab") return;
      params.set(key, value);
    });
    return params;
  }, [sp]);

  const onTabChange = (next: string) => {
    const t = normalizeTab(next);
    setTab(t);

    // URL compat: historiquement Tipote utilisait tab=billing
    const urlTab = t === "pricing" ? "billing" : t;

    const params = new URLSearchParams(queryBase);
    params.set("tab", urlTab);
    const qs = params.toString();
    router.push(qs ? `/settings?${qs}` : "/settings");
  };

  // -------------------------
  // Profil (connecté à /api/profile)
  // -------------------------
  const [profileLoading, setProfileLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [niche, setNiche] = useState("");
  const [mission, setMission] = useState("");
  const [pendingProfile, startProfileTransition] = useTransition();

  const [privacyUrl, setPrivacyUrl] = useState("");
  const [termsUrl, setTermsUrl] = useState("");
  const [cgvUrl, setCgvUrl] = useState("");
  const [pendingLegal, startLegalTransition] = useTransition();

  const [sioApiKey, setSioApiKey] = useState("");
  const [pendingSio, startSioTransition] = useTransition();

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [pendingLinks, startLinksTransition] = useTransition();

  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [initialOffers, setInitialOffers] = useState<OfferItem[]>([]);
  const [pendingOffers, startOffersTransition] = useTransition();

  const [initialProfile, setInitialProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProfileLoading(true);
      try {
        const res = await fetch("/api/profile", { method: "GET" });
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setFirstName(row?.first_name ?? "");
        setNiche(row?.niche ?? "");
        setMission(row?.mission ?? "");
        setPrivacyUrl(row?.privacy_url ?? "");
        setTermsUrl(row?.terms_url ?? "");
        setCgvUrl(row?.cgv_url ?? "");
        setSioApiKey(row?.sio_user_api_key ?? "");
        setLinkedinUrl(row?.linkedin_url ?? "");
        setInstagramUrl(row?.instagram_url ?? "");
        setYoutubeUrl(row?.youtube_url ?? "");
        setWebsiteUrl(row?.website_url ?? "");

        const loadedOffers = Array.isArray(row?.offers)
          ? row.offers.map((o: any) => ({
              name: String(o?.name ?? ""),
              price: String(o?.price ?? ""),
              link: String(o?.link ?? ""),
              promise: String(o?.promise ?? ""),
              description: String(o?.description ?? ""),
              target: String(o?.target ?? ""),
              format: String(o?.format ?? ""),
            }))
          : [];
        setOffers(loadedOffers);
        setInitialOffers(loadedOffers);
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: "Impossible de charger le profil",
            description: e?.message ?? "Erreur inconnue",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const profileDirty = useMemo(() => {
    const i = initialProfile;
    return (i?.first_name ?? "") !== firstName || (i?.niche ?? "") !== niche || (i?.mission ?? "") !== mission;
  }, [initialProfile, firstName, niche, mission]);

  const saveProfile = () => {
    startProfileTransition(async () => {
      try {
        const body: any = {};
        if ((initialProfile?.first_name ?? "") !== firstName) body.first_name = firstName;
        if ((initialProfile?.niche ?? "") !== niche) body.niche = niche;
        if ((initialProfile?.mission ?? "") !== mission) body.mission = mission;

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);

        toast({ title: "Profil mis à jour" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // Offers management
  // -------------------------
  const offersDirty = useMemo(() => {
    if (offers.length !== initialOffers.length) return true;
    return offers.some(
      (o, i) =>
        o.name !== initialOffers[i]?.name ||
        o.price !== initialOffers[i]?.price ||
        o.link !== initialOffers[i]?.link ||
        o.promise !== initialOffers[i]?.promise ||
        o.description !== initialOffers[i]?.description ||
        o.target !== initialOffers[i]?.target ||
        o.format !== initialOffers[i]?.format,
    );
  }, [offers, initialOffers]);

  const addOffer = () => setOffers((prev) => [...prev, { name: "", price: "", link: "", promise: "", description: "", target: "", format: "" }]);

  const removeOffer = (idx: number) => setOffers((prev) => prev.filter((_, i) => i !== idx));

  const updateOffer = (idx: number, field: keyof OfferItem, value: string) => {
    setOffers((prev) => prev.map((o, i) => (i === idx ? { ...o, [field]: value } : o)));
  };

  const saveOffers = () => {
    startOffersTransition(async () => {
      try {
        const cleaned = offers.filter((o) => o.name.trim());
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offers: cleaned }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        const saved = Array.isArray(row?.offers)
          ? row.offers.map((o: any) => ({
              name: String(o?.name ?? ""),
              price: String(o?.price ?? ""),
              link: String(o?.link ?? ""),
              promise: String(o?.promise ?? ""),
              description: String(o?.description ?? ""),
              target: String(o?.target ?? ""),
              format: String(o?.format ?? ""),
            }))
          : cleaned;
        setOffers(saved);
        setInitialOffers(saved);

        toast({ title: "Offres enregistrées" });
      } catch (e: any) {
        toast({ title: "Impossible d'enregistrer", description: e?.message ?? "Erreur", variant: "destructive" });
      }
    });
  };

  // -------------------------
  // Persona enrichment
  // -------------------------
  const [enriching, setEnriching] = useState(false);

  const enrichPersona = async () => {
    setEnriching(true);
    try {
      const res = await fetch("/api/persona/enrich", { method: "POST" });
      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok) {
        if (json?.error === "NO_CREDITS") {
          toast({
            title: "Crédits insuffisants",
            description: "L'enrichissement du persona coûte 1 crédit.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(json?.error || "Erreur");
      }

      if (json.persona_summary) {
        setMission(json.persona_summary);
      }
      if (json.niche_summary) {
        setNiche(json.niche_summary);
      }

      // Update initialProfile to reflect new values
      setInitialProfile((prev) => ({
        ...prev,
        niche: json.niche_summary || prev?.niche,
        mission: json.persona_summary || prev?.mission,
      }));

      toast({ title: "Persona enrichi avec succès" });
    } catch (e: any) {
      toast({
        title: "Erreur lors de l'enrichissement",
        description: e?.message ?? "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setEnriching(false);
    }
  };

  // -------------------------
  // Legal URLs
  // -------------------------
  const legalDirty = useMemo(() => {
    const i = initialProfile;
    return (i?.privacy_url ?? "") !== privacyUrl || (i?.terms_url ?? "") !== termsUrl || (i?.cgv_url ?? "") !== cgvUrl;
  }, [initialProfile, privacyUrl, termsUrl, cgvUrl]);

  const saveLegalUrls = () => {
    startLegalTransition(async () => {
      try {
        const body: any = {};
        if ((initialProfile?.privacy_url ?? "") !== privacyUrl) body.privacy_url = privacyUrl;
        if ((initialProfile?.terms_url ?? "") !== termsUrl) body.terms_url = termsUrl;
        if ((initialProfile?.cgv_url ?? "") !== cgvUrl) body.cgv_url = cgvUrl;

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setPrivacyUrl(row?.privacy_url ?? "");
        setTermsUrl(row?.terms_url ?? "");
        setCgvUrl(row?.cgv_url ?? "");

        toast({ title: "URLs légales enregistrées" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // Systeme.io API Key
  // -------------------------
  const sioDirty = useMemo(() => {
    return (initialProfile?.sio_user_api_key ?? "") !== sioApiKey;
  }, [initialProfile, sioApiKey]);

  const saveSioKey = () => {
    startSioTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sio_user_api_key: sioApiKey }),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setSioApiKey(row?.sio_user_api_key ?? "");

        toast({ title: "Clé API Systeme.io enregistrée" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // Social Links
  // -------------------------
  const linksDirty = useMemo(() => {
    const i = initialProfile;
    return (
      (i?.linkedin_url ?? "") !== linkedinUrl ||
      (i?.instagram_url ?? "") !== instagramUrl ||
      (i?.youtube_url ?? "") !== youtubeUrl ||
      (i?.website_url ?? "") !== websiteUrl
    );
  }, [initialProfile, linkedinUrl, instagramUrl, youtubeUrl, websiteUrl]);

  const saveLinks = () => {
    startLinksTransition(async () => {
      try {
        const body: any = {};
        if ((initialProfile?.linkedin_url ?? "") !== linkedinUrl) body.linkedin_url = linkedinUrl;
        if ((initialProfile?.instagram_url ?? "") !== instagramUrl) body.instagram_url = instagramUrl;
        if ((initialProfile?.youtube_url ?? "") !== youtubeUrl) body.youtube_url = youtubeUrl;
        if ((initialProfile?.website_url ?? "") !== websiteUrl) body.website_url = websiteUrl;

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setLinkedinUrl(row?.linkedin_url ?? "");
        setInstagramUrl(row?.instagram_url ?? "");
        setYoutubeUrl(row?.youtube_url ?? "");
        setWebsiteUrl(row?.website_url ?? "");

        toast({ title: "Liens enregistrés" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // ✅ Reset Tipote (connecté à /api/account/reset)
  // -------------------------
  const [resetting, setResetting] = useState(false);

  async function onResetAccount() {
    try {
      const ok1 = window.confirm(
        "⚠️ Réinitialiser ton Tipote ?\n\nTous les contenus, toutes les tâches et toutes les personnalisations seront effacés. C’est définitif.",
      );
      if (!ok1) return;

      const confirmWord = window.prompt('Tape "RESET" pour confirmer :');
      if ((confirmWord ?? "").trim().toUpperCase() !== "RESET") {
        toast({
          title: "Réinitialisation annulée",
          description: 'Tu dois taper "RESET" pour confirmer.',
          variant: "destructive",
        });
        return;
      }

      setResetting(true);

      const res = await fetch("/api/account/reset", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !json?.ok) {
        toast({
          title: "Reset impossible",
          description: json?.error || "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Tipote réinitialisé ✅",
        description: "On te renvoie vers l’onboarding.",
      });

      window.location.href = "/onboarding";
    } catch (e) {
      toast({
        title: "Reset impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <Tabs defaultValue="profile" value={tab} onValueChange={onTabChange} className="w-full">
      <TabsList className="mb-6 flex-wrap h-auto gap-1">
        <TabsTrigger value="profile" className="gap-2">
          <User className="w-4 h-4" />
          Profil
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-2">
          <Globe className="w-4 h-4" />
          Réglages
        </TabsTrigger>
        <TabsTrigger value="ai" className="gap-2">
          <Brain className="w-4 h-4" />
          IA & Crédits
        </TabsTrigger>
        <TabsTrigger value="pricing" className="gap-2">
          <CreditCard className="w-4 h-4" />
          Abonnement
        </TabsTrigger>
      </TabsList>

      {/* PROFIL */}
      <TabsContent value="profile" className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">Informations personnelles</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={userEmail} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Prénom</Label>
              <Input id="name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={profileLoading} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="flex gap-2">
                <Input id="password" type="password" value="••••••••" disabled className="flex-1" />

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">Modifier</Button>
                  </DialogTrigger>

                  <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                      <DialogTitle>Modifier le mot de passe</DialogTitle>
                    </DialogHeader>

                    <SetPasswordForm mode="reset" />
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Fuseau horaire</Label>
              <Select defaultValue="europe-paris">
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="europe-paris">Europe/Paris (UTC+1)</SelectItem>
                  <SelectItem value="europe-london">Europe/London (UTC)</SelectItem>
                  <SelectItem value="america-new-york">America/New_York (UTC-5)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button className="mt-6" onClick={saveProfile} disabled={!profileDirty || pendingProfile}>
            <Save className="w-4 h-4 mr-2" />
            {pendingProfile ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </Card>

        {/* ✅ ZONE DANGER */}
        <Card className="p-6 border border-red-200 bg-red-50/40">
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-700">Zone danger</h3>
              <p className="text-sm font-medium text-red-700/90">Réinitialiser mon Tipote</p>
            </div>
          </div>

          <p className="text-sm text-red-700/80">
            Tu as changé de voie ou tu t&apos;es perdu en cours de route ? Tu veux repartir à zéro avec ton Tipote et le lancer
            dans une autre direction ? Clique sur ce bouton. <b>Attention</b> : tous les contenus, toutes les tâches et toutes
            les personnalisations créés depuis ton arrivée seront effacés, tu repartira de zéro. C&apos;est définitif, tu ne
            pourras pas revenir en arrière.
          </p>

          <Button variant="destructive" className="mt-4 gap-2" onClick={onResetAccount} disabled={resetting}>
            <RotateCcw className="h-4 h-4" />
            {resetting ? "Réinitialisation…" : "Réinitialiser mon Tipote"}
          </Button>
        </Card>
      </TabsContent>

      {/* RÉGLAGES */}
      <TabsContent value="settings" className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">Langue et contenu</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Langue de l&apos;application</Label>
              <Select defaultValue="fr">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Langue du contenu généré</Label>
              <Select defaultValue="fr">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Forme d&apos;adresse par défaut</Label>
              <Select defaultValue="tu">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tu">Tutoiement (Tu)</SelectItem>
                  <SelectItem value="vous">Vouvoiement (Vous)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">Niche et Persona</h3>
          <p className="text-sm text-muted-foreground mb-4">Généré automatiquement après l&apos;onboarding. Vous pouvez le modifier ici.</p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Résumé de votre niche</Label>
              <Textarea
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                rows={2}
                className="resize-none"
                disabled={profileLoading}
              />
            </div>

            <div className="space-y-2">
              <Label>Résumé de votre persona</Label>
              <Textarea
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                rows={3}
                className="resize-none"
                disabled={profileLoading}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <Button variant="outline" onClick={saveProfile} disabled={!profileDirty || pendingProfile}>
              <Save className="w-4 h-4 mr-2" />
              {pendingProfile ? "Mise à jour…" : "Mettre à jour"}
            </Button>
            <Button variant="outline" onClick={enrichPersona} disabled={enriching}>
              {enriching ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {enriching ? "Enrichissement…" : "Enrichir avec l'IA"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            L&apos;enrichissement IA utilise vos données d&apos;onboarding, l&apos;analyse concurrentielle et les conversations avec le coach pour améliorer votre persona. Coût : 1 crédit.
          </p>
        </Card>

        <CompetitorAnalysisSection />

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-bold">Mentions légales & CGV</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Ces URLs seront utilisées automatiquement dans vos quiz, tunnels et pages publiques.
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Politique de confidentialité</Label>
              <Input
                placeholder="https://monsite.com/politique-de-confidentialite"
                value={privacyUrl}
                onChange={(e) => setPrivacyUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Mentions légales / Conditions d&apos;utilisation</Label>
              <Input
                placeholder="https://monsite.com/mentions-legales"
                value={termsUrl}
                onChange={(e) => setTermsUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Conditions Générales de Vente (CGV)</Label>
              <Input
                placeholder="https://monsite.com/cgv"
                value={cgvUrl}
                onChange={(e) => setCgvUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
          </div>

          <Button variant="outline" className="mt-4" onClick={saveLegalUrls} disabled={!legalDirty || pendingLegal}>
            <Save className="w-4 h-4 mr-2" />
            {pendingLegal ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Key className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-bold">Systeme.io</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Connecte ton compte Systeme.io pour exporter automatiquement les leads de tes quiz avec des tags.{" "}
            <a
              href="https://aide.systeme.io/article/2322-comment-creer-une-cle-api-publique-sur-systeme-io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary hover:text-primary/80"
            >
              Comment trouver ma clé API ?
            </a>
          </p>

          <div className="space-y-2">
            <Label>Clé API Systeme.io</Label>
            <Input
              type="password"
              placeholder="Colle ta clé API ici..."
              value={sioApiKey}
              onChange={(e) => setSioApiKey(e.target.value)}
              disabled={profileLoading}
            />
          </div>

          <Button variant="outline" className="mt-4" onClick={saveSioKey} disabled={!sioDirty || pendingSio}>
            <Save className="w-4 h-4 mr-2" />
            {pendingSio ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">Liens et réseaux</h3>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Linkedin className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://linkedin.com/in/..."
                className="flex-1"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="flex items-center gap-3">
              <Instagram className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://instagram.com/..."
                className="flex-1"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="flex items-center gap-3">
              <Youtube className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://youtube.com/@..."
                className="flex-1"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="flex items-center gap-3">
              <LinkIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://monsite.com"
                className="flex-1"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
          </div>

          <Button variant="outline" className="mt-4" onClick={saveLinks} disabled={!linksDirty || pendingLinks}>
            <Save className="w-4 h-4 mr-2" />
            {pendingLinks ? "Enregistrement…" : "Enregistrer les liens"}
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Liste des offres</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Ajoutez vos offres avec leurs détails pour que l'IA puisse créer du contenu pertinent.
          </p>

          <div className="space-y-4">
            {offers.map((offer, idx) => (
              <div key={idx} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Offre {idx + 1}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeOffer(idx)} disabled={profileLoading}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nom de l'offre *</Label>
                    <Input
                      placeholder="Ex: Formation Copywriting"
                      value={offer.name}
                      onChange={(e) => updateOffer(idx, "name", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Prix</Label>
                    <Input
                      placeholder="Ex: 297€"
                      value={offer.price}
                      onChange={(e) => updateOffer(idx, "price", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Promesse principale</Label>
                  <Input
                    placeholder="Ex: Apprends à écrire des textes qui vendent en 30 jours"
                    value={offer.promise}
                    onChange={(e) => updateOffer(idx, "promise", e.target.value)}
                    disabled={profileLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Public cible</Label>
                  <Input
                    placeholder="Ex: Entrepreneurs et freelances qui veulent vendre en ligne"
                    value={offer.target}
                    onChange={(e) => updateOffer(idx, "target", e.target.value)}
                    disabled={profileLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description courte</Label>
                  <Textarea
                    placeholder="En 2-3 phrases, décris ce que contient ton offre et le résultat attendu"
                    value={offer.description}
                    onChange={(e) => updateOffer(idx, "description", e.target.value)}
                    disabled={profileLoading}
                    className="min-h-[60px]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Format</Label>
                    <Input
                      placeholder="Ex: Vidéo, PDF, coaching, ebook..."
                      value={offer.format}
                      onChange={(e) => updateOffer(idx, "format", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lien</Label>
                    <Input
                      placeholder="https://..."
                      value={offer.link}
                      onChange={(e) => updateOffer(idx, "link", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addOffer} disabled={profileLoading} className="gap-1">
              <Plus className="w-4 h-4" />
              Ajouter une offre
            </Button>
          </div>

          <Button variant="outline" className="mt-4" onClick={saveOffers} disabled={!offersDirty || pendingOffers}>
            <Save className="w-4 h-4 mr-2" />
            {pendingOffers ? "Enregistrement…" : "Enregistrer les offres"}
          </Button>
        </Card>
      </TabsContent>

      {/* IA & CRÉDITS */}
      <TabsContent value="ai" className="space-y-6">
        <AiCreditsPanel />
      </TabsContent>

      {/* ABONNEMENT */}
      <TabsContent value="pricing" className="space-y-6">
        <BillingSection email={userEmail} />
      </TabsContent>
    </Tabs>
  );
}
