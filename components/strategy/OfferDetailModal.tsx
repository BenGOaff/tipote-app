import { useState } from "react";
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
import { Label } from "@/components/ui/label";
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

const getDefaultOfferDetails = (
  offerType: OfferType,
  offer: Offer,
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
  const defaultDetails = getDefaultOfferDetails(offerType, offer);

  const [isEditing, setIsEditing] = useState(false);
  const [localOffer, setLocalOffer] = useState<Offer>({
    ...offer,
    why: offer.why ?? defaultDetails.why,
    whyPrice: offer.whyPrice ?? defaultDetails.whyPrice,
    whatToCreate: offer.whatToCreate ?? defaultDetails.whatToCreate,
    howToCreate: offer.howToCreate ?? defaultDetails.howToCreate,
    howToPromote: offer.howToPromote ?? defaultDetails.howToPromote,
  });
  const [savedOffer, setSavedOffer] = useState<Offer>(localOffer);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center border ${config.borderColor}`}
                >
                  <Icon className={`w-6 h-6 ${config.color}`} />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-display font-bold">
                    {localOffer.title}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2 mt-1">
                    <Badge variant={config.badgeVariant}>{config.label}</Badge>
                    <span className="font-semibold">{localOffer.price}</span>
                  </DialogDescription>
                </div>
              </div>
            </div>

            {isEditing ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLocalOffer(savedOffer);
                    setIsEditing(false);
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Annuler
                </Button>
                <Button
                  onClick={() => {
                    setSavedOffer(localOffer);
                    setIsEditing(false);
                    onUpdateOffer?.(localOffer);
                  }}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Enregistrer
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setSavedOffer(localOffer);
                  setIsEditing(true);
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Modifier
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Titre</Label>
              <Input
                value={localOffer.title}
                disabled={!isEditing}
                onChange={(e) =>
                  setLocalOffer((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Prix</Label>
              <Input
                value={localOffer.price}
                disabled={!isEditing}
                onChange={(e) =>
                  setLocalOffer((prev) => ({ ...prev, price: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={localOffer.description}
              disabled={!isEditing}
              onChange={(e) =>
                setLocalOffer((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="min-h-[80px]"
            />
          </div>

          <Separator />

          {/* Why */}
          <div className="p-4 rounded-xl bg-muted/30 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Pourquoi cette offre ?</h4>
            </div>
            <Textarea
              value={localOffer.why || ""}
              disabled={!isEditing}
              onChange={(e) =>
                setLocalOffer((prev) => ({ ...prev, why: e.target.value }))
              }
              className="min-h-[80px]"
            />
          </div>

          {/* Pricing rationale */}
          <div className="p-4 rounded-xl bg-muted/30 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Pourquoi ce prix ?</h4>
            </div>
            <Textarea
              value={localOffer.whyPrice || ""}
              disabled={!isEditing}
              onChange={(e) =>
                setLocalOffer((prev) => ({ ...prev, whyPrice: e.target.value }))
              }
              className="min-h-[80px]"
            />
          </div>

          <Separator />

          {/* What to create */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Ce que tu dois créer</h4>
            </div>

            <ul className="space-y-2">
              {(localOffer.whatToCreate?.length ? localOffer.whatToCreate : ["—"]).map(
                (item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
                    {isEditing ? (
                      <Input
                        value={item}
                        onChange={(e) => {
                          const next = [...(localOffer.whatToCreate || [])];
                          next[idx] = e.target.value;
                          setLocalOffer((prev) => ({ ...prev, whatToCreate: next }));
                        }}
                      />
                    ) : (
                      <span className="text-sm">{item}</span>
                    )}
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* How to create */}
          <div className="p-4 rounded-xl bg-muted/30 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Comment la créer</h4>
            </div>
            <Textarea
              value={localOffer.howToCreate || ""}
              disabled={!isEditing}
              onChange={(e) =>
                setLocalOffer((prev) => ({ ...prev, howToCreate: e.target.value }))
              }
              className="min-h-[100px]"
            />
          </div>

          {/* How to promote */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Comment la promouvoir</h4>
            </div>

            <ul className="space-y-2">
              {(localOffer.howToPromote?.length ? localOffer.howToPromote : ["—"]).map(
                (item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
                    {isEditing ? (
                      <Input
                        value={item}
                        onChange={(e) => {
                          const next = [...(localOffer.howToPromote || [])];
                          next[idx] = e.target.value;
                          setLocalOffer((prev) => ({ ...prev, howToPromote: next }));
                        }}
                      />
                    ) : (
                      <span className="text-sm">{item}</span>
                    )}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
