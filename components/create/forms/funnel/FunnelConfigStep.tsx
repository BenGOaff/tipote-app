import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Wand2, Coins, ImageIcon, Link2, Sparkles, Trash2 } from "lucide-react";
import { type SystemeTemplate } from "@/data/systemeTemplates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FunnelOfferOption = { id: string; name: string };

// Schema-driven user field (from /api/templates/schema)
export type UserField = {
  key: string;
  kind: "scalar" | "array_scalar" | "array_object";
  label: string;
  description?: string;
  source: "user" | "user_or_ai";
  fallback: "generate" | "remove" | "placeholder" | "empty";
  inputType: "text" | "textarea" | "image_url" | "url" | "email" | "select";
  required: boolean;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  subFields?: Array<{ key: string; maxLength?: number; description?: string }>;
};

interface FunnelConfigStepProps {
  mode: "visual" | "text_only";
  selectedTemplate: SystemeTemplate | null;

  funnelPageType: "capture" | "sales";
  setFunnelPageType: (type: "capture" | "sales") => void;

  // Offer linking (existing offers)
  offers: FunnelOfferOption[];
  offerChoice: "existing" | "scratch";
  setOfferChoice: (v: "existing" | "scratch") => void;
  selectedOfferId: string;
  setSelectedOfferId: (v: string) => void;

  // Manual offer fields (when scratch)
  offerName: string;
  setOfferName: (v: string) => void;
  offerPromise: string;
  setOfferPromise: (v: string) => void;
  offerTarget: string;
  setOfferTarget: (v: string) => void;
  offerPrice: string;
  setOfferPrice: (v: string) => void;

  urgency: string;
  setUrgency: (v: string) => void;
  guarantee: string;
  setGuarantee: (v: string) => void;

  // Schema-driven template fields
  templateUserFields: UserField[];
  templateFieldValues: Record<string, string>;
  setTemplateFieldValue: (key: string, value: string) => void;
  templateFieldChoices: Record<string, "user" | "generate" | "remove">;
  setTemplateFieldChoice: (key: string, choice: "user" | "generate" | "remove") => void;
  isLoadingSchema: boolean;

  isGenerating: boolean;
  onGenerate: () => void;
  onBack: () => void;
  creditCost: number;
}

// ─── Sub-components ──────────────────────────────────────────────

function FieldChoiceToggle({
  field,
  choice,
  onChoiceChange,
}: {
  field: UserField;
  choice: "user" | "generate" | "remove";
  onChoiceChange: (c: "user" | "generate" | "remove") => void;
}) {
  if (field.source !== "user_or_ai") return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => onChoiceChange("user")}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
          choice === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        Je fournis
      </button>
      <button
        type="button"
        onClick={() => onChoiceChange("generate")}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
          choice === "generate"
            ? "bg-blue-600 text-white"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        <Sparkles className="h-3 w-3" />
        IA génère
      </button>
      {field.fallback === "remove" && (
        <button
          type="button"
          onClick={() => onChoiceChange("remove")}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            choice === "remove"
              ? "bg-red-600 text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Trash2 className="h-3 w-3" />
          Supprimer
        </button>
      )}
    </div>
  );
}

function SchemaFieldInput({
  field,
  value,
  onChange,
  choice,
  onChoiceChange,
}: {
  field: UserField;
  value: string;
  onChange: (v: string) => void;
  choice: "user" | "generate" | "remove";
  onChoiceChange: (c: "user" | "generate" | "remove") => void;
}) {
  const isDisabled = choice === "generate" || choice === "remove";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5">
          {field.inputType === "image_url" && <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
          {field.inputType === "url" && <Link2 className="h-3.5 w-3.5 text-muted-foreground" />}
          {field.label}
          {field.required && field.source === "user" && <span className="text-red-500">*</span>}
        </Label>
        <FieldChoiceToggle field={field} choice={choice} onChoiceChange={onChoiceChange} />
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}

      {choice === "remove" ? (
        <div className="rounded-md border border-dashed border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">
          Cette section sera supprimée du template.
        </div>
      ) : choice === "generate" ? (
        <div className="rounded-md border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-600">
          L'IA générera ce contenu automatiquement.
        </div>
      ) : field.inputType === "textarea" || field.kind === "array_scalar" || field.kind === "array_object" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getPlaceholder(field)}
          className="min-h-[80px]"
          disabled={isDisabled}
        />
      ) : (
        <Input
          type={field.inputType === "email" ? "email" : field.inputType === "url" || field.inputType === "image_url" ? "url" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getPlaceholder(field)}
          disabled={isDisabled}
        />
      )}
    </div>
  );
}

