// hooks/use-copy-to-clipboard.ts
//
// Tiny shared hook so the "copy the CNAME" / "copy the IP" /
// "copy the embed snippet" buttons across the app stop reinventing
// the same `navigator.clipboard.writeText` + reset-after-2s dance.

import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  // Auto-reset the "copied" flag after this delay so the button can
  // flip back to its idle state. 2 seconds is the de-facto industry
  // default (GitHub, Vercel, …).
  resetMs?: number;
};

export function useCopyToClipboard(options: Options = {}) {
  const { resetMs = 2000 } = options;
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timer if the hook unmounts mid-flight to avoid
  // setting state on an unmounted component.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch {
        // Permission denied, http (not https) context, etc. — let the
        // caller decide whether to toast an error.
        return false;
      }
    },
    [resetMs],
  );

  return { copy, copied };
}
