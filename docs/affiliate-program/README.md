# Programme d'affiliation Tipote/Tiquiz

Vue d'ensemble du système d'attribution affiliée. Source de vérité :
Supabase Tipote. Dashboard à venir : `affiliate.tipote.com`.

## Architecture

```
Affilié partage : tipote.fr/article?sa=ABC
                              |
                              v
       [Snippet JS sur tipote.fr/.com/.blog]
            |                |               |
            |                |               |
       capture en       réécrit les       intercepte les
       cookie 90j       liens sortants   form submits (email)
            |                |               |
            v                v               v
                POST /api/affiliate/track
                (app.tipote.com)
                              |
                              v
              Supabase Tipote : affiliate_clicks
                                affiliate_conversions
                              |
                              v
                  Vente arrive via webhook
                  Systeme.io customer.sale.completed
                              |
            +-----------------+------------------+
            v                                    v
    Tipote webhook                       Tiquiz webhook
    /api/systeme-io/webhook              /api/systeme-io/webhook
            |                                    |
            | attributeSale()                    | POST /api/affiliate/attribute-sale
            v                                    v
              affiliate_commissions (Supabase Tipote)
                              |
                              v
                  Dashboard affiliate.tipote.com
```

## Tables Supabase Tipote

- `affiliates` — registre des affiliés (sa, email, RIB, PayPal…)
- `affiliate_clicks` — chaque clic sur un lien avec `?sa=`
- `affiliate_conversions` — chaque submit de form avec email + sa cookie actif
- `affiliate_commissions` — commission tied à une vente (dedup par
  `(source_app, sio_order_id)`)
- `affiliate_stats` (view) — agrégats par affilié pour le dashboard

## Vars d'env nécessaires (Tipote)

```
# Hash IP côté affiliate_clicks (RGPD - ne pas stocker l'IP brute)
AFFILIATE_IP_HASH_SECRET=<random 32-char string>

# Secret partagé entre Tiquiz webhook et Tipote /attribute-sale endpoint
AFFILIATE_INTERNAL_SECRET=<random 64-char string>
```

Set aussi `AFFILIATE_INTERNAL_SECRET` côté Tiquiz pour qu'il puisse
authentifier ses appels vers Tipote.

## Snippet JS à installer sur les domaines de promo

Le snippet doit être installé **une fois par domaine** où des affiliés
peuvent poser des liens :

- `tipote.fr` (Systeme.io) — via "Code de tracking global" dans les
  paramètres compte
- `tipote.com` — idem
- `tipote.blog` — via le footer du thème WordPress ou code custom global

Voir `snippet.html` dans ce même dossier pour le code à copier-coller.

## Tester l'installation

1. Visite n'importe quelle page du domaine instrumenté avec `?sa=sa00xxx`
   à la fin. Vérifie en console (`F12 → Application → Cookies`) qu'un
   cookie `tipote_sa` est posé avec la bonne valeur.

2. Vérifie que les liens vers tipote.fr/.com/.blog sur la page ont
   été réécrits pour inclure `?sa=` (inspecte un `<a>` dans DevTools).

3. Soumets un formulaire test avec un email. Dans Supabase Tipote,
   SQL editor :

   ```sql
   select * from affiliate_conversions
   order by created_at desc limit 5;
   ```

   Tu devrais voir la conversion (email + sa) ajoutée.

## Paliers de commission

Définis en dur dans `lib/affiliate/attribution.ts` :

| Ventes cumulées | Taux |
|----------------:|-----:|
| 0–9             | 40%  |
| 10–24           | 45%  |
| 25+             | 50%  |

À ajuster côté code si on veut des paliers personnalisés par affilié.

## Fenêtre d'attribution

90 jours, last-touch. Le dernier `?sa=` cliqué avant la vente l'emporte.
Configurable dans `lib/affiliate/attribution.ts`.
