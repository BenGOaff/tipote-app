"use client";

// app/affiliate/admin/codes/CodesAdminForm.tsx
//
// Créer un code de réduction pour une affiliée, et éteindre ceux qui ne
// servent plus. Rien d'autre : la vérification côté acheteur vit dans
// `/api/affiliate/code-reduction`, et un écran qui recalculerait la même
// décision finirait par mentir.

import { useState } from "react";

export type CodeRow = {
  code: string;
  sa: string;
  email: string | null;
  percent_off: number;
  produits: string[] | null;
  expires_at: string | null;
  enabled: boolean;
  note: string | null;
};

export function CodesAdminForm({ initial }: { initial: CodeRow[] }) {
  const [rows, setRows] = useState<CodeRow[]>(initial);
  const [code, setCode] = useState("");
  const [cible, setCible] = useState("");
  const [pct, setPct] = useState("20");
  const [expire, setExpire] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const creer = async () => {
    setEnvoi(true);
    setMsg(null);
    try {
      const res = await fetch("/affiliate/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Trois entrées pour désigner l'affiliée, et le serveur lit celle
        // qui correspond : Béné a l'une ou l'autre sous la main selon
        // d'où elle vient.
        body: JSON.stringify({
          code,
          ref: cible,
          email: cible,
          sa: cible,
          percent_off: Number(pct),
          expires_at: expire || null,
          note,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      // Un `ok: false` produit TOUJOURS quelque chose à l'écran.
      if (!j.ok) {
        setMsg(j.error ?? "Le code n'a pas été créé.");
        return;
      }
      setMsg(`Code créé. Il ne marchera que sur le lien de cette affiliée.`);
      setCode("");
      setNote("");
      // On recharge plutôt que de deviner la ligne écrite : l'écran doit
      // montrer ce qui est EN BASE, pas ce qu'on croit y avoir mis.
      window.location.reload();
    } catch {
      setMsg("Réseau indisponible. Rien n'a été créé.");
    } finally {
      setEnvoi(false);
    }
  };

  const basculer = async (row: CodeRow) => {
    const res = await fetch("/affiliate/api/admin/codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: row.code, enabled: !row.enabled }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!j.ok) {
      setMsg(j.error ?? "La mise à jour a échoué.");
      return;
    }
    setRows((p) => p.map((r) => (r.code === row.code ? { ...r, enabled: !r.enabled } : r)));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Attribuer un code</h2>
        <div className="grid gap-3 sm:grid-cols-2">
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
            Affiliée (code public, identifiant, ou email)
            <input
              value={cible}
              onChange={(e) => setCible(e.target.value)}
              placeholder="jocelyne"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
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
            Expire le (facultatif)
            <input
              type="date"
              value={expire}
              onChange={(e) => setExpire(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Note pour toi (facultatif)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lancement de sa formation, octobre"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void creer()}
          disabled={envoi || !code.trim() || !cible.trim()}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {envoi ? "Création…" : "Créer le code"}
        </button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </div>

      <div className="rounded-lg border">
        {rows.length === 0 ? (
          // Un tableau vide sans un mot se lit "c'est cassé" ou "je n'ai
          // rien à faire ici", et les deux coûtent du temps.
          <p className="p-4 text-sm text-muted-foreground">
            Aucun code pour l&apos;instant. Un code n&apos;est utile que si tu as promis une
            remise à quelqu&apos;un : il ne marchera que sur SON lien.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Affiliée</th>
                <th className="px-3 py-2">Remise</th>
                <th className="px-3 py-2">Fin</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono">{r.code}</td>
                  <td className="px-3 py-2">{r.email ?? r.sa}</td>
                  <td className="px-3 py-2">-{r.percent_off} %</td>
                  <td className="px-3 py-2">
                    {r.expires_at ? new Date(r.expires_at).toLocaleDateString("fr-FR") : "sans fin"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void basculer(r)}
                      className="rounded-md border px-3 py-1 text-xs"
                    >
                      {r.enabled ? "Éteindre" : "Rallumer"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
