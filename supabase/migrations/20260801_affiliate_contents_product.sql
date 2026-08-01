-- 20260801_affiliate_contents_product.sql
--
-- L'espace Contenu affilié se range désormais par produit promu :
-- "Promouvoir l'Atelier du Quiz" et "Promouvoir Tiquiz" ont chacun leurs
-- emails, posts et articles. Toutes les lignes existantes sont du
-- matériel Tiquiz, d'où le défaut.

alter table public.affiliate_contents
  add column if not exists product text not null default 'tiquiz';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'affiliate_contents_product_check'
  ) then
    alter table public.affiliate_contents
      add constraint affiliate_contents_product_check
      check (product in ('tiquiz', 'atelier'));
  end if;
end $$;

create index if not exists affiliate_contents_product_kind_locale_idx
  on public.affiliate_contents (product, kind, locale, published, sort_order);

notify pgrst, 'reload schema';
