// app/api/systeme-io/user-webhook/route.ts
// Receives webhook events from users' Systeme.io accounts.
// Each user has unique secret token in the URL for identification.
// Handles: NEW_SALE, SALE_CANCELED, CONTACT_CREATED
// Feeds: sio_sales, offer_metrics, toast_events, notifications, leads

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// ─── Helpers ───

function extractEvent(body: any): string {
  // SIO sends event type at root level or nested in "event"
  return String(body?.event ?? body?.type ?? body?.event_type ?? "").toUpperCase();
}

function extractCustomer(body: any): {
  email: string;
  firstName: string;
  lastName: string;
  contactId: string;
} {
  const c = body?.customer ?? body?.data?.customer ?? body;
  const fields = c?.fields ?? {};
  return {
    email: String(c?.email ?? "").trim().toLowerCase(),
    firstName: String(fields?.first_name ?? c?.firstName ?? "").trim(),
    lastName: String(fields?.surname ?? fields?.last_name ?? c?.lastName ?? "").trim(),
    contactId: String(c?.contactId ?? c?.contact_id ?? c?.id ?? ""),
  };
}

function extractOrder(body: any): {
  orderId: string;
  amount: number;
  currency: string;
  createdAt: string;
} {
  const order = body?.order ?? body?.data?.order ?? {};
  const pricePlan = body?.pricePlan ?? body?.price_plan ?? body?.data?.pricePlan ?? {};
  // Amount can be in order or at root
  const rawAmount = order?.amount ?? body?.amount ?? pricePlan?.price ?? 0;
  return {
    orderId: String(order?.id ?? body?.orderId ?? ""),
    amount: typeof rawAmount === "number" ? rawAmount : parseFloat(rawAmount) || 0,
    currency: String(order?.currency ?? body?.currency ?? "EUR").toUpperCase(),
    createdAt: String(order?.createdAt ?? body?.createdAt ?? new Date().toISOString()),
  };
}

function extractOffer(body: any): {
  offerName: string;
  offerId: string;
  pricePlanName: string;
  pricePlanId: string;
} {
  const pp = body?.pricePlan ?? body?.price_plan ?? body?.data?.pricePlan ?? {};
  return {
    offerName: String(pp?.name ?? pp?.innerName ?? "").trim() || "Offre",
    offerId: String(pp?.offerId ?? pp?.offer_id ?? ""),
    pricePlanName: String(pp?.name ?? "").trim(),
    pricePlanId: String(pp?.id ?? ""),
  };
}

// ─── Sale notification messages (i18n) ───

const SALE_MESSAGES: Record<string, { title: string; body: string }> = {
  fr: {
    title: "Nouvelle vente !",
    body: "{name} vient d'acheter \"{offer}\" ({amount})",
  },
  en: {
    title: "New sale!",
    body: "{name} just purchased \"{offer}\" ({amount})",
  },
  es: {
    title: "Nueva venta!",
    body: "{name} acaba de comprar \"{offer}\" ({amount})",
  },
  it: {
    title: "Nuova vendita!",
    body: "{name} ha appena acquistato \"{offer}\" ({amount})",
  },
  ar: {
    title: "عملية بيع جديدة!",
    body: "{name} اشترى للتو \"{offer}\" ({amount})",
  },
};

const CANCEL_MESSAGES: Record<string, { title: string; body: string }> = {
  fr: {
    title: "Vente annulée",
    body: "L'achat de \"{offer}\" par {name} a été annulé.",
  },
  en: {
    title: "Sale canceled",
    body: "The purchase of \"{offer}\" by {name} has been canceled.",
  },
  es: {
    title: "Venta cancelada",
    body: "La compra de \"{offer}\" por {name} ha sido cancelada.",
  },
  it: {
    title: "Vendita annullata",
    body: "L'acquisto di \"{offer}\" da parte di {name} è stato annullato.",
  },
  ar: {
    title: "تم إلغاء البيع",
    body: "تم إلغاء شراء \"{offer}\" من قبل {name}.",
  },
};

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function getUserLocale(uiLocale: string | null): string {
  const supported = ["fr", "en", "es", "it", "ar"];
  return supported.includes(uiLocale ?? "") ? uiLocale! : "fr";
}

// ─── Event Handlers ───

