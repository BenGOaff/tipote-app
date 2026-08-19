# Programme d'affiliation maison : le plan

Proposition, pas encore validée. Demande Béné du 8 août 2026 :
sortir de Systeme.io pour l'affiliation de Tipote (quand il sera en
vente), Tiquiz et l'Atelier. Un programme fiable, avec des paliers de
commission, un vrai suivi pour les affiliés, et la possibilité
d'interdire quelqu'un qui ne respecte pas les règles.

---

## 1. Ce qui existe déjà, et qui ne demande qu'à être branché

Tu es beaucoup plus avancée que tu ne le crois. Le programme n'est PAS
géré par Systeme.io aujourd'hui : il est déjà chez nous.

**Ce qui tourne déjà (repo `tipote-app`) :**

| Pièce | Où | Ce qu'elle fait |
|---|---|---|
| Registre des affiliés | table `affiliates` | statut `active` / `paused` / `banned`, PayPal, IBAN |
| Clics | table `affiliate_clicks` | IP hashée (RGPD), page, referrer |
| Conversions | table `affiliate_conversions` | l'email capturé, relié à l'affilié |
| Commissions | table `affiliate_commissions` | montant HT, taux, statut, remboursement |
| Attribution | `lib/affiliate/attribution.ts` | last-touch 90 jours, anti-auto-affiliation |
| Dashboard affilié | `affiliate.tipote.com` | revenus, promouvoir, contenus, essai Tiquiz |
| Destinations | `affiliate_link_destinations` | tu changes une URL sans commit |
| Ventes Tiquiz | `/api/affiliate/attribute-sale` | Tiquiz pousse ses ventes ici |

**Ce qui manque vraiment**, et c'est court :

1. un identifiant d'affilié **à nous** (aujourd'hui c'est le `sa` de
   Systeme.io, donc le programme est locataire) ;
