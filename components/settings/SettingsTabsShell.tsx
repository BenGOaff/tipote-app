// components/settings/SettingsTabsShell.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Globe,
  Brain,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Save,
  Linkedin,
  Instagram,
  Youtube,
  Link as LinkIcon,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";
import SetPasswordForm from "@/components/SetPasswordForm";
import BillingSection from "@/components/settings/BillingSection";
import { ampTrack } from "@/lib/telemetry/amplitude-client";

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

type ProfileRow = {
  first_name?: string | null;
  niche?: string | null;
  mission?: string | null;
};

type Provider = "openai" | "claude" | "gemini";

type ApiKeyState = {
  loading: boolean;
  configured: boolean;
  hasKey: boolean;
  masked: string | null;
  value: string;
  saving: boolean;
  error: string | null;
};

function makeApiKeyState(): ApiKeyState {
  return {
    loading: true,
    configured: false,
    hasKey: false,
    masked: null,
    value: "",
    saving: false,
    error: null,
  };
}

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
    return (
      (i?.first_name ?? "") !== firstName ||
      (i?.niche ?? "") !== niche ||
      (i?.mission ?? "") !== mission
    );
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
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

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

      // ✅ Dans ton code serveur (app/app/page.tsx), l’absence de onboarding_completed => redirect("/onboarding")
      // Donc aller directement sur /onboarding est OK.
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

  // -------------------------
  // API Keys (connecté à /api/user/api-keys)
  // -------------------------
  const [keys, setKeys] = useState<Record<Provider, ApiKeyState>>({
    openai: makeApiKeyState(),
    claude: makeApiKeyState(),
    gemini: makeApiKeyState(),
  });

  const loadKey = async (provider: Provider) => {
    setKeys((s) => ({
      ...s,
      [provider]: { ...s[provider], loading: true, error: null },
    }));

    try {
      const res = await fetch(`/api/user/api-keys?provider=${provider}`, { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok) throw new Error(json?.error || "Erreur");

      setKeys((s) => ({
        ...s,
        [provider]: {
          ...s[provider],
          loading: false,
          configured: Boolean(json.configured),
          hasKey: Boolean(json.hasKey),
          masked: json.masked ?? null,
          value: "",
          error: null,
        },
      }));
    } catch (e: any) {
      setKeys((s) => ({
        ...s,
        [provider]: {
          ...s[provider],
          loading: false,
          error: e?.message ?? "Erreur",
        },
      }));
    }
  };

  useEffect(() => {
    if (tab !== "ai") return;
    loadKey("openai");
    loadKey("claude");
    loadKey("gemini");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const saveKey = async (provider: Provider) => {
    const v = (keys[provider].value ?? "").trim();
    if (!v) return;

    setKeys((s) => ({
      ...s,
      [provider]: { ...s[provider], saving: true, error: null },
    }));

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: v }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok) throw new Error(json?.error || "Erreur");

      ampTrack("tipote_api_key_saved", {
        provider,
      });

      toast({ title: "Clé enregistrée", description: provider.toUpperCase() });
      await loadKey(provider);
    } catch (e: any) {
      setKeys((s) => ({
        ...s,
        [provider]: { ...s[provider], saving: false, error: e?.message ?? "Erreur" },
      }));
      return;
    }

    setKeys((s) => ({
      ...s,
      [provider]: { ...s[provider], saving: false, value: "" },
    }));
  };

  const deleteKey = async (provider: Provider) => {
    setKeys((s) => ({
      ...s,
      [provider]: { ...s[provider], saving: true, error: null },
    }));

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok) throw new Error(json?.error || "Erreur");

      toast({ title: "Clé supprimée", description: provider.toUpperCase() });
      await loadKey(provider);
    } catch (e: any) {
      setKeys((s) => ({
        ...s,
        [provider]: { ...s[provider], saving: false, error: e?.message ?? "Erreur" },
      }));
      return;
    }

    setKeys((s) => ({
      ...s,
      [provider]: { ...s[provider], saving: false, value: "" },
    }));
  };

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
          IA & API
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
              <Input
                id="name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={profileLoading}
              />
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
          <p className="text-sm text-muted-foreground mb-4">
            Généré automatiquement après l&apos;onboarding. Vous pouvez le modifier ici.
          </p>

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

          <Button variant="outline" className="mt-4" onClick={saveProfile} disabled={!profileDirty || pendingProfile}>
            <Save className="w-4 h-4 mr-2" />
            {pendingProfile ? "Mise à jour…" : "Mettre à jour"}
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">Liens et réseaux</h3>

          <div className="space-y-4">
            {[
              { label: "LinkedIn", icon: Linkedin, placeholder: "https://linkedin.com/in/..." },
              { label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/..." },
              { label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@..." },
              { label: "Blog", icon: LinkIcon, placeholder: "https://monblog.com" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <Input placeholder={item.placeholder} className="flex-1" />
              </div>
            ))}
          </div>

          <Button variant="outline" className="mt-4" disabled>
            <Save className="w-4 h-4 mr-2" />
            Enregistrer les liens
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">Liste des offres</h3>
          <p className="text-sm text-muted-foreground mb-4">Ajoutez vos offres pour les utiliser dans les modules de génération.</p>

          <div className="space-y-3">
            <div className="flex gap-3">
              <Input placeholder="Nom de l'offre" className="flex-1" />
              <Input placeholder="Prix" className="w-24" />
              <Input placeholder="Lien" className="flex-1" />
              <Button variant="outline" size="icon" disabled>
                +
              </Button>
            </div>
          </div>
        </Card>
      </TabsContent>

      {/* IA & API */}
      <TabsContent value="ai" className="space-y-6">
        <Card className="p-6 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
              <Brain className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">Configuration des clés API IA</h3>
              <p className="text-muted-foreground text-sm">
                <strong>IA Niveau 1 (Stratégie) :</strong> Gérée par Tipote™
                <br />
                <strong>IA Niveau 2 (Contenu) :</strong> Vos clés API personnelles
              </p>
            </div>
          </div>
        </Card>

        {/* OpenAI */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg ${
                  keys.openai.hasKey ? "bg-success/10" : "bg-muted"
                } flex items-center justify-center`}
              >
                {keys.openai.hasKey ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-medium">OpenAI GPT-4</p>
                <p className="text-sm text-muted-foreground">
                  {keys.openai.loading
                    ? "Chargement…"
                    : keys.openai.hasKey
                      ? "Clé configurée"
                      : "Non configuré"}
                </p>
              </div>
            </div>

            {keys.openai.hasKey ? (
              <Badge className="bg-success text-success-foreground">Connecté</Badge>
            ) : (
              <Badge variant="outline">Non connecté</Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              type="password"
              value={keys.openai.hasKey ? keys.openai.masked ?? "" : keys.openai.value}
              onChange={(e) =>
                setKeys((s) => ({ ...s, openai: { ...s.openai, value: e.target.value } }))
              }
              placeholder="sk-..."
              className="flex-1"
              disabled={keys.openai.loading || keys.openai.hasKey}
            />
            {keys.openai.hasKey ? (
              <Button
                variant="outline"
                onClick={() => deleteKey("openai")}
                disabled={keys.openai.saving || keys.openai.loading}
              >
                Supprimer
              </Button>
            ) : (
              <Button
                onClick={() => saveKey("openai")}
                disabled={keys.openai.saving || keys.openai.loading || !keys.openai.value.trim()}
              >
                {keys.openai.saving ? "Connexion…" : "Connecter"}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            <a
              href="https://platform.openai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Obtenir une clé sur platform.openai.com <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>

          {keys.openai.error ? <p className="text-xs text-destructive mt-2">{keys.openai.error}</p> : null}
        </Card>

        {/* Claude */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg ${
                  keys.claude.hasKey ? "bg-success/10" : "bg-muted"
                } flex items-center justify-center`}
              >
                {keys.claude.hasKey ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-medium">Claude (Anthropic)</p>
                <p className="text-sm text-muted-foreground">
                  {keys.claude.loading
                    ? "Chargement…"
                    : keys.claude.hasKey
                      ? "Clé configurée"
                      : "Non configuré"}
                </p>
              </div>
            </div>

            {keys.claude.hasKey ? (
              <Badge className="bg-success text-success-foreground">Connecté</Badge>
            ) : (
              <Badge variant="outline">Non connecté</Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              type="password"
              value={keys.claude.hasKey ? keys.claude.masked ?? "" : keys.claude.value}
              onChange={(e) =>
                setKeys((s) => ({ ...s, claude: { ...s.claude, value: e.target.value } }))
              }
              placeholder="sk-ant-..."
              className="flex-1"
              disabled={keys.claude.loading || keys.claude.hasKey}
            />
            {keys.claude.hasKey ? (
              <Button
                variant="outline"
                onClick={() => deleteKey("claude")}
                disabled={keys.claude.saving || keys.claude.loading}
              >
                Supprimer
              </Button>
            ) : (
              <Button
                onClick={() => saveKey("claude")}
                disabled={keys.claude.saving || keys.claude.loading || !keys.claude.value.trim()}
              >
                {keys.claude.saving ? "Connexion…" : "Connecter"}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Obtenir une clé sur console.anthropic.com <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>

          {keys.claude.error ? <p className="text-xs text-destructive mt-2">{keys.claude.error}</p> : null}
        </Card>

        {/* Gemini */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg ${
                  keys.gemini.hasKey ? "bg-success/10" : "bg-muted"
                } flex items-center justify-center`}
              >
                {keys.gemini.hasKey ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-medium">Google Gemini</p>
                <p className="text-sm text-muted-foreground">
                  {keys.gemini.loading
                    ? "Chargement…"
                    : keys.gemini.hasKey
                      ? "Clé configurée"
                      : "Non configuré"}
                </p>
              </div>
            </div>

            {keys.gemini.hasKey ? (
              <Badge className="bg-success text-success-foreground">Connecté</Badge>
            ) : (
              <Badge variant="outline">Non connecté</Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              type="password"
              value={keys.gemini.hasKey ? keys.gemini.masked ?? "" : keys.gemini.value}
              onChange={(e) =>
                setKeys((s) => ({ ...s, gemini: { ...s.gemini, value: e.target.value } }))
              }
              placeholder="AIza..."
              className="flex-1"
              disabled={keys.gemini.loading || keys.gemini.hasKey}
            />
            {keys.gemini.hasKey ? (
              <Button
                variant="outline"
                onClick={() => deleteKey("gemini")}
                disabled={keys.gemini.saving || keys.gemini.loading}
              >
                Supprimer
              </Button>
            ) : (
              <Button
                onClick={() => saveKey("gemini")}
                disabled={keys.gemini.saving || keys.gemini.loading || !keys.gemini.value.trim()}
              >
                {keys.gemini.saving ? "Connexion…" : "Connecter"}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            <a
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Obtenir une clé sur makersuite.google.com <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>

          {keys.gemini.error ? <p className="text-xs text-destructive mt-2">{keys.gemini.error}</p> : null}
        </Card>

        {/* Perplexity (UI only) */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Perplexity</p>
                <p className="text-sm text-muted-foreground">Pour sourcing et actualités</p>
              </div>
            </div>
            <Badge variant="outline">Non connecté</Badge>
          </div>
          <div className="flex gap-2">
            <Input type="password" placeholder="pplx-..." className="flex-1" disabled />
            <Button disabled>Connecter</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <a
              href="https://www.perplexity.ai/help-center/fr/articles/10352995-parametres-de-l-api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Trouver votre clé Perplexity <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </Card>

        {/* Systeme.io API (UI only) */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">API Systeme.io</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Connectez votre compte Systeme.io pour synchroniser vos contacts et ventes.
          </p>
          <div className="flex gap-2">
            <Input type="password" placeholder="Votre clé API Systeme.io" className="flex-1" disabled />
            <Button disabled>Connecter</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <a
              href="https://aide.systeme.io/article/2322-comment-creer-une-cle-api-publique-sur-systeme-io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Trouver votre clé dans Systeme.io <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </Card>
      </TabsContent>

      {/* ABONNEMENT */}
      <TabsContent value="pricing" className="space-y-6">
        <BillingSection email={userEmail} />
      </TabsContent>
    </Tabs>
  );
}
