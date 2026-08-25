"use client";

// app/affiliate/admin/affilies/AffiliesAdminTable.tsx
//
// Un affilié par ligne, son avantage réglable en place.
//
// Le panneau d'édition s'ouvre SOUS la ligne plutôt que dans une fenêtre :
// Béné attribue un code en regardant qui a amené du monde, et une fenêtre
// modale lui cacherait justement la liste qu'elle est en train de lire.

import { useState } from "react";

export type AvantageLigne = {
  code: string;
  kind: "percent" | "free_days";
  percentOff: number;
  duration: "once" | "forever" | "months";
  durationMonths: number | null;
  freeDays: number | null;
  expiresAt: string | null;
  startsAt: string | null;
  enabled: boolean;
};

export type LigneAffilie = {
  sa: string;
  email: string;
  displayName: string | null;
  status: string;
  ref: string | null;
  code: AvantageLigne | null;
};

const PALIERS = ["monthly", "monthly_plus", "yearly", "yearly_plus"] as const;
const NOM_PALIER: Record<string, string> = {
  monthly: "Mensuel",
  monthly_plus: "Mensuel +",
  yearly: "Annuel",
  yearly_plus: "Annuel +",
};

/** Ce que la ligne annonce en un coup d'oeil. */
function resume(a: AvantageLigne | null): string {
  if (!a) return "aucun";
  const etat = a.enabled ? "" : " (éteint)";
  if (a.kind === "free_days") return `${a.code} : ${a.freeDays} jours offerts${etat}`;
  const duree =
    a.duration === "forever"
      ? "à vie"
      : a.duration === "months"
        ? `pendant ${a.durationMonths ?? "?"} mois`
        : "1re échéance";
  return `${a.code} : -${a.percentOff} % ${duree}${etat}`;
}

