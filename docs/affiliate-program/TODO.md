# TODO affiliate — à reprendre demain matin

## 🚨 Bugs à fixer en priorité

### 1. Favicon `/favicon.png` 404 sur affiliate.tipote.com
**Symptôme** : pas de favicon Tipote sur la page de connexion affilié.

**Cause probable** : mon rewrite dans `next.config.ts` :
```ts
source: "/:path((?!_next|api|affiliate|favicon\\.ico).*)"
```
exclut bien `/favicon.ico` du rewrite mais PAS `/favicon.png`. Donc
`affiliate.tipote.com/favicon.png` est rewrité en
`/affiliate/favicon.png` qui n'existe pas → 404 → fallback navigateur
sur favicon.ico → route handler dynamique → favicon Tipote par défaut.

**Fix proposé** : étendre l'exclusion regex pour aussi catch tous les
fichiers statiques au root (favicon.*, robots.txt, sitemap.xml, etc.).
Pattern :
```ts
source: "/:path((?!_next|api|affiliate|favicon|robots\\.txt|sitemap\\.xml).*)"
```

**⚠️ ATTENTION FAVICON CUSTOM DOMAINS** : NE PAS toucher au route
handler `app/favicon.ico/route.ts` qui sert le favicon custom des
utilisateurs sur leurs domaines branded. Tester APRÈS le fix qu'on a
toujours :
- Le bon favicon Tipote sur app.tipote.com et affiliate.tipote.com
- Le favicon CUSTOM (Gwenn / autres) sur leurs domaines connectés
- Pas de 404 sur /favicon.ico ni /favicon.png pour n'importe quel host

Test rapide après fix :
```bash
curl -sI -H "Host: affiliate.tipote.com" http://127.0.0.1:3000/favicon.png | head -3
# Doit retourner 200, pas 404
```

### 2. Onboarding Tipote s'affiche sur affiliate.tipote.com
**Symptôme** : Béné voit le didacticiel Tipote (tutorial) s'activer
quand elle navigue sur le dashboard affiliate. C'est le composant
d'onboarding du dashboard Tipote principal qui est mounté par le root
layout (via Providers ou un composant client).

**Fix proposé** :
1. Trouver le composant qui mount le tour onboarding (probablement
   dans `components/Providers.tsx` ou un `OnboardingTour.tsx` quelque part)
2. Le gater pour qu'il ne se déclenche PAS sur les pathnames /affiliate/*
3. Soit via `usePathname()` côté client, soit en passant un flag
   `disableTour` depuis un context dans le layout affiliate

Alternative : refacto le layout affiliate pour qu'il ait son propre
Providers light (sans le tour) au lieu de réutiliser le root.

À investiguer : `find components -name "*Onboarding*" -o -name "*Tour*" -o -name "*Tutorial*"`

## 📋 Sprint 4 (multilang + gamification, à venir)

Quand la V1 affiliate est stable côté Béné (favicon + onboarding fixés,
flow signup-via-webhook validé en prod) :

- **Multi-langue complet du dashboard** (FR/EN/ES/IT/PT/AR) via next-intl.
  Namespace : `affiliate`. Traduire toutes les chaînes en dur des pages
  /affiliate/*.
- **Tutoriel guidé affilié** (équivalent du tour Tipote mais pour
  l'espace affilié) : 4-5 étapes au premier login pour expliquer le
  cookie 90j, l'onglet Promouvoir, le calculateur Revenus, le paiement.
  Compteur completion stocké dans `affiliates.onboarded_at`.
- **Gamification** : badges (1ère vente, top 10 du mois, palier passé),
  guide de lancement 6 étapes checklist, classement anonymisé style
  "ff-***" (à l'image FunnelForge).
- **Version Tipote du contenu Promouvoir** : actuellement tout le matos
  est centré Tiquiz (8 emails, 24 posts, 18 visuels). Faire la version
  Tipote équivalente quand Béné aura rédigé.
- **Auto-locale du magic link webhook** : actuellement fallback FR.
  Détecter via Accept-Language du visiteur sur la landing SIO et stocker
  dans un custom field, ou bien dans le payload du webhook.

## ✅ Ce qui est OK et déjà testé

- Backend tracking : `/api/affiliate/track` + JS snippet pour clics et
  conversions (Béné l'a posé sur ses landings)
- Attribution `last-touch` 90 jours dans `lib/affiliate/attribution.ts`
- Anti-auto-affiliation (refuse commission si email affilié = client)
- Tables Supabase Tipote : `affiliates`, `affiliate_clicks`,
  `affiliate_conversions`, `affiliate_commissions`, view `affiliate_stats`
- Dashboard pages : Overview, Promouvoir (4 sous-onglets), Revenus,
  Paiement, Support
- Magic link custom via Resend (multilang FR/EN/ES/IT/PT/AR)
- Sous-domaine `affiliate.tipote.com` routé via `next.config.ts`
  rewrites + Caddy vhost
- Webhook `/api/affiliate/webhook` qui réagit aux inscriptions form SIO