async function handleNewSale(
  userId: string,
  projectId: string | null,
  body: any,
): Promise<void> {
  const customer = extractCustomer(body);
  const order = extractOrder(body);
  const offer = extractOffer(body);

  if (!customer.email && !order.orderId) {
    console.warn("[user-webhook] NEW_SALE: no email or order ID, skipping");
    return;
  }

  // 1. Insert into sio_sales
  const { error: salesErr } = await supabaseAdmin.from("sio_sales").upsert(
    {
      user_id: userId,
      project_id: projectId,
      sio_order_id: order.orderId || crypto.randomUUID(),
      sio_contact_id: customer.contactId,
      customer_email: customer.email,
      customer_first_name: customer.firstName,
      customer_last_name: customer.lastName,
      offer_name: offer.offerName,
      offer_id: offer.offerId,
      price_plan_name: offer.pricePlanName,
      price_plan_id: offer.pricePlanId,
      amount: order.amount,
      currency: order.currency,
      status: "completed",
      raw_payload: body,
    },
    { onConflict: "user_id,sio_order_id" },
  );

  if (salesErr) {
    console.error("[user-webhook] sio_sales insert error:", salesErr.message);
  }

  // 2. Update offer_metrics (increment revenue + sales_count for current month)
  const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
  const { data: existing } = await supabaseAdmin
    .from("offer_metrics")
    .select("id, revenue, sales_count")
    .eq("user_id", userId)
    .eq("offer_name", offer.offerName)
    .eq("month", currentMonth)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("offer_metrics")
      .update({
        revenue: (parseFloat(existing.revenue) || 0) + order.amount,
        sales_count: (existing.sales_count || 0) + 1,
        is_paid: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("offer_metrics").insert({
      user_id: userId,
      project_id: projectId,
      offer_name: offer.offerName,
      offer_level: "user_offer",
      is_paid: true,
      month: currentMonth,
      revenue: order.amount,
      sales_count: 1,
    });
  }

  // 3. Feed toast widgets (social proof: "Marie vient d'acheter...")
  const { data: widgets } = await supabaseAdmin
    .from("toast_widgets")
    .select("id")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (widgets && widgets.length > 0) {
    for (const widget of widgets) {
      await supabaseAdmin.from("toast_events").insert({
        widget_id: widget.id,
        event_type: "purchase",
        visitor_name: customer.firstName || customer.email.split("@")[0],
        page_url: "",
        metadata: {
          offer_name: offer.offerName,
          amount: order.amount,
          currency: order.currency,
        },
      });
    }
  }

  // 4. Create notification
  const { data: bp } = await supabaseAdmin
    .from("business_profiles")
    .select("ui_locale")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const locale = getUserLocale(bp?.ui_locale);
  const msgs = SALE_MESSAGES[locale] || SALE_MESSAGES.fr;
  const displayName = customer.firstName || customer.email.split("@")[0];
  const amountStr = formatAmount(order.amount, order.currency);

  await createNotification({
    user_id: userId,
    project_id: projectId,
    type: "sale",
    title: msgs.title,
    body: msgs.body
      .replace("{name}", displayName)
      .replace("{offer}", offer.offerName)
      .replace("{amount}", amountStr),
    icon: "💰",
    action_url: "/dashboard",
    action_label: locale === "fr" ? "Voir le tableau de bord" : "View dashboard",
    meta: {
      sio_order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      offer_name: offer.offerName,
      customer_email: customer.email,
    },
  });

  console.log(`[user-webhook] NEW_SALE processed: ${customer.email} → ${offer.offerName} (${amountStr})`);
}

async function handleSaleCanceled(
  userId: string,
  projectId: string | null,
  body: any,
): Promise<void> {
  const customer = extractCustomer(body);
  const order = extractOrder(body);
  const offer = extractOffer(body);

  // Update sio_sales status
  if (order.orderId) {
    await supabaseAdmin
      .from("sio_sales")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("sio_order_id", order.orderId);
  }

  // Decrement offer_metrics
  const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
  const { data: existing } = await supabaseAdmin
    .from("offer_metrics")
    .select("id, revenue, sales_count")
    .eq("user_id", userId)
    .eq("offer_name", offer.offerName)
    .eq("month", currentMonth)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("offer_metrics")
      .update({
        revenue: Math.max(0, (parseFloat(existing.revenue) || 0) - order.amount),
        sales_count: Math.max(0, (existing.sales_count || 0) - 1),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  }

  // Notification
  const { data: bp } = await supabaseAdmin
    .from("business_profiles")
    .select("ui_locale")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const locale = getUserLocale(bp?.ui_locale);
  const msgs = CANCEL_MESSAGES[locale] || CANCEL_MESSAGES.fr;
  const displayName = customer.firstName || customer.email.split("@")[0];

  await createNotification({
    user_id: userId,
    project_id: projectId,
    type: "sale_canceled",
    title: msgs.title,
    body: msgs.body
      .replace("{name}", displayName)
      .replace("{offer}", offer.offerName),
    icon: "❌",
  });

  console.log(`[user-webhook] SALE_CANCELED processed: ${order.orderId}`);
}

async function handleContactCreated(
  userId: string,
  projectId: string | null,
  body: any,
): Promise<void> {
  const customer = extractCustomer(body);
  if (!customer.email) return;

  // Upsert into leads table (source: systeme_io)
  const { error } = await supabaseAdmin.from("leads").upsert(
    {
      user_id: userId,
      project_id: projectId,
      email: customer.email,
      first_name: customer.firstName || null,
      last_name: customer.lastName || null,
      source: "systeme_io",
      source_name: "Systeme.io",
      exported_sio: true,
    },
    { onConflict: "user_id,email" },
  );

  if (error) {
    console.error("[user-webhook] leads upsert error:", error.message);
  } else {
    console.log(`[user-webhook] CONTACT_CREATED: ${customer.email} synced to leads`);
  }
}

// ─── Main Route ───

export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    // Look up the webhook registration by secret token
    const { data: reg } = await supabaseAdmin
      .from("sio_webhook_registrations")
      .select("id, user_id, project_id, event_type")
      .eq("secret_token", token)
      .eq("status", "active")
      .maybeSingle();

    if (!reg) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Parse body
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Update last_received_at
    await supabaseAdmin
      .from("sio_webhook_registrations")
      .update({ last_received_at: new Date().toISOString() })
      .eq("id", reg.id);

    // Route to handler
    const event = extractEvent(body) || reg.event_type;

    switch (event) {
      case "NEW_SALE":
        await handleNewSale(reg.user_id, reg.project_id, body);
        break;
      case "SALE_CANCELED":
        await handleSaleCanceled(reg.user_id, reg.project_id, body);
        break;
      case "CONTACT_CREATED":
        await handleContactCreated(reg.user_id, reg.project_id, body);
        break;
      default:
        console.log(`[user-webhook] Unknown event type: ${event}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[user-webhook] Error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