export function AffiliesAdminTable({ initial }: { initial: LigneAffilie[] }) {
  const [rows] = useState(initial);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const visibles = rows.filter((r) => {
    const q = filtre.trim().toLowerCase();
    if (!q) return true;
    return (
      r.email.toLowerCase().includes(q) ||
      (r.displayName ?? "").toLowerCase().includes(q) ||
      (r.ref ?? "").toLowerCase().includes(q) ||
      (r.code?.code ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3">
      <input
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        placeholder="Chercher un affilié, un code…"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <div className="rounded-lg border">
        {visibles.length === 0 ? (
          // Un tableau vide sans un mot se lit "c'est cassé".
          <p className="p-4 text-sm text-muted-foreground">
            {rows.length === 0
              ? "Aucun affilié inscrit pour l'instant."
              : "Aucun affilié ne correspond à cette recherche."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Affilié</th>
                <th className="px-3 py-2">Lien</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Avantage</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <RowAffilie
                  key={r.sa}
                  row={r}
                  ouvert={ouvert === r.sa}
                  onToggle={() => setOuvert(ouvert === r.sa ? null : r.sa)}
                  onMessage={setMsg}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RowAffilie({
  row,
  ouvert,
  onToggle,
  onMessage,
}: {
  row: LigneAffilie;
  ouvert: boolean;
  onToggle: () => void;
  onMessage: (m: string) => void;
}) {
  const a = row.code;
  const [code, setCode] = useState(a?.code ?? "");
  const [kind, setKind] = useState<"percent" | "free_days">(a?.kind ?? "percent");
  const [pct, setPct] = useState(String(a?.percentOff ?? 20));
  const [duration, setDuration] = useState<"once" | "forever" | "months">(a?.duration ?? "once");
  const [mois, setMois] = useState(String(a?.durationMonths ?? 3));
  const [jours, setJours] = useState(String(a?.freeDays ?? 60));
  const [debut, setDebut] = useState((a?.startsAt ?? "").slice(0, 10));
  const [fin, setFin] = useState((a?.expiresAt ?? "").slice(0, 10));
  const [parPalier, setParPalier] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      const res = await fetch("/affiliate/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          // On désigne l'affilié par son identifiant interne : c'est la
          // ligne qu'on regarde, il n'y a rien à deviner.
          sa: row.sa,
          kind,
          percent_off: Number(pct),
          duration,
          duration_months: Number(mois),
          free_days: Number(jours),
          percent_by_product: Object.fromEntries(
            Object.entries(parPalier)
              .filter(([, v]) => v.trim())
              .map(([k, v]) => [k, Number(v)]),
          ),
          starts_at: debut || null,
          expires_at: fin || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      // Un `ok: false` produit TOUJOURS quelque chose à l'écran.
      if (!j.ok) {
        onMessage(j.error ?? "L'avantage n'a pas été enregistré.");
        return;
      }
      onMessage(`Avantage enregistré pour ${row.email}.`);
      window.location.reload();
    } catch {
      onMessage("Réseau indisponible. Rien n'a été enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  const basculer = async () => {
    if (!a) return;
    const res = await fetch("/affiliate/api/admin/codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: a.code, enabled: !a.enabled }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!j.ok) {
      onMessage(j.error ?? "La mise à jour a échoué.");
      return;
    }
    window.location.reload();
  };

  return (
    <>
      <tr className="border-b last:border-0 align-top">
        <td className="px-3 py-2">
          <div className="font-medium">{row.displayName || row.email}</div>
          <div className="text-xs text-muted-foreground">{row.email}</div>
        </td>
        <td className="px-3 py-2 font-mono text-xs">{row.ref ?? "-"}</td>
        <td className="px-3 py-2">
          <span className={row.status === "active" ? "text-emerald-600" : "text-destructive"}>
            {row.status}
          </span>
        </td>
        <td className="px-3 py-2">{resume(a)}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {a && (
            <button type="button" onClick={() => void basculer()} className="mr-2 rounded-md border px-2 py-1 text-xs">
              {a.enabled ? "Éteindre" : "Rallumer"}
            </button>
          )}
          <button type="button" onClick={onToggle} className="rounded-md border px-2 py-1 text-xs">
            {ouvert ? "Fermer" : a ? "Modifier" : "Attribuer"}
          </button>
        </td>
      </tr>
      {ouvert && (
        <tr className="border-b bg-muted/20">
          <td colSpan={5} className="px-3 py-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Code
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="JOCELYNE20"
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm uppercase"
                />
              </label>
              <label className="text-sm">
                Nature de l&apos;avantage
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value === "free_days" ? "free_days" : "percent")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="percent">Une remise en %</option>
                  <option value="free_days">Des jours offerts</option>
                </select>
              </label>
              {kind === "free_days" ? (
                <label className="text-sm">
                  Jours offerts (60 = deux mois)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={jours}
                    onChange={(e) => setJours(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              ) : (
                <>
                  <label className="text-sm">
                    Remise (%)
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={pct}
                      onChange={(e) => setPct(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Elle porte sur
                    <select
                      value={duration}
                      onChange={(e) =>
                        setDuration(
                          e.target.value === "forever"
                            ? "forever"
                            : e.target.value === "months"
                              ? "months"
                              : "once",
                        )
                      }
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="once">La première échéance payée</option>
                      <option value="months">Un nombre de mois</option>
                      <option value="forever">Toutes les échéances (à vie)</option>
                    </select>
                  </label>
                  {duration === "months" && (
                    <label className="text-sm">
                      Nombre de mois
                      <input
                        type="number"
                        min={1}
                        max={36}
                        value={mois}
                        onChange={(e) => setMois(e.target.value)}
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                  )}
                </>
              )}
              <label className="text-sm">
                Ouvre le (facultatif)
                <input
                  type="date"
                  value={debut}
                  onChange={(e) => setDebut(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                Ferme le (facultatif)
                <input
                  type="date"
                  value={fin}
                  onChange={(e) => setFin(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>

            {kind === "percent" && (
              <div className="mt-3">
                <p className="text-xs font-medium">
                  Un taux différent selon la formule (facultatif, vide = le taux ci-dessus)
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {PALIERS.map((p) => (
                    <label key={p} className="text-xs">
                      {NOM_PALIER[p]}
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={parPalier[p] ?? ""}
                        onChange={(e) => setParPalier({ ...parPalier, [p]: e.target.value })}
                        className="mt-0.5 w-20 rounded-md border px-2 py-1 text-xs"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void enregistrer()}
              disabled={envoi || !code.trim()}
              className="mt-4 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {envoi ? "Enregistrement…" : "Enregistrer l'avantage"}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
