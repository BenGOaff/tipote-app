"use client";

// PopquizAppearanceForm — bloc d'édition de l'apparence de la page
// publique d'un popquiz. Partagé entre PopquizNewClient et
// PopquizEditClient pour ne pas dupliquer la UI.
//
// Note 2026-05-09 : titre / sous-titre ont été retirés de ce form,
// ils sont maintenant éditables INLINE dans la preview à droite
// (clic pour éditer, comme dans l'éditeur de quiz). Le form ne gère
// donc plus que fond / bordure / ombre / bouton play / branding.
//
// Toutes les valeurs sont contrôlées par le parent (controlled
// component) — le form ne gère pas la persistance, juste la saisie.

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";

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
            et l&apos;embed iframe. Le titre et le sous-titre sont
            éditables directement dans l&apos;aperçu à droite (clique
            pour modifier).
          </p>
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
                <ColorSwatchPicker
                  value={props.bgColor}
                  onChange={props.setBgColor}
                  label={props.bgStyle === "gradient" ? "Couleur 1 du fond" : "Couleur du fond"}
                />
              </div>
              {props.bgStyle === "gradient" ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Couleur 2</Label>
                  <ColorSwatchPicker
                    value={props.bgColor2}
                    onChange={props.setBgColor2}
                    label="Couleur 2 du fond"
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
                <ColorSwatchPicker
                  value={props.borderColor}
                  onChange={props.setBorderColor}
                  label="Couleur de la bordure"
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
              <ColorSwatchPicker
                value={props.playButtonColor || "#ffffff"}
                onChange={props.setPlayButtonColor}
                label="Couleur du bouton play"
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
