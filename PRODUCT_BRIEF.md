# Brief produit Tipote, pour génération de contenu de vente

Ce document est destiné à un agent IA qui doit produire des landing pages, séquences emails, posts sociaux, scripts vidéo, ads ou pages de vente pour Tipote. Il est rédigé pour être consommé directement par une IA générative : structuré, factuel, sans verbiage.

Pour la documentation technique destinée aux développeurs, voir `CAHIER_DES_CHARGES.md` et `docs/INVARIANTS.md`.

---

## 1. Identité

- Nom du produit : Tipote (avec ®)
- Domaine principal (app) : app.tipote.com
- Tagline courte : "Le pote de business des entrepreneurs"
- Pitch en une phrase : Tipote est l'assistant IA qui mémorise ton business, ta cible et tes objectifs pour bâtir ta stratégie, créer tes contenus et les publier directement sur tes réseaux sociaux, sans repartir de zéro à chaque fois.
- Pitch en trois phrases : Les outils IA génériques sont amnésiques, tu redonnes ton contexte à chaque conversation et le résultat reste lisse et interchangeable. Tipote mémorise une fois pour toutes ton profil business, ton audience, tes offres, ton storytelling, et s'en sert pour tout générer en cohérence avec TA stratégie. Et il publie pour toi sur LinkedIn, Facebook, Instagram, Threads, X, TikTok et Pinterest, sans copier-coller.

## 2. Public cible

### 2.1. Cible principale

- Solopreneur ou micro-entrepreneur francophone (FR, BE, CH, CA), 30 à 55 ans.
- Vend des prestations de service (coaching, conseil, accompagnement) ou des produits digitaux (formations, ebooks, programmes en ligne).
- Niveau technique non-tech ou tech-curieux. N'a pas envie de manipuler des prompts, des intégrations Zapier ou des workflows complexes.
- Niveau marketing : a fait quelques essais, suit des formateurs, mais n'a pas de stratégie cohérente.
- Statistiques produit issues d'études Tipote :
  - 51% n'ont pas encore fait leur première vente.
  - 46% passent trop de temps sur la création de contenu.
  - 52% trouvent l'IA générique trop passe-partout pour eux.

### 2.2. Cibles secondaires

- Coachs et consultants déjà en activité qui veulent industrialiser leur communication sans perdre leur voix.
- Affiliés Systeme.io (Tipote est disponible en white-label chez Systeme.io) qui veulent un outil intégré à leur écosystème.
- Petites équipes (2 à 5 personnes) en marketing ou content : plan Elite multi-projets.

### 2.3. Anti-cible (à ne pas adresser)

- Grandes entreprises avec une équipe marketing dédiée.
- Agences qui revendraient à leurs clients (outil pas pensé pour ça).
- Développeurs et makers tech qui veulent un sandbox IA (Tipote est volontairement opinionated).

## 3. Promesse principale

"Tu n'as plus besoin de réfléchir à QUOI publier, NI à QUAND, NI à COMMENT."

Variations selon le canal :
- Email ou landing : "Une stratégie qui ne change pas de cap chaque semaine. Du contenu qui te ressemble. Une publication qui se fait toute seule."
- Ad court : "L'IA qui se souvient de ton business."
- Social : "Tu mets ton business dedans une fois, Tipote bosse pour toi tous les jours."

## 4. Pain points résolus (à mentionner dans la copy)

