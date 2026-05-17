"use client";

// components/settings/RegistrarInstructions.tsx
//
// Renders step-by-step DNS-setup instructions tailored to the user's
// detected registrar. For unknown / fallback cases, a generic blurb
// covers the rest. The CNAME target + the user's hostname are passed
// in so the snippets read like "create a CNAME called blog pointing
// to connect.tipote.com" rather than parameter-soup.
//
// We intentionally keep the instructions short and visual rather than
// reproducing every screen of every registrar's UI — those change too
// often. The goal is "your user knows exactly where to click", not
// "your user never opens the registrar tab".

import { useTranslations } from "next-intl";
import { ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { toast } from "sonner";
import type { RegistrarId, RegistrarInfo } from "@/lib/registrarDetect";

type Props = {
  hostname: string;
  cnameTarget: string; // e.g. "connect.tipote.com"
  registrar: RegistrarInfo;
};

// Splits "blog.alice-business.com" → { name: "blog", root: "alice-business.com" }
// so we can show "Create a CNAME called 'blog' on alice-business.com".
function splitHostname(hostname: string): { name: string; root: string } {
  const labels = hostname.split(".");
  if (labels.length <= 2) {
    return { name: "@", root: hostname };
  }
  return {
    name: labels.slice(0, -2).join("."),
    root: labels.slice(-2).join("."),
  };
}

// Registrar-specific UI labels that drift over time but rarely break
// fundamentally. Translation keys cover the verbs, this map covers
// the proper nouns ("Add Record" vs "Create Record" vs "+ Add"…).
const STEPS_BY_REGISTRAR: Partial<Record<RegistrarId, ReadonlyArray<string>>> = {
  cloudflare: [
    "registrarSteps.cloudflare.s1",
    "registrarSteps.cloudflare.s2",
    "registrarSteps.cloudflare.s3",
    "registrarSteps.cloudflare.s4",
  ],
  ovh: [
    "registrarSteps.ovh.s1",
    "registrarSteps.ovh.s2",
    "registrarSteps.ovh.s3",
    "registrarSteps.ovh.s4",
  ],
  godaddy: [
    "registrarSteps.godaddy.s1",
    "registrarSteps.godaddy.s2",
    "registrarSteps.godaddy.s3",
    "registrarSteps.godaddy.s4",
  ],
  namecheap: [
    "registrarSteps.namecheap.s1",
    "registrarSteps.namecheap.s2",
    "registrarSteps.namecheap.s3",
    "registrarSteps.namecheap.s4",
  ],
  gandi: [
    "registrarSteps.gandi.s1",
    "registrarSteps.gandi.s2",
    "registrarSteps.gandi.s3",
    "registrarSteps.gandi.s4",
  ],
  google: [
    "registrarSteps.google.s1",
    "registrarSteps.google.s2",
    "registrarSteps.google.s3",
    "registrarSteps.google.s4",
  ],
};

export function RegistrarInstructions({ hostname, cnameTarget, registrar }: Props) {
  const t = useTranslations("settings");
  const { name, root } = splitHostname(hostname);
  const stepKeys = STEPS_BY_REGISTRAR[registrar.id];

  return (
    <div className="space-y-4">
      {/* Detected-registrar header. Reassures the user that we know
          where they are and points them straight to the right console. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {t("registrarDetectedLabel")}
        </span>
        <span className="font-medium">{registrar.label}</span>
        {registrar.dnsConsoleUrl && (
          <Button asChild variant="link" size="sm" className="h-auto p-0 gap-1">
            <a
              href={registrar.dnsConsoleUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("registrarOpenConsole")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>

      {/* The actual CNAME values, copy-able. Single source of truth so
          the user can't typo our target. */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("dnsRecordToCreate")}
        </div>
        <div className="grid gap-2 sm:grid-cols-[80px_1fr_auto] items-center text-sm font-mono">
          <span className="text-muted-foreground font-sans text-xs">
            {t("dnsFieldType")}
          </span>
          <code className="bg-background rounded px-2 py-1 inline-block w-fit">
            CNAME
          </code>
          <span />

          <span className="text-muted-foreground font-sans text-xs">
            {t("dnsFieldName")}
          </span>
          <CopyableField value={name} />
          <span />

          <span className="text-muted-foreground font-sans text-xs">
            {t("dnsFieldTarget")}
          </span>
          <CopyableField value={cnameTarget} />
          <span />
        </div>
      </div>

      {/* Step-by-step. Generic fallback if we don't recognise the
          registrar — still beats "good luck". */}
      <ol className="space-y-2 text-sm list-decimal list-inside marker:text-muted-foreground">
        {stepKeys ? (
          stepKeys.map((key) => (
            <li key={key}>{t(key, { name, root, cnameTarget })}</li>
          ))
        ) : (
          <>
            <li>{t("registrarSteps.generic.s1", { root })}</li>
            <li>{t("registrarSteps.generic.s2")}</li>
            <li>{t("registrarSteps.generic.s3", { name, cnameTarget })}</li>
            <li>{t("registrarSteps.generic.s4")}</li>
          </>
        )}
      </ol>
    </div>
  );
}

function CopyableField({ value }: { value: string }) {
  const t = useTranslations("settings");
  const { copy, copied } = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copy(value);
        if (ok) toast.success(t("toastCopied"));
        else toast.error(t("toastCopyFailed"));
      }}
      className="inline-flex items-center gap-2 bg-background rounded px-2 py-1 w-fit hover:bg-accent transition-colors group"
    >
      <code className="text-sm">{value}</code>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
      )}
    </button>
  );
}
