"use client";

import { useState } from "react";
import { CreditCard, Building2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Initial = {
  paypal_email: string | null;
  iban_holder: string | null;
  iban_number: string | null;
};

export function PaymentForm({ initial }: { initial: Initial }) {
  // Onglet par défaut : ce qui est déjà configuré (PayPal en priorité).
  const [tab, setTab] = useState<"paypal" | "iban">(
    initial.iban_number && !initial.paypal_email ? "iban" : "paypal",
  );
  const [paypalEmail, setPaypalEmail] = useState(initial.paypal_email ?? "");
  const [ibanHolder, setIbanHolder] = useState(initial.iban_holder ?? "");
  const [ibanNumber, setIbanNumber] = useState(initial.iban_number ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validation simple : pas envoyer les deux moyens sans données.
    const payload =
      tab === "paypal"
        ? {
            paypal_email: paypalEmail.trim().toLowerCase() || null,
            iban_holder: null,
            iban_number: null,
          }
        : {
            paypal_email: null,
            iban_holder: ibanHolder.trim() || null,
            iban_number: ibanNumber.replace(/\s/g, "").toUpperCase() || null,
          };

    try {
      const res = await fetch("/affiliate/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.reason ?? "Erreur lors de la sauvegarde.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "paypal" | "iban")}>
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="paypal" className="gap-1.5">
          <CreditCard className="h-4 w-4" />
          PayPal
        </TabsTrigger>
        <TabsTrigger value="iban" className="gap-1.5">
          <Building2 className="h-4 w-4" />
          Virement (RIB)
        </TabsTrigger>
      </TabsList>

      <form onSubmit={handleSubmit} className="space-y-4">
        <TabsContent value="paypal" className="space-y-4 mt-0">
          <div className="space-y-2">
            <Label htmlFor="paypal_email">Email PayPal</Label>
            <Input
              id="paypal_email"
              type="email"
              placeholder="ton-email@paypal.com"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              L&apos;email associé à ton compte PayPal. Tes commissions seront virées
              directement.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="iban" className="space-y-4 mt-0">
          <div className="space-y-2">
            <Label htmlFor="iban_holder">Titulaire du compte</Label>
            <Input
              id="iban_holder"
              type="text"
              placeholder="Prénom Nom"
              value={ibanHolder}
              onChange={(e) => setIbanHolder(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iban_number">IBAN</Label>
            <Input
              id="iban_number"
              type="text"
              placeholder="FR76 1234 5678 9012 3456 7890 123"
              value={ibanNumber}
              onChange={(e) => setIbanNumber(e.target.value)}
              autoComplete="off"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Espaces ignorés. Format IBAN international (max 34 caractères).
            </p>
          </div>
        </TabsContent>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 flex gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Méthode de paiement enregistrée.</span>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sauvegarde…" : "Sauvegarder"}
        </Button>
      </form>
    </Tabs>
  );
}
