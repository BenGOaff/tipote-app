# Programme d'affiliation maison : le plan

Demande Béné, 8 août 2026 : sortir de Systeme.io pour l'affiliation de
Tipote (quand il sera en vente), Tiquiz et l'Atelier. Un programme
fiable, avec des paliers de commission, un vrai suivi pour les affiliés,
et la possibilité d'interdire quelqu'un qui ne respecte pas les règles.

**Les trois priorités qu'elle a posées, dans son ordre :**

1. personne ne doit pouvoir tricher ;
2. tout doit être aussi automatique que possible ;
3. tout doit être fiable : chacun reçoit ce qui lui a été annoncé, tout
   est bien expliqué, le cookie tient.

Elles ne sont pas décoratives : chaque choix technique du document est
justifié par l'une des trois, et quand deux se contredisent, c'est
l'ordre ci-dessus qui tranche.

---

## 1. Où on en est vraiment

**L'affiliation est gérée par Systeme.io aujourd'hui.** C'est leur
cookie, leur identifiant d'affilié (`sa...`), leur paiement. Ce qui vit
dans ce repo n'est pas le programme : c'est un MIROIR, construit pour
récupérer un maximum de données et les afficher proprement.

Ce miroir n'est pas du travail perdu, c'est même la moitié de ce qui
reste à faire. Ce qui existe et se réutilise tel quel :

| Pièce | Où | Ce qui sert |
|---|---|---|
| Registre | table `affiliates` | statut actif / en pause / banni, PayPal, IBAN |
| Clics | `affiliate_clicks` | IP hashée (RGPD), page, referrer |
| Conversions | `affiliate_conversions` | l'email capturé, relié à l'affilié |
| Commissions | `affiliate_commissions` | HT, taux, statut, remboursement, récurrent |
| Attribution | `lib/affiliate/attribution.ts` | last-touch 90 jours, anti-auto-affiliation |
| Dashboard | `affiliate.tipote.com` | revenus, promouvoir, contenus, essai Tiquiz |
| Destinations | `affiliate_link_destinations` | tu changes une URL sans commit |
| Pont Tiquiz | `/api/affiliate/attribute-sale` | Tiquiz pousse déjà ses ventes ici |

Ce qui manque pour que le programme soit VRAIMENT le nôtre :

