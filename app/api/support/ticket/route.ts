// app/api/support/ticket/route.ts
//
// LA PORTE COMMUNE DU SUPPORT. Publique, sans compte.
//
//   POST { email, message?, conversation?, product?, ... }  ->  { ok }
//
// Béné, 23 août 2026 : "s'il n'a pas reçu ses accès, comment il accède à
// quiz.tipote.com/support ? Je veux un service de ticketing dans le
// centre d'aide commun à toutes les app, essentiellement pour Tiquiz et
// L'Atelier, avec ticket relié à la fiche client si elle existe."
//
// La porte est ici, parce que le centre d'aide est l'adresse partagée
// par les trois produits et qu'on ne demande à personne de deviner sur
// quelle app écrire. La FILE, elle, vit dans Tiquiz : le ticket doit
// s'afficher sur la fiche client, à côté des accès et des paiements.
// Voir `lib/support/relayTicket.ts`.
//
// Cette route servait l'escalade du chat depuis le 12 mars et écrivait
// dans la table LOCALE. Elle relaie maintenant, et ne garde le local que
// comme filet : une demande ne se perd jamais.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ecrireEnSecours, messageLisible, relayerVersTiquiz } from "@/lib/support/relayTicket";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().max(100).optional(),
  subject: z.string().trim().max(200).optional(),
  // Le formulaire envoie un message, le chat envoie une conversation.
  // Les deux sont acceptés, et au moins l'un des deux est exigé plus bas.
  message: z.string().trim().max(5000).optional(),
  conversation: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(30)
    .optional(),
  product: z.string().trim().max(40).optional(),
  page: z.string().trim().max(300).optional(),
  locale: z.string().trim().max(8).optional(),
});

// 3 tickets / heure / IP. La limite est ICI, sur l'adresse réelle de la
// personne : le relais vers Tiquiz part toujours de la même IP serveur,
// donc la limite de là-bas ne peut pas faire ce travail.
const compteur = new Map<string, { n: number; jusqu: number }>();

function tropDeDemandes(ip: string): boolean {
  const now = Date.now();
  const vu = compteur.get(ip);
  if (!vu || now > vu.jusqu) {
    compteur.set(ip, { n: 1, jusqu: now + 3_600_000 });
    return false;
  }
  vu.n += 1;
  if (compteur.size > 5000) compteur.clear();
  return vu.n > 3;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (tropDeDemandes(ip)) {
    return NextResponse.json({ ok: false, reason: "trop_de_demandes" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const d = parsed.data;
  const message = messageLisible(d.message, d.conversation);
  if (message.length < 10) {
    return NextResponse.json({ ok: false, reason: "message_trop_court" }, { status: 400 });
  }

  const ticket = {
    email: d.email,
    name: d.name ?? null,
    subject: d.subject ?? null,
    message,
    product: d.product ?? "tipote",
    page: d.page ?? "centre d'aide",
    locale: d.locale ?? "fr",
    conversation: d.conversation ?? [],
  };

  const relais = await relayerVersTiquiz(ticket);
  if (relais.ok) return NextResponse.json({ ok: true });

  // LE FILET. Elle a vu "envoyé", donc la demande doit exister quelque
  // part, même si l'autre app ne répond pas.
  console.error(
    `[support] relais vers Tiquiz impossible (${relais.reason}) : ticket de ${d.email} ` +
      `garde EN LOCAL. A reprendre dans l'admin de Tipote.`,
  );
  const secours = await ecrireEnSecours(ticket);
  if (!secours) {
    return NextResponse.json({ ok: false, reason: "write_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, secours: true });
}
