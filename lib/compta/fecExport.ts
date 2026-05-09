// lib/compta/fecExport.ts
//
// Génère un FEC (Fichier des Écritures Comptables) au format légal
// défini par l'article A47 A-1 du LPF (Livre des procédures fiscales).
// Obligatoire pour les SASU en cas de contrôle fiscal — l'admin
// fiscal peut le demander à tout moment, et le format est strict :
// 18 colonnes nommées, séparateur pipe (|) ou tabulation, encoding
// UTF-8 ou ISO-8859-15, dates AAAAMMJJ, montants avec virgule décimale.
//
// Source de vérité côté Tipote : les tables `transactions` (PSP
// synchronisés) et `manual_transactions` (saisies hors PSP). Les
// écritures sont chronologiques par date de paiement, numérotées
// sans saut.
//
// **Limite assumée** : Tipote ne fait PAS de comptabilité complète
// (pas d'achats, pas d'amortissements, pas de paie, pas de TVA
// déductible, pas de lettrage). Le FEC produit ici couvre les
// VENTES + ENCAISSEMENTS uniquement. C'est suffisant pour montrer
// au fisc qu'on a bien un tracking des recettes ; mais le comptable
// devra y agréger ses propres écritures (achats, charges, salaires,
// dotations) avant le dépôt définitif. Le bandeau de download le
// rappelle clairement à l'user.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type VatRegime = "reel_mensuel" | "reel_trimestriel" | "simplifie" | null;

export interface FecExportInput {
  userId: string;
  projectId: string | null;
  /** Inclus. AAAAMMJJ. */
  fromYmd: string;
  /** Inclus. AAAAMMJJ. */
  toYmd: string;
  /** SIREN à 9 chiffres, sert au nom de fichier ET en colonne CompAuxNum
   *  pour les ventes (compte client unique faute de pousser une fiche
   *  client par transaction). */
  siren: string;
  /** Si l'user a un régime TVA configuré on split HT/TVA à 20% par défaut.
   *  Sinon (franchise / non-soumis), on traite tout en HT = TTC. */
  vatRegime: VatRegime;
}

export interface FecExportResult {
  /** Contenu du fichier prêt à servir. */
  content: string;
  /** `<SIREN>FEC<AAAAMMJJ>.txt` — nom imposé par l'admin fiscale. */
  filename: string;
  /** Pour log + UI : combien d'écritures couvertes. */
  entryCount: number;
}

/** En-tête FEC obligatoire : 18 noms de colonnes séparés par pipe. */
const FEC_HEADER = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
].join("|");

// Plan comptable minimaliste (PCG général)
const COMPTE_BANQUE = { num: "512100", lib: "Banque" };
const COMPTE_CAISSE = { num: "530000", lib: "Caisse" };
const COMPTE_VENTE_SERVICES = { num: "706000", lib: "Prestations de services" };
const COMPTE_VENTE_MARCHANDISES = { num: "707000", lib: "Ventes de marchandises" };
const COMPTE_AFFILIATE = { num: "758000", lib: "Produits divers de gestion courante" };
const COMPTE_TVA_COLLECTEE = { num: "445710", lib: "TVA collectée" };
const COMPTE_TVA_DEDUCTIBLE = { num: "445660", lib: "TVA déductible sur biens et services" };

/** Mapping catégorie expense_item → compte de charge (PCG général).
 *  Permet de produire un FEC où chaque achat tombe dans le bon
 *  compte 6XX. Le comptable peut affiner derrière, mais c'est déjà
 *  utilisable comme base. */
const COMPTE_CHARGE_BY_CATEGORY: Record<string, { num: string; lib: string }> = {
  achats: { num: "607000", lib: "Achats de marchandises" },
  services: { num: "611000", lib: "Sous-traitance générale" },
  fournitures: { num: "606300", lib: "Fournitures non stockables" },
  deplacements: { num: "625100", lib: "Voyages et déplacements" },
  logiciels: { num: "651100", lib: "Redevances logiciels et services en ligne" },
  loyer: { num: "613200", lib: "Locations immobilières" },
  communication: { num: "626000", lib: "Frais postaux et télécommunications" },
  marketing: { num: "623100", lib: "Annonces et insertions" },
  formation: { num: "631100", lib: "Versement formation professionnelle continue" },
  autre: { num: "658000", lib: "Charges diverses de gestion courante" },
};

