"use client";

// Client-only wrapper around PopquizEditClient. Forces ssr:false so
// the editor renders ONLY after mount on the client — sidesteps every
// SSR/CSR hydration pitfall (Date.now, toLocaleString, window-access,
// theme classes, etc.) that previously triggered React error #418
// and bricked the page into a 404-looking error.
//
// SSR brings nothing meaningful here: the page is auth-gated by the
// server component above (it 404s / redirects if you're not the
// owner), so visitors who land on the URL are already past the
// network-level gate. The brief loader on first render is a much
// better UX than React's silent unmount-to-error-page.

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import type PopquizEditClientType from "./PopquizEditClient";

const PopquizEditClientInner = dynamic(
  () => import("./PopquizEditClient"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

type Props = ComponentProps<typeof PopquizEditClientType>;

export default function PopquizEditClientLazy(props: Props) {
  return <PopquizEditClientInner {...props} />;
}
