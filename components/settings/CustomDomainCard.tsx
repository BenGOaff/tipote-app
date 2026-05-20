"use client";

// components/settings/CustomDomainCard.tsx
//
// One card per custom-domain row. Drives most of the user-facing
// custom-domain UX: status badge, "where to add the CNAME" panel,
// auto-polling of the verify endpoint, delete confirmation.
//
// Auto-poll: while the domain is in pending_dns/failed state we hit
// /verify every 30s for up to 20 attempts (10 minutes), so the user
// can configure DNS in another tab and watch the badge flip green on
// its own. The poll stops as soon as the domain is verified or the
// component unmounts.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2, AlertCircle, Loader2, ExternalLink, RefreshCw, Trash2, Clock, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { CustomDomainRow } from "@/lib/customDomains";
import type { RegistrarInfo } from "@/lib/registrarDetect";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { prepareFaviconForUpload } from "@/lib/clientFaviconUpload";
import { RegistrarInstructions } from "./RegistrarInstructions";

type Props = {
  domain: CustomDomainRow;
  cnameTarget: string;
  // Per-domain registrar info detected at add-time. Optional because
  // the parent only knows it for freshly-added domains; older rows
  // load with no detection until the user expands the card.
  registrar: RegistrarInfo | null;
  onUpdated: (next: CustomDomainRow) => void;
  onDeleted: (id: string) => void;
};

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_ATTEMPTS = 20; // 20 × 30s = 10 min