| Pain | Ressenti | Réponse Tipote |
|---|---|---|
| "J'ai pas de stratégie, je publie au feeling" | Anxiété, éparpillement | Plan stratégique en 3 phases (Fondations, Croissance, Scaling) généré automatiquement après l'onboarding, mis à jour en live quand le profil change |
| "Je passe 2h à écrire un post LinkedIn" | Frustration, procrastination | Génération de posts, emails, articles et scripts en quelques secondes, à partir d'un brief court ou d'une offre existante |
| "ChatGPT sort toujours le même style passe-partout" | Démotivation | La mémoire Tipote (profil, persona, storytelling, ton de voix) est injectée dans chaque prompt, donc des résultats personnalisés |
| "Je sais pas QUAND publier ni à quel rythme" | Inertie | Calendrier éditorial avec programmation sur les créneaux choisis |
| "Je connecte Zapier ou Buffer et ça plante" | Fatigue technique | Publication directe via OAuth officiel sur 7 réseaux, sans intermédiaire |
| "J'ai des leads quelque part dans Systeme.io mais je sais pas d'où ils viennent" | Opacité | Tableau leads centralisé, taggé par source (quiz, page, popquiz), avec sync auto vers Systeme.io |
| "Ma stratégie devient obsolète après 2 mois" | Pas actualisé | Flag "stratégie à jour ?" plus bouton "Recalculer" qui régénère en tenant compte des dernières infos |
| "Je dois ressaisir mes ventes pour suivre mon CA" | Saisie chronophage | Sync automatique des ventes (Systeme.io et PSP). Tipote calcule le CA, les ventes par offre et la progression vers ton objectif à partir de la vraie donnée |
| "Je sais pas où j'en suis côté compta : seuils TVA, échéances URSSAF" | Anxiété fiscale | Onglet Compta complet : configuration du statut, connexions Stripe, PayPal, Mollie, jauge franchise TVA, calendrier fiscal personnalisé. Disclaimer permanent : Tipote ne remplace pas un comptable |
| "Je touche des commissions d'affiliation mais je les distingue mal de mes ventes" | Mélange CA réel vs commissions | Auto-détection des commissions plus saisie manuelle. Le dashboard Compta sépare ventes directes et commissions |
| "Mon coach IA me sort des conseils génériques" | Confiance érodée | Le coach reçoit ton CA réel du mois, ta progression vers l'objectif, tes abonnés perdus. Conseils calibrés sur les chiffres |
| "Mon compte LinkedIn s'est déconnecté, j'ai perdu des posts programmés" | Perte de visibilité | Email d'alerte immédiat dès la détection d'un token révoqué, et quand un post programmé finit en échec, avec lien direct pour le reprogrammer |

## 5. Différenciateurs (vs concurrents)

### vs ChatGPT, Claude, Gemini (IA généralistes)
- Mémoire persistante structurée vs amnésie et redéfinition du contexte à chaque chat.
- Output cohérent dans le temps : tes posts d'aujourd'hui restent dans la lignée de ton storytelling.
- Publication directe : Tipote publie sur tes réseaux, ChatGPT ne le fait pas.

### vs Buffer, Hootsuite, Later (planners)
- Tipote génère le contenu, pas seulement le programme.
- Tipote a une stratégie derrière (publier sur cet axe parce que tu es en phase Fondations).
- Tipote intègre leads, clients et Systeme.io dans le même outil.

### vs Notion AI, Jasper, Copy.ai (générateurs)
- Tipote est opinionated : il sait ce que tu dois publier.
- Tipote publie sur tes réseaux.
- Tipote gère le post-clic : capture leads, automatisations Systeme.io, suivi des clients.

### vs Systeme.io (plateforme tout-en-un)
- Tipote n'est pas un concurrent, c'est un complément : il pousse les leads vers Systeme.io via webhooks officiels.
- Tipote est disponible en white-label dans Systeme.io.
- Tipote apporte la couche stratégie, génération et publication réseaux que Systeme.io n'a pas.

## 6. Workflow utilisateur (storytelling produit)

### Onboarding
1. Connexion (Google ou email).
2. Onboarding type Typeform : niche, mission, audience cible, offres existantes, objectif de revenu mensuel, blocage principal, temps disponible.
3. Tipote génère automatiquement : un persona client, un storytelling de marque, un plan d'action en 3 phases (chaque phase dure le temps nécessaire à ses jalons), une pyramide d'offres si l'user n'en a pas, et des tâches concrètes.

### Première création
1. Direction `/create`.
2. Choix : post réseau social, email, article, script vidéo, offre, page, quiz, sondage, popquiz, stratégie de contenu.
3. Tipote pose quelques questions ciblées.
4. Génération en quelques secondes (streaming).
5. Édition inline, ajustement avec le coach IA.
6. Publication directe (LinkedIn, FB, IG, Threads, X, TikTok, Pinterest), un clic ou programmé.

