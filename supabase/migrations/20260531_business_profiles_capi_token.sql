-- Meta Conversions API (CAPI) : token serveur pour envoyer l'event Lead
-- côté serveur, dédupliqué avec le pixel navigateur via un event_id
-- partagé. Le token est un SECRET (System User token Meta) : il n'est
-- JAMAIS exposé sur les pages publiques — lu uniquement server-side dans
-- l'endpoint de capture du lead. Stocké sur business_profiles (apparié au
-- pixel par défaut, scopé par projet).
alter table public.business_profiles
  add column if not exists default_meta_capi_token text;

notify pgrst, 'reload schema';
