// lib/ia/echecIa.ts
//
// LA RAISON D'UN ÉCHEC IA DOIT ARRIVER JUSQU'À L'ÉCRAN.
//
// -- LE PROBLÈME, MESURÉ LE 31 AOÛT ------------------------------------
//
// Cloudflare sert nos six domaines et REMPLACE le corps d'un 5xx par sa
// propre page (`error code: 502`, en text/plain). Un écran qui lit
// `reason` dans le JSON reçoit alors `undefined` et retombe sur sa
// phrase générique. Mesuré deux fois le même jour, sur `signup` et sur
// `newsletter`.
//
// Les routes de génération de quiz, de rééquilibrage et de réécriture
// répondaient encore en 500 / 502 / 503 : leur raison n'atteignait donc
// jamais la créatrice, et l'AGENTS.md le notait comme "à reprendre"
// depuis le 1er septembre.
//
// -- ET LE DÉFAUT PLUS GRAVE QUE LE STATUT -----------------------------
//
// `/api/quiz/generate` répondait `{ error: "Claude API key missing on
// the server." }`, et le client affichait ce champ TEL QUEL. Une
// créatrice espagnole lisait donc une phrase technique en anglais. Le
// serveur renvoie la RAISON, l'interface dit comment la dire : c'est la
// règle du 3 août (suppression d'un quiz) et du 7 août (import PDF),
// et elle vaut d'autant plus que l'interface existe en 7 langues.
//
// -- POURQUOI 200 ET PAS 5xx -------------------------------------------
//
// Un 5xx ne se justifie que là où un FOURNISSEUR doit réessayer, c'est à
// dire dans un webhook. Un navigateur ne réessaie rien tout seul : le
// statut ne lui sert à rien, le corps lui sert à tout.
//
// Les 4xx RESTENT (401, 403, 404, 400) : ils passent intacts à travers
// Cloudflare et ils disent la bonne chose.

import { NextResponse } from "next/server";
import type { AiFailure } from "@/lib/aiFailure";

/**
 * Les raisons que l'interface sait traduire.
 *
 * Elles vivent dans le namespace `erreursIa` des 7 fichiers de
 * `messages/`, en phrases NEUTRES : les mêmes servent la génération d'un
 * quiz, un rééquilibrage et les générateurs. Celles de
 * `generateurs.erreurs` parlent d'« écriture », ce qui sonne faux quand
 * on génère un quiz.
 */
export type RaisonIa =
  | AiFailure
  | "unreadable"
  | "rate_limited"
  | "not_configured"
  | "generic";

/**
 * La réponse d'un échec IA sur un chemin lu par un NAVIGATEUR.
 *
 * 200 délibérément : voir l'en-tête. Le `Content-Type` reste
 * `application/json`, et c'est ce qui permet au client de distinguer une
 * erreur d'un flux SSE (`lireEchecIa`), sans jamais tester `res.ok`.
 */
export function echecIa(raison: RaisonIa, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, reason: raison, ...(extra ?? {}) });
}