1. **un identifiant à nous** (la clé de `affiliates` est le `sa` de
   Systeme.io, donc l'objet le plus central du programme leur appartient) ;
2. **notre cookie**, posé par notre serveur, sur notre domaine ;
3. **les paliers** (40% et 70% sont écrits en dur dans le code) ;
4. **le paiement** (la colonne `payout_id` existe et ne pointe vers
   aucune table) ;
5. **l'Atelier**, qui tient ses propres tables sur son propre Supabase,
   avec son 0.7 écrit en dur de son côté pendant que le 0.4 Tiquiz est
   écrit en dur du nôtre.

Le point 5 est le plus dangereux et il passe en premier dans le
chantier : **une même règle écrite à deux endroits finit toujours par
diverger.** Ajouter des paliers avant de fusionner, ce serait écrire le
moteur deux fois, et il se contredirait avant la fin du mois.

---

## 2. Les décisions, tranchées

| # | Décision | Ce qui est retenu |
|---|---|---|
| 1 | Base des paliers | **Atelier : nombre de ventes. Tiquiz et Tipote : nombre d'abonnés.** |
| 2 | Effet d'un palier | **À partir de la vente suivante**, jamais rétroactivement |
| 3 | Attribution | **90 jours, last-touch** (inchangé) |
| 4 | Paiement | **Seuil 50 €, le 10 du mois, sur les ventes de plus de 30 jours** |
| 5 | Devenir affilié | **Inscription libre, mais aucun paiement sans profil de facturation complet** |

Trois précisions qui découlent de tes réponses et qu'il faut fixer
maintenant, parce qu'elles changent le code.

**Un palier PAR PRODUIT, pas un palier global.** Vendre l'Atelier et
amener des abonnés Tiquiz sont deux métiers différents ; une seule
échelle mélangerait une vente à 47 € et un abonnement à 17 €/mois. Donc
un compteur Atelier, un compteur Tiquiz, un compteur Tipote, chacun avec
sa propre grille.

**"Abonnés" veut dire abonnés ACTIFS.** Un abonné qui résilie sort du
compteur, donc le palier peut redescendre. Ça ne reprend jamais rien de
gagné (le taux est gelé à chaque vente), ça règle seulement le taux des
ventes SUIVANTES. C'est ce qui rend le palier honnête dans les deux
sens, et c'est aussi une protection anti-triche : un affilié qui
fabriquerait des abonnements pour monter d'un palier les verrait
disparaître au premier impayé.

**Le profil de facturation est un mur, pas un formulaire.** Tant que
SIRET ou SIREN, raison sociale (ou "particulier"), régime de TVA et
adresse ne sont pas renseignés, les commissions s'accumulent et
s'affichent, mais aucun lot de paiement ne les prend. L'écran le dit
avant, pas au moment du virement raté. Et c'est ce profil qui alimente
la facture : c'est pour ça qu'il est obligatoire et pas optionnel.

---

## 3. Le lien affilié

### 3.1 Un code lisible, choisi, vérifié

`?ref=jocelyne` au lieu de `?sa=sa00168442b3f...`. Un lien qui se dicte
au téléphone et se met dans une bio Instagram.

- 3 à 20 caractères, `a-z`, `0-9` et le tiret, insensible à la casse ;
- vérification de disponibilité en direct pendant la saisie ;
- les noms de nos propres chemins sont réservés (`go`, `j`, `api`,
  `admin`) et rien d'autre, pour la même raison que les slugs publics du
  4 août : une liste d'interdits qui grossit finit par interdire les
  mots que les gens veulent vraiment.

**Un ancien code ne meurt JAMAIS.** Si Jocelyne change son code, son
ancien continue de rediriger et de lui attribuer les ventes, pour
toujours. Elle a des liens dans des vidéos YouTube et des newsletters
déjà parties : un code libéré qui serait réattribué à quelqu'un d'autre
lui volerait son trafic. Un code retiré est donc mort pour tout le
monde sauf son propriétaire d'origine.

### 3.2 Le clic passe par NOTRE serveur, et le cookie aussi

```
https://affiliate.tipote.com/go/jocelyne/atelier
   -> le clic est enregistré côté serveur
   -> NOTRE cookie est posé (première partie, donc durable)
   -> redirection vers la page de vente
```

Aujourd'hui le clic est capté par un bout de JavaScript posé sur les
pages Systeme.io. Trois faiblesses, et elles disent toutes la même
chose : le tracking dépend de ce qu'on ne contrôle pas.

- tu modifies une page de vente, tu perds le snippet sans le voir ;
- un bloqueur de publicité le coupe ;
- Safari limite à 7 jours un cookie posé par un script tiers.

Une redirection serveur règle les trois d'un coup, et c'est le seul
moyen d'avoir des statistiques par lien.

### 3.3 Le lien court est le MÊME objet, pas un raccourcisseur

`affiliate.tipote.com/j/a7k` et `affiliate.tipote.com/go/jocelyne/atelier`
pointent sur la même ligne en base : même cookie, même canal, mêmes
statistiques. Le lien court ne peut donc pas "casser le cookie",
puisqu'il ne rajoute aucune étape.

**Et c'est exactement pour ça qu'il ne faut pas passer par bit.ly.** Un
raccourcisseur externe ajoute un saut qu'on ne maîtrise pas, certains
suppriment les paramètres d'URL, et le cookie ne serait alors jamais
posé. Un lien affilié raccourci ailleurs que chez nous est un lien qui
peut cesser de compter sans prévenir personne.

### 3.4 D'où vient le clic

Deux sources, l'une choisie, l'autre gratuite.

- **Le canal, écrit par l'affilié** : il crée ses propres étiquettes
  (`youtube`, `newsletter`, `insta`, `story-mardi`) et génère un lien par
  étiquette. C'est ce qui lui permet de comparer ce qui marche.
- **La provenance, déduite du referrer** : YouTube, Instagram, un
  webmail, un site. Elle est là même quand il n'a rien étiqueté, donc
  personne ne se retrouve avec un écran vide parce qu'il n'a pas pensé à
  taguer.

Chaque clic porte les deux, la conversion et la commission héritent des
deux. Son tableau devient : par destination, par canal, par provenance,
avec clics, ventes, taux de conversion et commissions.

---

## 4. Empêcher la triche

C'est ta priorité numéro un, donc elle a sa section.

**Ce qui protège déjà** : l'anti-auto-affiliation par email, l'IP hashée,
l'unicité de la référence de paiement (un webhook rejoué ne compte pas
deux fois), le statut de remboursement.