2. les **paliers** (40% et 70% sont écrits en dur dans le code) ;
3. le **paiement** des affiliés (la colonne `payout_id` existe et ne
   pointe vers aucune table : rien n'est payé par l'app aujourd'hui) ;
4. **l'Atelier**, qui tient ses propres tables sur son propre Supabase.

Ce quatrième point est le plus dangereux et je le mets en tête, parce
que c'est exactement le défaut qui revient dans ce repo depuis trois
mois : **une même règle écrite à deux endroits finit toujours par
diverger**. Aujourd'hui le taux Tiquiz (0.4) vit dans
`tipote-app/lib/affiliate/attribution.ts` et le taux Atelier (0.7) vit
dans `formaquiz/lib/affiliateTracking.ts`, dans deux bases différentes.
Ajouter des paliers sans fusionner d'abord, ce serait écrire le moteur
de paliers deux fois. Il se contredirait avant la fin du mois.

---

## 2. Les 5 décisions qui pilotent tout le reste

Je donne ma recommandation à chaque fois. Tu peux répondre en une ligne
par point, ou juste dire "ok" si les recommandations te vont.

**1. Les paliers : calculés sur quoi ?**
Recommandation : sur le **nombre de ventes validées des 90 derniers
jours**, pas sur le chiffre d'affaires. Une affiliée qui vend 10 fois
l'Atelier à 47 € comprend "10 ventes", elle ne calcule pas son CA. Et
90 jours glissants récompense celle qui est active MAINTENANT, pas
celle qui a fait un gros mois en janvier.

**2. Un palier atteint, il s'applique à partir de quand ?**
Recommandation : **à partir de la vente suivante, jamais rétroactivement**.
Le rétroactif oblige à recalculer des sommes déjà affichées comme dues,
donc à faire baisser un montant sur l'écran de quelqu'un. C'est le
genre de chose qui te coûte un affilié. Et le dashboard affiche
"encore 3 ventes avant 50%", ce qui est justement le truc qui motive.

**3. La fenêtre d'attribution.**
Recommandation : on garde **90 jours, last-touch**, comme aujourd'hui.
C'est le standard, c'est déjà codé, et c'est déjà écrit aux affiliés.

**4. Le paiement.**
Recommandation : **seuil 50 €, paiement le 10 de chaque mois, sur les
commissions dont la vente a plus de 30 jours** (le délai de garantie).
En dessous du seuil, le solde reste et se cumule. Les trois règles sont
affichées en permanence sur son écran, sinon tu passes tes journées à
répondre "quand est-ce que je suis payée".

**5. Qui peut devenir affilié ?**
Recommandation : **inscription libre, validation automatique, mais
première commission payée seulement après une vérification manuelle**.
Ouvert ne veut pas dire sans contrôle, et l'argent est le seul endroit
où le contrôle doit être obligatoire.

---

## 3. L'architecture cible

### 3.1 Un seul registre, trois apps qui écrivent dedans

```
   Tiquiz            Atelier           Tipote (plus tard)
      \                 |                    /
       \                |                   /
        ---->   affiliate.tipote.com  <----
             (Supabase Tipote = LE registre)
```

C'est déjà le dessin actuel pour Tiquiz. Il manque l'Atelier, qui
écrit chez lui. Le jour où l'Atelier pousse ses ventes vers le registre
central comme Tiquiz le fait déjà, il n'y a plus qu'un seul endroit qui
calcule un taux, un seul qui décide qui est banni, un seul qui paie.

**Conséquence pratique :** un affilié voit ses gains Tiquiz, Atelier et
Tipote sur UN écran, avec UN seuil et UN virement. Aujourd'hui, s'il
promeut les deux, il a deux comptes et deux paiements.

### 3.2 Un identifiant d'affilié qui t'appartient

Aujourd'hui la clé primaire de `affiliates` est le `sa` de Systeme.io
(`sa00168442b...`). Tant qu'elle y reste, ton programme dépend d'eux
pour la chose la plus basique : savoir qui est qui.

Le changement est petit et il doit être fait en premier :

- chaque affilié reçoit un **code lisible** qu'il peut choisir
  (`?ref=jocelyne`), unique, jamais réattribué ;
- `sa` devient une simple colonne d'historique, plus une clé ;
- une seule fonction `resolveAffiliate(ref)` traduit le code en
  affilié, et plus personne ne lit `sa` ailleurs.

Un lien `?ref=jocelyne` se retient, se dicte au téléphone et se met
dans une bio Instagram. `?sa=sa00168442b3f...` non.

### 3.3 Le clic passe par NOTRE domaine

Aujourd'hui le clic est enregistré par un bout de JavaScript posé sur
les pages Systeme.io. Trois faiblesses, et elles sont toutes du même
genre : le tracking dépend de quelque chose qu'on ne contrôle pas.

- tu modifies une page de vente, tu perds le snippet sans le voir ;
- un bloqueur de pub le coupe ;
- Safari limite le cookie posé par un script tiers à 7 jours.

À la place : un lien de redirection **chez nous**.

```
https://affiliate.tipote.com/go/jocelyne/atelier
   -> on enregistre le clic côté serveur
   -> on pose notre cookie (premier partie, donc durable)
   -> on redirige vers la page de vente, avec le suivi dans l'URL
```

Rien à installer sur les pages, rien à casser en les modifiant, et ça
marche même si le visiteur bloque tout le JavaScript. C'est aussi le
seul moyen de savoir **quel lien** convertit, ce que tes affiliés te
demanderont dès qu'ils seront sérieux.

### 3.4 Les paliers : une table, pas du code

```
affiliate_tiers
  produit      (tiquiz | atelier | tipote)
  min_ventes   (0, 5, 15, ...)
  taux         (0.40, 0.45, 0.50 ...)
```

Trois règles non négociables, et elles viennent toutes de bugs qu'on a
déjà payés cher ici :

1. **Le taux est GELÉ sur la commission au moment de la vente**
   (la colonne `commission_rate` existe déjà et sert à ça). On ne
   recalcule JAMAIS une commission passée : un montant affiché à un
   affilié est un engagement.
2. **Le produit est un paramètre obligatoire**, jamais deviné. Un
   moteur qui déduit "c'est sûrement Tiquiz" appliquera un jour 70% à
   une vente Tiquiz. C'est la leçon du quiz scoré à qui on appliquait
   les contrôles des quiz à profils.
3. **Les paliers vivent en base**, éditables depuis l'admin. Tu vas les
   changer, et il ne faut pas que ça demande un déploiement.

### 3.5 Interdire un affilié, pour de vrai

Le statut existe déjà. Ce qui manque, c'est ce qu'il DOIT provoquer :

| Statut | Le lien | Les nouvelles ventes | Les commissions en cours | Son écran |
|---|---|---|---|---|
| `active` | marche | attribuées | payables | complet |
| `paused` | marche | attribuées | **gelées** | bandeau qui explique |
| `banned` | **redirige quand même** | **plus attribuées** | gelées, motif écrit | fermé, motif affiché |

Le point qui compte : **un affilié banni redirige toujours**. Le
visiteur qui a cliqué sur son lien n'a rien fait de mal, il ne doit pas
tomber sur une page morte. Il arrive sur la page de vente, simplement
la vente n'est plus attribuée.

Et une chose à faire AVANT le premier bannissement, pas après :
**des règles écrites, acceptées à l'inscription, avec leur numéro de
version stocké** (`accepted_terms_version`). Bannir quelqu'un sur une
règle qu'il n'a jamais lue, c'est un litige que tu perds. Les
interdictions classiques : pas de publicité sur ta marque, pas de
cashback ni de coupon, pas de spam, pas d'auto-affiliation (ce
dernier est déjà bloqué dans le code).

