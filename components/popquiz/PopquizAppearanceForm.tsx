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

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import { UserPalettePicker, type PaletteList } from "@/components/editor/UserPalettePicker";

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
  /** Palettes utilisateur (charte centralisée) — surfacées dans chaque
   *  ColorSwatchPicker + ligne récap en haut du form. */
  palettes?: PaletteList;
  onChangePalettes?: (next: PaletteList) => void | Promise<void>;
  userPalettesLabel?: string;
}

export function PopquizAppearanceForm(props: Props) {
  const t = useTranslations("popquizAppearance");
  const id = props.idPrefix ?? "appear";
  const palettes = props.palettes ?? [];
  const userPalettesLabel = props.userPalettesLabel;

  return (
    <Card>
      <CardContent className="py-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold">{t("sectionTitle")}</h2>
          <p className="text-xs text-muted-foreground">
            {t.rich("sectionDescription", {
              code: (chunks) => (
                <code className="px-1 bg-muted rounded">{chunks}</code>
              ),
            })}
          </p>
        </div>
        {/* Palettes utilisateur — résumé en haut du form. Le clic sur
            un swatch applique la couleur au fond (la plus courante des
            modifs d'apparence popquiz). Le manage-dialog reste dispo
            via le menu déroulant. */}
        {props.onChangePalettes && (
          <UserPalettePicker
            currentColor={props.bgColor}
            onPick={props.setBgColor}
            palettes={palettes}
            onChangePalettes={props.onChangePalettes}
          />
        )}

        <div className="space-y-2">
          <Label>
            {t("bgLabel")}{" "}
            <span className="text-muted-foreground font-normal text-xs">
              {t("bgLabelSuffix")}
            </span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "transparent", label: t("bgStyleNone") },
                { value: "solid", label: t("bgStyleSolid") },
                { value: "gradient", label: t("bgStyleGradient") },
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
                  {props.bgStyle === "gradient" ? t("color1") : t("color")}
                </Label>
                <ColorSwatchPicker
                  value={props.bgColor}
                  onChange={props.setBgColor}
                  label={props.bgStyle === "gradient" ? t("color1BgLabel") : t("colorBgLabel")}
                  userPalettes={palettes}
                  userPalettesLabel={userPalettesLabel}
                />
              </div>
              {props.bgStyle === "gradient" ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{t("color2")}</Label>
                  <ColorSwatchPicker
                    value={props.bgColor2}
                    onChange={props.setBgColor2}
                    label={t("color2BgLabel")}
                    userPalettes={palettes}
                    userPalettesLabel={userPalettesLabel}
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
                aria-label={t("bgPreviewAria")}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>{t("borderLabel")}</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs">{t("borderThickness")}</Label>
              <select
                value={props.borderWidth}
                onChange={(e) => props.setBorderWidth(parseInt(e.target.value, 10))}
                className="rounded border bg-background px-2 py-1 text-xs"
              >
                <option value="0">{t("borderNone")}</option>
                <option value="1">{t("border1px")}</option>
                <option value="2">{t("border2px")}</option>
                <option value="4">{t("border4px")}</option>
                <option value="8">{t("border8px")}</option>
                <option value="12">{t("border12px")}</option>
              </select>
            </div>
            {props.borderWidth > 0 ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs">{t("color")}</Label>
                <ColorSwatchPicker
                  value={props.borderColor}
                  onChange={props.setBorderColor}
                  label={t("borderColorLabel")}
                  userPalettes={palettes}
                  userPalettesLabel={userPalettesLabel}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("shadowLabel")}</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "none", label: t("shadowNone") },
                { value: "soft", label: t("shadowSoft") },
                { value: "medium", label: t("shadowMedium") },
                { value: "strong", label: t("shadowStrong") },
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
          <Label>{t("playButtonLabel")}</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs">{t("shape")}</Label>
              <div className="flex gap-1">
                {(
                  [
                    { value: "circle", label: t("shapeCircle") },
                    { value: "rounded", label: t("shapeRounded") },
                    { value: "square", label: t("shapeSquare") },
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
              <Label className="text-xs">{t("colorOptional")}</Label>
              <ColorSwatchPicker
                value={props.playButtonColor || "#ffffff"}
                onChange={props.setPlayButtonColor}
                label={t("playButtonColorLabel")}
                userPalettes={palettes}
                userPalettesLabel={userPalettesLabel}
              />
              {props.playButtonColor ? (
                <button
                  type="button"
                  onClick={() => props.setPlayButtonColor("")}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {t("reset")}
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
            {t("showCreatorBranding")}
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
