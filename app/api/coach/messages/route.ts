// app/api/coach/messages/route.ts
// Alias stable pour la persistance mémoire Coach IA.
//
// ⚠️ Next.js (Turbopack) n’autorise pas le re-export de la config de route (`runtime`, `dynamic`).
// Donc : on proxy uniquement GET/POST, et on redéfinit la config ici.

import { GET as ChatMessagesGET, POST as ChatMessagesPOST } from "../chat/messages/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = ChatMessagesGET;
export const POST = ChatMessagesPOST;
