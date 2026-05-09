"use client";

// PopquizAppearanceForm — bloc d'édition de l'apparence de la page
// publique d'un popquiz. Partagé entre PopquizNewClient et
// PopquizEditClient pour ne pas dupliquer la UI.
//
// Toutes les valeurs sont contrôlées par le parent (controlled
// component) — le form ne gère pas la persistance, juste la saisie.
// Le parent (qu'il s'agisse de la page de création ou d'édition) est
// responsable d'envoyer ces valeurs à l'API.

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BgStyle = "transparent" | "solid" | "gradient";
export type ShadowIntensity = "none" | "soft" | "medium" | "strong";
export type PlayButtonShape = "circle" | "rounded" | "square";

export interface AppearanceValues {
  displayTitle: string;
  displaySubtitle: string;
  bgStyle: BgStyle;
  bgColor: string;
  bgColor2: string;
  borderWidth: number;
  borderColor: string;
  shadowIntensity: ShadowIntensity;
  playButtonColor: string;
  playButtonShape: PlayButtonShape;
  showCreatorBranding: boolean;
}

export interface AppearanceSetters {
  setDisplayTitle: (v: string) => void;
  setDisplaySubtitle: (v: string) => void;
  setBgStyle: (v: BgStyle) => void;
  setBgColor: (v: string) => void;
  setBgColor2: (v: string) => void;
  setBorderWidth: (v: number) => void;
  setBorderColor: (v: string) => void;
  setShadowIntensity: (v: ShadowIntensity) => void;
  setPlayButtonColor: (v: string) => void;
  setPlayButtonShape: (v: PlayButtonShape) => void;
  setShowCreatorBranding: (v: boolean) => void;
}

interface Props extends AppearanceValues, AppearanceSetters {
  /** Préfixe pour les ids HTML — évite les collisions si 2 instances
   *  cohabitent sur la même page. */
  idPrefix?: string;
}

export function PopquizAppearanceForm(props: Props) {
  const id = props.idPrefix ?? "appear";

  return (
    <Card>
      <CardContent className="py-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold">Apparence de la page publique</h2>
          <p className="text-xs text-muted-foreground">
            Pour le lien direct <code className="px-1 bg-muted rounded">/pq/...</code>{" "}
            et l&apos;embed iframe. Tout est optionnel — sans config,
            la page affiche juste la vidéo proprement.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-display-title`}>
              Titre affiché{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (lien direct uniquement)
              </span>
            </Label>
            <Input
              id={`${id}-display-title`}
              value={props.displayTitle}
              onChange={(e) => props.setDisplayTitle(e.target.value)}
              placeholder="Ex : La méthode pour..."
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-display-subtitle`}>
              Sous-titre{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (lien direct uniquement)
              </span>
            </Label>
            <Input
              id={`${id}-display-subtitle`}
              value={props.displaySubtitle}
              onChange={(e) => props.setDisplaySubtitle(e.target.value)}
              placeholder="Ex : Découvre comment en 12 minutes"
              maxLength={400}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            Fond de la page{" "}
            <span className="text-muted-foreground font-normal text-xs">
              (lien direct uniquement)
            </span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "transparent", label: "Aucun" },
                { value: "solid", label: "Couleur unie" },
                { value: "gradient", label: "Dégradé" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => props.setBgStyle(opt.value)}
                className={`text-xs rounded-md border px-3 py-1.5 transition ${
                  props.bgStyle === opt.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {props.bgStyle !== "transparent" ? (
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <div className="flex items-center gap-2">
                <Label className="text-xs">
                  {props.bgStyle === "gradient" ? "Couleur 1" : "Couleur"}
                </Label>
                <input
                  type="color"
                  value={props.bgColor}
                  onChange={(e) => props.setBgColor(e.target.value)}
                  className="size-9 rounded border cursor-pointer"
                />
              </div>
              {props.bgStyle === "gradient" ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Couleur 2</Label>
                  <input
                    type="color"
                    value={props.bgColor2}
                    onChange={(e) => props.setBgColor2(e.target.value)}
                    className="size-9 rounded border cursor-pointer"
                  />
                </div>
              ) : null}
              <div
                className="h-9 flex-1 min-w-[120px] rounded border"
                style={{
                  background:
                    props.bgStyle === "gradient"
                      ? `linear-gradient(135deg, ${props.bgColor}, ${props.bgColor2})`
                      : props.bgColor,
                }}
                aria-label="Aperçu du fond"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>Bordure autour de la vidéo</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Épaisseur</Label>
              <select
                value={props.borderWidth}
                onChange={(e) => props.setBorderWidth(parseInt(e.target.value, 10))}
                className="rounded border bg-background px-2 py-1 text-xs"
              >
                <option value="0">Aucune</option>
                <option value="1">1 px (fine)</option>
                <option value="2">2 px</option>
                <option value="4">4 px</option>
                <option value="8">8 px</option>
                <option value="12">12 px (épaisse)</option>
              </select>
            </div>
            {props.borderWidth > 0 ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Couleur</Label>
                <input
                  type="color"
                  value={props.borderColor}
                  onChange={(e) => props.setBorderColor(e.target.value)}
                  className="size-9 rounded border cursor-pointer"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Ombre portée</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "none", label: "Aucune" },
                { value: "soft", label: "Douce" },
                { value: "medium", label: "Moyenne" },
                { value: "strong", label: "Forte" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => props.setShadowIntensity(opt.value)}
                className={`text-xs rounded-md border px-3 py-1.5 transition ${
                  props.shadowIntensity === opt.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Bouton play (overlay vidéo)</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Forme</Label>
              <div className="flex gap-1">
                {(
                  [
                    { value: "circle", label: "Rond" },
                    { value: "rounded", label: "Arrondi" },
                    { value: "square", label: "Carré" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => props.setPlayButtonShape(opt.value)}
                    className={`text-xs rounded-md border px-2 py-1 transition ${
                      props.playButtonShape === opt.value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Couleur (optionnel)</Label>
              <input
                type="color"
                value={props.playButtonColor || "#ffffff"}
                onChange={(e) => props.setPlayButtonColor(e.target.value)}
                className="size-9 rounded border cursor-pointer"
              />
              {props.playButtonColor ? (
                <button
                  type="button"
                  onClick={() => props.setPlayButtonColor("")}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  réinitialiser
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t">
          <input
            type="checkbox"
            id={`${id}-show-creator-branding`}
            checked={props.showCreatorBranding}
            onChange={(e) => props.setShowCreatorBranding(e.target.checked)}
            className="size-4 rounded"
          />
          <Label
            htmlFor={`${id}-show-creator-branding`}
            className="text-sm cursor-pointer"
          >
            Afficher mon logo et lien site sur la page publique
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