### Capture de leads
1. Création d'un quiz lead-magnet, d'un sondage ou d'un popquiz vidéo.
2. Partage : URL courte, embed iframe, partage social, ou domaine personnalisé sur les plans payants.
3. À chaque lead capturé : tag automatique dans Systeme.io, déclenchement de campagnes.
4. Sur le plan Free, les premiers leads sont visibles, les suivants restent capturés mais floutés jusqu'à l'upgrade.

### Automatisation
1. Auto-commentaires : un commentaire IA personnalisé sur les posts de prospects.
2. Comment-to-DM ou comment-to-email : commente un mot-clé pour recevoir un contenu.
3. Tipote détecte les commentaires, envoie un DM ou email, tagge le contact dans Systeme.io.

### Pilotage
1. Analytics : quels posts ont performé, conversion par offre, CA réel synchronisé.
2. Coach IA qui connaît tout ton business et tes chiffres.
3. Quand le profil change, bandeau puis bouton "Recalculer ma stratégie".

## 7. Catalogue de fonctionnalités (organisé par bénéfice)

### 7.1. Stratégie
- Plan d'action auto-généré en 3 phases (Fondations, Croissance, Scaling).
- Persona client détaillé (douleurs, désirs, canaux).
- Storytelling de marque (axes narratifs, message clé, mission).
- Pyramide d'offres générée par IA ou import des offres existantes.
- Tâches actionnables synchronisées avec la progression.
- Recalcul live quand les infos profil ou les stats évoluent.

### 7.2. Génération de contenus
- Posts réseaux sociaux adaptés au format de chaque plateforme.
- Emails marketing (séquences, newsletters, promos).
- Articles de blog (longs, structurés).
- Scripts vidéo (TikTok, Reels, YouTube short).
- Offres (page produit, promesse, deliverables, tarification).
- Pages (capture, vente, vitrine, link-in-bio) via constructeur visuel.
- Quiz lead-magnet (par profil), quiz scorés (diagnostic avec score sur 100, jauge, barres par axe, tranches de résultat) et sondages. L'IA génère les deux types de quiz, tranches calculées automatiquement.
- Popquiz vidéo (vidéo avec quiz incrustés à des timestamps).
- Stratégie éditoriale (calendrier).

### 7.3. Publication et automatisations
- Publication directe sur 7 réseaux via OAuth officiel.
- Programmation sur le calendrier éditorial.
- Auto-commentaires (commentaire IA personnalisé sur les posts de prospects).
- Comment-to-DM et comment-to-email.

### 7.4. Captation et relation client
- Quiz : simple à créer, capture email plus tags, étape de partage pour la viralité, résultats personnalisés avec CTA. Thèmes prêts à l'emploi, fonds riches (dégradé ou image), écran d'accueil en cover, transitions directionnelles, raccourcis clavier, swipe mobile, formes de boutons, carte résultat partageable avec confettis, fermeture du quiz avec redirection.
- Quiz scoré : score global sur 100 (jauge en pourcentage ou en mots : bas, moyen, élevé), jusqu'à 6 axes thématiques avec barre par axe, variables de score dans les textes et le lien du bouton, tags Systeme.io par tranche pour segmenter les emails.
- Sondages (NPS, feedback) avec analyse des réponses.
- Popquiz vidéo (YouTube, Vimeo ou upload), embeddable en iframe.
- Pages de capture drag-and-drop avec branding cohérent.
- Tableau leads centralisé avec tags, source, statut, et KPI cards cliquables qui filtrent la liste.
- Module clients : suivi des prospects qui ont acheté, notes, statuts, accompagnements avec suivi financier.

### 7.5. Intégration Systeme.io
- Webhooks temps réel (ventes, annulations, contacts ajoutés).
- Auto-tagging des leads à la conversion.
- Auto-inscription aux formations et communautés Systeme.io.
- Enrichissement des contacts.
- Whitelabel disponible dans la marketplace Systeme.io.
- Clé API chiffrée at rest (AES-256-GCM, DEK par utilisateur).