function getPlaceholder(field: UserField): string {
  if (field.inputType === "image_url") return "https://... (URL de l'image)";
  if (field.inputType === "url") return "https://...";
  if (field.inputType === "email") return "contact@votresite.com";
  if (field.kind === "array_object" && field.subFields?.length) {
    const example = field.subFields.map((sf) => sf.key.replace(/_/g, " ")).join(", ");
    return `1 par ligne (${example})`;
  }
  if (field.kind === "array_scalar") return "1 élément par ligne";
  return `ex: ${field.label}`;
}

// ─── Main component ──────────────────────────────────────────────

export function FunnelConfigStep({
  mode,
  selectedTemplate,
  funnelPageType,
  setFunnelPageType,

  offers,
  offerChoice,
  setOfferChoice,
  selectedOfferId,
  setSelectedOfferId,

  offerName,
  setOfferName,
  offerPromise,
  setOfferPromise,
  offerTarget,
  setOfferTarget,
  offerPrice,
  setOfferPrice,

  urgency,
  setUrgency,
  guarantee,
  setGuarantee,

  templateUserFields,
  templateFieldValues,
  setTemplateFieldValue,
  templateFieldChoices,
  setTemplateFieldChoice,
  isLoadingSchema,

  isGenerating,
  onGenerate,
  onBack,
  creditCost,
}: FunnelConfigStepProps) {
  const showVisualExtras = mode === "visual";

  // Group template fields by category
  const legalFields = templateUserFields.filter(
    (f) => (f.key.includes("legal") || f.key.includes("cgv")) && f.inputType === "url"
  );
  const optionalSections = templateUserFields.filter(
    (f) => f.source === "user_or_ai" && (f.fallback === "remove" || f.fallback === "generate") && f.kind !== "scalar"
  );
  const mainFields = templateUserFields.filter(
    (f) => !legalFields.includes(f) && !optionalSections.includes(f)
  );

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Retour
        </Button>
        <div>
          <h3 className="text-lg font-semibold">Décris ton offre</h3>
          <p className="text-sm text-muted-foreground">
            L'IA utilisera ces informations pour personnaliser le contenu.
          </p>
        </div>
      </div>

      {/* Template reminder (visual mode) */}
      {showVisualExtras && selectedTemplate && (
        <Card className="p-3 flex items-center gap-3 bg-muted/50">
          <div className="w-16 h-11 rounded overflow-hidden bg-muted border flex-shrink-0">
            <iframe
              src={`/api/templates/file/${selectedTemplate.layoutPath || `src/templates/${selectedTemplate.type === "sales" ? "vente" : "capture"}/${selectedTemplate.id}/layout.html`}`}
              title={`mini-${selectedTemplate.id}`}
              className="w-[300%] h-[300%] scale-[0.33] origin-top-left pointer-events-none"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{selectedTemplate.name}</p>
            <Badge variant="outline" className="text-[10px]">
              {selectedTemplate.type === "capture" ? "Page de capture" : "Page de vente"}
            </Badge>
          </div>
        </Card>
      )}

      {/* Page type selector (text_only mode only) */}
      {mode === "text_only" && (
        <div className="space-y-2">
          <Label>Type de page</Label>
          <div className="flex gap-2">
            <Button
              variant={funnelPageType === "capture" ? "default" : "outline"}
              size="sm"
              onClick={() => setFunnelPageType("capture")}
            >
              Page de capture
            </Button>
            <Button
              variant={funnelPageType === "sales" ? "default" : "outline"}
              size="sm"
              onClick={() => setFunnelPageType("sales")}
            >
              Page de vente
            </Button>
          </div>
        </div>
      )}

      {/* Offer source choice */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={offerChoice === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setOfferChoice("existing")}
            disabled={offers.length === 0}
          >
            Offre existante
          </Button>
          <Button
            type="button"
            variant={offerChoice === "scratch" ? "default" : "outline"}
            size="sm"
            onClick={() => setOfferChoice("scratch")}
          >
            À partir de zéro
          </Button>
        </div>

        {offerChoice === "existing" ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Choisis une offre, tu n'auras pas à tout re-renseigner.
            </Label>
            <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
              <SelectTrigger>
                <SelectValue placeholder={offers.length ? "Sélectionne une offre" : "Aucune offre disponible"} />
              </SelectTrigger>
              <SelectContent>
                {offers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Ton offre *</Label>
              <Textarea
                placeholder="Ex: Formation Instagram pour coachs sportifs – 297€ – Inclut 6 modules vidéo, des templates et un groupe privé…"
                value={offerPromise}
                onChange={(e) => setOfferPromise(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Décris ton offre ou colle une description existante. Plus tu donnes de détails, meilleur sera le résultat.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom de l'offre</Label>
                <Input
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  placeholder="ex: Plan d'action 90 jours"
                />
              </div>
              <div className="space-y-2">
                <Label>Cible</Label>
                <Input
                  value={offerTarget}
                  onChange={(e) => setOfferTarget(e.target.value)}
                  placeholder="ex: Coachs / freelances..."
                />
              </div>
              <div className="space-y-2">
                <Label>Prix</Label>
                <Input
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  placeholder="ex: 49€ / 490€ / 1997€"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Urgency & guarantee */}
      <div className="space-y-4 border-t pt-4">
        <p className="text-sm font-medium text-muted-foreground">
          Angles de persuasion (optionnel)
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Urgence</Label>
            <Input
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              placeholder="ex: Offre valable jusqu'à dimanche"
            />
          </div>
          <div className="space-y-2">
            <Label>Garantie</Label>
            <Input
              value={guarantee}
              onChange={(e) => setGuarantee(e.target.value)}
              placeholder="ex: Satisfait ou remboursé 14 jours"
            />
          </div>
        </div>
      </div>

      {/* Schema-driven template fields (visual mode only) */}
      {showVisualExtras && !isLoadingSchema && templateUserFields.length > 0 && (
        <div className="space-y-4 border-t pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            Personnalisation du template (optionnel)
          </p>

          {/* Main user fields (identity, images, etc.) */}
          {mainFields.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ImageIcon className="h-4 w-4" />
                Ce dont le template a besoin
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {mainFields
                  .filter((f) => f.kind === "scalar" && f.inputType !== "textarea")
                  .map((field) => (
                    <SchemaFieldInput
                      key={field.key}
                      field={field}
                      value={templateFieldValues[field.key] || ""}
                      onChange={(v) => setTemplateFieldValue(field.key, v)}
                      choice={templateFieldChoices[field.key] || (field.source === "user" ? "user" : "generate")}
                      onChoiceChange={(c) => setTemplateFieldChoice(field.key, c)}
                    />
                  ))}
              </div>

              {/* Full-width fields (textareas, arrays) */}
              {mainFields
                .filter((f) => f.kind !== "scalar" || f.inputType === "textarea")
                .map((field) => (
                  <SchemaFieldInput
                    key={field.key}
                    field={field}
                    value={templateFieldValues[field.key] || ""}
                    onChange={(v) => setTemplateFieldValue(field.key, v)}
                    choice={templateFieldChoices[field.key] || (field.source === "user" ? "user" : "generate")}
                    onChoiceChange={(c) => setTemplateFieldChoice(field.key, c)}
                  />
                ))}
            </div>
          )}

          {/* Optional sections (testimonials, etc.) */}
          {optionalSections.length > 0 && (
            <div className="space-y-4">
              <Separator />
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4" />
                Sections optionnelles
              </div>
              <p className="text-xs text-muted-foreground">
                Fournis tes propres données, laisse l'IA générer, ou supprime la section.
              </p>

              {optionalSections.map((field) => (
                <SchemaFieldInput
                  key={field.key}
                  field={field}
                  value={templateFieldValues[field.key] || ""}
                  onChange={(v) => setTemplateFieldValue(field.key, v)}
                  choice={templateFieldChoices[field.key] || "generate"}
                  onChoiceChange={(c) => setTemplateFieldChoice(field.key, c)}
                />
              ))}
            </div>
          )}

          {/* Legal links */}
          {legalFields.length > 0 && (
            <div className="space-y-4">
              <Separator />
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Link2 className="h-4 w-4" />
                Liens légaux
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {legalFields.map((field) => (
                  <SchemaFieldInput
                    key={field.key}
                    field={field}
                    value={templateFieldValues[field.key] || ""}
                    onChange={(v) => setTemplateFieldValue(field.key, v)}
                    choice="user"
                    onChoiceChange={() => {}}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showVisualExtras && isLoadingSchema && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des champs du template...
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex-1"
          size="lg"
        >
          {isGenerating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Génération en cours...</>
          ) : (
            <><Wand2 className="w-4 h-4 mr-2" />Générer {mode === "visual" ? "la page" : "le copywriting"}</>
          )}
        </Button>
        <Badge variant="outline" className="gap-1 whitespace-nowrap py-2">
          <Coins className="w-3.5 h-3.5" />
          {creditCost} crédits
        </Badge>
      </div>
    </div>
  );
}