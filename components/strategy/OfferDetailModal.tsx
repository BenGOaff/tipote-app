import { useEffect, useMemo, useState } from "react";
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

interface Offer {
  title: string;
  price: string;
  description: string;
  why?: string;
  whyPrice?: string;
  whatToCreate?: string[];
  howToCreate?: string;
  howToPromote?: string[];
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
): Partial<Offer> => {
  const baseDetails = {
    lead_magnet: {
      why: "Ce lead magnet attire ton audience cible en résolvant un problème urgent et spécifique. Il établit ta crédibilité et te positionne comme expert de ton domaine.",
      whyPrice:
        "Gratuit pour maximiser les inscriptions et construire ta liste email. La valeur perçue doit être élevée pour encourager le partage.",
      whatToCreate: [
        "Un contenu qui répond à une question brûlante de ton audience",
        "Un format facilement consommable (PDF, vidéo courte, checklist)",
        "Un design professionnel qui reflète ta marque",
        "Une page de capture optimisée pour les conversions",
      ],
      howToCreate:
        "Commence par identifier le problème #1 de ton audience. Crée un contenu actionnable qu'ils peuvent appliquer immédiatement. Limite le contenu à l'essentiel pour qu'il soit rapide à consommer mais impactant.",
      howToPromote: [
        "Posts organiques sur tes réseaux sociaux avec un CTA clair",
        "Publicités ciblées sur Facebook/Instagram vers ta page de capture",
        "Partenariats avec d'autres créateurs pour du cross-promo",
        "Mentions dans tes emails et contenus existants",
      ],
    },
    low_ticket: {
      why: "Cette offre convertit tes leads en clients. Elle prouve la valeur de tes produits et crée une habitude d'achat tout en générant tes premiers revenus.",
      whyPrice:
        "Un prix accessible (47-197€) réduit la friction d'achat. Assez élevé pour attirer des clients sérieux, assez bas pour être une décision impulsive.",
      whatToCreate: [
        "Une formation ou ressource qui approfondit le lead magnet",
        "Des templates, scripts ou outils pratiques",
        "Un accès à une communauté ou des bonus exclusifs",
        "Une page de vente convaincante avec témoignages",
      ],
      howToCreate:
        "Transforme ton expertise en un produit structuré. Inclus des résultats mesurables et des étapes claires. Ajoute des bonus pour augmenter la valeur perçue.",
      howToPromote: [
        "Séquence email automatisée après le lead magnet",
        "Offres flash et promotions limitées",
        "Upsell direct après l'inscription au lead magnet",
        "Témoignages et études de cas sur les réseaux",
      ],
    },
    high_ticket: {
      why: "Cette offre maximise tes revenus avec un accompagnement premium. Elle attire les clients les plus motivés qui veulent des résultats garantis.",
      whyPrice:
        "Un prix premium (997€+) reflète la valeur transformationnelle. Les clients qui investissent plus sont plus engagés et obtiennent de meilleurs résultats.",
      whatToCreate: [
        "Un programme d'accompagnement complet sur plusieurs semaines",
        "Des sessions de coaching individuelles ou en groupe",
        "Un accès VIP avec support prioritaire",
        "Des ressources avancées et exclusives",
      ],
      howToCreate:
        "Conçois une transformation complète. Définis clairement les résultats attendus et le processus. Limite les places pour créer l'exclusivité et pouvoir offrir un suivi personnalisé.",
      howToPromote: [
        "Webinars de vente avec présentation de la méthode",
        "Appels de découverte pour qualifier les prospects",
        "Témoignages vidéo de clients transformés",
        "Séquence email nurturing sur plusieurs semaines",
      ],
    },
  };

  return baseDetails[offerType];
};

export const OfferDetailModal = ({
  isOpen,
  onClose,
  offer,
  offerType,
  onUpdateOffer,
}: OfferDetailModalProps) => {
  const config = offerConfig[offerType];
  const Icon = config.icon;

  const defaultDetails = useMemo(
    () => getDefaultOfferDetails(offerType, offer),
    [offerType, offer],
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
                <Input
                  value={editedOffer.price}
                  onChange={(e) =>
                    setEditedOffer({ ...editedOffer, price: e.target.value })
                  }
                  className="w-32 text-right font-bold"
                />
              ) : (
                <span className="text-2xl font-bold">{displayOffer.price}</span>
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
              <h3 className="font-semibold">Pourquoi cette offre ?</h3>
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
              <h3 className="font-semibold">Pourquoi ce prix ?</h3>
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

          <Separator />

          {/* Quoi créer */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className={`w-5 h-5 ${config.color}`} />
              <h3 className="font-semibold">Quoi créer ?</h3>
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
              <h3 className="font-semibold">Comment créer ?</h3>
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
              <h3 className="font-semibold">Comment promouvoir ?</h3>
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