### 7.6. Pilotage et insight
- Analytics par contenu, plateforme, période, offre, alimentés par les vraies ventes synchronisées.
- Diagnostic IA avec recommandations.
- Coach IA contextuel (Pro et Elite) qui connaît ton CA réel, ta progression, tes abonnés perdus.
- Pépites : insights traduits automatiquement, multi-format.
- Notifications temps réel, dont alertes business (objectif atteint, mi-parcours, abonnés à recontacter).

### 7.7. Compta et suivi business
- Onglet Compta avec configuration du statut selon le pays.
- Pays couverts : France, Suisse, Belgique, Portugal, Espagne, Canada, États-Unis.
- Connexions Stripe, PayPal, Mollie, avec sync de l'historique puis sync delta quotidien.
- Saisies manuelles pour les paiements hors PSP.
- Catégorisation automatique ventes directes vs commissions d'affiliation.
- Tableau de bord business : CA mensuel et annuel, comparaison N vs N-1, revenus récurrents, abonnés actifs, nouveaux et perdus, taux de remboursement, top produits, jauge franchise TVA.
- Jauge "objectif mensuel" affichée sur Aujourd'hui, sur Stratégie et dans Compta (une seule source de vérité).
- Calendrier fiscal personnalisé avec liens vers les sites officiels.
- Export FEC pour les sociétés françaises à l'IS.
- Disclaimer permanent : Tipote aide à anticiper, ne remplace ni un comptable ni les déclarations.

### 7.8. Domaines personnalisés (plans payants)
- Connecte ton propre domaine (par exemple `quiz.mon-business.fr`).
- Setup en quelques minutes : un enregistrement CNAME, vérification DNS automatique, certificat SSL émis sans action supplémentaire.
- URLs propres sur ton domaine (`ma-marque.com/mon-quiz`), sans préfixe technique.
- Une seule URL pour tous tes contenus : quiz, sondages, popquiz, pages.
- Multi-marque natif : sur le plan Elite, chaque projet a ses propres domaines.
- Les anciennes URLs continuent de fonctionner.

