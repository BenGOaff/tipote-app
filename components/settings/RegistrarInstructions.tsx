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
import { enregistrementPour } from "@/lib/dns/enregistrement";

type Props = {
  hostname: string;
  cnameTarget: string; // e.g. "connect.tipote.com"
  ipTarget: string; // e.g. "82.25.115.166", la seule voie à la racine
  registrar: RegistrarInfo;
};

// LE NOM DU CHAMP EST CELUI QU'IL VOIT À L'ÉCRAN (Béné, 29 août 2026).
//
// "Sur OVH c'est différent, il faut mettre sous domaine + cible, et pas
// type nom cible, sinon mes users pas dégourdis sont paumés."
//
// Elle a raison, et c'est vérifiable sur sa capture : le formulaire OVH
// intitule ses champs "Sous-domaine" et "Cible (nom d'hôte)". Quelqu'un
// qui cherche un champ "Nom" ne le trouve pas, et conclut qu'il n'est
// pas au bon endroit. On affiche donc le mot de SON hébergeur quand on
// le connaît, et le mot générique sinon.
const CHAMP_NOM_PAR_REGISTRAR: Partial<Record<RegistrarId, string>> = {
  ovh: "dnsFieldNameSubdomain",
};

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

export function RegistrarInstructions({
  hostname,
  cnameTarget,
  ipTarget,
  registrar,
}: Props) {
  const t = useTranslations("settings");
  // La décision vit dans lib/dns/enregistrement.ts : à la RACINE d'un
  // domaine, un CNAME est refusé par l'hébergeur, et le contrôle
  // serveur accepte déjà l'enregistrement A. Recalculer ça ici ferait
  // mentir l'écran, comme quatre fois avant lui.
  const dns = enregistrementPour(hostname, { cname: cnameTarget, ip: ipTarget });
  const name = dns.nom;
  const root = dns.racine;
  const stepKeys = dns.apex ? undefined : STEPS_BY_REGISTRAR[registrar.id];
  const labelNom = t(CHAMP_NOM_PAR_REGISTRAR[registrar.id] ?? "dnsFieldName");

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
            {dns.forme === "a" ? "A" : "CNAME"}
          </code>
          <span />

          <span className="text-muted-foreground font-sans text-xs">
            {labelNom}
          </span>
          <CopyableField value={name} />
          <span />

          <span className="text-muted-foreground font-sans text-xs">
            {t("dnsFieldTarget")}
          </span>
          <CopyableField value={dns.cible} />
          <span />
        </div>
      </div>

      {/* À LA RACINE, ON DIT POURQUOI CE N'EST PAS UN CNAME.
          Sans cette phrase, quelqu'un qui a lu ailleurs qu'il faut un
          CNAME croit qu'on s'est trompé, et va se battre avec son
          hébergeur qui refuse. Et on propose le sous-domaine, qui est
          la MEILLEURE configuration : un CNAME désigne notre hôte par
          son nom, donc il reste juste le jour où le serveur change
          d'adresse. */}
      {dns.apex && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/20">
          <p>{t("dnsApexWhy")}</p>
          {dns.suggestion && (
            <p className="mt-2">
              {t("dnsApexPrefer", { suggestion: dns.suggestion })}
            </p>
          )}
        </div>
      )}

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
            <li>
              {t(dns.apex ? "registrarSteps.generic.s3Apex" : "registrarSteps.generic.s3", {
                name,
                cnameTarget: dns.cible,
              })}
            </li>
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
