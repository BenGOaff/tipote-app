// src/data/systemeTemplates.ts
// ⚠️ On a 2 fichiers "systemeTemplates.ts" (root /data + ici).
// Source de vérité = /data/systemeTemplates.ts (car tsconfig "@/*" pointe sur la racine).
// Pour éviter toute divergence / import accidentel, ce fichier est un proxy.

export * from "../../data/systemeTemplates";