### 7.9. Multi-projets (plan Elite)
- Une instance Tipote par projet, marque ou sub-business.
- Chaque projet a sa propre clé Systeme.io, son onboarding, ses contenus, ses domaines et son catalogue public.
- Identité visuelle par projet (couleur d'accent, emoji).
- Switch d'un clic depuis le sélecteur de projet.
- Reset par session : à chaque nouvelle session navigateur, Tipote ramène sur le projet par défaut.
- Suppression de projet en danger zone (confirmation par recopie du nom).
- Un nouveau projet est un profil business neuf et vide, à re-onboarder.

### 7.10. Tipote Boost
- Espace d'engagement (pod) : un utilisateur qui connecte LinkedIn peut rejoindre un pod, avec suggestions de commentaires par IA.
- Extension Chrome Tipote Boost qui amplifie la portée des publications.
- Réservé aux plans Pro, Elite et Beta.

### 7.11. Partager un quiz entier à quelqu'un
- **Un lien, un clic, et le quiz est installé chez l'autre**, dans son compte : textes, images, questions, points, profils de résultat, couleurs et mise en page. L'original ne bouge pas, la personne reçoit une copie.
- Trois usages : montrer un quiz déjà construit à un client potentiel (il voit la page sans créer de compte), livrer un quiz réalisé pour un client, distribuer un modèle à un groupe.
- **Ce qui reste chez l'expéditeur, et c'est un argument** : ses tags Systeme.io, ses pixels publicitaires, l'adresse de ses boutons, son lien de confidentialité, son pied de page. Sinon les leads du destinataire tomberaient dans les automatisations de l'expéditeur. L'écran d'installation liste ce qu'il reste à remplir.
- **Le quiz arrive en brouillon**, toujours. Le lien ne sert qu'une fois par défaut, affiche son nombre d'installations et se désactive d'un clic.
- La page vue par le destinataire parle la langue DU QUIZ partagé. Le contenu, lui, n'est jamais traduit.

### 7.12. Sécurité et alertes
- Email immédiat quand un compte social se déconnecte (token révoqué, expiré).
- Email quand un post programmé bascule en échec, avec lien direct vers l'éditeur.
- Détection automatique de token mort pendant la publication.
- Dédup pour ne pas spammer en cas d'échecs en cascade.

### 7.13. Dashboard d'affiliation (affiliate.tipote.com)
- Espace dédié aux affiliés qui promeuvent Tiquiz et Tipote, opérationnel en quelques minutes.
- Vue d'ensemble : lien d'affiliation, gains, progression.
- Promouvoir : liens trackés éditables (le code de suivi est ajouté automatiquement).
- **Mes liens** : un lien par canal, chacun avec ses clics, ses inscrits et ses commissions. En un coup d'oeil, l'affilié sait lequel de ses canaux travaille.
- Contenus prêts à copier-coller : emails, posts réseaux, articles, visuels, tous personnalisables (lien et prénom injectés).
- Studio visuels IA : depuis chaque post, l'affilié génère un visuel pro qui s'accroche au post.
- Essai gratuit : accès Tipote Elite offert pour créer du contenu de promo authentique.
- **Il choisit comment il est payé** : PayPal ou virement bancaire. L'IBAN est chiffré et ne ressort jamais en clair, pas même à son propriétaire (un écran se photographie) : il en voit un masque, et le ressaisit pour le changer.
- **On écrit sa facture à sa place**, chaque mois, avec son accord (mandat d'autofacturation). Il la télécharge pour sa comptabilité et n'a rien à nous envoyer.
- **Le cookie dure 1 an**, et une inscription gratuite via son lien rattache la personne à l'affilié **à vie**. Celui qui a amené le contact le garde, même si le prospect croise un autre lien plus tard.
- **La commission est versable 30 jours après le paiement du client.** Ne jamais annoncer un autre délai : c'est celui que les affiliés connaissent.
- **La commission est RÉCURRENTE** : 40 % sur Tiquiz versés chaque mois tant que la personne recommandée reste abonnée, pas une prime une seule fois. Elle s'arrête si la personne part ou se fait rembourser ; les mois déjà versés restent acquis. C'est l'argument principal du programme, et il ne doit jamais être présenté comme un paiement unique.
- **Un affilié qui est aussi client est récompensé, et c'est LUI qui choisit comment** : soit son abonnement baisse de 10 % par tranche de 10 filleuls actifs (jusqu'à la gratuité), soit son taux de commission monte de 5 points par tranche, de 40 % à 70 %. Les deux sont exclusifs, et il bascule de l'un à l'autre quand il veut.
- **Un filleul actif est quelqu'un qui PAIE**, pas un inscrit gratuit ni un essai. Le compte se recalcule chaque mois.
- **Si sa récompense baisse, il est prévenu par email avant que le prix bouge**, avec la raison (combien de filleuls actifs) et pas seulement le chiffre. Une remise qui descend est un prélèvement qui monte : le découvrir sur son relevé, c'est perdre un affilié.
- **Chaque affilié peut avoir son code de réduction**, et l'avantage est au choix : un pourcentage sur la première échéance, un pourcentage à vie, un pourcentage sur une période donnée (une opération de décembre par exemple), un pourcentage selon le plan, ou des jours offerts.
- **Ce qu'on promet, on le tient dans les deux sens** : une commission tombe si la vente est remboursée ou impayée, comme le disent les conditions du programme. Un affilié qui découvrirait l'inverse cesserait de nous croire sur le reste.
- **Les liens mènent à NOS pages** (`tiquiz.fr`, `tiquiz.fr/commande/<produit>`, `atelierduquiz.fr`) depuis le 26 août, et plus aux tunnels Systeme.io. Ce n'est pas cosmétique : leur page ne transmet pas ce qu'on ajoute à l'URL, donc un lien qui passait par eux ne pouvait atteindre ni notre commissionnement ni le mois offert. Seule l'inscription gratuite reste chez eux, parce que son formulaire crée le contact et pose le tag qui déclenche les séquences email.
- **L'Atelier du Quiz est dans le même programme**, au même endroit, avec le même lien et le même versement. Un élève de l'Atelier n'a plus rien à aller chercher dans Systeme.io : son lien est déjà là quand il ouvre l'onglet.
- Ne jamais annoncer un délai de versement inférieur à 21 jours après la vente : c'est le délai de rétractation plus une marge, et une commission virée ne se reprend pas.
- **Ne jamais présenter un identifiant Systeme.io comme nécessaire pour être affilié.** Il est facultatif depuis le 25 août, et il ne sert qu'à rattacher les ventes arrivées par les anciens tunnels. Le présenter comme un prérequis fait renoncer quelqu'un qui n'a pas de compte chez eux.

## 8. Plans et tarification

### Free, 0€
- Tous les modules accessibles.
- 25 crédits IA en one-shot (pas de renouvellement).
- 1 connexion sociale.
- 1 quiz, 1 sondage, 1 page, 1 popquiz par projet.
- Quota mensuel de leads visibles (les suivants restent capturés mais floutés jusqu'à l'upgrade).
- Idéal pour tester.

### Basic, 19€/mois ou 190€/an
- Tout le Free, plus : 40 crédits IA/mois, 2 connexions sociales, auto-commentaires, analyse statistique IA, enrichissement persona IA, analyse concurrentielle IA, achat de packs de crédits.
- Idéal pour un solo qui veut publier régulièrement et automatiser.

### Pro, 49€/mois ou 490€/an
- Tout le Basic, plus : 150 crédits IA/mois, 4 connexions sociales, coach IA illimité.
- Idéal pour un coach ou consultant en croissance.

### Elite, 99€/mois ou 990€/an
- Tout le Pro, plus : 500 crédits IA/mois, connexions sociales illimitées, multi-projets.
- Idéal pour un solo qui a 2 ou 3 activités, ou une petite équipe.

### Packs de crédits supplémentaires (sans expiration)
- Starter : 25 crédits, 3€.
- Standard : 100 crédits, 10€.
- Pro : 250 crédits, 22€.

### Économie de crédits (transparence)
- 1 crédit vaut environ 0,01€ de coûts IA réels.
- Génération d'un post : 0,5 à 2 crédits.
- Génération d'un article : 3 à 5 crédits.
- Auto-commentaire : 0,25 crédit.
- Modification de page via chat IA : 0,5 crédit.

## 9. Voix de marque et ton

### Vocabulaire
- Mots à utiliser : pote, mémoire, ton, stratégie, vraiment, concrètement, en live, en un clic.
- Mots à bannir : disruptif, révolutionnaire, leader, solution, expertise (trop corporate), best-in-class, scaling, growth-hacking.
- Tutoiement obligatoire sur la copy grand public. Le tutoiement est la marque.
- Métaphores : Tipote comme un pote qui te connaît, un copilote, un co-fondateur silencieux. Pas comme un outil, pas comme un assistant.

### Ton
- Direct, sans flagornerie.
- Concret : toujours un exemple, un chiffre, un cas d'usage.
- Empathique mais lucide.
- Drôle quand c'est juste, jamais forcé.
- Pédagogue : on explique le pourquoi.

### Exemples de phrases dans la voix
- "Ton plan est prêt en quelques minutes. Tes posts du mois suivent. Et oui, c'est vraiment toi qu'on lit."
- "Tu n'as pas le temps de lire un livre de marketing. Tipote l'a lu pour toi et applique ce qui marche pour TON business."
- À éviter : "Notre solution révolutionnaire utilise les dernières innovations en IA pour transformer votre business."
- À éviter : "Découvrez la puissance de l'intelligence artificielle pour votre marketing."

## 10. Preuves et garanties

### Sécurité
- Auth Supabase PKCE avec cookies httpOnly.
- Chiffrement AES-256-GCM par utilisateur pour les leads (email, téléphone, nom).
- Clé API Systeme.io chiffrée at rest.
- RLS Postgres sur toutes les tables : isolation par user au niveau DB.

### Fiabilité produit
- 7 langues d'interface (FR, EN, ES, IT, AR avec RTL, PT, PT-BR).
- Le contenu des quiz peut être généré dans un large catalogue de langues, avec plusieurs variantes de rendu public.
- Tests de non-régression documentés et tests E2E sur les pages publiques.
- Détecteur de migrations manquantes en prod.

### Service client
- Support FR par chatbot IA et tickets.
- Aide centralisée à app.tipote.com/support.

## 11. Objections fréquentes et réponses

| Objection | Réponse type |
|---|---|
| "Encore un outil IA, j'en ai marre" | Tipote n'est pas un IA-de-plus. C'est un outil avec une mémoire. Tu donnes ton contexte une fois, pas cinquante. |
| "C'est cher 19€/mois, je fais pareil avec ChatGPT" | ChatGPT te redemande ton contexte à chaque session. Tipote l'a en mémoire. Et il publie pour toi sur 7 réseaux. |
| "Je vais perdre ma voix, ça va parler comme un robot" | La voix part de TON storytelling renseigné à l'onboarding. Tu modifies chaque output inline. |
| "Je suis pas tech, je vais pas y arriver" | Onboarding guidé. Pas de prompts à écrire, pas d'API à configurer. Le SAV est en français. |
| "Mes données vont entraîner l'IA" | Non. Les données ne sont jamais envoyées en clair, uniquement des prompts contextualisés sans PII. Les leads sont chiffrés. |
| "Et si vous fermez ?" | Export complet de tes données à tout moment (CSV). Tu emportes tes leads, tes contenus, ta stratégie. Aucun lock-in. |
| "Pourquoi pas Make ou Zapier ?" | Make et Zapier connectent des trucs. Tipote crée le contenu en plus. Tout est dans Tipote. |

## 12. CTAs

### Primaires (haut d'entonnoir)
- "Essayer Tipote gratuitement"
- "Tester l'onboarding" (gratuit, sans CB)
- "Voir un exemple de stratégie générée"

### Secondaires (mi-entonnoir)
- "Découvrir comment Tipote publie sur LinkedIn pour toi"
- "Regarder un quiz lead-magnet en action"

### Bas d'entonnoir
- "Démarrer mon plan d'action"
- "Connecter mes réseaux sociaux"
- "Activer mes automatisations"

### Upsell
- "Débloquer le coach IA" (vers Pro)
- "Activer le multi-projet" (vers Elite)
- "Acheter 100 crédits"

## 13. Données chiffrées à mentionner

- 51% des entrepreneurs n'ont pas fait leur première vente.
- 46% passent trop de temps sur la création de contenu.
- 52% trouvent l'IA trop générique.
- 7 réseaux sociaux supportés en publication directe.
- 7 langues d'interface.
- Plan d'action en 3 phases.
- Module Compta couvrant 7 pays.
- Plan Free : 1 quiz, 1 sondage, 1 page, 1 popquiz, 25 crédits one-shot.

## 14. Slogans et accroches (réutilisables)

- "Le pote de business des entrepreneurs"
- "L'IA qui se souvient de ton business"
- "Une stratégie qui ne change pas de cap chaque semaine"
- "Tu n'as plus besoin de réfléchir à QUOI publier"
- "Tu mets ton business dedans une fois, Tipote bosse pour toi tous les jours"
- "De l'onboarding à la vente, sans changer d'outil"

## 15. Ce qu'il ne faut pas faire dans la com

- Comparer frontalement à ChatGPT par nom (positionnement complémentaire plutôt qu'agressif).
- Promettre des revenus garantis.
- Afficher des témoignages non vérifiables.
- Vendre Tipote comme un tout-en-un magique : Tipote a des limites (pas de pub Meta ou Google native, pas de SMS marketing, pas d'invoicing).
- Vouvoyer le prospect dans la com B2C.
- Mettre en avant les crédits IA comme argument numéro un : les crédits sont un mécanisme de pricing, pas une promesse.
- Utiliser des captures d'écran de l'app qui ne reflètent pas la version actuelle.
- Utiliser des em-dash ou en-dash dans le contenu produit : ils trahissent un texte généré par IA.
