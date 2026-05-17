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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/custom-domain");
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) {
          setIsPaid(!!data.isPaid);
          setDomains(data.domains ?? []);
          setCnameTarget(data.dnsTargetCname ?? "");
        } else {
          toast.error(data.error ?? t("errGeneric"));
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

  return (
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
  );
}
