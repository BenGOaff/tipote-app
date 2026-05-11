"use client";

// ComptaExpenseItems — phase 1k. Saisie manuelle des achats / charges
// pro pour calculer la TVA déductible et nourrir le FEC.
//
// Pattern miroir de ComptaManualTransactions (côté ventes), mais
// avec en plus un sélecteur de taux TVA et un calcul live de la
// TVA déductible pendant la saisie. La card du haut affiche le
// récap "TVA collectée vs déductible → TVA à payer" pour que
// l'user voie tout de suite l'impact.

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Receipt,
  Plus,
  Loader2,
  Trash2,
  Edit3,
  Check,
  X,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  VAT_RATES,
  type ExpenseCategory,
} from "@/lib/compta/types";

interface ExpenseItem {
  id: string;
  amount_ttc_cents: number;
  currency: string;
  vat_rate: number;
  vat_deductible_cents: number;
  vendor_name: string | null;
  description: string | null;
  category: ExpenseCategory;
  paid_at: string;
  notes: string | null;
}

interface Totals {
  total_ttc_cents: number;
  total_vat_deductible_cents: number;
  total_ht_cents: number;
}

function formatEUR(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Calcul live côté client — la version serveur (qui fait foi) est
 *  dans /api/compta/expense-items/route.ts. */
function liveVatDeductible(ttcCents: number, rate: number): number {
  if (rate <= 0 || ttcCents <= 0) return 0;
  return Math.round((ttcCents * rate) / (100 + rate));
}

export function ComptaExpenseItems() {
  const t = useTranslations("compta.expenseItems");
  const locale = useLocale();
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [totals, setTotals] = useState<Totals>({
    total_ttc_cents: 0,
    total_vat_deductible_cents: 0,
    total_ht_cents: 0,
  });
  const [vatCollected, setVatCollected] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/compta/expense-items");
      const json = await res.json();
      if (json.ok) {
        setItems(json.items ?? []);
        setTotals(json.totals);
      }
      // Récup TVA collectée pour la card "TVA à payer". On ré-utilise
      // l'endpoint dashboard qui agrège déjà tout.
      const dashRes = await fetch("/api/compta/dashboard");
      const dashJson = await dashRes.json();
      if (dashJson.ok && typeof dashJson.vat_collected_ytd_cents === "number") {
        setVatCollected(dashJson.vat_collected_ytd_cents);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const vatToPay = vatCollected - totals.total_vat_deductible_cents;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">{t("title")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("description")}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("addButton")}
        </Button>
      </div>

      {/* Card TVA à payer (collectée - déductible) — visible dès qu'il
          y a au moins une charge ou de la TVA collectée. */}
      {(totals.total_vat_deductible_cents > 0 || vatCollected > 0) ? (
        <div className="rounded-lg border bg-muted/30 p-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("vatCollected")}</div>
            <div className="text-lg font-bold">{formatEUR(vatCollected, locale)}</div>
            <div className="text-[10px] text-muted-foreground">{t("sinceJanuary")}</div>
          </div>
          <div className="border-x">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("vatDeductible")}</div>
            <div className="text-lg font-bold">{formatEUR(totals.total_vat_deductible_cents, locale)}</div>
            <div className="text-[10px] text-muted-foreground">{t("expensesCount", { count: items.length })}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("vatToPay")}</div>
            <div className={`text-lg font-bold ${vatToPay < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {formatEUR(Math.max(0, vatToPay), locale)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {vatToPay < 0 ? t("vatCredit") : t("estimated")}
            </div>
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <ExpenseForm
          mode="create"
          onCancel={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false);
            await reload();
            toast.success(t("toastAdded"));
          }}
        />
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("emptyState")}
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {items.map((item) => (
            <ExpenseRow
              key={item.id}
              item={item}
              isEditing={editingId === item.id}
              onEdit={() => setEditingId(item.id)}
              onCancelEdit={() => setEditingId(null)}
              onUpdated={async () => {
                setEditingId(null);
                await reload();
                toast.success(t("toastUpdated"));
              }}
              onDeleted={async () => {
                await reload();
                toast.success(t("toastDeleted"));
              }}
            />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>{t("mvpNotice")}</p>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Form (create + edit modes)
// ─────────────────────────────────────────────────────────────────────

function ExpenseForm({
  mode,
  initial,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: ExpenseItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("compta.expenseItems");
  const locale = useLocale();
  const [amountEuros, setAmountEuros] = useState<string>(
    initial ? String(initial.amount_ttc_cents / 100) : "",
  );
  const [vatRate, setVatRate] = useState<number>(initial?.vat_rate ?? 20);
  const [category, setCategory] = useState<ExpenseCategory>(
    initial?.category ?? "autre",
  );
  const [vendorName, setVendorName] = useState<string>(initial?.vendor_name ?? "");
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [paidAt, setPaidAt] = useState<string>(initial?.paid_at ?? todayYmd());
  const [busy, setBusy] = useState(false);

  const amountTtcCents = useMemo(() => {
    const f = parseFloat(amountEuros.replace(",", "."));
    if (!Number.isFinite(f)) return 0;
    return Math.round(f * 100);
  }, [amountEuros]);

  const vatDeductibleCents = liveVatDeductible(amountTtcCents, vatRate);

  async function handleSave() {
    if (amountTtcCents <= 0) {
      toast.error(t("errorInvalidAmount"));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        amount_ttc_cents: amountTtcCents,
        vat_rate: vatRate,
        category,
        vendor_name: vendorName.trim() || null,
        description: description.trim() || null,
        paid_at: paidAt,
      };
      const res = await fetch(
        mode === "create"
          ? "/api/compta/expense-items"
          : `/api/compta/expense-items/${initial!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error ?? t("errorSaveFailed"));
        return;
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="exp-amount">{t("amountTtcLabel")}</Label>
          <Input
            id="exp-amount"
            type="text"
            inputMode="decimal"
            value={amountEuros}
            onChange={(e) => setAmountEuros(e.target.value)}
            placeholder="124,99"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-rate">{t("vatRateLabel")}</Label>
          <select
            id="exp-rate"
            value={vatRate}
            onChange={(e) => setVatRate(parseFloat(e.target.value))}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm"
          >
            {VAT_RATES.map((r) => (
              <option key={r} value={r}>
                {r === 0 ? t("vatRateZero") : `${r} %`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Calcul live de la TVA déductible — confirmation visuelle pour
          l'user. La valeur stockée en DB est recalculée serveur-side
          au cas où. */}
      <div className="rounded-md bg-background border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>{t("vatDeductibleCalculated")}</span>
        <span className="font-mono font-semibold text-foreground">
          {formatEUR(vatDeductibleCents, locale)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="exp-cat">{t("categoryLabel")}</Label>
          <select
            id="exp-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-paid">{t("paidAtLabel")}</Label>
          <input
            id="exp-paid"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="exp-vendor">{t("vendorLabel")}</Label>
          <Input
            id="exp-vendor"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder={t("vendorPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-desc">{t("descriptionLabel")}</Label>
          <Input
            id="exp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4 mr-1" />
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              {t("saving")}
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              {mode === "create" ? t("add") : t("save")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ExpenseRow({
  item,
  isEditing,
  onEdit,
  onCancelEdit,
  onUpdated,
  onDeleted,
}: {
  item: ExpenseItem;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdated: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const t = useTranslations("compta.expenseItems");
  const locale = useLocale();
  const [deleting, setDeleting] = useState(false);

  if (isEditing) {
    return (
      <div className="p-3 bg-muted/20">
        <ExpenseForm
          mode="edit"
          initial={item}
          onCancel={onCancelEdit}
          onSaved={() => onUpdated()}
        />
      </div>
    );
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/compta/expense-items/${item.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error ?? t("errorDeleteFailed"));
        return;
      }
      await onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">
            {item.vendor_name || t("vendorUnspecified")}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {EXPENSE_CATEGORY_LABELS[item.category]}
          </span>
        </div>
        {item.description ? (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {item.description}
          </p>
        ) : null}
        <div className="text-xs text-muted-foreground mt-0.5">
          {t("rowSummary", { date: item.paid_at, rate: item.vat_rate, amount: formatEUR(item.vat_deductible_cents, locale) })}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-base font-semibold">
          {formatEUR(item.amount_ttc_cents, locale)}
        </div>
        <div className="text-[10px] text-muted-foreground">{t("ttcLabel")}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label={t("editAriaLabel")}>
          <Edit3 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={deleting}
          aria-label={t("deleteAriaLabel")}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
