// app/api/strategy/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY_OWNER!,
});

// GET = récupérer la stratégie existante
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("strategies")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ strategy: data ?? null });
}

// POST = générer (ou régénérer) la stratégie
export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: récupérer les données d'onboarding de ton user
  // (business_profiles, business_plan, etc.)

  // TODO: aller chercher les ressources pertinentes dans resource_chunks
  // et les utiliser comme contexte pour la génération

  // Pour l’instant, on fait une FAUSSE génération avec des données mockées
  const fakeStrategy = {
    objective_revenue: "50K€/mois",
    horizon: "90 jours",
    persona: {
      profile: "Entrepreneur digital 30-45 ans",
      pains: [
        "Manque de temps pour créer du contenu",
        "Stratégie marketing incohérente",
        "Difficulté à générer des leads qualifiés",
      ],
      goals: [
        "Automatiser la création de contenu",
        "Augmenter les revenus de 50%",
        "Développer une audience engagée",
      ],
    },
    pyramids: {
      chosenId: "pyramid-1",
      variants: [
        {
          id: "pyramid-1",
          title: "Pyramide 1 - Formation + Coaching",
          levels: [
            { label: "High Ticket", price: "1997€", description: "Coaching stratégique 3 mois" },
            { label: "Middle Ticket", price: "497€", description: "Programme de groupe 8 semaines" },
            { label: "Lead Magnet", price: "Gratuit", description: "Guide PDF + mini formation" },
          ],
        },
        {
          id: "pyramid-2",
          title: "Pyramide 2 - Programme en ligne",
          levels: [
            { label: "High Ticket", price: "1497€", description: "Accompagnement premium + communauté" },
            { label: "Middle Ticket", price: "297€", description: "Cours en ligne complet" },
            { label: "Lead Magnet", price: "Gratuit", description: "Checklist + template Notion" },
          ],
        },
        {
          id: "pyramid-3",
          title: "Pyramide 3 - Service done-for-you",
          levels: [
            { label: "High Ticket", price: "2997€", description: "Service clé en main" },
            { label: "Middle Ticket", price: "797€", description: "Audit + plan d'action détaillé" },
            { label: "Lead Magnet", price: "Gratuit", description: "Audit express à distance" },
          ],
        },
      ],
    },
  };

  const { data, error } = await supabase
    .from("strategies")
    .upsert(
      {
        user_id: user.id,
        ...fakeStrategy,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ strategy: data });
}
