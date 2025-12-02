'use client';

import React, { useState } from 'react';

type SubscriptionItem = {
  id: number;
  [key: string]: any;
};

type SubscriptionsResponse = {
  contactId?: number;
  limit?: number;
  count?: number;
  subscriptions?: SubscriptionItem[];
  raw?: any;
};

type CancelResponse = {
  status?: string;
  subscriptionId?: string;
  cancel?: string;
  error?: string;
};

export default function SystemeIoToolsPage() {
  const [contactIdInput, setContactIdInput] = useState<string>('');
  const [limitInput, setLimitInput] = useState<string>('50');
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listResult, setListResult] = useState<SubscriptionsResponse | null>(
    null,
  );

  const [subscriptionIdInput, setSubscriptionIdInput] = useState<string>('');
  const [cancelMode, setCancelMode] = useState<'Now' | 'WhenBillingCycleEnds'>(
    'Now',
  );
  const [loadingCancel, setLoadingCancel] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<CancelResponse | null>(null);

  async function handleListSubscriptions(e: React.FormEvent) {
    e.preventDefault();
    setLoadingList(true);
    setListError(null);
    setListResult(null);

    try {
      const body: any = {};
      if (contactIdInput.trim() !== '') {
        const asNumber = Number(contactIdInput.trim());
        if (!Number.isFinite(asNumber) || asNumber <= 0) {
          throw new Error('sio_contact_id doit être un entier positif');
        }
        // On garde le nom sio_contact_id pour rester cohérent
        // avec les tests PowerShell que tu as déjà.
        body.sio_contact_id = asNumber;
      }
      if (limitInput.trim() !== '') {
        const l = Number(limitInput.trim());
        if (Number.isFinite(l) && l > 0) {
          body.limit = l;
        }
      }

      const res = await fetch('/api/systeme-io/subscriptions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Erreur HTTP ${res.status} lors du listing des abonnements: ${text}`,
        );
      }

      const json = (await res.json()) as SubscriptionsResponse;
      setListResult(json);
    } catch (err: any) {
      console.error('[SystemeIoTools] List error', err);
      setListError(err?.message ?? 'Erreur inconnue lors du listing');
    } finally {
      setLoadingList(false);
    }
  }

  async function handleCancelSubscription(e: React.FormEvent) {
    e.preventDefault();
    setLoadingCancel(true);
    setCancelError(null);
    setCancelResult(null);

    try {
      if (subscriptionIdInput.trim() === '') {
        throw new Error('SubscriptionId obligatoire');
      }

      const body = {
        subscriptionId: subscriptionIdInput.trim(),
        cancel: cancelMode,
      };

      const res = await fetch('/api/systeme-io/subscriptions/cancel', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // Si l’API renvoie un 204 ou autre sans JSON, on construit une réponse simple
        json = { status: res.ok ? 'ok' : 'error', raw: text };
      }

      if (!res.ok) {
        throw new Error(
          json?.error ??
            `Erreur HTTP ${res.status} lors de l’annulation: ${text}`,
        );
      }

      setCancelResult(json as CancelResponse);
    } catch (err: any) {
      console.error('[SystemeIoTools] Cancel error', err);
      setCancelError(err?.message ?? 'Erreur inconnue lors de l’annulation');
    } finally {
      setLoadingCancel(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 rounded-2xl bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-2 border-b pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Outils Systeme.io (Tipote)
          </h1>
          <p className="text-sm text-zinc-600">
            Page interne pour tester l’API Systeme.io via les endpoints Next :
            <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 text-xs">
              /api/systeme-io/subscriptions
            </code>
            et
            <code className="ml-1 rounded bg-zinc-100 px-1 py-0.5 text-xs">
              /api/systeme-io/subscriptions/cancel
            </code>
            .
          </p>
        </header>

        {/* SECTION LISTING */}
        <section className="flex flex-col gap-4 rounded-xl border p-4">
          <h2 className="text-lg font-medium">1. Lister les abonnements</h2>
          <p className="text-sm text-zinc-600">
            Optionnellement, indique un{' '}
            <span className="font-mono">sio_contact_id</span> (par exemple{' '}
            <span className="font-mono">16366834</span>) et/ou une limite.
          </p>

          <form
            onSubmit={handleListSubscriptions}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700">
                sio_contact_id
              </label>
              <input
                type="text"
                value={contactIdInput}
                onChange={(e) => setContactIdInput(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="ex : 16366834"
              />
            </div>

            <div className="flex w-28 flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700">limit</label>
              <input
                type="number"
                min={1}
                max={100}
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
              />
            </div>

            <button
              type="submit"
              disabled={loadingList}
              className="mt-5 h-9 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 sm:mt-auto"
            >
              {loadingList ? 'Chargement…' : 'Lister les abonnements'}
            </button>
          </form>

          {listError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {listError}
            </p>
          )}

          {listResult && (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                {typeof listResult.contactId !== 'undefined' && (
                  <span>
                    contactId :{' '}
                    <span className="font-mono">
                      {listResult.contactId}
                    </span>
                  </span>
                )}
                {typeof listResult.limit !== 'undefined' && (
                  <span>
                    limit :{' '}
                    <span className="font-mono">{listResult.limit}</span>
                  </span>
                )}
                {typeof listResult.count !== 'undefined' && (
                  <span>
                    count :{' '}
                    <span className="font-mono">{listResult.count}</span>
                  </span>
                )}
              </div>

              <div className="overflow-auto rounded-lg border text-xs">
                <table className="min-w-full border-collapse">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="border-b px-2 py-1 text-left font-medium">
                        id
                      </th>
                      <th className="border-b px-2 py-1 text-left font-medium">
                        status
                      </th>
                      <th className="border-b px-2 py-1 text-left font-medium">
                        createdAt
                      </th>
                      <th className="border-b px-2 py-1 text-left font-medium">
                        cancelledAt
                      </th>
                      <th className="border-b px-2 py-1 text-left font-medium">
                        pricePlan.name
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(listResult.subscriptions ?? []).map((sub) => (
                      <tr key={sub.id}>
                        <td className="border-b px-2 py-1 font-mono">
                          {sub.id}
                        </td>
                        <td className="border-b px-2 py-1">
                          {String((sub as any).status ?? '')}
                        </td>
                        <td className="border-b px-2 py-1">
                          {String((sub as any).createdAt ?? '')}
                        </td>
                        <td className="border-b px-2 py-1">
                          {String((sub as any).cancelledAt ?? '')}
                        </td>
                        <td className="border-b px-2 py-1">
                          {String((sub as any).pricePlan?.name ?? '')}
                        </td>
                      </tr>
                    ))}
                    {(listResult.subscriptions ?? []).length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-2 text-center text-zinc-500"
                        >
                          Aucun abonnement trouvé.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <details className="rounded-lg border bg-zinc-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium">
                  Voir la réponse brute
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto text-[11px]">
                  {JSON.stringify(listResult.raw ?? listResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>

        {/* SECTION CANCEL */}
        <section className="flex flex-col gap-4 rounded-xl border p-4">
          <h2 className="text-lg font-medium">
            2. Annuler un abonnement Systeme.io
          </h2>
          <p className="text-sm text-zinc-600">
            Tu peux récupérer l’<span className="font-mono">id</span> dans le
            tableau ci-dessus, puis choisir le mode d’annulation.
          </p>

          <form
            onSubmit={handleCancelSubscription}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700">
                subscriptionId
              </label>
              <input
                type="text"
                value={subscriptionIdInput}
                onChange={(e) => setSubscriptionIdInput(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="ex : 1713851"
              />
            </div>

            <div className="flex w-56 flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700">
                cancel mode
              </label>
              <select
                value={cancelMode}
                onChange={(e) =>
                  setCancelMode(e.target.value as 'Now' | 'WhenBillingCycleEnds')
                }
                className="h-9 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
              >
                <option value="Now">Now (annulation immédiate)</option>
                <option value="WhenBillingCycleEnds">
                  WhenBillingCycleEnds (à la fin de la période)
                </option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loadingCancel}
              className="mt-5 h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60 sm:mt-auto"
            >
              {loadingCancel ? 'Annulation…' : 'Annuler cet abonnement'}
            </button>
          </form>

          {cancelError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {cancelError}
            </p>
          )}

          {cancelResult && (
            <div className="space-y-2">
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Résultat :{' '}
                <span className="font-mono">
                  {cancelResult.status ?? 'ok'}
                </span>{' '}
                – id{' '}
                <span className="font-mono">
                  {cancelResult.subscriptionId ?? subscriptionIdInput}
                </span>{' '}
                – mode{' '}
                <span className="font-mono">
                  {cancelResult.cancel ?? cancelMode}
                </span>
              </p>
              <details className="rounded-lg border bg-zinc-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium">
                  Voir la réponse brute
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto text-[11px]">
                  {JSON.stringify(cancelResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
