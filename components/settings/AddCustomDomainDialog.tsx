"use client";

// components/settings/AddCustomDomainDialog.tsx
//
// Two-step "add a domain" flow:
//
//   1. User types a hostname → we call /detect-ns to figure out which
//      registrar hosts their DNS, and preview the CNAME they will need
//      to add. The user can copy the CNAME values right from this
//      preview before committing — useful when they want to set up DNS
//      first and only then click Confirm.
//
//   2. On Confirm we POST /api/custom-domain which inserts the row
//      and runs the DNS check inline. The result (verified or
//      pending_dns) lands in the parent list immediately.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { CustomDomainRow } from "@/lib/customDomains";
import type { RegistrarInfo } from "@/lib/registrarDetect";
import { RegistrarInstructions } from "./RegistrarInstructions";

type Props = {
  cnameTarget: string;
  onCreated: (domain: CustomDomainRow, registrar: RegistrarInfo | null) => void;
};

type DetectionResult = {
  hostname: string;
  nameservers: string[];
  registrar: RegistrarInfo;
};

export function AddCustomDomainDialog({ cnameTarget, onCreated }: Props) {
  const t = useTranslations("settings");

  const [open, setOpen] = useState(false);
  const [hostnameInput, setHostnameInput] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  function resetState() {
    setHostnameInput("");
    setDetecting(false);
    setSubmitting(false);
    setDetection(null);
    setErrorText(null);
  }

  async function handleDetect() {
    setErrorText(null);
    setDetection(null);
    setDetecting(true);
    try {
      const res = await fetch("/api/custom-domain/detect-ns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: hostnameInput }),
      });
      const data = await res.json();
      if (data.ok) {
        setDetection({
          hostname: data.hostname,
          nameservers: data.nameservers ?? [],
          registrar: data.registrar,
        });
      } else {
        setErrorText(data.error ?? t("errGeneric"));
      }
    } catch {
      setErrorText(t("errNetwork"));
    } finally {
      setDetecting(false);
    }
  }

  async function handleConfirm() {
    if (!detection) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: detection.hostname }),
      });
      const data = await res.json();
      if (data.ok && data.domain) {
        onCreated(data.domain, detection.registrar);
        toast.success(
          data.domain.status === "verified"
            ? t("toastDomainVerified", { hostname: data.domain.hostname })
            : t("toastDomainAdded"),
        );
        setOpen(false);
        resetState();
      } else {
        setErrorText(data.error ?? t("errGeneric"));
      }
    } catch {
      setErrorText(t("errNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("domainAddBtn")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("domainAddTitle")}</DialogTitle>
          <DialogDescription>{t("domainAddDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="custom-domain-input">
              {t("domainHostnameLabel")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="custom-domain-input"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("domainHostnamePh")}
                value={hostnameInput}
                onChange={(e) => {
                  setHostnameInput(e.target.value);
                  // Invalidate stale detection if the user edits the input.
                  if (detection) setDetection(null);
                  if (errorText) setErrorText(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hostnameInput.trim() && !detecting) {
                    void handleDetect();
                  }
                }}
                disabled={detecting || submitting}
              />
              <Button
                variant="outline"
                onClick={handleDetect}
                disabled={!hostnameInput.trim() || detecting || submitting}
                className="gap-1.5 shrink-0"
              >
                {detecting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("domainDetectBtn")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("domainHostnameHint")}
            </p>
          </div>

          {errorText && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorText}
            </div>
          )}

          {detection && (
            <div className="border-t pt-4">
              <RegistrarInstructions
                hostname={detection.hostname}
                cnameTarget={cnameTarget}
                registrar={detection.registrar}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              resetState();
            }}
            disabled={submitting}
          >
            {t("cancelBtn")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!detection || submitting}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("domainConfirmBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
