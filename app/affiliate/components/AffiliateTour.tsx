"use client";

// app/affiliate/components/AffiliateTour.tsx
//
// Tutoriel guidé pour les nouveaux affiliés. Séquence de 5 modales
// successives expliquant les essentiels : lien d'affiliation,
// onglet Promouvoir, Trial Tipote, paliers de commission, paiement.
//
// Déclenchement : automatique au mount si `onboardedAt` prop est null
// (affilié qui n'a jamais terminé le tour). Persistance via
// /affiliate/api/onboarded à la fin.
//
// Peut aussi être déclenché manuellement par d'autres composants en
// dispatchant l'événement custom 'affiliate-tour-start' sur window.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Link2,
  Megaphone,
  Gift,
  Award,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Bienvenue dans l'espace affilié 👋",
    description: "1 minute pour comprendre comment ça marche.",
    body: (
      <>
        <p>
          Tu fais maintenant partie du programme d&apos;affiliation Tipote × Tiquiz.
          Tu touches une <strong>commission de 40 à 50%</strong> sur chaque vente
          générée par ton lien.
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Voici les 4 trucs à savoir pour démarrer en force.
        </p>
      </>
    ),
  },
  {
    icon: Link2,
    title: "Ton lien d'affiliation tracké",
    description: "Le seul truc à retenir pour toucher tes commissions.",
    body: (
      <>
        <p>
          Sur ta vue d&apos;ensemble, tu trouves ton lien principal :{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
            tipote.fr/?sa=ton_id
          </code>
        </p>
        <ul className="space-y-2 mt-3 text-sm">
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <span>
              <strong>Cookie 90 jours</strong> — même si le client achète 3 mois après son
              clic, c&apos;est toi qui touches.
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <span>
              <strong>Last-touch</strong> — si plusieurs affiliés ont influencé,
              c&apos;est le dernier clic qui compte.
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <span>
              Tu peux rajouter <code className="bg-muted px-1 py-0.5 rounded text-xs">?sa=ton_id</code> à
              n&apos;importe quelle URL tipote.fr/.com/.blog.
            </span>
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: Megaphone,
    title: "Onglet Promouvoir — tout le matos prêt",
    description: "Emails, posts réseaux, visuels. Copy-paste partout.",
    body: (
      <>
        <p>L&apos;onglet <strong>Promouvoir</strong> contient :</p>
        <ul className="space-y-2 mt-3 text-sm">
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <span><strong>8 emails</strong> evergreen prêts à copier (séquence sur 2 semaines)</span>
          </li>
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <span><strong>24 posts</strong> (8 jours × 3 réseaux : Instagram / LinkedIn / X)</span>
          </li>
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <span><strong>18 visuels</strong> téléchargeables (format Instagram 1080×1350)</span>
          </li>
        </ul>
        <p className="text-sm text-muted-foreground mt-3">
          Ton lien tracké est automatiquement injecté dans tous les emails et
          posts. Tu cliques &quot;Copier&quot;, tu colles. C&apos;est tout.
        </p>
      </>
    ),
  },
  {
    icon: Gift,
    title: "🎁 1 mois Tipote Elite offert",
    description: "Pour tester l'outil et créer du contenu authentique.",
    body: (
      <>
        <p>
          On t&apos;offre <strong>30 jours d&apos;accès Elite à Tipote</strong> pour
          que tu testes l&apos;outil, captures des screenshots de TON propre
          dashboard, et puisses faire des démos vidéo authentiques.
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          C&apos;est <strong>une seule fois</strong> dans ta vie d&apos;affilié. Réserve-le
          pour quand tu auras 2h devant toi pour explorer à fond. Onglet{" "}
          <strong>Trial Tipote</strong> dans la nav.
        </p>
      </>
    ),
  },
  {
    icon: Award,
    title: "Tes paliers de commission",
    description: "Plus tu vends, plus ta com' monte.",
    body: (
      <>
        <p>Tu démarres à <strong>40%</strong>. Ta commission augmente automatiquement :</p>
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border">
            <span className="text-sm">0–9 ventes</span>
            <span className="font-bold text-sm">40%</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/30">
            <span className="text-sm">10–24 ventes</span>
            <span className="font-bold text-sm">45%</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/50">
            <span className="text-sm">25+ ventes</span>
            <span className="font-bold text-sm">50%</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Paiement le 10 de chaque mois, à partir de 50€ accumulés.
          PayPal ou virement, à toi de choisir dans <strong>Paiement</strong>.
        </p>
      </>
    ),
  },
];

export function AffiliateTour({ onboardedAt }: { onboardedAt: string | null }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Auto-ouvre si l'affilié n'a jamais terminé le tour. Léger délai
  // pour laisser la page s'afficher proprement d'abord.
  useEffect(() => {
    if (onboardedAt) return;
    const timer = setTimeout(() => setIsOpen(true), 600);
    return () => clearTimeout(timer);
  }, [onboardedAt]);

  // Permet à d'autres composants (genre bouton "Refaire le tour" dans
  // Support) de relancer le tour via un événement custom.
  useEffect(() => {
    function handler() {
      setCurrentStep(0);
      setIsOpen(true);
    }
    window.addEventListener("affiliate-tour-start", handler);
    return () => window.removeEventListener("affiliate-tour-start", handler);
  }, []);

  async function complete() {
    setSaving(true);
    try {
      await fetch("/affiliate/api/onboarded", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
    } catch {
      // Best effort — si l'API échoue, on ferme quand même la modale
    }
    setSaving(false);
    setIsOpen(false);
    router.refresh();
  }

  async function skip() {
    // Skip = on marque quand même comme terminé pour pas reproposer
    await complete();
  }

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;
  const Icon = step.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && skip()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{step.title}</DialogTitle>
              <DialogDescription className="text-xs">{step.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="text-sm leading-relaxed py-2">{step.body}</div>

        {/* Indicateur de progression */}
        <div className="flex items-center gap-1.5 justify-center pt-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep
                  ? "w-6 bg-primary"
                  : i < currentStep
                    ? "w-1.5 bg-primary/50"
                    : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={skip}
            disabled={saving}
            className="text-muted-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Passer
          </Button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                disabled={saving}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {isLast ? (
              <Button onClick={complete} disabled={saving}>
                {saving ? "..." : "C'est parti !"}
                <Sparkles className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={saving}
              >
                Suivant
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
