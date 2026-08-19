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
| 5 | Devenir affilié | **Inscription libre. Aucun statut exigé, on demande seulement de quoi payer et facturer** |

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

**Le profil de facturation ne juge personne, il sert à payer.** On ne
demande ni statut ni SIRET : l'affilié déclare ses revenus de son côté,
ça ne nous regarde pas. On demande son nom, son adresse, son pays, s'il
est assujetti à la TVA, et où envoyer l'argent. Tant que ces cases ne
sont pas remplies les commissions s'accumulent et s'affichent, mais
aucun lot de paiement ne les prend, et l'écran le dit avant, pas au
moment du virement raté. Le détail champ par champ est en section 7 bis.

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
facturation complet), **émettre la facture**, marquer les commissions
comme payées, archiver le document des deux côtés. Le virement lui-même
peut rester manuel très longtemps sans que ça se voie.

---

## 7 bis. La facture : autofacturation, comme Systeme.io

**Décision Béné, 19 août 2026 :** "Facture créée chez moi comme pour
Systeme io et gestion TVA : si l'affilié est soumis à la TVA notre
facture le prend en compte."

C'est le bon choix, et le plus automatisable : l'affilié n'a rien à
produire, donc rien ne bloque son paiement parce qu'il n'a pas envoyé
son PDF. Mais l'autofacturation a une contrepartie stricte : **on émet
un document AU NOM de quelqu'un d'autre**, donc on ne peut pas se
tromper sur son identité ni sur son régime.

### Ce que ça impose, et qui doit exister avant le premier paiement

1. **Un mandat de facturation accepté à l'inscription.** L'affilié
   autorise expressément Tipote à établir ses factures en son nom et
   pour son compte. Sans cet accord, l'autofacturation n'est pas
   opposable. Il est versionné comme les règles du programme
   (`accepted_terms_version`), et pour la même raison : on ne peut pas
   invoquer un accord que la personne n'a jamais vu.
2. **Un droit de contestation, et un délai.** Chaque facture lui est
   notifiée et il peut la contester. En pratique : la facture apparaît
   dans son espace, il reçoit un email, et un bouton "Signaler une
   erreur" ouvre une ligne dans ta file de vérification. C'est aussi
   une protection pour toi : une facture contestée un an après vaut
   moins qu'une facture jamais regardée.
3. **Une série de numérotation dédiée PAR AFFILIÉ**, continue, sans
   trou. Pas une série commune à toutes les autofactures : c'est une
   série par vendeur, parce que chaque facture appartient à la
   comptabilité de SON affilié, pas à la tienne. Une seule série
   partagée ferait des trous dans la numérotation de chacun.
4. **Le document est FIGÉ.** Une fois émis, il ne se réécrit pas. Une
   erreur se corrige par un avoir, jamais en modifiant le PDF. Sinon le
   montant affiché à l'affilié et le montant déclaré peuvent diverger
   sans que rien ne le signale, ce qui est exactement la famille de bug
   que ce repo passe son temps à fermer.

### La TVA : trois cas, un seul champ décide

Le régime de TVA n'est pas une case cosmétique du profil : c'est LUI
qui détermine ce qui est écrit sur la facture et ce que tu verses.

| Cas | Ce que la facture porte |
|---|---|
| Assujetti en France | commission HT + TVA au taux normal, TTC payé |
| Franchise en base (micro) | pas de TVA, avec la mention légale correspondante |
| Entreprise dans un autre pays de l'UE, numéro de TVA valide | pas de TVA française, autoliquidation par lui |
| Hors UE | hors champ de la TVA française |

**Deux règles de code qui en découlent :**

- **Le régime est GELÉ sur la facture au moment de l'émission**, comme
  le taux de commission l'est sur la vente. Un affilié qui passe à la
  TVA en octobre ne doit pas transformer rétroactivement ses factures de
  juin. Même principe, même raison : un document déjà remis est un
  engagement.
- **Un numéro de TVA intracommunautaire se VÉRIFIE, il ne se croit pas.**
  Un numéro invalide dans la case "UE, autoliquidation" te fait facturer
  sans TVA une opération qui en devait, et c'est toi qui la dois. La
  vérification se fait auprès du service européen prévu pour ça, au
  moment où il saisit son numéro, et le résultat est stocké avec sa
  date. Un numéro non vérifié = paiement bloqué, pas TVA à zéro par
  défaut. C'est la règle du `??` qui ne protège que du manquant : ici
  la valeur fausse est plus dangereuse que la valeur absente.

### Le profil de facturation, champ par champ

Chaque champ existe parce qu'il décide d'une ligne du document. Aucun
n'est là "au cas où".

**Décision Béné, 19 août 2026 : "on n'oblige RIEN, ils déclarent leurs
revenus de leur côté, ça ne nous regarde pas."**

Donc aucun statut exigé, aucun plafond, aucune vérification de ce qu'il
fait de son argent. Le profil ne demande QUE ce dont on a besoin pour le
payer et pour établir le document, et rien d'autre.

| Champ | Obligatoire ? | Ce qu'il décide |
|---|---|---|
| Nom et prénom, ou raison sociale | oui | au nom de qui la facture est établie |
| Adresse complète | oui | mention légale obligatoire |
| Pays | oui | le régime de TVA applicable |
| Assujetti à la TVA (oui / non) | oui | TVA appliquée, ou mention d'exonération |
| Numéro de TVA intracommunautaire | seulement si assujetti | autoliquidation, après vérification |
| SIREN / SIRET | **non** | ajouté à la facture s'il le donne |
| IBAN ou email PayPal | oui | où part l'argent |

