// components/settings/legal/LegalDocGenerator.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Loader2,
} from "lucide-react";

import type { Country, DocType, LegalFormData } from "./types";
import {
  COUNTRY_LABELS,
  DEFAULT_FORM_DATA,
  DOC_TYPE_LABELS,
} from "./types";
import { generateDocument } from "./templates";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docType: DocType;
};

/* ------------------------------------------------------------------ */
/*  Wizard steps                                                       */
/* ------------------------------------------------------------------ */

const STEP_KEYS = ["country", "identity", "hosting", "activity", "payment", "data", "preview"] as const;
type StepKey = (typeof STEP_KEYS)[number];

/* ------------------------------------------------------------------ */
/*  Helper: field row                                                  */
/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {textarea ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="text-sm"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="text-sm"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PDF generation (jspdf)                                             */
/* ------------------------------------------------------------------ */

async function downloadPdf(text: string, fileName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const marginTop = 25;
  const marginBottom = 20;
  const usableWidth = pageWidth - marginX * 2;
  const lineHeight = 5.5;
  const titleLineHeight = 8;

  doc.setFont("helvetica", "normal");

  const lines = text.split("\n");
  let y = marginTop;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Detect title-like lines (ALL CAPS or starts with "ARTICLE" or numbered section)
    const isTitle =
      (line.length > 3 && line === line.toUpperCase() && /[A-ZÀ-Ü]/.test(line)) ||
      /^ARTICLE\s+\d/.test(line) ||
      /^\d+\.\s+[A-ZÀ-Ü]/.test(line);

    if (isTitle) {
      y += 3; // extra space before title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const wrapped = doc.splitTextToSize(line, usableWidth) as string[];
      for (const wl of wrapped) {
        if (y + titleLineHeight > pageHeight - marginBottom) {
          doc.addPage();
          y = marginTop;
        }
        doc.text(wl, marginX, y);
        y += titleLineHeight;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    } else if (line.trim() === "") {
      y += lineHeight * 0.6;
    } else {
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(line, usableWidth) as string[];
      for (const wl of wrapped) {
        if (y + lineHeight > pageHeight - marginBottom) {
          doc.addPage();
          y = marginTop;
        }
        doc.text(wl, marginX, y);
        y += lineHeight;
      }
    }
  }

  doc.save(fileName);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LegalDocGenerator({ open, onOpenChange, docType }: Props) {
  const t = useTranslations("legalDocGen");
  const tf = useTranslations("legalDocFields");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<LegalFormData>({ ...DEFAULT_FORM_DATA });
  const [downloading, setDownloading] = useState(false);

  const set = useCallback(
    <K extends keyof LegalFormData>(key: K, value: LegalFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const generatedText = useMemo(() => {
    if (step !== STEP_KEYS.length - 1) return "";
    return generateDocument(docType, form);
  }, [step, docType, form]);

  const handleDownload = useCallback(async () => {
    if (!generatedText) return;
    setDownloading(true);
    try {
      const fileName = `${DOC_TYPE_LABELS[docType].replace(/\s+/g, "_")}_${COUNTRY_LABELS[form.country]}.pdf`;
      await downloadPdf(generatedText, fileName);
    } finally {
      setDownloading(false);
    }
  }, [generatedText, docType, form.country]);

  const handleReset = useCallback(() => {
    setStep(0);
    setForm({ ...DEFAULT_FORM_DATA });
  }, []);

  const handleClose = useCallback(
    (v: boolean) => {
      if (!v) handleReset();
      onOpenChange(v);
    },
    [onOpenChange, handleReset],
  );

  const canNext = step < STEP_KEYS.length - 1;
  const canPrev = step > 0;

  /* ================================================================ */
  /*  Step renderers                                                   */
  /* ================================================================ */

  function renderCountry() {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold mb-1">{t("alertTitle")}</p>
              <p>{t("alertBody")}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("countryQuestion")}</Label>
          <Select
            value={form.country}
            onValueChange={(v) => set("country", v as Country)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(COUNTRY_LABELS) as [Country, string][]).map(
                ([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  function renderIdentity() {
    const c = form.country;
    return (
      <div className="space-y-3">
        <Field label={tf("identity.structureType")} value={form.structureType} onChange={(v) => set("structureType", v)} placeholder={tf("identity.structureTypePh")} />
        <Field label={tf("identity.raisonSociale")} value={form.raisonSociale} onChange={(v) => set("raisonSociale", v)} placeholder={tf("identity.raisonSocialePh")} />
        <Field label={tf("identity.nomCommercial")} value={form.nomCommercial} onChange={(v) => set("nomCommercial", v)} />
        <Field label={tf("identity.responsableName")} value={form.responsableName} onChange={(v) => set("responsableName", v)} />
        <Field label={tf("identity.responsableFunction")} value={form.responsableFunction} onChange={(v) => set("responsableFunction", v)} placeholder={tf("identity.responsableFunctionPh")} />
        <Field label={tf("identity.adresse")} value={form.adresse} onChange={(v) => set("adresse", v)} />
        <Field label={tf("identity.email")} value={form.email} onChange={(v) => set("email", v)} />
        <Field label={tf("identity.telephone")} value={form.telephone} onChange={(v) => set("telephone", v)} />
        <Field label={tf("identity.siteUrl")} value={form.siteUrl} onChange={(v) => set("siteUrl", v)} placeholder="https://monsite.com" />

        {/* France-specific */}
        {c === "france" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{tf("identity.registersFr")}</p>
            </div>
            <Field label={tf("identity.siren")} value={form.siren} onChange={(v) => set("siren", v)} />
            <Field label={tf("identity.rcsVille")} value={form.rcsVille} onChange={(v) => set("rcsVille", v)} />
            <Field label={tf("identity.rcsNumero")} value={form.rcsNumero} onChange={(v) => set("rcsNumero", v)} />
            <Field label={tf("identity.tvaIntra")} value={form.tvaIntra} onChange={(v) => set("tvaIntra", v)} />
            <Field label={tf("identity.capitalSocial")} value={form.capitalSocial} onChange={(v) => set("capitalSocial", v)} />
          </>
        )}

        {/* Belgique-specific */}
        {c === "belgique" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{tf("identity.registersBe")}</p>
            </div>
            <Field label={tf("identity.bceName")} value={form.bceName} onChange={(v) => set("bceName", v)} />
            <Field label={tf("identity.tvaBelgique")} value={form.tvaBelgique} onChange={(v) => set("tvaBelgique", v)} />
          </>
        )}

        {/* Luxembourg-specific */}
        {c === "luxembourg" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{tf("identity.registersLu")}</p>
            </div>
            <Field label={tf("identity.rcslNumero")} value={form.rcslNumero} onChange={(v) => set("rcslNumero", v)} />
            <Field label={tf("identity.tvaLux")} value={form.tvaLux} onChange={(v) => set("tvaLux", v)} />
            <Field label={tf("identity.capitalSocial")} value={form.capitalSocial} onChange={(v) => set("capitalSocial", v)} />
            <Field label={tf("identity.autorisationEtablissement")} value={form.autorisationEtablissement} onChange={(v) => set("autorisationEtablissement", v)} />
          </>
        )}

        {/* Suisse-specific */}
        {c === "suisse" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{tf("identity.registersCh")}</p>
            </div>
            <Field label={tf("identity.ideNumero")} value={form.ideNumero} onChange={(v) => set("ideNumero", v)} />
            <Field label={tf("identity.tvaSuisse")} value={form.tvaSuisse} onChange={(v) => set("tvaSuisse", v)} />
          </>
        )}

        {/* Canada-specific */}
        {c === "canada" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{tf("identity.registersCa")}</p>
            </div>
            <Field label={tf("identity.province")} value={form.province} onChange={(v) => set("province", v)} placeholder={tf("identity.provincePh")} />
            <Field label={tf("identity.bnNumero")} value={form.bnNumero} onChange={(v) => set("bnNumero", v)} />
            <Field label={tf("identity.neqNumero")} value={form.neqNumero} onChange={(v) => set("neqNumero", v)} />
          </>
        )}
      </div>
    );
  }

  function renderHosting() {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground mb-2">
          {tf("hosting.intro")}
        </p>
        <Field label={tf("hosting.nom")} value={form.hebergeurNom} onChange={(v) => set("hebergeurNom", v)} placeholder={tf("hosting.nomPh")} />
        <Field label={tf("hosting.adresse")} value={form.hebergeurAdresse} onChange={(v) => set("hebergeurAdresse", v)} />
        <Field label={tf("hosting.telephone")} value={form.hebergeurTelephone} onChange={(v) => set("hebergeurTelephone", v)} />
        <Field label={tf("hosting.url")} value={form.hebergeurUrl} onChange={(v) => set("hebergeurUrl", v)} placeholder={tf("hosting.urlPh")} />
      </div>
    );
  }

  function renderActivity() {
    return (
      <div className="space-y-3">
        <Field label={tf("activity.type")} value={form.activiteType} onChange={(v) => set("activiteType", v)} placeholder={tf("activity.typePh")} />
        <Field label={tf("activity.products")} value={form.produitsDescription} onChange={(v) => set("produitsDescription", v)} placeholder={tf("activity.productsPh")} textarea />
        <div className="space-y-1.5">
          <Label className="text-sm">{tf("activity.publicLabel")}</Label>
          <Select value={form.publicVise} onValueChange={(v) => set("publicVise", v)}>
            <SelectTrigger><SelectValue placeholder={tf("activity.choose")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="B2C">{tf("activity.b2c")}</SelectItem>
              <SelectItem value="B2B">{tf("activity.b2b")}</SelectItem>
              <SelectItem value="B2C et B2B">{tf("activity.mix")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label={tf("activity.zone")} value={form.zoneGeo} onChange={(v) => set("zoneGeo", v)} placeholder={tf("activity.zonePh")} />
      </div>
    );
  }

  function renderPayment() {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-sm">{tf("payment.modality")}</Label>
          <Select value={form.modaliteCommande} onValueChange={(v) => set("modaliteCommande", v)}>
            <SelectTrigger><SelectValue placeholder={tf("activity.choose")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Paiement en ligne sur le site">{tf("payment.online")}</SelectItem>
              <SelectItem value="Redirection vers Stripe Checkout">{tf("payment.redirect")}</SelectItem>
              <SelectItem value="Prise de rendez-vous / devis">{tf("payment.appointment")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label={tf("payment.methods")} value={form.moyensPaiement} onChange={(v) => set("moyensPaiement", v)} placeholder={tf("payment.methodsPh")} />
        <Field label={tf("payment.currency")} value={form.devise} onChange={(v) => set("devise", v)} placeholder={tf("payment.currencyPh")} />
        <Field label={tf("payment.provider")} value={form.prestatairePaiement} onChange={(v) => set("prestatairePaiement", v)} placeholder={tf("payment.providerPh")} />

        <div className="border-t pt-3 mt-3">
          <div className="flex items-center gap-3 mb-3">
            <Switch
              checked={form.produitsPhysiques}
              onCheckedChange={(v) => set("produitsPhysiques", v)}
            />
            <Label className="text-sm">{tf("payment.physicalSwitch")}</Label>
          </div>
          {form.produitsPhysiques && (
            <div className="space-y-3 pl-1">
              <Field label={tf("payment.zones")} value={form.zonesLivrees} onChange={(v) => set("zonesLivrees", v)} placeholder={tf("payment.zonesPh")} />
              <Field label={tf("payment.delays")} value={form.delaisLivraison} onChange={(v) => set("delaisLivraison", v)} placeholder={tf("payment.delaysPh")} />
              <Field label={tf("payment.fees")} value={form.fraisLivraison} onChange={(v) => set("fraisLivraison", v)} placeholder={tf("payment.feesPh")} />
            </div>
          )}
        </div>

        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{tf("payment.refundHeader")}</p>
        </div>
        <Field label={tf("payment.exclusions")} value={form.retractationExclusions} onChange={(v) => set("retractationExclusions", v)} placeholder={tf("payment.exclusionsPh")} textarea />
        <Field label={tf("payment.refundPolicy")} value={form.politiqueRemboursement} onChange={(v) => set("politiqueRemboursement", v)} placeholder={tf("payment.refundPolicyPh")} textarea />
      </div>
    );
  }

  function renderData() {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground mb-1">
          {tf("data.intro")}
        </p>
        <Field label={tf("data.collected")} value={form.donneesCollectees} onChange={(v) => set("donneesCollectees", v)} placeholder={tf("data.collectedPh")} textarea />
        <Field label={tf("data.tools")} value={form.outilsUtilises} onChange={(v) => set("outilsUtilises", v)} placeholder={tf("data.toolsPh")} textarea />
        <Field label={tf("data.purposes")} value={form.finalitesTraitement} onChange={(v) => set("finalitesTraitement", v)} placeholder={tf("data.purposesPh")} textarea />
        <Field label={tf("data.retention")} value={form.dureesConservation} onChange={(v) => set("dureesConservation", v)} placeholder={tf("data.retentionPh")} textarea />
        <Field label={tf("data.emailRgpd")} value={form.emailRgpd} onChange={(v) => set("emailRgpd", v)} placeholder={tf("data.emailRgpdPh")} />
        <Field label={tf("data.transfers")} value={form.transfertsHorsUE} onChange={(v) => set("transfertsHorsUE", v)} placeholder={tf("data.transfersPh")} textarea />

        {form.country === "canada" && (
          <Field label={tf("data.privacyOfficer")} value={form.responsableViePrivee} onChange={(v) => set("responsableViePrivee", v)} placeholder={tf("data.privacyOfficerPh")} />
        )}
      </div>
    );
  }

  function renderPreview() {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">{t("previewAlert")}</p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 max-h-[400px] overflow-y-auto">
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground">
            {generatedText}
          </pre>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleDownload} disabled={downloading} className="gap-2 flex-1">
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloading ? t("generating") : t("download")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(generatedText);
            }}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {t("copyText")}
          </Button>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  const stepRenderers = [
    renderCountry,
    renderIdentity,
    renderHosting,
    renderActivity,
    renderPayment,
    renderData,
    renderPreview,
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t("dialogTitle", { doc: DOC_TYPE_LABELS[docType] })}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEP_KEYS.map((key, i) => (
            <div key={key} className="flex items-center gap-1 flex-1">
              <div
                className={`h-1.5 rounded-full flex-1 transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {t("stepIndicator", { step: step + 1, total: STEP_KEYS.length, label: t(`steps.${STEP_KEYS[step]}` as any) })}
        </p>

        {/* Step content */}
        {stepRenderers[step]()}

        {/* Navigation */}
        {step < STEP_KEYS.length - 1 && (
          <div className="flex justify-between mt-4 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={!canPrev}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> {t("previous")}
            </Button>
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="gap-2"
            >
              {step === STEP_KEYS.length - 2 ? t("generateDoc") : t("next")}{" "}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === STEP_KEYS.length - 1 && (
          <div className="flex justify-between mt-4 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> {t("editInfo")}
            </Button>
            <Button variant="ghost" onClick={() => handleClose(false)}>
              {t("close")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