export function CustomDomainCard({
  domain,
  cnameTarget,
  registrar,
  onUpdated,
  onDeleted,
}: Props) {
  const t = useTranslations("settings");

  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [removingFavicon, setRemovingFavicon] = useState(false);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Auto-poll state. Counts attempts so we can show "checking…
  // (attempt N/20)" and stop without hammering when DNS won't budge.
  const [pollAttempt, setPollAttempt] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Async refs so the polling callback always sees the latest row.
  const domainRef = useRef(domain);
  domainRef.current = domain;

  async function runVerify(opts: { fromPoll: boolean }): Promise<void> {
    if (!opts.fromPoll) setVerifying(true);
    try {
      const res = await fetch(`/api/custom-domain/${domain.id}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok && data.domain) {
        const previousStatus = domainRef.current.status;
        onUpdated(data.domain);
        if (
          data.domain.status === "verified" &&
          previousStatus !== "verified"
        ) {
          toast.success(t("toastDomainVerified", { hostname: domain.hostname }));
          stopPolling();
        }
        if (data.domain.status === "failed" && !opts.fromPoll) {
          toast.error(
            data.domain.error_message ?? t("toastDomainStillPending"),
          );
        }
      } else if (!opts.fromPoll) {
        toast.error(data.error ?? t("errGeneric"));
      }
    } catch {
      if (!opts.fromPoll) toast.error(t("errNetwork"));
    } finally {
      if (!opts.fromPoll) setVerifying(false);
    }
  }

  function startPolling() {
    if (pollingRef.current) return;
    setPollAttempt(0);
    pollingRef.current = setInterval(() => {
      setPollAttempt((n) => {
        const next = n + 1;
        if (next > POLL_MAX_ATTEMPTS) {
          stopPolling();
          return n;
        }
        // Fire and forget — we don't await inside setInterval.
        void runVerify({ fromPoll: true });
        return next;
      });
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  // Kick off the poll loop whenever the domain is not yet verified,
  // and tear it down on unmount or once it becomes verified.
  useEffect(() => {
    if (domain.status !== "verified" && pollAttempt < POLL_MAX_ATTEMPTS) {
      startPolling();
    } else {
      stopPolling();
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain.status]);

  async function persistFaviconUrl(url: string | null): Promise<void> {
    const res = await fetch(`/api/custom-domain/${domain.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favicon_url: url }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) throw new Error(data?.error ?? "save_failed");
    if (data.domain) onUpdated(data.domain as CustomDomainRow);
  }

  async function handleFaviconUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("errImageTooLarge2"));
      return;
    }
    setUploadingFavicon(true);
    try {
      const prepared = await prepareFaviconForUpload(file);
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_signed_in");
      const path = `favicons/${user.id}/${domain.id}-${Date.now()}.${prepared.ext}`;
      const { error } = await supabase.storage
        .from("public-assets")
        .upload(path, prepared.blob, {
          upsert: true,
          contentType: prepared.contentType,
        });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
      await persistFaviconUrl(urlData.publicUrl);
      toast.success(t("faviconUploaded"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Favicon upload failed:", err);
      toast.error(t("errFaviconUpload", { msg }));
    } finally {
      setUploadingFavicon(false);
    }
  }

  async function handleFaviconRemove() {
    setRemovingFavicon(true);
    try {
      await persistFaviconUrl(null);
      toast.success(t("saved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("errFaviconUpload", { msg }));
    } finally {
      setRemovingFavicon(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/custom-domain/${domain.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(t("toastDomainDeleted"));
        onDeleted(domain.id);
      } else {
        toast.error(data.error ?? t("errGeneric"));
      }
    } catch {
      toast.error(t("errNetwork"));
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-base font-semibold truncate">
                {domain.hostname}
              </code>
              <StatusBadge status={domain.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              <SubStatus
                status={domain.status}
                pollAttempt={pollAttempt}
                pollMaxAttempts={POLL_MAX_ATTEMPTS}
                errorMessage={domain.error_message}
                verifiedAt={domain.verified_at}
              />
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {domain.status !== "verified" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => runVerify({ fromPoll: false })}
                disabled={verifying}
                className="gap-1.5"
              >
                {verifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t("domainVerifyBtn")}
              </Button>
            )}
            {domain.status === "verified" && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                <a
                  href={`https://${domain.hostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("domainOpenBtn")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="text-destructive hover:text-destructive"
              aria-label={t("domainDeleteBtn")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {/* Setup instructions panel — only when DNS not yet verified.
            Once verified there's nothing more to do, the card collapses
            to its header. */}
        {domain.status !== "verified" && registrar && (
          <CardContent className="pt-0">
            <div className="border-t pt-4">
              <RegistrarInstructions
                hostname={domain.hostname}
                cnameTarget={cnameTarget}
                registrar={registrar}
              />
            </div>
          </CardContent>
        )}

        {/* Favicon — un par domain. Affiché dans l'onglet navigateur
            des pages publiques servies via ce domaine. */}
        {domain.status === "verified" && (
          <CardContent className="pt-0">
            <div className="border-t pt-4">
              <div className="flex items-start gap-4">
                {domain.favicon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={domain.favicon_url}
                    alt="Favicon"
                    className="h-14 w-14 rounded-lg border bg-white object-contain p-1"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                    <Upload className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-sm font-medium">{t("faviconTitle")}</div>
                  <p className="text-xs text-muted-foreground">{t("faviconDesc")}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={uploadingFavicon || removingFavicon}
                      onClick={() => faviconInputRef.current?.click()}
                    >
                      {uploadingFavicon ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {t("faviconUploadBtn")}
                    </Button>
                    {domain.favicon_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={uploadingFavicon || removingFavicon}
                        onClick={handleFaviconRemove}
                      >
                        {removingFavicon ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : null}
                        {t("faviconRemoveBtn")}
                      </Button>
                    )}
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.ico,.svg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFaviconUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("domainDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("domainDeleteDesc", { hostname: domain.hostname })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              {t("cancelBtn")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("domainDeleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("settings");
  switch (status) {
    case "verified":
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {t("domainStatusVerified")}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          {t("domainStatusFailed")}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          {t("domainStatusPending")}
        </Badge>
      );
  }
}

function SubStatus({
  status,
  pollAttempt,
  pollMaxAttempts,
  errorMessage,
  verifiedAt,
}: {
  status: string;
  pollAttempt: number;
  pollMaxAttempts: number;
  errorMessage: string | null;
  verifiedAt: string | null;
}) {
  const t = useTranslations("settings");
  if (status === "verified") {
    if (verifiedAt) {
      // Lightweight relative formatter — full date is below i18n complexity
      // for an MVP, ISO date is unambiguous enough.
      const date = new Date(verifiedAt);
      return <>{t("domainVerifiedSince", { date: date.toLocaleDateString() })}</>;
    }
    return <>{t("domainStatusVerified")}</>;
  }
  if (status === "failed" && errorMessage) {
    return <>{errorMessage}</>;
  }
  if (pollAttempt > 0 && pollAttempt < pollMaxAttempts) {
    return (
      <>
        {t("domainPollingProgress", {
          n: pollAttempt,
          total: pollMaxAttempts,
        })}
      </>
    );
  }
  if (pollAttempt >= pollMaxAttempts) {
    return <>{t("domainPollingExhausted")}</>;
  }
  return <>{t("domainPendingHint")}</>;
}
