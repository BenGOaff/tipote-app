"use client";

// Saisies manuelles d'encaissements (étape 1e).
//
// Pour les paiements qui n'arrivent pas via Stripe / PayPal / Mollie :
// virements bancaires, espèces, chèques, autres. L'user peut ajouter,
// éditer ou supprimer ses saisies. La somme est agrégée dans le
// dashboard (1f) avec les transactions PSP pour donner le CA total.
//
// Volontairement minimaliste — pas de validation comptable
// sophistiquée, pas de catégorisation, pas de TVA détaillée. C'est
// un journal des encaissements TTC, pas un livre comptable.

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  ArrowLeft,
} from "lucide-react";

interface ManualTransaction {
  id: string;
  amount_cents: number;
  currency: string;
  source_label: string;
  category?: "sale" | "affiliate" | "other";
  paid_at: string;
  customer_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_OPTIONS: ReadonlyArray<{ value: "sale" | "affiliate" | "other"; label: string; hint: string }> = [
  { value: "sale", label: "Vente", hint: "Tu as vendu un produit / une prestation" },
  { value: "affiliate", label: "Commission affiliation", hint: "Tu touches une commission sur la vente d'un autre" },
  { value: "other", label: "Autre", hint: "Autre revenu (remboursement reçu, etc.)" },
];

function categoryLabel(value: string | undefined): string {
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? "Vente";
}

const SOURCE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "virement", label: "Virement bancaire" },
  { value: "especes", label: "Espèces" },
  { value: "cheque", label: "Chèque" },
  { value: "autre", label: "Autre" },
];

function sourceLabel(value: string): string {
  return SOURCE_OPTIONS.find((s) => s.value === value)?.label ?? value;
}

function formatAmount(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Currency invalide → fallback affichage simple
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatDateFR(iso: string): string {
  // iso = "YYYY-MM-DD"
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function ComptaManualTransactions() {
  const t = useTranslations("comptaManual");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ManualTransaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast } = useToast();

  async function reload() {
    try {
      const res = await fetch("/api/compta/manual-transactions");
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; transactions?: ManualTransaction[] }
        | null;
      if (json?.ok && Array.isArray(json.transactions)) {
        setItems(json.transactions);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/compta/manual-transactions/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (json?.ok) {
        toast({ title: t("entryDeleted") });
        await reload();
      } else {
        toast({ title: "Erreur", description: json?.error, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Inconnue",
        variant: "destructive",
      });
    }
  }

  const editingItem = items.find((i) => i.id === editingId) ?? null;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <ListPlus className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-lg">Saisies manuelles</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("introHint")}
            </p>
          </div>
        </div>
        {!showForm && !editingItem ? (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            Ajouter une saisie
          </Button>
        ) : null}
      </div>

      {/* Form de saisie / édition */}
      {showForm || editingItem ? (
        <ManualTransactionForm
          initial={editingItem ?? undefined}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
          }}
          onSaved={async () => {
            setShowForm(false);
            setEditingId(null);
            await reload();
          }}
        />
      ) : null}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement de tes saisies…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">
          {t("emptyState")}
        </p>
      ) : (
        <div className="border rounded-md divide-y">
          {items.map((item) => (
            <ManualTransactionRow
              key={item.id}
              item={item}
              onEdit={() => setEditingId(item.id)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Une ligne de saisie dans la liste
 * ────────────────────────────────────────────────────────────────── */

function ManualTransactionRow({
  item,
  onEdit,
  onDelete,
}: {
  item: ManualTransaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isNegative = item.amount_cents < 0;
  const isAffiliate = item.category === "affiliate";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`font-semibold tabular-nums ${isNegative ? "text-destructive" : ""}`}>
            {formatAmount(item.amount_cents, item.currency)}
          </span>
          {isAffiliate ? (
            <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded font-medium">
              Commission
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {sourceLabel(item.source_label)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateFR(item.paid_at)}
          </span>
        </div>
        {(item.customer_name || item.description) ? (
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {item.customer_name ? <span className="font-medium">{item.customer_name}</span> : null}
            {item.customer_name && item.description ? " — " : null}
            {item.description ? <span>{item.description}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Modifier"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Formulaire create + edit
 * ────────────────────────────────────────────────────────────────── */

interface FormProps {
  initial?: ManualTransaction;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

function ManualTransactionForm({ initial, onCancel, onSaved }: FormProps) {
  const t = useTranslations("comptaManual");
  const isEdit = !!initial;
  const [amount, setAmount] = useState(
    initial ? (initial.amount_cents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "EUR");
  const [sourceLabelValue, setSourceLabelValue] = useState(initial?.source_label ?? "virement");
  const [category, setCategory] = useState<"sale" | "affiliate" | "other">(
    initial?.category ?? "sale",
  );
  const [paidAt, setPaidAt] = useState(initial?.paid_at ?? new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedAmount = amount.trim();
    if (!trimmedAmount) {
      setError("Renseigne un montant.");
      return;
    }

    startTransition(async () => {
      try {
        const url = isEdit
          ? `/api/compta/manual-transactions/${initial!.id}`
          : "/api/compta/manual-transactions";
        const method = isEdit ? "PATCH" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: trimmedAmount,
            currency,
            source_label: sourceLabelValue,
            category,
            paid_at: paidAt,
            customer_name: customerName.trim() || null,
            description: description.trim() || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!json?.ok) {
          setError(json?.error ?? "Erreur");
          return;
        }
        toast({ title: isEdit ? t("entryModified") : t("entryAdded") });
        await onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("networkError"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-sm">
          {isEdit ? "Modifier la saisie" : "Nouvelle saisie"}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mt-amount">Montant TTC</Label>
          <div className="flex gap-2">
            <Input
              id="mt-amount"
              inputMode="decimal"
              placeholder="120,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
              required
              className="flex-1 tabular-nums"
            />
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="CHF">CHF</SelectItem>
                <SelectItem value="CAD">CAD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("refundHint")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mt-paid-at">Date du paiement</Label>
          <Input
            id="mt-paid-at"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            disabled={pending}
            required
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mt-source">Mode de paiement</Label>
          <Select value={sourceLabelValue} onValueChange={setSourceLabelValue}>
            <SelectTrigger id="mt-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Nature du revenu</Label>
          <p className="text-xs text-muted-foreground">
            Pour distinguer tes ventes directes de tes commissions d&apos;affiliation
            dans le tableau de bord.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                disabled={pending}
                className={`text-left rounded-md border px-3 py-2 text-xs transition-colors ${
                  category === opt.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-muted-foreground mt-0.5">{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mt-customer">Client (optionnel)</Label>
          <Input
            id="mt-customer"
            type="text"
            placeholder="Nom du client"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            disabled={pending}
            maxLength={200}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mt-desc">Description (optionnelle)</Label>
        <Input
          id="mt-desc"
          type="text"
          placeholder={t("noteLabel")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={pending}
          maxLength={1000}
        />
      </div>

      {error ? (
        <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enregistrement…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              {isEdit ? "Enregistrer" : "Ajouter"}
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Annuler
        </Button>
      </div>
    </form>
  );
}
