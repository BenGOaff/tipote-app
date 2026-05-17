"use client";

// hooks/useShareDomain.ts
//
// Reads the creator's preferred share-link hostname from
// /api/profile/share-domain and exposes everything the share UI
// needs to render a domain selector + build share URLs.
//
// Used by quiz / popquiz / hosted-pages / link-in-bio editors so the
// same "pick which of my domains to share from" behaviour is wired
// identically across all four. The actual API logic + validation
// lives in app/api/profile/share-domain/route.ts — this hook is just
// a thin client cache + setter.
//
// Multi-profile: the API GET is project-scoped, so each profile sees
// its own list of options and its own stored default. Switching the
// active project resets both — no leakage between profiles.
//
// Lifecycle:
//   - On mount: GET the user's options + effective default.
//   - On change: optimistically update local state, fire-and-forget
//     PATCH to persist (failures are silent — the next GET reconciles).
//
// `shareOrigin` is the value callers should concatenate with /q/...,
// /pq/..., /p/... or a bare /<slug> on custom domains. It's always
// https:// once we know a domain, and falls back to
// window.location.origin while the GET is pending so links aren't
// briefly relative.

import { useCallback, useEffect, useState } from "react";

/** The 3 prefixed public-content namespaces in Tipote. Used to decide
 *  the URL shape on the main host (where the prefix is required to
 *  distinguish between content types). On a custom domain the prefix
 *  is always dropped — the catch-all in app/[publicSlug] resolves
 *  across all 3 in priority order. */
export type PublicContentKind = "q" | "pq" | "p";

export interface UseShareDomain {
  /** The selected hostname (e.g. "test.ethilife.fr"). null until the GET resolves. */
  shareDomain: string | null;
  /** All pickable hostnames. Length <= 1 means there's nothing to choose. */
  shareDomainOptions: string[];
  /**
   * The origin to prepend when building share URLs. Falls back to
   * window.location.origin until the GET resolves so links never
   * render as bare paths in the meantime.
   */
  shareOrigin: string;
  /** Updates local state immediately + persists the choice in the background. */
  setShareDomain: (next: string) => void;
  /**
   * True when the selected domain is a creator's custom domain (not
   * the multi-tenant main host). The catch-all route at
   * app/[publicSlug] serves bare slugs on these, so share URLs can
   * drop the /q/, /pq/ or /p/ prefix.
   */
  isCustomDomain: boolean;
  /**
   * Build the public share URL for a quiz, popquiz or hosted_page.
   * On a custom domain we drop the type prefix
   * (`test.ethilife.fr/<slug>`); on the main host we keep it
   * (`app.tipote.com/q/<slug>`) because the root is multi-tenant
   * and shared with the dashboard chrome.
   */
  buildPublicUrl: (kind: PublicContentKind, slug: string, suffix?: string) => string;
}

export function useShareDomain(): UseShareDomain {
  const [shareDomain, setShareDomainState] = useState<string | null>(null);
  const [shareDomainOptions, setShareDomainOptions] = useState<string[]>([]);
  const [mainHost, setMainHost] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    fetch("/api/profile/share-domain")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (aborted || !data?.ok) return;
        setShareDomainOptions(Array.isArray(data.options) ? data.options : []);
        setMainHost(typeof data.mainHost === "string" ? data.mainHost : null);
        setShareDomainState(
          typeof data.effectiveDefault === "string" ? data.effectiveDefault : null,
        );
      })
      .catch(() => { /* silent — selector just won't appear */ });
    return () => { aborted = true; };
  }, []);

  const setShareDomain = useCallback((next: string) => {
    setShareDomainState(next);
    fetch("/api/profile/share-domain", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: next }),
    }).catch(() => { /* silent — next GET reconciles */ });
  }, []);

  const shareOrigin = shareDomain
    ? `https://${shareDomain}`
    : (typeof window !== "undefined" ? window.location.origin : "");

  // True when the picked hostname is neither the main host (per API)
  // nor a development origin. We err on the side of "no" during the
  // brief pre-fetch window so URLs render with the legacy prefix
  // until we know better, matching the historical behaviour.
  const isCustomDomain =
    !!shareDomain && !!mainHost && shareDomain !== mainHost;

  const buildPublicUrl = useCallback(
    (kind: PublicContentKind, slug: string, suffix = "") => {
      if (!shareOrigin) return `/${slug}${suffix}`;
      return isCustomDomain
        ? `${shareOrigin}/${slug}${suffix}`
        : `${shareOrigin}/${kind}/${slug}${suffix}`;
    },
    [shareOrigin, isCustomDomain],
  );

  return {
    shareDomain,
    shareDomainOptions,
    shareOrigin,
    setShareDomain,
    isCustomDomain,
    buildPublicUrl,
  };
}
