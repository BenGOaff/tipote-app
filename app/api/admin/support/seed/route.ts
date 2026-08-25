// app/api/admin/support/seed/route.ts
//
// PUBLIER LE CONTENU D'AIDE : ce qui est NOUVEAU, ce qui est MIS A JOUR,
// et ce qui a rate.
//
// Bene, 26 aout 2026 : "j'ai l'impression que ca n'ajoute rien".
//
// Ca ajoutait bien, mais l'ecran ne disait que le TOTAL ("68 articles"),
// le meme avant et apres. Un compteur qui ne bouge pas se lit comme un
// bouton qui ne marche pas, et elle a doute d'un envoi parfaitement
// reussi. On compare donc les slugs DEJA en base avant d'ecrire, et on
// dit les deux nombres.
//
// Et une ecriture ratee n'arrete plus les suivantes : avant, le premier
// article en erreur faisait echouer tout le reste, sans dire jusqu'ou on
// etait alle. On continue, on compte, et on NOMME ce qui n'est pas passe
// (regle du `ok: false`, 3 aout).
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";
import { SEED_CATEGORIES, SEED_ARTICLES } from "@/lib/support/seedData";

export async function POST(req: NextRequest) {
  // Admin check
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || !isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    // 1) Upsert categories
    for (const cat of SEED_CATEGORIES) {
      const { error } = await supabaseAdmin
        .from("support_categories")
        .upsert(
          { slug: cat.slug, icon: cat.icon, sort_order: cat.sort_order, title: cat.title, description: cat.description },
          { onConflict: "slug" }
        );
      if (error) throw new Error(`Category ${cat.slug}: ${error.message}`);
    }

    // 2) Fetch category id map
    const { data: cats } = await supabaseAdmin
      .from("support_categories")
      .select("id, slug");
    const catMap = Object.fromEntries((cats ?? []).map((c: any) => [c.slug, c.id]));

    // 3) Ce qui existe DEJA, pour pouvoir dire ce qui est nouveau.
    //    En erreur, on ne pretend pas savoir : `dejaLa` reste null et
    //    l'ecran affiche le total sans le detail, au lieu d'annoncer
    //    "68 nouveaux" a chaque passage.
    const { data: existants, error: errLecture } = await supabaseAdmin
      .from("support_articles")
      .select("slug");
    const dejaLa = errLecture
      ? null
      : new Set((existants ?? []).map((a: { slug: string }) => a.slug));

    // 4) Upsert articles
    let nouveaux = 0;
    let majs = 0;
    const rates: string[] = [];
    for (const art of SEED_ARTICLES) {
      const categoryId = catMap[art.category_slug];
      if (!categoryId) {
        rates.push(`${art.slug} (categorie inconnue : ${art.category_slug})`);
        continue;
      }

      const { error } = await supabaseAdmin
        .from("support_articles")
        .upsert(
          {
            slug: art.slug,
            category_id: categoryId,
            sort_order: art.sort_order,
            title: art.title,
            content: art.content,
            related_slugs: art.related_slugs,
            tags: art.tags,
            published: true,
          },
          { onConflict: "slug" }
        );
      if (error) {
        // On continue : un article qui ne passe pas ne doit pas priver
        // les 67 autres de leur mise a jour.
        console.error(`[support/seed] ${art.slug} : ${error.message}`);
        rates.push(`${art.slug} (${error.message})`);
        continue;
      }
      if (dejaLa && !dejaLa.has(art.slug)) nouveaux += 1;
      else majs += 1;
    }

    return NextResponse.json({
      ok: rates.length === 0,
      categories: SEED_CATEGORIES.length,
      articles: SEED_ARTICLES.length,
      // `null` quand on n'a pas pu lire l'existant : "je ne sais pas" et
      // "aucun nouveau" ne s'ecrivent pas pareil.
      nouveaux: dejaLa ? nouveaux : null,
      misAJour: dejaLa ? majs : null,
      rates,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