**Ce qu'il faut ajouter, du plus efficace au moins :**

1. **La garantie est le meilleur filtre, et elle est déjà là.** Une
   commission ne devient payable qu'après 30 jours, et un remboursement
   l'annule. Toute fraude qui repose sur des achats remboursables meurt
   toute seule, sans qu'on ait à la détecter.
2. **Anti-auto-affiliation élargie.** Aujourd'hui on compare l'email de
   l'affilié à celui du client. Il faut aussi refuser quand c'est la
   même empreinte de carte (possible dès qu'on vend en direct) ou le
   même compte, et pas seulement la même adresse.
3. **Un clic ne compte qu'une fois.** Dédoublonnage par (affilié, IP
   hashée) sur 24 h : recharger sa page cent fois n'affiche plus cent
   clics. Ça protège surtout ses chiffres à LUI, qui deviennent
   lisibles.
4. **Le cookie ne se pose que sur un vrai passage** par `/go/`, avec le
   referrer enregistré. On ne peut pas le poser depuis une page tierce,
   ce qui ferme le bourrage de cookie.
5. **Des règles écrites, acceptées, versionnées** (`accepted_terms_version`).
   Pas d'enchère sur ta marque, pas de site de coupons ni de cashback,
   pas de spam, pas d'auto-affiliation. **Bannir quelqu'un sur une règle
   qu'il n'a jamais lue, c'est un litige que tu perds** : ce texte doit
   exister AVANT le premier bannissement, pas après.
6. **Une file de vérification** dans l'admin : tout ce qui est signalé
   attend ta décision au lieu de partir en virement.

Et le corollaire, qui vaut pour tout ce document : **on signale, on ne
supprime jamais en silence.** Une commission écartée reste visible, avec
son motif. Une commission qui disparaît sans explication est la
meilleure façon de se faire accuser de tricher soi-même.

---

## 5. Interdire un affilié

Le statut existe déjà. Ce qui manque, ce sont ses effets.

| Statut | Le lien | Nouvelles ventes | Commissions en cours | Son écran |
|---|---|---|---|---|
| actif | marche | attribuées | payables | complet |
| en pause | marche | attribuées | **gelées** | bandeau qui explique |
| banni | **redirige quand même** | **plus attribuées** | gelées, motif écrit | fermé, motif affiché |

Le point à ne pas rater : **un affilié banni redirige toujours.** Le
visiteur qui a cliqué n'a rien fait de mal, il ne doit pas tomber sur une
page morte. Il arrive sur la page de vente, simplement la vente n'est
plus attribuée.

Et on ne supprime jamais une ligne : l'historique doit rester pour la
comptabilité.

---

## 6. Le suivi affilié : centralisé, avec une fenêtre dans chaque app

Ta question : tout centraliser sur `affiliate`, ou mettre les stats et
les liens à disposition dans chaque app ?

**Réponse : les DONNÉES et l'ARGENT vivent à un seul endroit
(`affiliate.tipote.com`), et chaque app en montre une FENÊTRE.**

Trois raisons, et la première est la plus solide.

