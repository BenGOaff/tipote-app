import { useEffect, useMemo, useState } from "react";
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Gift,
  Zap,
  Crown,
  Target,
  DollarSign,
  FileText,
  Megaphone,
  Lightbulb,
  Pencil,
  Save,
  X,
  CheckCircle2,
} from "lucide-react";

type OfferType = "lead_magnet" | "low_ticket" | "high_ticket";

interface PricingTier {
  label: string;
  price: string;
  period: string;
  description: string;
}

interface Offer {
  title: string;
  price: string;
  description: string;
  why?: string;
  whyPrice?: string;
  whatToCreate?: string[];
  howToCreate?: string;
  howToPromote?: string[];
  pricing?: PricingTier[];
}

interface OfferDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: Offer;
  offerType: OfferType;
  profileData?: Record<string, unknown>;
  onUpdateOffer?: (offer: Offer) => void;
}

const offerConfig = {
  lead_magnet: {
    icon: Gift,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    label: "Lead Magnet",
    badgeVariant: "outline" as const,
  },
  low_ticket: {
    icon: Zap,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
    label: "Low Ticket",
    badgeVariant: "secondary" as const,
  },
  high_ticket: {
    icon: Crown,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    label: "High Ticket",
    badgeVariant: "default" as const,
  },
};

const isMeaningfulString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const coalesceString = (
  value: string | undefined,
  fallback: string | undefined,
) => (isMeaningfulString(value) ? value : fallback);

const coalesceStringArray = (
  value: string[] | undefined,
  fallback: string[] | undefined,
) => (Array.isArray(value) && value.length > 0 ? value : fallback);

const getDefaultOfferDetails = (
  offerType: OfferType,
  _offer: Offer,
  t: ReturnType<typeof useTranslations>,
): Partial<Offer> => {
  return {
    why: t(`${offerType}.why` as any),
    whyPrice: t(`${offerType}.whyPrice` as any),
    whatToCreate: t.raw(`${offerType}.whatToCreate` as any) as string[],
    howToCreate: t(`${offerType}.howToCreate` as any),
    howToPromote: t.raw(`${offerType}.howToPromote` as any) as string[],
  };
};