Le seul champ vraiment bloquant est celui qui décide de la TVA, et il se
répond par oui ou non. Un affilié qui ne coche rien est traité comme non
assujetti : pas de TVA, mention d'exonération, il est payé.

### Ce que dit la réforme de la facturation électronique

Tu m'as demandé de me renseigner plutôt que de te renvoyer vers ton
comptable. Voilà ce qui est établi, et ce que ça change pour nous.

**Deux dates, et elles ne te concernent pas de la même façon.**

- **1er septembre 2026** (dans deux semaines) : obligation de
  RÉCEPTION pour toute entreprise assujettie à la TVA en France. Tu dois
  être capable de recevoir une facture électronique structurée via une
  plateforme agréée. **Ça concerne ta compta, pas ce code**, et c'est
  la seule échéance vraiment imminente du document.
- **1er septembre 2027** : obligation d'ÉMISSION pour les TPE, PME et
  micro-entreprises, e-reporting compris. **C'est cette date qui compte
  pour nos factures affiliés.** On a un an.

**Ce que la réforme impose à une autofacture**, et qui confirme ou
corrige ce que j'avais écrit plus haut :

- l'autofacturation est traitée comme un **mandat d'émission**, qui doit
  être **préalable et écrit** (c'était déjà dans le plan) ;
- la facture doit porter la mention **"autofacturation"** ET la
  **référence au mandat** ;
- elle porte un **type de facture dédié** dans le format structuré ;
- **numérotation en série chronologique par vendeur** (c'est ce qui a
  corrigé le point 3 ci-dessus) ;
- formats acceptés : **Factur-X, UBL ou CII**, transmis par une
  **plateforme agréée** (le nouveau nom des PDP).

**La conséquence de conception, et c'est la seule qui compte
aujourd'hui : on stocke les DONNÉES structurées de chaque facture, pas
seulement un PDF.** Émetteur, destinataire, mandat, lignes, base HT,
taux, montant de TVA, mention légale, devise, dates. Le PDF n'est qu'un
rendu de ces données. À ce prix, passer à Factur-X en 2027 est un export
à écrire ; si on ne stocke qu'un PDF, c'est une reprise de tout
l'historique. La différence de coût est d'un facteur dix, pour une
décision qui se prend maintenant et ne se voit pas.

**Ce qu'on ne fait PAS maintenant :** brancher une plateforme agréée.
Ce serait payer un an d'avance un service qui n'est pas encore
obligatoire pour toi, et les offres bougent encore. On garde la porte
ouverte, on ne la franchit pas.

### La TVA du client final : la règle, c'est ce que Béné a répondu

"Ma TVA c'est 20% en France et après les taux normaux pour mon domaine,
selon chaque pays."

**C'est exactement la règle**, et il n'y avait rien à demander : depuis
2015, un service numérique vendu à un particulier est taxé dans le pays
où il réside, au taux de ce pays. Ma question était mal posée : ce qui
reste ouvert n'a jamais été QUEL taux, mais **qui fait le travail** une
fois Systeme.io hors du circuit. Aujourd'hui c'est leur bon de commande
qui détermine le pays, applique le bon taux et sort les montants. Demain
ce serait notre code.

Ce que ça veut dire concrètement pour la phase 3, et rien de plus :

- une table des taux par pays, tenue à jour, et le taux GELÉ sur chaque
  vente (même principe que partout ailleurs dans ce document) ;
- déterminer le pays du client et en garder la preuve ;
- **le seuil de 10 000 €** : tant que tes ventes transfrontalières B2C
  dans l'UE restent en dessous sur l'année, tu peux appliquer la TVA
  française partout. Au dessus, c'est le taux du pays du client et le
  guichet unique OSS, une déclaration trimestrielle unique. Donc l'app
  doit CUMULER ce montant et te prévenir avant que tu franchisses le
  seuil, pas après ;
- un professionnel de l'UE qui donne un numéro de TVA valide est en
  autoliquidation, exactement comme pour les factures affiliés ;
- et l'e-reporting des ventes B2C à partir de septembre 2027 : montants
  HT, TVA par taux, devise, dates, transmis par une plateforme agréée.
  L'amende est de 250 € par transmission manquante, plafonnée à 15 000 €
  par an, ce qui en fait un poste à ne pas découvrir en route.

Rien de tout ça ne bloque le programme d'affiliation. C'est du travail
de phase 3, et c'est maintenant chiffrable au lieu d'être un inconnu.

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

Et il faut reprendre ce que le bon de commande Systeme.io fait
aujourd'hui sans qu'on le voie : déterminer le pays du client, appliquer
le taux de ce pays, cumuler le seuil de 10 000 €, sortir les montants
pour l'OSS. La règle est connue (cf. section 7 bis), donc ce n'est plus
un inconnu : c'est du travail identifié, à faire une fois.

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
- profil de facturation obligatoire avant paiement, numéro de TVA
  intracommunautaire vérifié avant d'être cru ;
- mandat de facturation accepté et versionné ;
- lots mensuels, autofacturation émise et figée, série de numérotation
  séparée, contestation possible, historique ;
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
- ouvrir le paiement d'un affilié dont le numéro de TVA n'a pas été
  vérifié ;
- demander à un affilié un statut, un SIRET ou quoi que ce soit sur ses
  revenus : on n'oblige rien, il déclare de son côté ;
- brancher une plateforme agréée avant que ce soit nécessaire (septembre
  2027 pour l'émission), tout en stockant dès maintenant les données
  structurées qui permettront de le faire sans reprise.
