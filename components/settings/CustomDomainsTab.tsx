"use client";

// components/settings/CustomDomainsTab.tsx
//
// The "Custom domains" tab content. Loads the user's existing
// domains from /api/custom-domain on mount, renders one card per
// row + the "Add domain" trigger.
//
// Plan-gating: the POST endpoint already refuses for free-plan users;
// the GET endpoint returns `isPaid` alongside the list so we render
// the upsell upfront when relevant, rather than letting the user fill
// the form and bump into a 403.
//
// Multi-profile: the API already scopes by active project, so the
// list shown here reflects ONLY the currently-active project. Switching
// project (via Tipote's project picker) re-renders this tab with a
// different list — domains are isolated per profile.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { CustomDomainRow } from "@/lib/customDomains";
import type { RegistrarInfo } from "@/lib/registrarDetect";
import { AddCustomDomainDialog } from "./AddCustomDomainDialog";
import { CustomDomainCard } from "./CustomDomainCard";

export function CustomDomainsTab() {
  const t = useTranslations("settings");

  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [domains, setDomains] = useState<CustomDomainRow[]>([]);
  const [cnameTarget, setCnameTarget] = useState("");
  // Per-domain registrar info isn't stored server-side (no point — NS
  // can change), so we keep it in component state, keyed by domain id.
  // Set when the user adds a new domain (we detect at that moment).
  // For domains loaded from the API on mount we initially render
  // without registrar info; the auto-poll still works, the user just
  // doesn't see tailored setup instructions until they re-open the
  // detection somewhere else. Good enough for v1.
  const [registrars, setRegistrars] = useState<Record<string, RegistrarInfo>>({});

  // Nom de marque user-éditable affiché à la place de "Tipote" dans
  // og:site_name + suffix du <title> sur les routes publiques servies
  // via custom domain. Per-project (business_profiles.share_site_name).
  const [shareSiteName, setShareSiteName] = useState("");
  const [shareSiteNameOriginal, setShareSiteNameOriginal] = useState("");
  const [savingShareSiteName, setSavingShareSiteName] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // En parallèle : domaines custom + profile pour pré-remplir le
        // bloc "nom de marque dans les partages".
        const [domRes, profRes] = await Promise.all([
          fetch("/api/custom-domain"),
          fetch("/api/profile"),
        ]);
        const domData = await domRes.json().catch(() => null);
        const profData = await profRes.json().catch(() => null);
        if (cancelled) return;
        if (domData?.ok) {
          setIsPaid(!!domData.isPaid);
          setDomains(domData.domains ?? []);
          setCnameTarget(domData.dnsTargetCname ?? "");
        } else {
          toast.error(domData?.error ?? t("errGeneric"));
        }
        if (profData?.ok) {
          const value = (profData.profile?.share_site_name ?? "") as string;
          setShareSiteName(value);
          setShareSiteNameOriginal(value);
        }
      } catch {
        if (!cancelled) toast.error(t("errNetwork"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handleSaveShareSiteName() {
    setSavingShareSiteName(true);
    try {
      const trimmed = shareSiteName.trim();
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share_site_name: trimmed || null }),
      });
      const data = await res.json();
      if (data.ok) {
        const next = (data.profile?.share_site_name ?? "") as string;
        setShareSiteName(next);
        setShareSiteNameOriginal(next);
        toast.success(t("saved"));
      } else {
        toast.error(data.error ?? t("errGeneric"));
      }
    } catch {
      toast.error(t("errNetwork"));
    } finally {
      setSavingShareSiteName(false);
    }
  }

  function handleCreated(domain: CustomDomainRow, registrar: RegistrarInfo | null) {
    setDomains((prev) => [domain, ...prev]);
    if (registrar) {
      setRegistrars((prev) => ({ ...prev, [domain.id]: registrar }));
    }
  }

  function handleUpdated(next: CustomDomainRow) {
    setDomains((prev) => prev.map((d) => (d.id === next.id ? next : d)));
  }

  function handleDeleted(id: string) {
    setDomains((prev) => prev.filter((d) => d.id !== id));
    setRegistrars((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isPaid) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("customDomainsTitle")}
          </CardTitle>
          <CardDescription>{t("customDomainsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/30 p-6 text-center space-y-3">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">{t("customDomainsUpsellTitle")}</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t("customDomainsUpsellDesc")}
            </p>
            <Button asChild variant="default" className="rounded-full">
              <a href="/settings?tab=pricing">{t("customDomainsUpsellCta")}</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Le bloc "nom de marque" n'apparaît que quand au moins 1 domain
  // vérifié — sinon le réglage n'a aucun effet (le backend ne
  // l'applique que sur les routes servies via un custom domain).
  const hasVerifiedDomain = domains.some((d) => d.status === "verified");
  const firstVerifiedHost = domains.find((d) => d.status === "verified")?.hostname || "";
  const shareSiteNameDirty = shareSiteName.trim() !== shareSiteNameOriginal.trim();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t("customDomainsTitle")}
            </CardTitle>
            <CardDescription>{t("customDomainsDesc")}</CardDescription>
          </div>
          <AddCustomDomainDialog
            cnameTarget={cnameTarget || "connect.tipote.com"}
            onCreated={handleCreated}
          />
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              {t("customDomainsEmpty")}
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map((d) => (
                <CustomDomainCard
                  key={d.id}
                  domain={d}
                  cnameTarget={cnameTarget || "connect.tipote.com"}
                  registrar={registrars[d.id] ?? null}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hasVerifiedDomain && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("shareSiteNameTitle")}
            </CardTitle>
            <CardDescription>{t("shareSiteNameDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Input
                  value={shareSiteName}
                  onChange={(e) => setShareSiteName(e.target.value.slice(0, 60))}
                  placeholder={firstVerifiedHost || "Mon studio"}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">
                  {t("shareSiteNameHint", { fallback: firstVerifiedHost })}
                </p>
              </div>
              <Button
                onClick={handleSaveShareSiteName}
                disabled={!shareSiteNameDirty || savingShareSiteName}
              >
                {savingShareSiteName ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
