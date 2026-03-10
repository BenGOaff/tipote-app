// app/api/pages/linkinbio/route.ts
// POST: Create a new link-in-bio page with default branding and starter blocks.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildLinkinbioPage, type LinkinbioPageData } from "@/lib/linkinbioBuilder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Fetch user's branding & profile
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("business_name, brand_name, brand_color_base, brand_color_accent, brand_font, brand_logo_url, brand_author_photo_url, niche, instagram_url, linkedin_url, youtube_url, tiktok_url, pinterest_url, threads_url, facebook_url, website_url, custom_links")
    .eq("user_id", userId)
    .maybeSingle();

  const p = profile as any;
  const displayName = p?.brand_name || p?.business_name || session.user.email?.split("@")[0] || "My page";

  // Generate a slug from the display name
  const baseSlug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "my-links";

  // Make unique slug by appending random suffix
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  // Build brand tokens
  const brandTokens: Record<string, any> = {};
  if (p?.brand_color_base) brandTokens["colors-primary"] = p.brand_color_base;
  if (p?.brand_color_accent) brandTokens["colors-accent"] = p.brand_color_accent;
  if (p?.brand_font) brandTokens["typography-heading"] = p.brand_font;

  // Build content_data with theme settings
  const contentData: Record<string, any> = {
    bio: p?.niche || "",
    theme: "minimal",
    buttonStyle: "rounded",
    backgroundType: "solid",
    backgroundValue: "#f8fafc",
  };

  // Create the hosted_page
  const { data: page, error: pageErr } = await supabase
    .from("hosted_pages")
    .insert({
      user_id: userId,
      title: displayName,
      slug,
      page_type: "linkinbio",
      status: "draft",
      template_kind: "capture", // required field, not used for linkinbio
      template_id: "linkinbio-01",
      content_data: contentData,
      brand_tokens: Object.keys(brandTokens).length > 0 ? brandTokens : null,
      meta_title: displayName,
      meta_description: contentData.bio || "",
      html_snapshot: "", // will be built after links are created
    })
    .select("id, slug")
    .single();

  if (pageErr || !page) {
    return NextResponse.json({ error: pageErr?.message || "Erreur création page" }, { status: 500 });
  }

  // Create default starter blocks from user's social links
  const starterLinks: any[] = [];
  let sortOrder = 0;

  // 1. Social icons block from user's profiles
  const socialLinks: { platform: string; url: string }[] = [];
  if (p?.instagram_url) socialLinks.push({ platform: "instagram", url: p.instagram_url });
  if (p?.linkedin_url) socialLinks.push({ platform: "linkedin", url: p.linkedin_url });
  if (p?.youtube_url) socialLinks.push({ platform: "youtube", url: p.youtube_url });
  if (p?.tiktok_url) socialLinks.push({ platform: "tiktok", url: p.tiktok_url });
  if (p?.pinterest_url) socialLinks.push({ platform: "pinterest", url: p.pinterest_url });
  if (p?.threads_url) socialLinks.push({ platform: "threads", url: p.threads_url });
  if (p?.facebook_url) socialLinks.push({ platform: "facebook", url: p.facebook_url });
  if (p?.website_url) socialLinks.push({ platform: "website", url: p.website_url });

  if (socialLinks.length > 0) {
    starterLinks.push({
      page_id: page.id,
      user_id: userId,
      block_type: "social_icons",
      title: "Social",
      social_links: socialLinks,
      sort_order: sortOrder++,
    });
  }

  // 2. Custom links from profile
  const customLinks = Array.isArray(p?.custom_links) ? p.custom_links : [];
  for (const cl of customLinks) {
    if (cl.url && cl.label) {
      starterLinks.push({
        page_id: page.id,
        user_id: userId,
        block_type: "link",
        title: cl.label,
        url: cl.url,
        sort_order: sortOrder++,
      });
    }
  }

  // 3. A placeholder link if no links were added
  if (starterLinks.length === 0) {
    starterLinks.push({
      page_id: page.id,
      user_id: userId,
      block_type: "link",
      title: "Mon site web",
      url: "https://",
      sort_order: sortOrder++,
    });
  }

  // Insert links
  if (starterLinks.length > 0) {
    await supabase.from("linkinbio_links").insert(starterLinks);
  }

  // Fetch the created links to build the initial HTML snapshot
  const { data: links } = await supabase
    .from("linkinbio_links")
    .select("*")
    .eq("page_id", page.id)
    .order("sort_order");

  // Build initial HTML snapshot
  const pageData: LinkinbioPageData = {
    pageId: page.id,
    bio: contentData.bio,
    displayName,
    avatarUrl: p?.brand_author_photo_url || undefined,
    logoUrl: p?.brand_logo_url || undefined,
    links: (links || []).map((l: any) => ({
      id: l.id,
      block_type: l.block_type,
      title: l.title,
      url: l.url,
      icon_url: l.icon_url,
      social_links: l.social_links,
      enabled: l.enabled,
      sort_order: l.sort_order,
    })),
    theme: contentData.theme,
    buttonStyle: contentData.buttonStyle,
    backgroundType: contentData.backgroundType,
    backgroundValue: contentData.backgroundValue,
    brandColor: p?.brand_color_base || undefined,
    brandAccent: p?.brand_color_accent || undefined,
    brandFont: p?.brand_font || undefined,
    locale: "fr",
  };

  const html = buildLinkinbioPage(pageData);

  await supabase
    .from("hosted_pages")
    .update({ html_snapshot: html })
    .eq("id", page.id);

  return NextResponse.json({ ok: true, pageId: page.id, slug: page.slug });
}
