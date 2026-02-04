// app/api/onboarding/chat/route.ts
// Wrapper route for onboarding chat v2.
// L’implémentation vit dans /app/api/onboarding/answers/chat/route.ts (historique).
// On expose /api/onboarding/chat pour que la nouvelle UI fonctionne,
// tout en gardant l'ancien chemin intact (zéro régression).

export { runtime, dynamic, maxDuration, POST } from "../answers/chat/route";
