// components/settings/legal/LegalDocGenerator.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
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

const STEPS = [
  { key: "country", label: "Pays" },
  { key: "identity", label: "Identité" },
  { key: "hosting", label: "Hébergeur" },
  { key: "activity", label: "Activité" },
  { key: "payment", label: "Paiement" },
  { key: "data", label: "Données" },
  { key: "preview", label: "Apercu" },
] as const;

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
    if (step !== STEPS.length - 1) return "";
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

  const canNext = step < STEPS.length - 1;
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
              <p className="font-semibold mb-1">Information importante</p>
              <p>
                Ce générateur produit des documents types couvrant les cas les plus courants.
                Il ne remplace pas l&apos;avis d&apos;un juriste qualifié. Pour des situations spécifiques
                (santé, finance, mineurs, activités réglementées...), nous vous recommandons
                vivement de faire relire vos documents par un professionnel du droit.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Dans quel pays est enregistrée votre entreprise ?
          </Label>
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
        <Field label="Type de structure" value={form.structureType} onChange={(v) => set("structureType", v)} placeholder="Ex: SAS, SARL, Auto-entrepreneur, Sàrl, SA, SRL..." />
        <Field label="Raison sociale" value={form.raisonSociale} onChange={(v) => set("raisonSociale", v)} placeholder="Nom légal de votre entreprise" />
        <Field label="Nom commercial (si différent)" value={form.nomCommercial} onChange={(v) => set("nomCommercial", v)} />
        <Field label="Nom et prénom du responsable légal" value={form.responsableName} onChange={(v) => set("responsableName", v)} />
        <Field label="Fonction du responsable" value={form.responsableFunction} onChange={(v) => set("responsableFunction", v)} placeholder="Ex: Président, Gérant, CEO" />
        <Field label="Adresse complète du siège" value={form.adresse} onChange={(v) => set("adresse", v)} />
        <Field label="Email de contact légal" value={form.email} onChange={(v) => set("email", v)} />
        <Field label="Téléphone" value={form.telephone} onChange={(v) => set("telephone", v)} />
        <Field label="URL du site" value={form.siteUrl} onChange={(v) => set("siteUrl", v)} placeholder="https://monsite.com" />

        {/* France-specific */}
        {c === "france" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Registres — France</p>
            </div>
            <Field label="N° SIREN/SIRET" value={form.siren} onChange={(v) => set("siren", v)} />
            <Field label="Ville du RCS" value={form.rcsVille} onChange={(v) => set("rcsVille", v)} />
            <Field label="N° d'immatriculation au RCS" value={form.rcsNumero} onChange={(v) => set("rcsNumero", v)} />
            <Field label="N° TVA intracommunautaire" value={form.tvaIntra} onChange={(v) => set("tvaIntra", v)} />
            <Field label="Capital social (€)" value={form.capitalSocial} onChange={(v) => set("capitalSocial", v)} />
          </>
        )}

        {/* Belgique-specific */}
        {c === "belgique" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Registres — Belgique</p>
            </div>
            <Field label="N° d'entreprise (BCE)" value={form.bceName} onChange={(v) => set("bceName", v)} />
            <Field label="N° de TVA intracommunautaire" value={form.tvaBelgique} onChange={(v) => set("tvaBelgique", v)} />
          </>
        )}

        {/* Luxembourg-specific */}
        {c === "luxembourg" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Registres — Luxembourg</p>
            </div>
            <Field label="N° RCS Luxembourg (RCSL)" value={form.rcslNumero} onChange={(v) => set("rcslNumero", v)} />
            <Field label="N° TVA" value={form.tvaLux} onChange={(v) => set("tvaLux", v)} />
            <Field label="Capital social (€)" value={form.capitalSocial} onChange={(v) => set("capitalSocial", v)} />
            <Field label="Autorisation d'établissement (si applicable)" value={form.autorisationEtablissement} onChange={(v) => set("autorisationEtablissement", v)} />
          </>
        )}

        {/* Suisse-specific */}
        {c === "suisse" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Registres — Suisse</p>
            </div>
            <Field label="N° IDE" value={form.ideNumero} onChange={(v) => set("ideNumero", v)} />
            <Field label="N° TVA (si assujetti)" value={form.tvaSuisse} onChange={(v) => set("tvaSuisse", v)} />
          </>
        )}

        {/* Canada-specific */}
        {c === "canada" && (
          <>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Registres — Canada</p>
            </div>
            <Field label="Province principale d'exercice" value={form.province} onChange={(v) => set("province", v)} placeholder="Ex: Québec, Ontario, Colombie-Britannique..." />
            <Field label="N° d'entreprise (BN fédéral)" value={form.bnNumero} onChange={(v) => set("bnNumero", v)} />
            <Field label="NEQ (Québec uniquement)" value={form.neqNumero} onChange={(v) => set("neqNumero", v)} />
          </>
        )}
      </div>
    );
  }

  function renderHosting() {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground mb-2">
          Informations sur l&apos;hébergeur de votre site web (obligatoire pour les mentions légales).
        </p>
        <Field label="Nom / Raison sociale de l'hébergeur" value={form.hebergeurNom} onChange={(v) => set("hebergeurNom", v)} placeholder="Ex: OVH, Vercel, AWS, Infomaniak..." />
        <Field label="Adresse complète" value={form.hebergeurAdresse} onChange={(v) => set("hebergeurAdresse", v)} />
        <Field label="Téléphone" value={form.hebergeurTelephone} onChange={(v) => set("hebergeurTelephone", v)} />
        <Field label="Site web" value={form.hebergeurUrl} onChange={(v) => set("hebergeurUrl", v)} placeholder="https://www.ovhcloud.com" />
      </div>
    );
  }

  function renderActivity() {
    return (
      <div className="space-y-3">
        <Field label="Type d'activité principale" value={form.activiteType} onChange={(v) => set("activiteType", v)} placeholder="Coach, formation en ligne, e-commerce, SaaS, agence..." />
        <Field label="Description des produits/services vendus" value={form.produitsDescription} onChange={(v) => set("produitsDescription", v)} placeholder="Formations en ligne sur le marketing digital, coaching individuel..." textarea />
        <div className="space-y-1.5">
          <Label className="text-sm">Public visé</Label>
          <Select value={form.publicVise} onValueChange={(v) => set("publicVise", v)}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="B2C">B2C (particuliers)</SelectItem>
              <SelectItem value="B2B">B2B (professionnels)</SelectItem>
              <SelectItem value="B2C et B2B">Mix B2C + B2B</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="Zone(s) géographique(s) visée(s)" value={form.zoneGeo} onChange={(v) => set("zoneGeo", v)} placeholder="France, UE, monde entier..." />
      </div>
    );
  }

  function renderPayment() {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-sm">Modalité de commande</Label>
          <Select value={form.modaliteCommande} onValueChange={(v) => set("modaliteCommande", v)}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Paiement en ligne sur le site">Paiement en ligne sur le site</SelectItem>
              <SelectItem value="Redirection vers Stripe Checkout">Redirection vers plateforme (Stripe, Shopify...)</SelectItem>
              <SelectItem value="Prise de rendez-vous / devis">Prise de rendez-vous / devis</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="Moyens de paiement acceptés" value={form.moyensPaiement} onChange={(v) => set("moyensPaiement", v)} placeholder="Carte bancaire, PayPal, virement..." />
        <Field label="Devise" value={form.devise} onChange={(v) => set("devise", v)} placeholder="EUR, CHF, CAD..." />
        <Field label="Prestataire de paiement" value={form.prestatairePaiement} onChange={(v) => set("prestatairePaiement", v)} placeholder="Stripe, PayPal, Systeme.io..." />

        <div className="border-t pt-3 mt-3">
          <div className="flex items-center gap-3 mb-3">
            <Switch
              checked={form.produitsPhysiques}
              onCheckedChange={(v) => set("produitsPhysiques", v)}
            />
            <Label className="text-sm">Je vends des produits physiques (livraison)</Label>
          </div>
          {form.produitsPhysiques && (
            <div className="space-y-3 pl-1">
              <Field label="Zones livrées" value={form.zonesLivrees} onChange={(v) => set("zonesLivrees", v)} placeholder="France métropolitaine, UE..." />
              <Field label="Délais moyens de livraison" value={form.delaisLivraison} onChange={(v) => set("delaisLivraison", v)} placeholder="3-5 jours ouvrés" />
              <Field label="Frais de livraison" value={form.fraisLivraison} onChange={(v) => set("fraisLivraison", v)} placeholder="Offerts dès 50€, sinon 4,90€" />
            </div>
          )}
        </div>

        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Rétractation & remboursement</p>
        </div>
        <Field label="Exclusions au droit de rétractation (si applicables)" value={form.retractationExclusions} onChange={(v) => set("retractationExclusions", v)} placeholder="Contenu numérique immédiatement accessible, prestation déjà exécutée..." textarea />
        <Field label="Politique de remboursement" value={form.politiqueRemboursement} onChange={(v) => set("politiqueRemboursement", v)} placeholder="Remboursement intégral sous 14 jours, hors contenus numériques déjà accédés." textarea />
      </div>
    );
  }

  function renderData() {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground mb-1">
          Pour la politique de confidentialité et les mentions relatives aux données personnelles.
        </p>
        <Field label="Données collectées" value={form.donneesCollectees} onChange={(v) => set("donneesCollectees", v)} placeholder="Nom, prénom, email, téléphone, adresse, données de paiement (via prestataire), cookies..." textarea />
        <Field label="Outils et sous-traitants utilisés" value={form.outilsUtilises} onChange={(v) => set("outilsUtilises", v)} placeholder="Google Analytics, Meta Pixel, Mailchimp, Stripe, Brevo..." textarea />
        <Field label="Finalités du traitement" value={form.finalitesTraitement} onChange={(v) => set("finalitesTraitement", v)} placeholder="Newsletter, prospection, stats, gestion de compte, facturation..." textarea />
        <Field label="Durées de conservation" value={form.dureesConservation} onChange={(v) => set("dureesConservation", v)} placeholder="Prospects: 3 ans, Clients: 10 ans (comptabilité), Cookies: 13 mois" textarea />
        <Field label="Email de contact RGPD / vie privée" value={form.emailRgpd} onChange={(v) => set("emailRgpd", v)} placeholder="rgpd@monsite.com (si différent de l'email principal)" />
        <Field label="Transferts de données hors UE / hors pays" value={form.transfertsHorsUE} onChange={(v) => set("transfertsHorsUE", v)} placeholder="USA (Google Analytics, Stripe) avec clauses contractuelles types..." textarea />

        {form.country === "canada" && (
          <Field label="Responsable de la vie privée (Loi 25)" value={form.responsableViePrivee} onChange={(v) => set("responsableViePrivee", v)} placeholder="Nom du responsable de la protection des renseignements personnels" />
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
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Ce document est un modèle type fourni à titre informatif. Il ne constitue pas un avis juridique.
              Pour les situations sectorielles (santé, finance, mineurs...) ou pour plus de sécurité,
              nous vous invitons à faire relire ce document par un professionnel du droit certifié.
            </p>
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
            {downloading ? "Génération..." : "Télécharger en PDF"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(generatedText);
            }}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            Copier le texte
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
            Générer : {DOC_TYPE_LABELS[docType]}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <div
                className={`h-1.5 rounded-full flex-1 transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Étape {step + 1}/{STEPS.length} — {STEPS[step].label}
        </p>

        {/* Step content */}
        {stepRenderers[step]()}

        {/* Navigation */}
        {step < STEPS.length - 1 && (
          <div className="flex justify-between mt-4 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={!canPrev}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Précédent
            </Button>
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="gap-2"
            >
              {step === STEPS.length - 2 ? "Générer le document" : "Suivant"}{" "}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === STEPS.length - 1 && (
          <div className="flex justify-between mt-4 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Modifier mes infos
            </Button>
            <Button variant="ghost" onClick={() => handleClose(false)}>
              Fermer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