export const OfferDetailModal = ({
  isOpen,
  onClose,
  offer,
  offerType,
  onUpdateOffer,
}: OfferDetailModalProps) => {
  const t = useTranslations('strategyDetails');
  const tDefaults = useTranslations('offerDefaults');
  const config = offerConfig[offerType];
  const Icon = config.icon;

  const defaultDetails = useMemo(
    () => getDefaultOfferDetails(offerType, offer, tDefaults),
    [offerType, offer, tDefaults],
  );

  const buildHydratedOffer = (): Offer => ({
    ...offer,
    why: coalesceString(offer.why, defaultDetails.why),
    whyPrice: coalesceString(offer.whyPrice, defaultDetails.whyPrice),
    whatToCreate: coalesceStringArray(
      offer.whatToCreate,
      defaultDetails.whatToCreate,
    ),
    howToCreate: coalesceString(offer.howToCreate, defaultDetails.howToCreate),
    howToPromote: coalesceStringArray(
      offer.howToPromote,
      defaultDetails.howToPromote,
    ),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedOffer, setEditedOffer] = useState<Offer>(buildHydratedOffer);

  // Important: keep in sync when the modal opens on a different offer.
  useEffect(() => {
    if (!isOpen) return;
    setIsEditing(false);
    setEditedOffer(buildHydratedOffer());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    offerType,
    offer.title,
    offer.price,
    offer.description,
    offer.why,
    offer.whyPrice,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setEditedOffer((prev) => ({
      ...prev,
      whatToCreate:
        (coalesceStringArray(offer.whatToCreate, defaultDetails.whatToCreate) ||
          prev.whatToCreate) ??
        prev.whatToCreate,
      howToPromote:
        (coalesceStringArray(offer.howToPromote, defaultDetails.howToPromote) ||
          prev.howToPromote) ??
        prev.howToPromote,
      howToCreate:
        coalesceString(offer.howToCreate, defaultDetails.howToCreate) ??
        prev.howToCreate,
      why:
        coalesceString(offer.why, defaultDetails.why) ??
        prev.why,
      whyPrice:
        coalesceString(offer.whyPrice, defaultDetails.whyPrice) ??
        prev.whyPrice,
    }));
  }, [
    isOpen,
    offer.whatToCreate,
    offer.howToPromote,
    offer.howToCreate,
    offer.why,
    offer.whyPrice,
    defaultDetails,
  ]);

  const handleSave = () => {
    onUpdateOffer?.(editedOffer);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedOffer(buildHydratedOffer());
    setIsEditing(false);
  };

  const displayOffer = isEditing ? editedOffer : buildHydratedOffer();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${config.bgColor}`}>
                <Icon className={`w-5 h-5 ${config.color}`} />
              </div>
              <div>
                <Badge variant={config.badgeVariant} className="mb-1">
                  {config.label}
                </Badge>
                {isEditing ? (
                  <Input
                    value={editedOffer.title}
                    onChange={(e) =>
                      setEditedOffer({ ...editedOffer, title: e.target.value })
                    }
                    className="text-xl font-bold"
                  />
                ) : (
                  <DialogTitle className="text-xl">
                    {displayOffer.title}
                  </DialogTitle>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                (!displayOffer.pricing || displayOffer.pricing.length === 0) ? (
                  <Input
                    value={editedOffer.price}
                    onChange={(e) =>
                      setEditedOffer({ ...editedOffer, price: e.target.value })
                    }
                    className="w-32 text-right font-bold"
                  />
                ) : null
              ) : (
                (!displayOffer.pricing || displayOffer.pricing.length === 0) ? (
                  <span className="text-2xl font-bold">{displayOffer.price}</span>
                ) : null
              )}
            </div>
          </div>
          {isEditing ? (
            <Textarea
              value={editedOffer.description}
              onChange={(e) =>
                setEditedOffer({ ...editedOffer, description: e.target.value })
              }
              className="mt-2"
            />
          ) : (
            <DialogDescription className="mt-2">
              {displayOffer.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6 pr-2">
          {/* Pourquoi cette offre */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className={`w-5 h-5 ${config.color}`} />
              <h3 className="font-semibold">{t('whyOffer')}</h3>
            </div>
            {isEditing ? (
              <Textarea
                value={editedOffer.why ?? ""}
                onChange={(e) =>
                  setEditedOffer({ ...editedOffer, why: e.target.value })
                }
                rows={3}
              />
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {displayOffer.why}
              </p>
            )}
          </div>

          <Separator />

          {/* Pourquoi ce prix */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className={`w-5 h-5 ${config.color}`} />
              <h3 className="font-semibold">{t('whyPrice')}</h3>
            </div>
            {isEditing ? (
              <Textarea
                value={editedOffer.whyPrice ?? ""}
                onChange={(e) =>
                  setEditedOffer({ ...editedOffer, whyPrice: e.target.value })
                }
                rows={3}
              />
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {displayOffer.whyPrice}
              </p>
            )}
          </div>

          {/* Pricing tiers (if any) */}
          {displayOffer.pricing && displayOffer.pricing.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className={`w-5 h-5 ${config.color}`} />
                  <h3 className="font-semibold">{t('pricingTiers')}</h3>
                </div>
                <div className="grid gap-3">
                  {displayOffer.pricing.map((tier, tIdx) => (
                    <div key={tIdx} className={`rounded-lg border p-3 ${config.bgColor}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{tier.label || `Tier ${tIdx + 1}`}</span>
                        <span className="font-bold">{tier.price}{tier.period ? ` ${tier.period}` : ""}</span>
                      </div>
                      {tier.description && (
                        <p className="text-xs text-muted-foreground">{tier.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Quoi créer */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className={`w-5 h-5 ${config.color}`} />
              <h3 className="font-semibold">{t('whatToCreate')}</h3>
            </div>
            <ul className="space-y-2">
              {displayOffer.whatToCreate?.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2
                    className={`w-4 h-4 ${config.color} mt-0.5 flex-shrink-0`}
                  />
                  {isEditing ? (
                    <Input
                      value={item}
                      onChange={(e) => {
                        const newItems = [...(editedOffer.whatToCreate || [])];
                        newItems[index] = e.target.value;
                        setEditedOffer({ ...editedOffer, whatToCreate: newItems });
                      }}
                      className="flex-1"
                    />
                  ) : (
                    <span>{item}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {/* Comment créer */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className={`w-5 h-5 ${config.color}`} />
              <h3 className="font-semibold">{t('howToCreate')}</h3>
            </div>
            {isEditing ? (
              <Textarea
                value={editedOffer.howToCreate ?? ""}
                onChange={(e) =>
                  setEditedOffer({ ...editedOffer, howToCreate: e.target.value })
                }
                rows={3}
              />
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {displayOffer.howToCreate}
              </p>
            )}
          </div>

          <Separator />

          {/* Comment promouvoir */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone className={`w-5 h-5 ${config.color}`} />
              <h3 className="font-semibold">{t('howToPromote')}</h3>
            </div>
            <ul className="space-y-2">
              {displayOffer.howToPromote?.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2
                    className={`w-4 h-4 ${config.color} mt-0.5 flex-shrink-0`}
                  />
                  {isEditing ? (
                    <Input
                      value={item}
                      onChange={(e) => {
                        const newItems = [...(editedOffer.howToPromote || [])];
                        newItems[index] = e.target.value;
                        setEditedOffer({
                          ...editedOffer,
                          howToPromote: newItems,
                        });
                      }}
                      className="flex-1"
                    />
                  ) : (
                    <span>{item}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          {!isEditing ? (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Modifier
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                Annuler
              </Button>
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Enregistrer
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