---

## 4. Le suivi pour l'affilié : ce qui manque vraiment

L'écran actuel montre clics, conversions, ventes, commissions. Un
affilié sérieux part quand même, parce qu'il lui manque les réponses
aux trois questions qu'il se pose vraiment :

1. **"Combien je touche, et quand exactement ?"**
   Un seul chiffre en haut : ce qui sera viré au prochain paiement, et
   la date. En dessous : ce qui est encore en garantie, avec la date de
   déblocage. Pas de total flou qui mélange les deux.

2. **"Quel lien marche ?"**
   Le tableau par destination : clics, ventes, taux de conversion. Sans
   ça il ne peut rien améliorer, donc il ne fait pas mieux le mois
   suivant.

3. **"Pourquoi cette vente a disparu ?"**
   Une commission remboursée doit rester visible, barrée, avec le
   motif. La faire disparaître silencieusement est la meilleure façon
   de te faire accuser de tricher. Le remboursement est déjà géré côté
   Atelier (statut `refunded`), il faut l'afficher.

Et l'historique des paiements avec un récapitulatif téléchargeable :
c'est ce qu'il donnera à son comptable.

---

## 5. Payer les affiliés : ce qui marche, et ce qui n'existe pas

Il faut que je sois net sur un point, parce que tu as cité Stripe.

- **Virement bancaire : oui, et c'est ce que je recommande pour
  commencer.** Tu as déjà les IBAN en base. Tu paies depuis Qonto, en
  une fois par mois. Zéro frais, zéro intégration, zéro dépendance.
- **PayPal : oui.** L'API PayPal Payouts existe, elle demande une
  activation de leur part, elle coûte des frais, et elle est utile pour
  l'international. Bon deuxième choix.
- **Stripe : non, pas pour payer des affiliés.** Stripe sait ENCAISSER,
  il ne sait pas envoyer de l'argent à quelqu'un qui n'est pas un
  compte connecté chez eux. Il faudrait inscrire chaque affilié comme
  compte Stripe Connect, avec vérification d'identité. C'est lourd pour
  eux et pour toi, et ça n'apporte rien de plus qu'un virement.

Ce que l'app doit faire dans les trois cas, c'est la partie utile :
calculer le lot du mois, l'afficher, tenir l'historique, et marquer les
commissions comme payées. Le virement lui-même peut rester manuel très
longtemps sans que personne s'en rende compte.

**Le point administratif, à confirmer avec ton comptable et pas avec
moi :** un affilié est un prestataire. Soit il t'envoie une facture,
soit tu émets un relevé d'autofacturation qu'il valide. Ce n'est pas
optionnel dès que les montants montent, et c'est plus simple à mettre
en place au début qu'après coup.

---

## 6. Vendre en direct (Stripe / PayPal) en gardant l'emailing sur Systeme.io

C'est le morceau le plus gros, et c'est aussi celui qui rend
l'affiliation **exacte** au lieu de probable. Je le mets en dernier
exprès : il n'est pas nécessaire pour lancer le programme.

### Ce que ça change dans le sens de la flèche

```
Aujourd'hui :  Systeme.io vend  ->  webhook  ->  l'app ouvre l'accès
Demain      :  l'app vend       ->  l'app ouvre l'accès  ->  l'app
                                    pousse le contact et le tag vers
                                    Systeme.io (emailing conservé)
```

L'emailing reste chez eux, tu continues à écrire tes séquences au même
endroit. Ce qui change, c'est qui encaisse et qui décide de l'accès.

### Pourquoi l'affiliation y gagne énormément

Aujourd'hui on attribue une vente **par email** : on cherche si
l'adresse du client correspond à une conversion affiliée récente. Ça
marche, mais ça rate dès que le client paie avec une autre adresse que
celle qu'il a donnée en optin. On a vu ce cas exact cette semaine avec
les commandes de l'Atelier.

Si c'est l'app qui vend, le code affilié voyage **dans le paiement
lui-même** (les métadonnées Stripe ou PayPal). Il n'y a plus rien à
deviner : la vente arrive déjà signée. Plus de correspondance par
email, plus de fenêtre de 90 jours à espérer, plus de clic perdu.

### La bonne nouvelle sur le chantier

