// components/settings/ProfileSection.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type ProfileRow = {
  first_name?: string | null;
  country?: string | null;
  niche?: string | null;
  mission?: string | null;

  business_maturity?: string | null;
  offers_status?: string | null;

  main_goals?: string[] | null;
  preferred_content_types?: string[] | null;
  tone_preference?: string | null;

  [key: string]: unknown;
};

type GetResp = { ok: boolean; profile?: ProfileRow | null; error?: string };
type PatchResp = { ok: boolean; profile?: ProfileRow | null; error?: string };

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  return [];
}

function csvToArray(s: string): string[] {
  const raw = (s ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function arrayToCsv(a: string[]) {
  return (a ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 12).join(", ");
}

export default function ProfileSection() {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [firstName, setFirstName] = useState("");
  const [country, setCountry] = useState("");
  const [niche, setNiche] = useState("");
  const [mission, setMission] = useState("");

  const [businessMaturity, setBusinessMaturity] = useState("");
  const [offersStatus, setOffersStatus] = useState("");

  const [mainGoalsCsv, setMainGoalsCsv] = useState("");
  const [contentTypesCsv, setContentTypesCsv] = useState("");
  const [tonePreference, setTonePreference] = useState("");

  const dirty = useMemo(() => {
    const p = profile ?? {};
    const same =
      asString(p.first_name ?? "") === firstName &&
      asString(p.country ?? "") === country &&
      asString(p.niche ?? "") === niche &&
      asString(p.mission ?? "") === mission &&
      asString(p.business_maturity ?? "") === businessMaturity &&
      asString(p.offers_status ?? "") === offersStatus &&
      arrayToCsv(asArray(p.main_goals ?? [])) === mainGoalsCsv &&
      arrayToCsv(asArray(p.preferred_content_types ?? [])) === contentTypesCsv &&
      asString(p.tone_preference ?? "") === tonePreference;

    return !same;
  }, [
    profile,
    firstName,
    country,
    niche,
    mission,
    businessMaturity,
    offersStatus,
    mainGoalsCsv,
    contentTypesCsv,
    tonePreference,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/profile", { method: "GET" });
        const json = (await res.json().catch(() => null)) as GetResp | null;

        if (!res.ok || !json?.ok) {
          toast({
            title: "Impossible de charger le profil",
            description: json?.error || "Erreur inconnue",
            variant: "destructive",
          });
          return;
        }

        const p = (json.profile ?? null) as ProfileRow | null;
        if (cancelled) return;

        setProfile(p);

        setFirstName(asString(p?.first_name ?? ""));
        setCountry(asString(p?.country ?? ""));
        setNiche(asString(p?.niche ?? ""));
        setMission(asString(p?.mission ?? ""));

        setBusinessMaturity(asString(p?.business_maturity ?? ""));
        setOffersStatus(asString(p?.offers_status ?? ""));

        setMainGoalsCsv(arrayToCsv(asArray(p?.main_goals ?? [])));
        setContentTypesCsv(arrayToCsv(asArray(p?.preferred_content_types ?? [])));
        setTonePreference(asString(p?.tone_preference ?? ""));
      } catch (e) {
        toast({
          title: "Impossible de charger le profil",
          description: e instanceof Error ? e.message : "Erreur inconnue",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = () => {
    startTransition(async () => {
      try {
        const payload = {
          first_name: firstName.trim(),
          country: country.trim(),
          niche: niche.trim(),
          mission: mission.trim(),
          business_maturity: businessMaturity.trim(),
          offers_status: offersStatus.trim(),
          main_goals: csvToArray(mainGoalsCsv),
          preferred_content_types: csvToArray(contentTypesCsv),
          tone_preference: tonePreference.trim(),
        };

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = (await res.json().catch(() => null)) as PatchResp | null;

        if (!res.ok || !json?.ok) {
          toast({
            title: "Sauvegarde impossible",
            description: json?.error || "Erreur inconnue",
            variant: "destructive",
          });
          return;
        }

        setProfile(json.profile ?? profile);

        toast({
          title: "Profil mis à jour ✅",
          description: "Tes infos ont été enregistrées.",
        });
      } catch (e) {
        toast({
          title: "Sauvegarde impossible",
          description: e instanceof Error ? e.message : "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">Profil business</h3>
          <p className="text-xs text-slate-500">Ces infos alimentent la stratégie et la génération de contenu.</p>
        </div>

        <div className="flex items-center gap-2">
          {loading ? <Badge variant="secondary">Chargement…</Badge> : dirty ? <Badge>Modifié</Badge> : <Badge variant="secondary">À jour</Badge>}
          <Button size="sm" onClick={onSave} disabled={loading || pending || !dirty}>
            {pending ? "Sauvegarde…" : "Sauvegarder"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="firstName">
            Prénom
          </Label>
          <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Béné" />
        </div>

        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="country">
            Pays
          </Label>
          <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="France" />
        </div>

        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="niche">
            Niche
          </Label>
          <Input id="niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Coach, E-commerce, SaaS…" />
        </div>

        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="tone">
            Ton préféré
          </Label>
          <Input
            id="tone"
            value={tonePreference}
            onChange={(e) => setTonePreference(e.target.value)}
            placeholder="Direct, fun, premium…"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label className="text-xs" htmlFor="mission">
          Mission
        </Label>
        <Textarea
          id="mission"
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="En une ou deux phrases : qu’est-ce que tu fais, pour qui, et pourquoi ?"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="maturity">
            Maturité business
          </Label>
          <Input
            id="maturity"
            value={businessMaturity}
            onChange={(e) => setBusinessMaturity(e.target.value)}
            placeholder="Idée, lancement, croissance, scale…"
          />
        </div>

        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="offersStatus">
            Statut des offres
          </Label>
          <Input
            id="offersStatus"
            value={offersStatus}
            onChange={(e) => setOffersStatus(e.target.value)}
            placeholder="Pas d’offre, une offre, plusieurs offres…"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="goals">
            Objectifs principaux (CSV)
          </Label>
          <Input
            id="goals"
            value={mainGoalsCsv}
            onChange={(e) => setMainGoalsCsv(e.target.value)}
            placeholder="Ex: trouver des clients, vendre une offre, construire une audience"
          />
          <p className="text-[11px] text-slate-500">Sépare par des virgules. Max 10.</p>
        </div>

        <div className="grid gap-2">
          <Label className="text-xs" htmlFor="types">
            Types de contenus préférés (CSV)
          </Label>
          <Input
            id="types"
            value={contentTypesCsv}
            onChange={(e) => setContentTypesCsv(e.target.value)}
            placeholder="Ex: posts, emails, blog, scripts vidéo"
          />
          <p className="text-[11px] text-slate-500">Sépare par des virgules. Max 12.</p>
        </div>
      </div>
    </section>
  );
}