const TVA_RATE = 0.2; // Taux normal France 20%

// ───────────────────────── Formatting helpers ─────────────────────────

function ymdToCompact(ymd: string): string {
  return ymd.replace(/-/g, "");
}

/** ISO timestamp (transactions.paid_at) → AAAAMMJJ. */
function tsToCompact(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Montant en cents → "123,45" (virgule décimale). 0 → "0,00". */
function fmtAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${euros},${String(remainder).padStart(2, "0")}`;
}

/** Échappe les caractères qui casseraient le format pipe. */
function clean(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/[\r\n\t|]/g, " ") // pas de retour ligne / tabulation / pipe dans les champs
    .trim()
    .slice(0, 250);
}

/** Construit une ligne FEC à partir d'un objet partiel. */
function fecLine(row: {
  journalCode: string;
  journalLib: string;
  ecritureNum: string;
  ecritureDate: string;
  compteNum: string;
  compteLib: string;
  compAuxNum?: string;
  compAuxLib?: string;
  pieceRef: string;
  pieceDate: string;
  ecritureLib: string;
  debit: number; // cents
  credit: number; // cents
  validDate: string;
  montantDevise?: string;
  idevise?: string;
}): string {
  return [
    row.journalCode,
    row.journalLib,
    row.ecritureNum,
    row.ecritureDate,
    row.compteNum,
    row.compteLib,
    row.compAuxNum ?? "",
    row.compAuxLib ?? "",
    row.pieceRef,
    row.pieceDate,
    row.ecritureLib,
    fmtAmount(row.debit),
    fmtAmount(row.credit),
    "", // EcritureLet (pas de lettrage MVP)
    "", // DateLet
    row.validDate,
    row.montantDevise ?? "",
    row.idevise ?? "",
  ].join("|");
}

// ───────────────────────── Main builder ─────────────────────────

interface SaleRow {
  type: "sale";
  paidAt: string; // ISO
  amountCents: number; // TTC
  currency: string;
  description: string | null;
  customerName: string | null;
  pieceRef: string; // ID de la transaction (PSP id ou manual UUID)
  category: "sale" | "affiliate" | "other"; // catégorie de l'encaissement
  source: "psp" | "manual";
  paymentMethod: "bank" | "cash"; // route comptable d'encaissement
}

interface ExpenseRow {
  type: "expense";
  paidAt: string; // ISO
  amountTtcCents: number;
  vatDeductibleCents: number;
  vatRate: number;
  currency: string;
  vendorName: string | null;
  description: string | null;
  pieceRef: string;
  category: string; // expense category → compte 6XX via map
}

type FecRow = SaleRow | ExpenseRow;

export async function buildFecExport(input: FecExportInput): Promise<FecExportResult> {
  const { userId, projectId, fromYmd, toYmd, siren, vatRegime } = input;
  const fromIso = `${fromYmd}T00:00:00Z`;
  // toYmd est inclus, donc on englobe tout le jour
  const toIso = `${toYmd}T23:59:59Z`;

  // 1. Transactions PSP — paid + partial_refund (on ignore failed/pending)
  let txQuery = supabaseAdmin
    .from("transactions")
    .select(
      "provider_transaction_id, amount_cents, currency, status, customer_name, customer_email, description, paid_at, category, provider",
    )
    .eq("user_id", userId)
    .in("status", ["paid", "partial_refund"])
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso)
    .order("paid_at", { ascending: true });
  if (projectId) txQuery = txQuery.eq("project_id", projectId);
  const { data: txData, error: txErr } = await txQuery;
  if (txErr) throw new Error(`FEC tx fetch: ${txErr.message}`);

  // 2. Saisies manuelles
  let manQuery = supabaseAdmin
    .from("manual_transactions")
    .select("id, amount_cents, currency, source_label, customer_name, description, paid_at, category")
    .eq("user_id", userId)
    .gte("paid_at", fromYmd)
    .lte("paid_at", toYmd)
    .order("paid_at", { ascending: true });
  if (projectId) manQuery = manQuery.eq("project_id", projectId);
  const { data: manData, error: manErr } = await manQuery;
  if (manErr) throw new Error(`FEC manual fetch: ${manErr.message}`);

  // 3. Achats / charges (expense_items, phase 1k)
  let expQuery = supabaseAdmin
    .from("expense_items")
    .select(
      "id, amount_ttc_cents, currency, vat_rate, vat_deductible_cents, vendor_name, description, category, paid_at",
    )
    .eq("user_id", userId)
    .gte("paid_at", fromYmd)
    .lte("paid_at", toYmd)
    .order("paid_at", { ascending: true });
  if (projectId) expQuery = expQuery.eq("project_id", projectId);
  const { data: expData, error: expErr } = await expQuery;
  if (expErr) throw new Error(`FEC expense fetch: ${expErr.message}`);

  // Normalisation commune (ventes + achats)
  const rows: FecRow[] = [];
  for (const t of (txData ?? []) as Array<Record<string, unknown>>) {
    rows.push({
      type: "sale",
      paidAt: String(t.paid_at),
      amountCents: Number(t.amount_cents) || 0,
      currency: String(t.currency || "EUR"),
      description: (t.description as string | null) ?? null,
      customerName: ((t.customer_name as string | null) ?? (t.customer_email as string | null)) ?? null,
      pieceRef: String(t.provider_transaction_id),
      category: (t.category as SaleRow["category"]) ?? "sale",
      source: "psp",
      paymentMethod: "bank",
    });
  }
  for (const m of (manData ?? []) as Array<Record<string, unknown>>) {
    rows.push({
      type: "sale",
      paidAt: `${String(m.paid_at)}T12:00:00Z`,
      amountCents: Number(m.amount_cents) || 0,
      currency: String(m.currency || "EUR"),
      description: (m.description as string | null) ?? null,
      customerName: (m.customer_name as string | null) ?? null,
      pieceRef: `MAN-${String(m.id).slice(0, 8)}`,
      category: (m.category as SaleRow["category"]) ?? "sale",
      source: "manual",
      paymentMethod: m.source_label === "especes" ? "cash" : "bank",
    });
  }
  for (const e of (expData ?? []) as Array<Record<string, unknown>>) {
    rows.push({
      type: "expense",
      paidAt: `${String(e.paid_at)}T12:00:00Z`,
      amountTtcCents: Number(e.amount_ttc_cents) || 0,
      vatDeductibleCents: Number(e.vat_deductible_cents) || 0,
      vatRate: Number(e.vat_rate) || 0,
      currency: String(e.currency || "EUR"),
      vendorName: (e.vendor_name as string | null) ?? null,
      description: (e.description as string | null) ?? null,
      pieceRef: `EXP-${String(e.id).slice(0, 8)}`,
      category: String(e.category || "autre"),
    });
  }

  // Tri chronologique global pour la numérotation continue (l'admin
  // fiscal exige un EcritureNum sans saut et chronologique).
  rows.sort((a, b) => a.paidAt.localeCompare(b.paidAt));

  // Date de validation = aujourd'hui (date à laquelle le FEC est généré).
  const validDate = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  })();

  // Année de début pour préfixer les numéros (style 2026000001).
  const yearPrefix = fromYmd.slice(0, 4);

  const lines: string[] = [FEC_HEADER];
  let entryCount = 0;
  const hasVat = vatRegime !== null;

  for (const row of rows) {
    entryCount += 1;
    const ecritureNum = `${yearPrefix}${String(entryCount).padStart(6, "0")}`;
    const ecritureDate = tsToCompact(row.paidAt);
    const pieceDate = ecritureDate;

    if (row.type === "sale") {
      const lib = clean(
        row.description
          ? `${row.description}${row.customerName ? ` — ${row.customerName}` : ""}`
          : row.customerName ?? `Encaissement ${row.pieceRef}`,
      );

      const compteEnc = row.paymentMethod === "cash" ? COMPTE_CAISSE : COMPTE_BANQUE;
      const compteProduit =
        row.category === "affiliate" ? COMPTE_AFFILIATE : COMPTE_VENTE_SERVICES;

      let ht = row.amountCents;
      let tva = 0;
      if (hasVat && row.category !== "affiliate") {
        ht = Math.round(row.amountCents / (1 + TVA_RATE));
        tva = row.amountCents - ht;
      }

      const baseRow = {
        journalCode: "VT",
        journalLib: "Ventes",
        ecritureNum,
        ecritureDate,
        pieceRef: clean(row.pieceRef).slice(0, 80),
        pieceDate,
        ecritureLib: lib,
        validDate,
        montantDevise: row.currency === "EUR" ? "" : fmtAmount(row.amountCents),
        idevise: row.currency === "EUR" ? "" : row.currency,
      };

      // Débit encaissement (TTC) — Crédit produit (HT) — Crédit TVA si applicable
      lines.push(
        fecLine({
          ...baseRow,
          compteNum: compteEnc.num,
          compteLib: compteEnc.lib,
          debit: row.amountCents,
          credit: 0,
        }),
      );
      lines.push(
        fecLine({
          ...baseRow,
          compteNum: compteProduit.num,
          compteLib: compteProduit.lib,
          compAuxNum: row.customerName ? siren : "",
          compAuxLib: row.customerName ? clean(row.customerName) : "",
          debit: 0,
          credit: ht,
        }),
      );
      if (tva > 0) {
        lines.push(
          fecLine({
            ...baseRow,
            compteNum: COMPTE_TVA_COLLECTEE.num,
            compteLib: COMPTE_TVA_COLLECTEE.lib,
            debit: 0,
            credit: tva,
          }),
        );
      }
    } else {
      // Expense (achat / charge) — journal AC, écriture inverse
      // de la vente : on débite la charge HT + la TVA déductible,
      // on crédite la banque (faute d'avoir un suivi fournisseur
      // dédié dans Tipote, on impute direct en banque).
      const compteCharge =
        COMPTE_CHARGE_BY_CATEGORY[row.category] ?? COMPTE_CHARGE_BY_CATEGORY.autre;
      const lib = clean(
        row.description
          ? `${row.description}${row.vendorName ? ` — ${row.vendorName}` : ""}`
          : row.vendorName ?? `Charge ${row.pieceRef}`,
      );
      const ht = row.amountTtcCents - row.vatDeductibleCents;

      const baseRow = {
        journalCode: "AC",
        journalLib: "Achats",
        ecritureNum,
        ecritureDate,
        pieceRef: clean(row.pieceRef).slice(0, 80),
        pieceDate,
        ecritureLib: lib,
        validDate,
        montantDevise: row.currency === "EUR" ? "" : fmtAmount(row.amountTtcCents),
        idevise: row.currency === "EUR" ? "" : row.currency,
      };

      // Débit charge (HT)
      lines.push(
        fecLine({
          ...baseRow,
          compteNum: compteCharge.num,
          compteLib: compteCharge.lib,
          compAuxNum: row.vendorName ? siren : "",
          compAuxLib: row.vendorName ? clean(row.vendorName) : "",
          debit: ht,
          credit: 0,
        }),
      );
      // Débit TVA déductible (si applicable)
      if (row.vatDeductibleCents > 0) {
        lines.push(
          fecLine({
            ...baseRow,
            compteNum: COMPTE_TVA_DEDUCTIBLE.num,
            compteLib: COMPTE_TVA_DEDUCTIBLE.lib,
            debit: row.vatDeductibleCents,
            credit: 0,
          }),
        );
      }
      // Crédit banque (TTC)
      lines.push(
        fecLine({
          ...baseRow,
          compteNum: COMPTE_BANQUE.num,
          compteLib: COMPTE_BANQUE.lib,
          debit: 0,
          credit: row.amountTtcCents,
        }),
      );
    }
  }

  // Nom de fichier obligatoire : <SIREN>FEC<AAAAMMJJ>.txt
  const filename = `${siren}FEC${ymdToCompact(toYmd)}.txt`;

  return {
    content: lines.join("\n"),
    filename,
    entryCount,
  };
}