Le checkout est **déjà écrit et déjà testé contre les vraies API** dans
Tiquiz, pour les revendeurs : `lib/stripeRest.ts`, `lib/paypalRest.ts`,
`lib/resellerPayments.ts`. On sait créer un abonnement Stripe et un
abonnement PayPal, vérifier une clé, chiffrer un secret. La partie
"encaisser" n'est pas à inventer.

### Le vrai coût, qui n'est pas le checkout

C'est la vie de l'abonnement APRÈS la première vente, que Systeme.io
absorbe aujourd'hui sans que ça se voie : le paiement qui échoue et les
relances, la carte qui expire, la résiliation, le remboursement, le
changement de palier. Chacun devient un événement que l'app doit
traiter, et un accès qui doit s'ouvrir ou se fermer au bon moment.

**Et deux points à trancher avec ton comptable avant de coder quoi que
ce soit** (je ne les affirme pas, je les signale) : qui est le vendeur
officiel sur la facture, et qui déclare la TVA sur des produits
numériques vendus dans plusieurs pays européens. Selon la réponse, la
vente directe est un chantier de 3 semaines ou de 3 mois. C'est la
seule question du document qui peut décaler tout le reste.

---

## 7. L'affiliation vue depuis l'intérieur des apps

Ta phrase : "que ceux qui sont dans les app et qui ne font pas
d'affiliation aient l'idée de se lancer parce qu'ils voient les infos
et le potentiel".

Trois choses, dans cet ordre d'efficacité :

1. **Une entrée permanente dans le menu** ("Gagner avec Tiquiz"), pas
   une bannière qu'on ferme. La leçon de Jocelyne du 3 août vaut ici :
   une nouveauté qu'on ne montre pas n'existe pas.
2. **Des chiffres réels, pas une promesse.** "Tu touches 40% sur chaque
   abonnement, tous les mois, tant que la personne reste. 3 clients
   mensuels = 20,40 € par mois qui tombent." Une créatrice qui a déjà
   un quiz en ligne a déjà une audience : le calcul lui parle.
3. **Un clic pour rejoindre, sans deuxième inscription.** Elle a déjà
   un compte Tiquiz. Le passage vers l'espace affilié doit réutiliser
   le mécanisme de connexion Tiquiz vers Atelier qui existe déjà
   (`app/api/partner/authorize`), surtout pas en réinventer un.

Et dans l'autre sens, rien ne change : un affilié qui n'a aucun compte
Tiquiz s'inscrit directement sur `affiliate.tipote.com` et promeut tout
le catalogue. C'est déjà le cas aujourd'hui.

---

## 8. Le plan, en 4 temps

Chaque phase est utilisable seule et ne casse rien de la précédente.
Aucune ne t'oblige à quitter Systeme.io tant que tu ne le décides pas.

### Phase 0 : le socle (rien ne change pour personne)
- code affilié à nous, `sa` relégué à l'historique ;
- lien de redirection sur notre domaine, clic enregistré côté serveur ;
- l'Atelier pousse ses ventes vers le registre central ;
- un seul écran de gains pour les trois produits.

À la fin de la phase 0, tu es propriétaire de ton programme. Les
affiliés ne voient qu'une chose : leur lien est plus court.

### Phase 1 : les paliers et les règles
- table des paliers, éditable depuis l'admin ;
- taux gelé à la vente, produit en paramètre obligatoire ;
- règles écrites, acceptées et versionnées ;
- pause et bannissement avec leurs effets réels.

### Phase 2 : le suivi et le paiement
- le prochain virement, la date, ce qui est en garantie ;
- les statistiques par lien ;
- lots de paiement mensuels, historique, récapitulatif à télécharger ;
- virement d'abord, PayPal ensuite.

### Phase 3 : la vente directe sur Tiquiz
- Stripe et PayPal en checkout natif (le code existe déjà) ;
- le code affilié voyage dans le paiement, l'attribution devient exacte ;
- le contact et le tag partent vers Systeme.io pour l'emailing ;
- gestion des échecs de paiement, résiliations, remboursements.

### Phase 4 : Tipote arrive sur les mêmes rails
Rien de nouveau à construire : un produit de plus dans la table des
paliers et une destination de plus dans les liens.

---

## 9. Ce que je ne ferai pas sans que tu le dises

- toucher à Systeme.io pour l'emailing : il reste, c'est acté ;
- couper le tracking actuel avant que le nouveau ait tourné en
  parallèle et donné les mêmes chiffres pendant au moins deux semaines ;
- changer un taux existant. 40% et 70% restent les paliers de base, les
  paliers ne font que monter au dessus ;
- promettre une date. Le seul inconnu réel, c'est la réponse de ton
  comptable sur la facturation et la TVA au moment de la vente directe.
