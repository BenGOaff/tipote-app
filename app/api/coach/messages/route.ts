// app/api/coach/messages/route.ts
// Alias stable pour la persistance mémoire Coach IA.
//
// Historique : la persistance a d’abord été implémentée sous /api/coach/chat/messages.
// Le front (CoachWidget) consomme /api/coach/messages.
// On expose donc cet alias sans dupliquer la logique.

export { GET, POST, runtime, dynamic } from "../chat/messages/route";
