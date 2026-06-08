// app/affiliate/promouvoir/content/emails-fr.ts
//
// Séquence email affiliation Tiquiz - 8 mails evergreen rédigés par Béné.
// VERSION 2 (juin 2026) : intègre les 5 plans regroupés en 2 familles
// (STANDARD : gratuit / 9 € / 90 € - PLUS : 29 € / 290 € pour le multi-clients).
//
// Le placeholder {AFFILIATE_LINK} est remplacé côté UI par le vrai
// lien tracké de l'affilié connecté (https://www.tipote.fr/part-tiquiz?sa={son_sa}).
// {NAME} → le prénom affiché de l'affilié.
// {first_name} → variable du destinataire (Systeme.io), laissée telle quelle.
//
// Tone : neutre, copy/paste-ready, adaptable. Posture "partenaire qui
// recommande", pas vendeur agressif. Voir docs persona Tiquiz.

export type EmailTemplate = {
  id: string;
  subject: string;
  preheader: string;
  body: string;
  notes?: string;
};

export const EMAILS_FR: EmailTemplate[] = [
  {
    id: "01-ouverture",
    subject: "Un outil que je voulais te partager",
    preheader: "Béné a sorti son SaaS de quiz, et je crois que ça va te parler.",
    notes: "Email 1 - Ouverture. Présenter Béné, présenter Tiquiz, présenter les 5 plans regroupés en 2 familles.",
    body: `Salut {first_name},

Je ne te parle pas souvent d'outils d'autres créateurs. Quand je le fais, c'est que le produit m'a convaincu·e et que la personne derrière est solide.

Aujourd'hui, les deux sont réunis. Je te parle de Tiquiz, le SaaS de quiz marketing de Béné (du blog blagardette.com, que tu connais peut-être déjà).

C'est un créateur de quiz qui capte des leads qualifiés, les segmente selon leurs réponses, et les envoie automatiquement dans ton compte Systeme io avec le bon tag, la bonne formation, la bonne communauté. Tu rentres ton objectif, l'IA te génère un quiz complet en 3 à 4 minutes, tu ajustes, tu partages, tu vois tomber les leads.

(en gros, tu arrêtes d'avoir une liste email où 80 % des gens ne savent pas ce qu'ils cherchent, et tu commences à savoir à qui tu parles)

Côté tarif, c'est simple, transparent, et il y a deux familles selon ton usage.

Si tu travailles pour ton business uniquement (la famille STANDARD) :
- 0 € pour le compte gratuit (1 quiz, 10 réponses par mois). Pas de carte bancaire, pas d'obligation, juste pour tester en conditions réelles.
- 9 € par mois sans engagement, pour les quiz et réponses illimités.
- 90 € par an si tu veux économiser deux mois et signer pour l'année.

Si tu gères plusieurs clients, marques ou comptes (la famille PLUS), typiquement agences, consultants, freelances qui montent des funnels pour leurs clients :
- 29 € par mois PLUS, ou 290 € par an PLUS.
- Tu débloques le multi-profils (un espace par client), l'analyse IA des résultats, le multi-clés API Systeme io (connecter plusieurs comptes), et les templates de quiz pré-conçus.

Si tu n'es pas sûr·e de ta catégorie, commence par le gratuit. Tu auras vu le produit tourner avant de décider quoi que ce soit. Tu pourras passer en STANDARD ou en PLUS quand tu sauras.

👉 Je découvre Tiquiz → {AFFILIATE_LINK}

Dans les prochains jours, je vais te partager ce que l'outil fait concrètement, à qui il sert, et les questions que tu te poses probablement. Si tu veux aller voir la page direct, le lien est juste au-dessus.

Si tu as une question précise, réponds à ce mail. Je te réponds (ou je demande à Béné si je ne sais pas).

À bientôt,
{NAME}`,
  },
  {
    id: "02-benefices",
    subject: "{first_name}, ce que Tiquiz fait vraiment",
    preheader: "La liste concrète, sans l'habiller.",
    notes: "Email 2 - Cascade de bénéfices. STANDARD pour tous, PLUS pour ceux qui gèrent du multi-client.",
    body: `Salut {first_name},

Hier je t'ai présenté Tiquiz. Aujourd'hui, ce que le produit fait concrètement.

Je te mets la liste telle que Béné me l'a décrite, sans enjoliver.

Ce que tu débloques dès le plan STANDARD (gratuit, 9 €/mois ou 90 €/an) :

- Tu génères un quiz complet avec l'IA en 3 à 4 minutes → tu arrêtes de passer des weekends à écrire un PDF que 4 personnes téléchargeront sans jamais lire.

- Tu captes des emails qualifiés (prénom, nom, téléphone, pays, tu choisis ce que tu demandes) → tu arrêtes de collecter des adresses jetables type prenom1234@gmail.com.

- Tu segmentes automatiquement selon les réponses → chaque lead est tagué dans Systeme io avec son profil, donc tu leur envoies une séquence qui leur parle, pas un message générique.

- Tu inscris tes leads dans une formation ou une communauté Systeme io selon leur profil de résultat → tu arrêtes de le faire à la main et d'oublier la moitié des nouveaux.

- Tu actives le partage viral (les prospects voient leur résultat après avoir partagé le quiz) → chaque lead te ramène quelques visites supplémentaires, sans budget pub.

- Tu crées des résultats qui vendent pour toi (chaque profil a sa propre page avec titre, description, CTA personnalisé) → ton prospect sort du quiz déjà chauffé pour l'offre qui lui correspond.

- Tu obtiens des stats utiles par quiz (vues, starts, complétions, partages, conversions) → tu sais ce qui marche et ce qui coince, sans dashboard à 40 onglets.

- Tu édites ton quiz dans plusieurs langues → tu touches un public international sans payer un traducteur.

- Tu utilises ta propre clé API Systeme io → tes leads arrivent direct chez toi, pas dans un intermédiaire payant.

Ce que tu débloques EN PLUS avec PLUS (29 €/mois ou 290 €/an), si tu gères plusieurs clients ou marques :

- Multi-profils → tu crées un espace par client. Branding distinct, quiz séparés, statistiques cloisonnées. Tu peux livrer 10 clients depuis un seul compte, sans tout mélanger.

- Analyse IA des résultats → pour chaque quiz lancé, Tiquiz te sort un rapport synthèse de ce qui ressort vraiment de tes répondants : leurs vrais blocages, leurs envies dominantes, les corrélations entre profils. Tu arrêtes de deviner ce que ton audience veut, l'IA te le pose noir sur blanc.

- Multi-clés API Systeme io → tu connectes le compte Systeme io de chacun de tes clients. Chaque quiz envoie ses leads dans le bon compte automatiquement. Plus de jongle entre les comptes, plus d'erreurs d'attribution.

- Templates de quiz pré-conçus → tu pars d'un quiz prêt-à-l'emploi (typés « diagnostic », « matching d'offre », « scoring leads B2B », etc.) et tu adaptes en quelques clics. Idéal si tu lances un nouveau quiz par semaine ou par client.

Le vrai changement, ce n'est pas le nombre de fonctionnalités. C'est que tu arrêtes de travailler pour attirer des curieux, et que tu commences à travailler avec des gens qui ont déjà montré ce qui les intéresse chez toi. Et si tu fais ça pour plusieurs clients, tu arrêtes de te disperser sur 4 outils différents.

Tu peux tester tout ça avec le compte gratuit (1 quiz, 10 réponses par mois). Pas de CB demandée. Tu testes vraiment, sans risque, et tu décides ensuite si tu passes en STANDARD ou en PLUS.

👉 Je teste Tiquiz gratuitement → {AFFILIATE_LINK}

Demain, je te raconte le profil type qui a le plus à gagner avec ce genre d'outil. Peut-être que tu vas t'y reconnaître.

{NAME}`,
  },
  {
    id: "03-linda",
    subject: "Le piège du « j'ai une liste mais rien ne se passe »",
    preheader: "Je vois ce pattern plusieurs fois par mois.",
    notes: "Email 3 - Persona miroir Linda (solopreneur). Before / After / Bridge. L'agence aura son tour à l'email 7.",
    body: `Salut {first_name},

Je vais te parler d'un pattern que je vois chez beaucoup de créateurs et créatrices que je croise.

Je vais l'appeler « Linda » pour ne pointer personne en particulier.

Linda a :
- Une liste email de quelques centaines de contacts
- Un ebook « 5 clés pour... » en aimant à inscrits
- Un tunnel Systeme io propre
- Un taux d'ouverture autour de 15 %
- 0 à 1 vente par mois

Linda bosse. Elle poste, elle tient son planning, elle répond en DM, elle a créé plusieurs offres et les a ajustées plusieurs fois.

Son problème, il n'est pas dans ses posts. Il n'est pas dans son ebook. Il n'est pas dans son offre.

Son problème, c'est qu'elle ne sait pas qui cherche quoi dans sa liste. Elle envoie les mêmes mails à tout le monde. Résultat : tout le monde reçoit un message qui parle à personne.

Linda passe des mois à écrire des séquences génériques, à baisser ses prix, à se dire que l'algo la punit, à envisager un coach (encore une dépense), et à douter de son positionnement (encore).

- - -

Linda met 20 minutes à créer un quiz « Quel type d'entrepreneur / parent / prof... es-tu ? » avec 4 profils de résultat. Elle le partage en story, en bio, sur sa page d'accueil, en signature de mail. En 2 semaines, des dizaines de personnes le remplissent. Systeme io les tague automatiquement. Linda écrit 4 séquences différentes, une par profil. Ouverture qui remonte à 35-40 %, clics qui suivent.

Comme elle sait qui veut quoi, elle arrête d'envoyer son offre « générale » à toute la liste. Elle envoie l'offre adaptée au bon segment.

Le quiz ne remplace pas le travail qu'elle fait. Il met un filtre intelligent à l'entrée, pour que tout ce qu'elle fait ensuite (contenu, mails, offres) parle à la bonne personne au bon moment.

Pour le cas de Linda, le plan Mensuel à 9 € ou Annuel à 90 € suffit largement : un seul business, un seul compte Systeme io, un seul branding. Pas besoin du PLUS.

Si tu te reconnais un peu dans Linda, le compte gratuit Tiquiz te permet de monter ton premier quiz sans sortir un euro. Tu vois les résultats sur 10 réponses (largement assez pour valider que les gens jouent le jeu), et tu décides ensuite.

👉 Je teste Tiquiz gratuitement → {AFFILIATE_LINK}

Demain, je te montre comment se passe la création d'un quiz, étape par étape. Chrono en main.

{NAME}`,
  },
  {
    id: "04-demo",
    subject: "Combien de temps pour créer un quiz dans Tiquiz",
    preheader: "Étape par étape, chrono en main.",
    notes: "Email 4 - Démonstration / process. Démystifier la technique. Mention discrète des templates + multi-clés PLUS.",
    body: `Salut {first_name},

Je te fais la version courte du process Tiquiz, pour que tu saches à quoi t'attendre si tu passes à l'action.

Tu choisis entre 3 modes : Manuel, IA, Import. Le mode IA, c'est là où tu gagnes des heures.

Étape 1 - Tu briefes l'IA (2 minutes)
- Ton objectif (exemple : qualifier mes visiteurs prêts à commander telle formation)
- Ton audience (exemple : parents débutants en éducation canine)
- Le ton (tu, vous, copain, pro...)
- Le CTA final (où tu veux les envoyer après)
- Le bonus de partage viral si tu l'actives

(Astuce : sur le plan PLUS, tu peux aussi partir d'un template pré-conçu - « diagnostic », « matching d'offre », « scoring leads B2B » - et l'IA part de ce squelette pour gagner encore quelques minutes. Utile surtout si tu en produis pour plusieurs clients.)

Étape 2 - L'IA écrit ton quiz (1 minute)
L'IA écrit ton quiz en direct sous tes yeux. Questions, options, profils de résultat, tout se remplit. 30 secondes à 1 minute.

Étape 3 - Tu personnalises (2 à 3 minutes)
C'est ton quiz, tu le veux à ton image. Tu changes une question, tu reformules un résultat, tu ajoutes ton logo et tes couleurs.

Étape 4 - Tu connectes Systeme io (1 minute par profil)
Pour chaque profil de résultat, tu choisis un tag Systeme io (tu prends un tag existant ou Tiquiz le crée pour toi). Tu peux aussi inscrire automatiquement les leads dans une formation ou une communauté.

(Sur le plan PLUS, tu peux brancher plusieurs comptes Systeme io en parallèle, un par client. Chaque quiz envoie ses leads dans le bon compte sans que tu y penses.)

Étape 5 - Tu publies (instantané)
Lien public ou code embed (article, popup, page d'accueil). Story, bio, mail, signature, c'est parti.

Total : entre 4 et 8 minutes selon ton niveau de perfectionnisme.

Ensuite, les leads tombent dans ton dashboard Tiquiz et dans Systeme io au fur et à mesure, avec leur email, leur prénom, leur profil, leur tag.

La connexion Systeme io est intégrée. Tu mets ta clé API une fois dans les paramètres, tout passe automatiquement. Pas d'outil intermédiaire à configurer, pas de Zapier, pas de Make.

👉 Je découvre Tiquiz → {AFFILIATE_LINK}

Demain, je passe au crible les questions qui reviennent le plus souvent. Si tu en as une qui n'y est pas, réponds à ce mail.

{NAME}`,
  },
  {
    id: "05-faq",
    subject: "7 questions qui reviennent sur Tiquiz",
    preheader: "Réponses directes, sans filtre.",
    notes: "Email 5 - FAQ / objections. Technique, comparaison, prix, multi-clients, niche, SIO, essai, remboursement.",
    body: `Salut {first_name},

J'ai pris les 7 questions qui reviennent le plus souvent, je te donne les réponses directes.

1. Faut-il être technique pour utiliser Tiquiz ?
Si tu sais utiliser Systeme io (ouvrir ton compte, créer une page, créer un tag), tu sais utiliser Tiquiz. L'IA fait la partie lourde, toi tu valides, tu ajustes, tu partages. Il y a aussi un tutoriel guidé en 7 étapes qui se lance à ta première connexion pour te prendre par la main.

2. Quelle différence avec Typeform ou Tally ?
Typeform et Tally sont de très bons formulaires. Mais ce sont des formulaires. Ils collectent, ils t'envoient un CSV. Tiquiz est pensé pour un usage précis : capter des leads qualifiés, les segmenter selon leurs réponses, et les synchroniser automatiquement dans Systeme io avec le bon tag, la bonne inscription en formation, la bonne communauté. Chaque résultat a sa propre mini page de vente avec CTA personnalisé, donc ton prospect sort déjà chauffé pour l'offre qui lui correspond.

Côté prix : Typeform Basic 25 € par mois, Plus 50 € par mois (600 € par an). Tally Pro 29 $ par mois. Tiquiz, c'est 9 € par mois ou 90 € par an pour la version STANDARD. Et 29 € par mois ou 290 € par an pour la version PLUS multi-clients.

3. Je gère plusieurs clients (agence, freelance, consultant). C'est quel plan ?
Le plan PLUS (29 € par mois ou 290 € par an). Tu débloques :
- Multi-profils : un espace par client, chaque client a son branding, ses quiz, ses stats. Rien ne se mélange.
- Multi-clés API Systeme io : tu connectes le compte Systeme io de chaque client. Les leads atterrissent direct chez le bon client.
- Templates de quiz : tu démarres vite, tu adaptes au cas client en quelques minutes.
- Analyse IA des résultats : tu livres à chaque client un rapport d'insights sur son audience captée. C'est un livrable que tu peux facturer à part si tu veux.

Si tu factures à tes clients 200-500 € le setup d'un quiz, le plan PLUS s'amortit dès le premier client du mois.

4. Est-ce que ça marche pour ma niche ?
Oui, si ton audience est humaine et que tu sais un minimum à qui tu parles. L'IA adapte le quiz à la niche que tu lui décris. Coaching sportif, formation cuisine, consulting B2B léger, parentalité, affiliation, création de contenu : tout y passe. Et comme le produit supporte plusieurs langues (avec gestion RTL pour l'arabe), tu peux aussi ouvrir à un public international.

Si tu vends du service B2B très technique avec cycles de vente de 6 mois et plusieurs décideurs par deal, ce n'est pas l'outil. Béné le dit elle-même.

5. Faut-il déjà avoir un compte Systeme io ?
Tu peux utiliser Tiquiz comme générateur de quiz indépendant, les leads arrivent dans ton dashboard Tiquiz, tu exportes quand tu veux. Mais la vraie puissance, c'est la connexion Systeme io (tagging auto, inscription formation, ajout communauté). Le compte gratuit Systeme io suffit pour démarrer. Sur le plan PLUS, tu peux brancher plusieurs comptes Systeme io en parallèle.

6. Y a-t-il un essai gratuit ?
Oui. Compte gratuit à vie : 1 quiz actif, 10 réponses par mois. Tu testes en conditions réelles, sur ton audience, sans CB demandée. Si tu es convaincu·e, tu passes en STANDARD (9 € par mois) ou en PLUS (29 € par mois) selon ton usage. Si tu ne l'es pas, tu restes sur le gratuit ou tu pars, sans engagement, sans drame.

7. Garantie ou remboursement ?
Non. Pas de garantie, pas de remboursement. Béné assume cette posture parce que le compte gratuit te permet déjà de tester en conditions réelles avant de payer un centime. Si tu hésites encore après ça, c'est que ce n'est pas l'outil pour toi, et c'est OK.

👉 Je découvre Tiquiz → {AFFILIATE_LINK}

Si ta question n'est pas dans cette liste, réponds à ce mail. Je te répondrai (ou je lui ferai remonter).

{NAME}`,
  },
  {
    id: "06-prix",
    subject: "Pourquoi Tiquiz coûte 9 € (ou 29 € en PLUS) et pas 50 €/mois",
    preheader: "La comparaison plan par plan qui m'a décidé·e.",
    notes: "Email 6 - Comparaison marché sur les deux familles. Justification du prix, économies sur 5 ans.",
    body: `Salut {first_name},

J'ai été un peu sceptique au début. Quand un outil est nettement moins cher que ses concurrents, je me demande où est le piège.

J'ai pris le temps de comparer plan par plan. Voici ce que ça donne.

POUR UN USAGE SOLO (1 business, 1 compte Systeme io)

Typeform Plus
- 50 € par mois, soit 600 € par an
- Pas de tagging Systeme io natif (il te faut Zapier ou Make en plus, comptez 20 € par mois)
- Page de résultat statique (pas de mini page de vente personnalisée par profil)

Tally Pro
- 29 $ par mois (environ 27 €), soit 330 € par an
- Pas de connexion native Systeme io, il te faut un middleware (Zapier ou Make)

Tiquiz Mensuel
- 9 € par mois, connexion Systeme io native, page de résultat personnalisée par profil

Tiquiz Annuel
- 90 € par an (économise 2 mois vs le mensuel), tout l'illimité

Sur 5 ans :
- Typeform Plus + Zapier : environ 4 200 €
- Tally Pro + Zapier : environ 2 800 €
- Tiquiz Annuel : 450 €

POUR UN USAGE MULTI-CLIENTS (agences, consultants, freelances qui montent des funnels pour plusieurs clients)

Les outils marché qui font vraiment du multi-clients propre (multi-workspaces + segmentation + analytics) tournent entre 80 et 300 € par mois :
- Outgrow agency : environ 270 $ par mois
- Interact Pro : environ 64 $ par mois (limité côté workspaces)
- Jotform Gold + middleware : environ 80 € par mois total
- Sans compter le coût Zapier/Make pour la sync CRM

Tiquiz Mensuel PLUS
- 29 € par mois, multi-comptes Systeme io, insights IA inclus

Tiquiz Annuel PLUS
- 290 € par an (économise 2 mois vs le mensuel PLUS), toutes les fonctionnalités PLUS

Sur 5 ans en PLUS :
- Outgrow agency : environ 15 000 €
- Interact Pro : environ 3 600 €
- Tiquiz Annuel PLUS : 1 450 €

👉 Je découvre Tiquiz → {AFFILIATE_LINK}

La différence vient du fait que Béné a codé Tiquiz avec l'IA, sans dépendre d'un dev externe coûteux, et qu'elle a fait le choix de fixer ses prix sur les valeurs de son audience plutôt que sur ce que le marché accepte de payer aveuglément. Les économies de structure passent dans le prix utilisateur. C'est aussi simple que ça.

Demain, je te montre deux cas d'usage concrets : un solo, une agence. Tu choisis celui qui te ressemble.

{NAME}`,
  },
  {
    id: "07-cas-usage",
    subject: "Le quiz qui pré-vend ton offre (et la rampe de lancement pour agence)",
    preheader: "Deux exemples concrets, deux familles de plans.",
    notes: "Email 7 - Cas d'usage. Marie (solo, STANDARD) + Karim (agence, PLUS). Mécanique de pré-vente transposable.",
    body: `Salut {first_name},

Le truc que je trouve le plus malin dans Tiquiz, c'est la page de résultat qui pré-vend ton offre. Et la deuxième chose la plus maligne, c'est que la même mécanique scale parfaitement pour une agence.

Je te raconte deux exemples concrets. J'invente les personas, la mécanique est exacte.

CAS 1 - Marie (solopreneur), plan Annuel à 90 €

Marie est coach business pour solopreneurs débutants. Elle propose 3 offres : un programme à 47 € (mini-formation), un accompagnement à 297 € (4 semaines), et un coaching premium à 1 200 € (3 mois).

Avant Tiquiz, Marie envoyait son ebook « 5 clés pour démarrer » à toute la liste. Tout le monde recevait la même séquence email avec la même offre poussée. Conversion : 0,5 % sur les 47 €, presque rien sur les autres.

Ce qu'elle fait avec Tiquiz : un quiz « Quel type d'entrepreneur·e es-tu ? » avec 4 profils de résultat :
- Profil 1 : « Le·la débutant·e qui n'a pas encore lancé » → besoin d'aide structurée et abordable
- Profil 2 : « Le·la débutant·e qui a démarré sans clients » → besoin d'accompagnement court et intensif
- Profil 3 : « L'autodidacte qui galère depuis des mois » → besoin d'un mentor pour débloquer
- Profil 4 : « Le·la pro qui veut passer un cap » → besoin d'un programme premium

Chaque profil débouche sur une page de résultat dédiée avec :
- Le diagnostic adapté (« Tu es le·la débutant·e qui... »)
- 3 forces que ce profil a déjà
- 3 freins typiques
- Une recommandation : LA bonne offre Marie pour ce profil
- Un CTA direct vers la page de vente de cette offre

Conversion sur l'offre adaptée : entre 5 et 12 % selon le segment. Soit 10 à 24 fois mieux qu'avant.

Pour Marie, le plan Annuel à 90 € suffit largement. Un seul business, un seul compte Systeme io. Investissement amorti dès la deuxième vente du mois.

CAS 2 - Karim (agence growth), plan Annuel PLUS à 290 €

Karim a une mini-agence : il monte des funnels Systeme io pour 8 clients coachs et formateurs. Avant Tiquiz, il livrait à chaque client un Typeform branché en Zapier sur leur compte Systeme io. Setup : 4-6 heures par client. Maintenance : casse-tête (Zapier qui saute, tags qui se perdent).

Ce qu'il fait avec Tiquiz PLUS : un espace par client (multi-profils). Pour chacun :
- Il branche la clé API du compte Systeme io du client (multi-clés API).
- Il part d'un template « diagnostic offre coaching » (templates pré-conçus) et l'adapte à l'offre du client en 30 minutes.
- Il livre un quiz brandé client en moins d'une heure.
- L'analyse IA des résultats lui donne, après les 50 premières réponses, une synthèse exploitable des insights - ce que Karim revend comme livrable stratégique à son client (compris dans son forfait ou facturé à part, selon).

Ce que ça change pour Karim :
- Setup quiz : passé de 5 h à 1 h par client (gain de 32 h par mois sur 8 clients).
- Zéro Zapier à maintenir.
- Un livrable analytics qu'il ne facturait pas avant et qui valorise sa prestation.
- Un seul outil pour 8 clients au lieu de 8 abonnements Typeform à 50 €.

Son plan Annuel PLUS à 290 € s'amortit sur le premier setup client du mois. Le reste, c'est marge.

Ce que tu peux faire avec ton activité à toi : si tu es solo avec une seule offre, le plan STANDARD (9 € ou 90 €) suffit largement. Si tu gères plusieurs clients ou plusieurs marques, le plan PLUS (29 € ou 290 €) te fait gagner du temps en plus de te faire vendre mieux. Dans les deux cas, tu peux tester avec le compte gratuit avant de choisir.

👉 Je découvre Tiquiz → {AFFILIATE_LINK}

Demain, dernier mail. Je te résume les 5 chemins possibles, et je te laisse décider.

{NAME}`,
  },
  {
    id: "08-soft-close",
    subject: "{first_name}, les 5 chemins possibles",
    preheader: "Récap. La décision te revient.",
    notes: "Email 8 - Soft close. Récap des 5 plans en 2 familles, pas d'urgence artificielle.",
    body: `Salut {first_name},

Dernier mail sur Tiquiz dans cette série.

Si tu as lu mes 7 mails précédents, tu sais ce que le produit fait, pour qui, et comment ça marche.

Tu as 5 chemins possibles à partir d'ici. Je les regroupe en 2 familles, pour que tu choisisses celle qui te correspond avant de choisir le détail.

FAMILLE STANDARD - pour ton business à toi

Chemin 1 - Tu testes gratuitement
Tu crées ton compte Tiquiz gratuit. Tu lances ton premier quiz dans la soirée. Tu collectes tes 10 premières réponses sur ton audience. Tu vois si la mécanique te convient.
Coût : 0 €. Sans CB.

Chemin 2 - Tu passes en illimité mensuel
Tu prends le plan à 9 € par mois sans engagement. Quiz et réponses illimités. Tu peux arrêter à tout moment.
Coût : 9 € par mois. Soit le prix d'un café par semaine.

Chemin 3 - Tu prends l'annuel
Tu prends le plan à 90 € par an. Tu économises 2 mois par rapport au mensuel. Tu te paies la tranquillité d'esprit pour l'année.
Coût : 90 € par an. Le prix d'un demi-mois de Typeform Plus.

FAMILLE PLUS - pour ton activité multi-clients

Chemin 4 - Mensuel PLUS
Tu prends le plan à 29 € par mois sans engagement. Tu débloques le multi-profils (un espace par client), le multi-clés API Systeme io, l'analyse IA des résultats, et les templates pré-conçus.
Coût : 29 € par mois. Soit environ 4 € par client si tu en gères 7-8.

Chemin 5 - Annuel PLUS
Tu prends le plan à 290 € par an. Toutes les fonctionnalités PLUS. Tu économises 2 mois par rapport au mensuel PLUS.
Coût : 290 € par an. Amorti dès le premier setup client du mois si tu factures tes prestations.

Quel chemin choisir ?
Si tu hésites entre les familles, prends le compte gratuit. Tu testes la mécanique de base. Tu verras vite si Tiquiz t'apporte de la valeur. Tu pourras passer en STANDARD ou en PLUS quand tu sauras vraiment.

Si tu sais déjà :
- Un seul business, une seule audience à toi → STANDARD (9 €/mois ou 90 €/an).
- Plusieurs clients, plusieurs marques, plusieurs comptes Systeme io à gérer → PLUS (29 €/mois ou 290 €/an).

👉 Je choisis mon chemin → {AFFILIATE_LINK}

Si tu décides de ne rien prendre, pas de souci. On se reparle bientôt sur un autre sujet. Je continue à te partager les outils que je trouve solides, sans te bombarder.

Merci d'avoir suivi ces 8 mails. Lire 8 mails d'une même personne sur un même sujet, ce n'est pas rien, et je le sais.

{NAME}`,
  },
];