1. **Un vrai tableau de bord dans chaque app, ce serait trois fois la
   même règle.** C'est le défaut qui te coûte cher depuis trois mois, et
   ici il porterait sur de l'argent : trois écrans qui calculent chacun
   "ce que je te dois" finiraient par afficher trois montants.
2. **Pour l'affilié, c'est plus simple.** Un seul seuil, un seul
   virement, une seule facture, un seul historique, même s'il promeut
   l'Atelier ET Tiquiz. Aujourd'hui ce sont deux comptes séparés.
3. **Un affilié n'a pas forcément de compte Tiquiz.** Ceux qui promeuvent
   tout sans être clients doivent tout trouver au même endroit, et c'est
   déjà le cas.

**Ce que la fenêtre affiche dans Tiquiz, Tipote et l'Atelier**, dans un
seul encart :

- ce que tu gagnes, en une phrase avec un chiffre réel ("40% sur chaque
  abonnement, tous les mois, tant que la personne reste") ;
- ton lien pour CE produit, prêt à copier ;
- trois nombres : clics, ventes, gains en attente ;
- un bouton "Voir tout mon suivi" qui mène à l'espace affilié.

Pas de graphique, pas de tableau, pas de réglage : une fenêtre, pas un
deuxième dashboard.

**Et on réutilise l'existant, sans rien redessiner.** Les cartes KPI et
le graphique de Mes stats (`app/stats/StatsShell.tsx`), la vue
`affiliate_stats` déjà en base, la page Promouvoir et
`affiliate_link_destinations`. Le seul écran vraiment nouveau, c'est le
tableau par lien et par canal, et il reprend la mise en forme du tableau
"Performances par quiz".

**Ce que l'affilié doit lire sans poser la question :**

- ce qui part au prochain virement, et sa date ;
- ce qui est encore en garantie, avec la date de déblocage ;
- combien de ventes avant le palier suivant ;
- une commission remboursée, barrée, avec son motif, jamais effacée ;
- l'historique des paiements avec la facture correspondante.

---

## 7. Payer les affiliés

- **Virement bancaire : oui, et c'est par là qu'on commence.** Les IBAN
  sont déjà en base, tu paies depuis Qonto une fois par mois. Zéro frais,
  zéro intégration, zéro dépendance.
- **PayPal : oui, ensuite.** L'API Payouts existe, elle demande une
  activation de leur part, elle a des frais, elle sert l'international.
- **Stripe : non, pas pour payer des affiliés.** Stripe sait encaisser,
  il ne sait pas envoyer de l'argent à quelqu'un qui n'est pas un compte
  connecté chez eux. Il faudrait inscrire chaque affilié en Stripe
  Connect avec vérification d'identité : lourd pour eux, lourd pour toi,
  et pas mieux qu'un virement.

Ce que l'app automatise, et c'est le vrai travail : constituer le lot du
mois (commissions validées, hors garantie, au dessus du seuil, profil de
facturation complet), **générer la facture ou le relevé
d'autofacturation** à partir du profil fiscal, marquer les commissions
comme payées, archiver le document des deux côtés. Le virement lui-même
peut rester manuel très longtemps sans que ça se voie.

**À confirmer avec ton comptable, pas avec moi :** facture émise par
l'affilié ou autofacturation par toi, et le traitement de la TVA selon
qu'il y est assujetti ou non, en France ou hors de France. C'est la
raison pour laquelle le profil fiscal demande le régime de TVA et
l'adresse : ce sont eux qui décident du contenu du document.

---

## 8. Vendre en direct (Stripe / PayPal) en gardant l'emailing sur Systeme.io

C'est le plus gros morceau, et il n'est pas nécessaire pour lancer le
programme. Il est en dernier exprès.

```
Aujourd'hui :  Systeme.io vend  ->  webhook  ->  l'app ouvre l'accès
Demain      :  l'app vend  ->  l'app ouvre l'accès  ->  l'app pousse le
                              contact et le tag vers Systeme.io
```

L'emailing reste chez eux, tu écris tes séquences au même endroit. Ce qui
change, c'est qui encaisse et qui décide de l'accès.

**Ce que l'affiliation y gagne, et c'est énorme.** Aujourd'hui on
attribue par EMAIL : on cherche si l'adresse du client correspond à une
conversion récente. Ça rate dès que le client paie avec une autre adresse
que celle de son optin, cas vu cette semaine sur l'Atelier. Si c'est
l'app qui vend, le code affilié voyage DANS le paiement : il n'y a plus
rien à deviner, la vente arrive signée.

**La bonne nouvelle :** le checkout est déjà écrit et déjà testé contre
les vraies API dans Tiquiz, pour les revendeurs (`lib/stripeRest.ts`,
`lib/paypalRest.ts`, `lib/resellerPayments.ts`). Encaisser n'est pas à
inventer.

**Le vrai coût n'est pas le checkout**, c'est la vie de l'abonnement
après la première vente, que Systeme.io absorbe aujourd'hui sans que ça
se voie : paiement qui échoue et relances, carte expirée, résiliation,
remboursement, changement de palier. Chacun devient un événement à
traiter et un accès à ouvrir ou fermer au bon moment.

Et la même question de facturation et de TVA se pose, en plus gros,
puisque tu deviens le vendeur. Selon la réponse de ton comptable, c'est
un chantier de trois semaines ou de trois mois. **C'est le seul inconnu
du document qui peut décaler tout le reste.**

---

## 9. Le plan en 4 temps

Chaque phase est utilisable seule et ne casse pas la précédente. Aucune
ne t'oblige à quitter Systeme.io tant que tu ne le décides pas.

### Phase 0 : le socle
- code affilié à nous, choisi, vérifié, avec ses anciens codes en alias
  permanents ;
- redirection `/go/...` et lien court, cookie posé par notre serveur ;
- canal et provenance sur chaque clic ;
- l'Atelier pousse ses ventes vers le registre central ;
- un seul écran de gains pour les trois produits.
- **Les deux systèmes tournent en parallèle**, et on ne coupe le
  tracking Systeme.io que quand les deux comptages donnent la même chose
  pendant deux semaines. Comparer avant de couper est la seule façon de
  savoir qu'on n'a rien perdu.

### Phase 1 : paliers et règles
- table des paliers par produit, éditable depuis l'admin ;
- taux gelé à la vente, produit en paramètre obligatoire ;
- compteur de ventes (Atelier) et d'abonnés actifs (Tiquiz, Tipote) ;
- règles écrites, acceptées, versionnées ;
- pause et bannissement avec leurs effets réels ;
- dédoublonnage des clics et anti-auto-affiliation élargie.

### Phase 2 : suivi et paiement
- prochain virement, sa date, ce qui est en garantie, prochain palier ;
- tableau par lien, par canal, par provenance ;
- profil de facturation obligatoire avant paiement ;
- lots mensuels, facture ou autofacturation générée, historique ;
- virement d'abord, PayPal ensuite ;
- la fenêtre affiliation dans Tiquiz, Tipote et l'Atelier.

### Phase 3 : vente directe sur Tiquiz
- Stripe et PayPal en checkout natif ;
- le code affilié voyage dans le paiement, l'attribution devient exacte ;
- contact et tag poussés vers Systeme.io pour l'emailing ;
- échecs de paiement, résiliations, remboursements.

### Phase 4 : Tipote sur les mêmes rails
Un produit de plus dans la table des paliers, une destination de plus
dans les liens. Rien à reconstruire.

---

## 10. Ce que je ne ferai pas sans que tu le dises

- toucher à l'emailing Systeme.io : il reste, c'est acté ;
- couper le tracking actuel avant la période de comparaison ;
- changer un taux existant : 40% et 70% restent les paliers de base, les
  paliers ne font que monter au dessus ;
- promettre une date sur la phase 3 tant que la question de la
  facturation et de la TVA n'est pas tranchée.
