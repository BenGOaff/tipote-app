// app/api/onboarding/chat/route.ts
// Alias stable pour le chat onboarding v2.
// ⚠️ Next.js n'autorise pas le "re-export" de `runtime` / `dynamic` / `maxDuration`.
// Donc on les redéclare ici, et on ré-exporte uniquement le handler POST.

import { POST as InnerPOST } from "../answers/chat/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = InnerPOST;
