import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, ArrowLeft, Sparkles, Loader2, Plus, Trash2 } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepGoalsProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const biggestChallenges = [
  { value: "pas d’offre claire", label: "Pas d’offre claire" },
  { value: "pas assez de trafic", label: "Pas assez de trafic" },
  { value: "pas d’idée de business", label: "Pas d’idée de business" },
  { value: "peur de ne pas être crédible", label: "Peur de ne pas être crédible" },
];

const preferredContentTypes = [
  { value: "par écrit (textes longs)", label: "Par écrit (textes longs)" },
  { value: "par écrit (textes courts)", label: "Par écrit (textes courts)" },
  { value: "par vidéo", label: "Par vidéo" },
  { value: "en live (coaching 1:1 ou de groupes)", label: "En live (coaching 1:1 ou de groupes)" },
];

const toneOptions = [
  "de manière décontractée mais professionnelle",
  "de manière provocante",
  "avec un humour décalé",
  "avec empathie",
  "avec bienveillance",
  "avec autorité",
  "avec sérieux",
  "autre : précise.",
];

export const StepGoals = ({ data, updateData, onComplete, onBack, isSubmitting }: StepGoalsProps) => {
  const toggleTone = (tone: string) => {
    const current = data.tonePreference ?? [];
    if (current.includes(tone)) {
      updateData({ tonePreference: current.filter((t) => t !== tone) });
      return;
    }
    if (current.length >= 3) return;
    updateData({ tonePreference: [...current, tone] });
  };

  const addFeedback = () => {
    updateData({ clientFeedback: [...(data.clientFeedback ?? [""]), ""] });
  };

  const updateFeedback = (idx: number, value: string) => {
    const next = [...(data.clientFeedback ?? [""])];
    next[idx] = value;
    updateData({ clientFeedback: next });
  };

  const removeFeedback = (idx: number) => {
    const next = (data.clientFeedback ?? [""]).filter((_, i) => i !== idx);
    updateData({ clientFeedback: next.length ? next : [""] });
  };

  const isValid =
    !!data.uniqueValue &&
    !!data.untappedStrength &&
    !!data.biggestChallenge &&
    !!data.successDefinition &&
    (data.clientFeedback ?? []).some((x) => x.trim().length > 0) &&
    !!data.preferredContentType &&
    (data.tonePreference ?? []).length > 0;

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Target className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Ce qui te rend unique</h2>
            <p className="text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Ces questions permettent à l'IA de créer du contenu qui te ressemble vraiment.
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-2">
            <Label>
              Qu'est-ce qui te différencie de tes concurrents ? Qu'est-ce que tu apportes que les autres n'apportent pas ? *
            </Label>
            <Textarea
              value={data.uniqueValue}
              onChange={(e) => updateData({ uniqueValue: e.target.value })}
              placeholder="Ex : ma méthode, mon expérience, mon approche..."
              className="min-h-[110px]"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Qu’est ce que tu réussis particulièrement bien ? *
            </Label>
            <Textarea
              value={data.untappedStrength}
              onChange={(e) => updateData({ untappedStrength: e.target.value })}
              placeholder="Ex : expliquer des choses compliquées simplement, créer de beaux visuels..."
              className="min-h-[110px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Quel est ton plus grand défi business en ce moment ? Une seule chose, la plus bloquante. *</Label>
            <Select value={data.biggestChallenge} onValueChange={(v) => updateData({ biggestChallenge: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne une option" />
              </SelectTrigger>
              <SelectContent>
                {biggestChallenges.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Ta définition du succès ? Quand tu te regardes dans un avenir où tu as réussi, qu’est ce que tu te dis : *
            </Label>
            <Textarea
              value={data.successDefinition}
              onChange={(e) => updateData({ successDefinition: e.target.value })}
              placeholder="Ex : je suis libre, je choisis mes clients, je me sens fier(ère)..."
              className="min-h-[110px]"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>
                Colle ici un retour client ou un message qui t'a fait plaisir (plusieurs champs possibles) *
              </Label>
              <Button onClick={addFeedback} type="button" variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>

            {(data.clientFeedback ?? [""]).map((val, idx) => (
              <Card key={idx} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">Retour {idx + 1}</div>
                  {(data.clientFeedback ?? []).length > 1 ? (
                    <Button
                      type="button"
                      onClick={() => removeFeedback(idx)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>

                <Textarea
                  value={val}
                  onChange={(e) => updateFeedback(idx, e.target.value)}
                  placeholder="Copie/colle ici un retour client..."
                  className="min-h-[90px]"
                />
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Tu préfères communiquer *</Label>
            <Select value={data.preferredContentType} onValueChange={(v) => updateData({ preferredContentType: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne une option" />
              </SelectTrigger>
              <SelectContent>
                {preferredContentTypes.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Comment préfères-tu parler à ton audience (3 choix possibles) *</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {toneOptions.map((tone) => {
                const checked = (data.tonePreference ?? []).includes(tone);
                const disabled = !checked && (data.tonePreference ?? []).length >= 3;

                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      toggleTone(tone);
                    }}
                    className={`p-4 border rounded-lg text-left hover:bg-muted/30 transition-colors ${
                      checked ? "bg-primary/10 border-primary text-primary" : ""
                    } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {tone}
                  </button>
                );
              })}
            </div>

            {(data.tonePreference ?? []).includes("autre : précise.") ? (
              <div className="space-y-2">
                <Label>Précise “autre”</Label>
                <Input
                  value={(data.tonePreference ?? []).find((t) => t.startsWith("autre :")) === "autre : précise." ? "" : ""}
                  onChange={() => {}}
                  placeholder="(si besoin tu peux préciser dans les retours clients ci-dessus)"
                  disabled
                />
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button onClick={onBack} variant="outline" size="lg" disabled={isSubmitting}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>

        <Button onClick={onComplete} disabled={!isValid || isSubmitting} size="lg">
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Configuration...
            </>
          ) : (
            "Terminer"
          )}
        </Button>
      </div>
    </div>
  );
};
