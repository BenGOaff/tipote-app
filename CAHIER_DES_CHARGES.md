# CAHIER DES CHARGES Tipote

Application web SaaS multilingue pour l'analyse business, la planification stratégique, la génération de contenus par IA, la publication automatisée sur les réseaux sociaux, la captation de leads (quiz, sondages, popquiz, pages) et le suivi comptable des indépendants.

Ce document décrit l'état courant du produit. Il s'adresse aux développeurs. Pour le brief marketing destiné à la génération de contenu de vente, voir `PRODUCT_BRIEF.md`. Pour les invariants et zones fragiles, voir `docs/INVARIANTS.md` et `CLAUDE_PITFALLS.md`.

---

## 1. Présentation du produit

### 1.1. Vision

Tipote est le "pote de business" des entrepreneurs. Contrairement aux outils IA génériques qui repartent de zéro à chaque conversation, Tipote mémorise le profil business de l'utilisateur, son audience cible et ses objectifs pour générer une stratégie cohérente et des contenus réellement personnalisés.

La mémoire Tipote est structurée (profil, diagnostic, persona, storytelling, plan, offres, tâches, chiffres réels) et sert de source de vérité pour tous les prompts de génération.

### 1.2. Problèmes adressés

- Les entrepreneurs sans stratégie publient au feeling : Tipote fournit un plan d'action en 3 phases.
- La création de contenu prend trop de temps : génération IA plus publication directe.
- L'IA générique produit un rendu passe-partout : personnalisation via le profil mémorisé.

### 1.3. Fonctionnalités clés

- Onboarding intelligent qui capture le profil business complet.
- Plan stratégique personnalisé (3 phases : Fondations, Croissance, Scaling) avec pyramide d'offres.
- Génération de contenus : posts, emails, articles, scripts vidéo, offres, pages, quiz, sondages, popquiz, stratégie éditoriale.
- Publication directe sur 7 réseaux sociaux (LinkedIn, Facebook, Instagram, Threads, X, TikTok, Pinterest) via OAuth officiel.
- Automatisations sociales : auto-commentaires, comment-to-DM, comment-to-email.
- Calendrier éditorial avec programmation.
- Constructeur de pages (capture, vente, vitrine, link-in-bio).
- Module Quiz complet (capture de leads, résultats personnalisés, thèmes, tags Systeme.io) avec deux variantes : quiz à profils, quiz à score, et sondages (NPS, feedback).
- Module Popquiz : vidéo avec quiz incrustés à des timestamps précis, embeddable en iframe.
- Gestion des leads avec chiffrement AES-256 par utilisateur.
- Gestion des clients (suivi, notes, statuts, accompagnements avec suivi financier).
- Module Compta multi-pays (France, Suisse, Belgique, Portugal, Espagne, Canada, États-Unis).
- Analytics avec diagnostic IA et connexion au CA réel.
- Coach IA contextuel (plans Pro/Elite).
- Pépites multilingues (insights traduits automatiquement).
- Widgets embarquables (preuve sociale, boutons de partage).
- Domaines personnalisés (plans payants).
- Multi-projets (plan Elite).
- Intégration Systeme.io (webhooks temps réel, sync leads, tagging, sync ventes).
- Dashboard d'affiliation dédié sur sous-domaine.
- Interface disponible en 7 langues (FR, EN, ES, IT, AR avec RTL, PT, PT-BR).

---

## 2. Principes fondateurs

### 2.1. Publication directe

Tipote publie directement sur les réseaux sociaux via OAuth 2.0. L'utilisateur connecte ses comptes dans Paramètres > Connexions, et les posts sont publiés en un clic ou programmés.

Plateformes supportées :

- LinkedIn (posts, images)
- Facebook Pages (posts, images, carrousels, vidéos)
- Instagram (photos, vidéos, Reels)
- Threads (posts)
- X / Twitter (tweets, images)
- TikTok (photos, vidéos)
- Pinterest (pins avec images et liens)

### 2.2. Deux niveaux d'IA

Niveau 1, cerveau stratégique (OpenAI GPT), clé propriétaire, appels backend uniquement :

- Onboarding et diagnostic business
- Génération du plan stratégique
- Propositions d'offres
- Création des tâches
- Coach IA
- Analyse analytics
- Traduction des pépites et des notifications

Niveau 2, génération de contenu (Claude, Anthropic), clé propriétaire :

- Posts réseaux sociaux
- Emails (newsletters, séquences)
- Articles de blog
- Scripts vidéo
- Copywriting de pages
- Quiz et sondages
- Stratégie éditoriale
- Auto-commentaires

Tous les appels Claude passent par un helper unique (`lib/claudeRequest.ts`) qui construit le corps des requêtes et gère la compatibilité des paramètres selon le modèle. La résolution du modèle est centralisée dans `lib/anthropicModel.ts`. L'utilisateur n'a aucune clé IA à configurer.

### 2.3. Monétisation par crédits

- Crédits inclus mensuellement selon le plan.
- Packs de crédits supplémentaires achetables via Systeme.io (sans expiration).
- Chaque génération de contenu consomme des crédits.
- Webhook Systeme.io pour délivrer les crédits achetés et gérer les abonnements.

---

## 3. Architecture UX

### 3.1. Navigation principale (sidebar)

Section principale :

| Menu | URL | Description |
| :---- | :---- | :---- |
| Aujourd'hui | /app | Dashboard : objectif, prochaine tâche, contenus du jour, progression |
| Ma Stratégie | /strategy | Plan d'action en 3 phases et tâches |
| Créer | /create | Hub de création de contenu |
| Mes Contenus | /contents | Liste et calendrier éditorial |
| Templates | /templates | Templates Systeme.io |
| Automatisations | /automations | Automatisations sociales |
| Mes Leads | /leads | Leads capturés |
| Mes Clients | /clients | Suivi des clients |
| Widgets | /widgets | Widgets embarquables |

Section secondaire : Analytics (/analytics), Pépites (/pepites).

Footer sidebar : Support (/support).

Les Paramètres sont accessibles via la photo de profil (avatar) en haut à droite du header, pas dans la sidebar. Le sélecteur de projet (plan Elite) apparaît dans la sidebar lorsque l'utilisateur a plusieurs projets.

### 3.2. Workflow utilisateur

Onboarding (une fois) puis, à chaque connexion : Aujourd'hui, Créer, Publier, Mes Contenus, Analytics.

---

## 4. Pages de l'application

### 4.1. Authentification

- Login email plus mot de passe (Supabase Auth, PKCE, cookies httpOnly).
- Reset password, set password.
- Détection automatique de la langue.
- Callbacks OAuth pour les réseaux sociaux.

### 4.2. Onboarding intelligent

Déclenché à la première connexion, obligatoire avant les fonctionnalités stratégiques. Format questionnaire progressif de type Typeform.

Données collectées : profil business complet, offres existantes ou absence d'offres ou profil affilié, situation réelle, freins, différenciation, preuves, positionnement, persona cible, objectifs, style et tonalité, non-négociables.

Stockage (Supabase, sur `business_profiles`) : `diagnostic_answers` (JSONB transcript), `diagnostic_profile` (JSONB normalisé), `diagnostic_summary` (résumé coach), flags d'onboarding.

Traitement backend (IA niveau 1) : génération du persona, diagnostic business, 3 propositions d'offres si l'utilisateur n'en a pas, génération du plan stratégique en 3 phases, création automatique des tâches.

La vérification d'onboarding est strictement scopée au couple (utilisateur, projet). Un trigger Postgres bascule le flag à complété dès qu'une ligne a une niche et au moins une offre.

### 4.3. Page Aujourd'hui (/app)

Dashboard de coaching automatique basé sur les données du profil.

- Bloc objectif : card avec l'objectif de la phase en cours, badge phase, CTA contextuel.
- Progression vers l'objectif mensuel : jauge alimentée par le CA réel (voir module Compta), message contextuel, couleurs adaptatives.
- Contenus programmés aujourd'hui : liste des contenus planifiés (canal, titre, horaire).
- Coaching de la semaine : résumé des actions accomplies, prochaine étape.
- Progression : analyse des stats analytics.
- Lien vers la stratégie complète.

### 4.4. Page Ma Stratégie (/strategy)

Plan d'action en 3 phases.

- Header avec badges : objectif revenu (éditable), phase actuelle, progression.
- Cards stats : tâches complétées, phase actuelle, objectif revenu.
- Phase 1 Fondations, Phase 2 Croissance, Phase 3 Scaling : chacune avec barre de progression et tâches cochables réordonnables par drag-and-drop.
- Archive des tâches complétées.
- Mini-jauge de progression vers l'objectif (même source que Aujourd'hui et Compta).

Le plan porte un flag `is_stale` posé quand un champ profil critique change (objectif revenu, niche, offres). La page affiche alors un bandeau "Tes infos ont changé" avec un bouton de recalcul qui force la régénération.

Les offres sont gérées dans Paramètres > Profil, le persona dans Paramètres > Positionnement. Lors de l'onboarding, si l'utilisateur n'a pas d'offres, Tipote propose des pyramides d'offres ; l'utilisateur en choisit une qui devient ses offres.

### 4.5. Page Créer (/create)

Hub unique de création de contenu IA.

| Type | Description | Formulaire |
| :---- | :---- | :---- |
| Post | Réseaux sociaux | PostForm |
| Email | Newsletters, séquences | EmailForm |
| Article | Blog, guides | ArticleForm |
| Vidéo | Scripts YouTube, Reels, TikTok | VideoForm |
| Offre | Pages de vente, descriptions produit | OfferForm |
| Pages | Capture, vente, vitrine, link-in-bio | PagesForm |
| Quiz | Quiz lead-magnet, sondages | QuizForm |
| Stratégie | Stratégie éditoriale | ContentStrategyForm |

Workflow après sélection : formulaire contextuel pré-rempli depuis l'onboarding et le persona, bouton Générer (IA niveau 2, streaming SSE pour les longs formats), prévisualisation, actions (régénérer, modifier, sauvegarder, planifier, publier directement).

Posts, fonctionnalités avancées : sélection de la plateforme, upload d'images (`content-images`) et de vidéos (`content-videos`), configuration d'auto-commentaire à la publication, sélection du board Pinterest, mode édition d'un post programmé via `?edit=<id>`.

Contexte IA : tous les prompts réinjectent le `persona_json` et les éléments du diagnostic (objections, vocabulaire, différenciation). Un cache d'arguments de vente par offre (`sales_arguments`, JSONB) est généré une fois par offre puis réutilisé dans les prompts pour réduire la consommation de tokens.

### 4.6. Page Mes Contenus (/contents)

Vue centralisée de tous les contenus générés.

- Vue Liste : onglets filtres (Tous, Posts, Emails, Articles, Vidéos, Quiz, Pages), recherche, filtres avancés (statut, canal).
- Vue Calendrier : vue mois avec codes couleur par type, clic pour éditer.
- Éléments : badge statut (Publié, Planifié, Brouillon), type et canal, titre et aperçu, date, menu actions.
- Les posts programmés sont éditables (ouverture de l'éditeur complet avec images, vidéos, auto-commentaires pré-remplis).
- Sous-sections intégrées : Mes Quiz, Mes Pages.

La programmation utilise un `ScheduleModal` avec un `DateTimePicker` (calendrier, créneaux prédéfinis, heure custom), validation des dates passées côté client et serveur.

### 4.7. Page Templates (/templates)

Bibliothèque de templates Systeme.io : prévisualisation et téléchargement direct.

### 4.8. Page Automatisations (/automations)

Automatisations sociales.

- Comment-to-DM : réponse automatique en DM aux commentaires contenant certains mots-clés.
- Comment-to-Email : capture de l'email des commentateurs via DM automatique.

Les auto-commentaires (commentaire automatique sur les posts publiés) sont configurés dans Paramètres > Connexions et activés à la création d'un post. Le contenu est généré par Claude.

Triggers : mots-clés configurables, variantes de réponses, logs d'exécution avec statut. Intégration n8n : webhooks pour publication asynchrone, callback pour posts programmés, health check.

### 4.9. Page Mes Leads (/leads)

Gestion centralisée des leads capturés (toutes sources).

- Tableau : email, nom, source, date de capture, statut d'export Systeme.io.
- Recherche par email ou nom, filtre par source, pagination, sélection multiple, export CSV.
- 4 KPI cards cliquables (Total, Exportés Systeme.io, Non exportés, Ce mois) : chaque card est un bouton qui togglent un filtre sur la liste (second clic retire le filtre), état actif matérialisé par un anneau coloré, filtre persisté en query string.
- Panel détail latéral : avatar, nom, email, téléphone, date, source, résultat quiz et réponses, statut d'export, actions.

Sécurité : chiffrement AES-256-GCM par champ (email, prénom, nom, téléphone, réponses quiz), clé de chiffrement par utilisateur (DEK), index aveugle HMAC pour la recherche sur email chiffré. Sur le plan gratuit, les leads au-delà du quota mensuel visible restent capturés mais floutés, le verrou étant appliqué côté serveur (`lib/leadLock.ts`) pour ne pas fuiter la PII.

### 4.10. Page Mes Clients (/clients)

Gestion des clients pour coachs, consultants et prestataires. Complémentaire à la page Leads : un lead est un prospect capturé, un client est une personne avec qui l'utilisateur travaille.

- 4 stats : total, actifs, complétés, taux de complétion moyen.
- Tableau : nom, email, statut (Prospect, Actif, En pause, Complété), badges d'accompagnements avec progression, date d'ajout. Recherche, filtre par statut, filtre par accompagnement, pagination.
- Création et édition via dialog : nom, email, téléphone, statut, notes.
- Panel détail : informations, notes, section Accompagnements (étapes cochables avec barre de progression, suivi financier par accompagnement : montant closé, montant encaissé, paiement comptant ou en tranches).
- Section Mes accompagnements : templates de processus réutilisables (nom, description, couleur, étapes ordonnées), applicables à un client avec saisie optionnelle des infos de paiement.

Enrichissement CA : quand la compta est configurée, chaque client est matché par email avec les transactions PSP pour afficher le total encaissé et un badge d'abonnement actif ou interrompu.

### 4.11. Page Analytics (/analytics)

Suivi des performances business.

- Onglet Résultats : KPIs du mois (revenus, ventes, inscrits, conversion), résumé des tendances, lien vers les métriques par offre. Quand la compta est configurée, les résultats totaux (ventes et CA) sont lus depuis les transactions PSP et manuelles, avec les commissions d'affiliation affichées séparément.
- Onglet Saisir mes données : sélecteur de période, métriques manuelles (visiteurs, inscrits, taux d'ouverture, taux de clic, vues page de vente, ventes, CA), calculs dérivés, diagnostic IA après enregistrement.
- Onglet Historique : historique des données par mois.
- Métriques d'offres : suivi par offre (visiteurs, inscrits, ventes, CA, conversion), agrégation et analyse IA.
- Bouton de synchronisation manuelle des ventes Systeme.io.

### 4.12. Page Pépites (/pepites)

Repository d'insights business multilingues, délivrés progressivement.

- Chaque pépite ajoutée par l'admin est traduite automatiquement dans les langues supportées (IA niveau 1).
- Affichage dans la langue de l'interface, fallback FR.
- Assignation par `group_key` pour ne pas servir la même pépite deux fois dans deux langues.
- Notifications de nouvelles pépites avec badge compteur dans la sidebar.
- Interface admin pour ajouter des pépites.

Tables : `pepites` (avec `locale` et `group_key`), `user_pepites`, `user_pepites_state`.

### 4.13. Page Paramètres (/settings)

Accès via la photo de profil. Onglets de configuration.

Onglet Profil : prénom, mission, formule de niche, storytelling fondateur en 6 étapes (situation initiale, élément déclencheur, péripéties, moment critique, résolution, situation finale), gestion des offres avec liens, URLs réseaux sociaux, liens personnalisés, langue du contenu généré.

Onglet Connexions : OAuth des 7 réseaux, configuration de la clé API Systeme.io avec nom de connexion personnalisé (chaque projet a sa propre clé indépendante), enregistrement automatique des webhooks SIO à la sauvegarde, champ identifiant affilié Tipote (Systeme.io) pour le tracking de commission, configuration des auto-commentaires, gestion et rafraîchissement des tokens. La clé API Systeme.io est chiffrée at rest (AES-256-GCM, DEK par utilisateur).

Onglet Réglages : email et mot de passe, paramètres du compte, langue par défaut, reset du projet actif ou reset du compte entier.

Onglet Positionnement : analyse des concurrents, positionnement marché, définition de niche.

Onglet Branding : police de marque, couleurs (base et accent), logo (upload), photo auteur, ton de voix.

Onglet IA : panel crédits (consommation, solde, historique), style des auto-commentaires.

Onglet Abonnement : plan actuel, crédits disponibles, tableau comparatif des plans, consommation par type, actions (acheter crédits, upgrade, gérer abonnement).

Onglet Domaine : connexion d'un domaine personnalisé (plans payants), voir 4.22.

Onglet Boost : gestion de l'espace d'engagement et de l'extension Chrome, voir 4.20.

Onglet Compta : suivi comptable, voir 4.19.

### 4.14. Constructeur de pages (/pages)

Constructeur de landing pages hébergées avec branding Tipote.

Types : page de capture, page de vente, site vitrine, link-in-bio.

Éditeur plein écran : barre supérieure (logo, toggle responsive, actions), sidebar gauche à deux onglets (Builder, Paramètres), aperçu WYSIWYG multi-device, chat IA intégré.

- Édition de texte inline dans l'aperçu (contentEditable).
- Sélection d'éléments par clic, panneau de propriétés contextuel.
- Sélecteur de couleurs inline (texte, fond, bordures).
- Dégradés linéaires sur fonds de section, rangées et boutons (couleur 1, couleur 2, angle).
- 20 polices Google pré-sélectionnées, sélecteur par élément, chargement auto.
- 8 animations CSS applicables à tout élément.
- Styles par élément : taille et graisse de police, alignement, marges, padding, bordures, arrondi.
- Palette d'ajout : section, rangée, titre, texte, bouton, image, vidéo, séparateur, colonnes, lien.
- Duplication d'éléments (clone styles plus contenu).
- Gestion des sections : ID ancre par section pour ciblage via liens et menus, réorganisation, suppression.
- Chat IA compact : modification par instructions naturelles, reformulation avant application, coût 0,5 crédit par modification, undo.

Publication et configuration : slug personnalisé, tags de capture Systeme.io, OG image, meta description, pixels de tracking (Facebook Pixel, Google Tag), page de remerciement configurable pour les pages de capture.

Exports et analytics : téléchargement HTML et PDF, analytics intégrés (vues, leads, conversion), export leads CSV, QR code de partage.

Sanitisation HTML en défense en profondeur : nettoyage serveur à chaque sauvegarde du `html_snapshot` (`lib/sanitizeHtml.ts`), nettoyage client dans le rendu public, endpoint admin de nettoyage en masse.

Pages publiques : accessibles via `/p/[slug]`.

### 4.15. Module Quiz (/quiz)

Constructeur de quiz interactifs pour capture de leads. Le module partage la table `quizzes` pour 3 modes :

- `quiz` : quiz à profils (chaque combinaison de réponses conduit à un profil résultat).
- `scoring` : quiz à score (le résultat dépend d'une tranche de score).
- `survey` : sondage (NPS, feedback), sans profil, avec analyse des réponses.

Modes de création : génération par IA (avec chat d'idéation `QuizIdeaChat`), création manuelle, import d'un quiz existant, duplication, réécriture assistée.

Types de questions : choix multiple, choix par image, oui/non, texte libre, échelle, notation. Le choix multiple supporte la sélection multiple.

Capture : email, prénom, nom, téléphone, pays (configurable). Position de la capture avant ou après le quiz. Étape de partage bonus optionnelle (viralité) avec image bonus, texte d'intro custom et message de bonus débloqué.

Résultats personnalisés : un CTA par résultat, texte riche. La distribution des leads par résultat suit une règle unique documentée dans `AGENTS.md` (source de vérité = `quiz_results` courant, exclusion silencieuse des orphelins, pourcentages calculés sur le total matché).

Présentation et thèmes (rendu public `/q/[quizId]`, éditeur WYSIWYG identique) :

- Thèmes prêts à l'emploi (`QUIZ_THEMES`) qui règlent police, couleur et fond en un clic (Indigo, Aurore, Océan, Menthe, Corail, Soleil, Rose poudré, Ardoise, Nuit).
- Branding fin par quiz surchargé sur le branding du business profile puis sur des constantes : police (9 choix Google Fonts), couleur primaire, couleur de fond, couleur de texte, logo (override, héritage ou masquage total).
- Fonds riches : couleur pleine, dégradé (palette fermée et validée, aucune injection CSS libre), ou image de fond (avec scrim de lisibilité). Les dégradés sombres basculent automatiquement les textes en clair.
- Écran d'accueil (cover) : carte texte ou image plein cadre avec titre en surimpression (welcome screen).
- Forme des boutons : pill (arrondi complet), rounded (coins doux), square (coins nets).
- Transitions directionnelles entre questions (glissement gauche/droite selon le sens de navigation).
- Raccourcis clavier : chiffres et lettres pour sélectionner une réponse, flèche gauche pour revenir en arrière.
- Gestes tactiles mobile : swipe horizontal pour naviguer entre les questions.
- Reprise de session : le visiteur qui revient reprend là où il s'était arrêté (stockage local), avec bandeau et bouton pour tout recommencer.
- Carte résultat partageable générée à la volée (`lib/resultCard.ts`) avec partage via Web Share API sur mobile ou téléchargement, plus confettis à l'arrivée sur le résultat.
- Fermeture du quiz : le créateur peut fermer un quiz, avec message par défaut ou redirection vers une URL (`close_redirect_url`).

Automations Systeme.io par résultat (3 actions configurables) : tag SIO, inscription à une formation SIO (`sio_course_id`), ajout à une communauté SIO (`sio_community_id`). Le résultat du quiz est stocké comme champ personnalisé sur le contact (enrichissement). Les leads sont synchronisés vers Systeme.io avec prénom, nom, téléphone et pays.

Langues : le contenu du quiz peut être généré dans de nombreuses langues (catalogue `lib/quizLanguages.ts`, découplé de la langue d'interface). Le rendu public propose plusieurs variantes de copy (FR, FR vouvoiement, EN, ES, DE, PT, IT, AR).

Stats et analytics : vues, partages, leads. Une page d'analytics par quiz (`/quiz/[id]/analytics`) présente des KPI, l'évolution des leads dans le temps, la distribution des résultats et un funnel par question (table `quiz_question_events`). Les compteurs de vues et de complétions sont recalculés en direct depuis `quiz_events`, jamais depuis le compteur dénormalisé `quizzes.views_count`, avec un garde-fou qui garantit un taux de capture inférieur ou égal à 100%.

i18n interne : namespace `quizDetail`, classe CSS rich-text `tipote-quiz-rich`.

### 4.16. Module Popquiz (/popquiz)

Nouveau type de contenu : une vidéo avec des quiz incrustés à des timestamps précis. Accessible depuis `/create`, scopé par projet.

- Source vidéo : YouTube, Vimeo, ou upload résumable via un serveur TUS dédié (JWT par app), avec lecture protégée par lien signé. Support des vidéos volumineuses.
- Cuepoints : quiz interactifs déclenchés à des timestamps.
- Player enrichi : vitesse de lecture, skip avant/arrière, partage (Web Share API avec fallback copie-lien), Picture-in-Picture, poster HD.
- Vignette personnalisable : auto-extraite ou uploadée, avec crop 16/9 intégré.
- Autosave de l'édition (colonnes `draft_state`, `draft_updated_at`).
- Embed iframe pour intégration externe (`/embed/pq/[id]`).
- Pages publiques : `/pq/[popquizId]`.

### 4.17. Coach IA

Bulle flottante de conversation avec le coach.

- Free et Basic : verrouillé (CTA upgrade).
- Pro et Elite : inclus, illimité, sans consommation de crédits.

Le coach reçoit tout le contexte business : profil, persona, progression, et le contexte financier réel (CA du mois, progression vers l'objectif, abonnés perdus) formaté par `lib/compta/businessContext.ts`. Le contexte est injecté dans le chat, la phrase d'encouragement quotidienne et la génération de stratégie. Historique des conversations conservé.

### 4.18. Didacticiel interactif

Tutoriel guidé pas-à-pas pour les nouveaux utilisateurs. Objectif : présenter chaque section puis insister sur l'importance de compléter les réglages (offres, positionnement, persona, branding) avant de créer du contenu.

Phases séquentielles couvrant : bienvenue, Aujourd'hui, Stratégie, Créer, Contenus, Templates, Crédits, Analytics, Pépites, chaque onglet des Paramètres, Coach, complétion.

UX : tooltips avec compteur d'étapes, spotlight sur les éléments ciblés, opt-out visible, fenêtre limitée aux premiers jours, relançable via le bouton d'aide flottant. Le tutoriel et les widgets propres à Tipote sont désactivés sur le sous-domaine affilié (détection par host).

### 4.19. Module Compta (onglet Paramètres > Compta)

Suivi comptable pour indépendants. Bandeau permanent : Tipote aide à anticiper, pas à déclarer, et ne remplace ni un comptable ni les déclarations officielles.

Pays couverts (le pays est déterminé par `business_profiles.country`, les autres pays voient un message d'attente) :

| Pays | Statuts modélisés |
| :---- | :---- |
| France | particulier, auto-entrepreneur, SASU, SAS, SARL, EURL |
| Suisse | indépendant, Sàrl, SA (26 cantons) |
| Belgique | indépendant principal, indépendant complémentaire, SRL, SA |
| Portugal | trabalhador independente, ENI, LDA unipessoal, LDA, SA |
| Espagne | autónomo, SLU, SL, SA (communautés autonomes, régimes foraux, IGIC) |
| Canada | travailleur autonome, entreprise individuelle, inc. provinciale, inc. fédérale (13 juridictions) |
| États-Unis | sole proprietorship, single et multi-member LLC, C-Corp, S-Corp (50 états plus DC) |

Sections empilées :

1. Progression vers l'objectif mensuel (`RevenueGoalProgress`).
2. Tableau de bord business (`ComptaDashboard`) : CA du mois avec delta N-1, cumul annuel, revenus récurrents, taux de remboursement, graphe 12 mois N vs N-1, décomposition clients (nouveaux, abonnés, perdus), top produits, jauge de franchise TVA.
3. Décomposition ventes directes vs commissions d'affiliation (affichée si au moins une commission catégorisée).
4. Connexions PSP : Stripe (Restricted Key), PayPal (OAuth client_credentials), Mollie (clé API). Sync initial de plusieurs mois d'historique plus sync delta quotidien, boutons Synchroniser et Déconnecter.
5. Saisies manuelles : CRUD pour les paiements hors PSP (virement, espèces, chèque, autre) avec catégorie (vente, commission, autre).
6. Configuration du statut (`ComptaConfigForm`) : sélecteur adapté au pays avec sous-formulaire dynamique (numéro d'entreprise validé, exercice fiscal, régime de TVA, options spécifiques). Liens vers les sites officiels.
7. Calendrier fiscal personnalisé (`FiscalCalendar`) : échéances calculées à la volée selon le statut et la configuration, groupées par mois, avec liens directs vers les portails officiels et suivi "fait".
8. Export FEC pour les sociétés à l'IS en France (`lib/compta/fecExport.ts`, format légal 18 colonnes).
9. Achats et charges avec TVA déductible, carte "TVA à payer".

Catégorisation automatique ventes vs commissions d'affiliation via heuristique sur la description, avec override manuel. Conversion EUR automatique des transactions en devises étrangères via une source de taux open data. Les seuils fiscaux sont stockés en base (`fiscal_thresholds`), versionnés par pays, année et catégorie, éditables via l'admin, et surveillés par un cron qui alerte quand une valeur disparaît de la page officielle.

Les vrais chiffres sont injectés dans le coach IA, le dashboard Aujourd'hui, la page Stratégie et la page Analytics via le helper unifié `lib/compta/businessSummary.ts`.

### 4.20. Tipote Boost (onglet Paramètres > Boost, espace /boost)

Deux composantes :

- Espace d'engagement (pod) : un utilisateur qui connecte LinkedIn peut être auto-joint à un pod (ex : pod FR seed). Le moteur (`lib/podBoostService.ts`) gère l'auto-join, le throttling et le matching des posts, et génère des suggestions de commentaires par IA (`lib/podAiSuggest.ts`). Tables `pods`, appartenance unique par (pod, utilisateur).
- Extension Chrome Tipote Boost : amplification de la portée des publications. Le panneau affiche le statut de l'extension (détectée ou non via un objet injecté), un lien d'installation vers le Chrome Web Store, et les réseaux compatibles.

Plan gate : Pro, Elite ou Beta uniquement. La lecture du plan passe obligatoirement par `profiles.plan` (attribut global de l'abonnement), jamais par `business_profiles` (per-projet).

### 4.21. Webinars et événements (/webinars)

Liste d'événements et de webinars avec statuts (à venir, en direct, terminé) et playbook associé.

### 4.22. Domaines personnalisés (Paramètres > Domaine)

Les créateurs sur plan payant peuvent connecter leur propre hostname (par exemple `pages.ma-marque.com`).

- Setup : pose d'un CNAME vers `connect.tipote.com`, vérification DNS automatique (poll), émission d'un certificat Let's Encrypt à la première requête HTTPS via Caddy on-demand TLS.
- Détection automatique du registrar (Cloudflare, OVH, Gandi, GoDaddy, Namecheap, Google Domains, Route 53, IONOS, Hetzner, Scaleway, Porkbun, Hostinger) avec instructions DNS adaptées.
- URLs propres : sur un hostname custom, les URLs publiques perdent leur préfixe (`mydomain.com/<slug>` au lieu de `/q/<slug>`). Sur le host principal, les préfixes restent.
- Une seule URL pour tous les contenus (quiz, sondages, popquiz, pages) via un catch-all (`app/[publicSlug]/page.tsx`) qui résout quiz actif, popquiz publié puis page hébergée publiée, scopé (utilisateur, projet).
- Sélecteur de domaine de partage (`ShareDomainPicker`, hook `useShareDomain`) présent dans tous les éditeurs publics, avec persistance en base.
- Sécurité : hostname unique global, un contenu servi via un domaine custom doit appartenir au propriétaire du hostname sinon 404 (anti-impersonation). Isolation par projet.
- Backwards-compat : les anciennes URLs (`/q/`, `/p/`, `/pq/`) continuent de fonctionner.

Tables : `custom_domains` (hostname unique, `project_id`, RLS). Helpers `lib/customDomains.ts` (edge-safe), `lib/customDomainsServer.ts` (DNS), `lib/registrarDetect.ts`. Un process `domain-dispatcher` permet au Caddy unique du VPS de router les domaines custom vers Tipote ou Tiquiz selon le hostname.

### 4.23. Système de notifications

Types : automatiques (système), broadcast admin, personnelles, ventes Systeme.io temps réel (`sale`, `sale_canceled`), alertes business (objectif atteint, mi-parcours, churn), alertes techniques (déconnexion sociale, post échoué). Messages traduits dans les langues supportées.

Interface : cloche dans le header avec compteur d'unread, panel avec deep-linking, clic pour étendre le texte complet, marquage lu automatique à la fermeture, marquage lu ou archivé manuel.

### 4.24. Page Widgets (/widgets)

Widgets embarquables à intégrer sur des pages externes.

Notifications de preuve sociale (toast) :

- Sources : visiteurs en temps réel, inscriptions récentes, achats récents, messages personnalisés.
- Config : position (4 coins), thème (light, dark, minimal), couleur d'accent, coins arrondis ou carrés, durée d'affichage, délai entre toasts, max par session, anonymisation configurable, labels avec variables `{count}` et `{name}`.
- Intégration : snippet script, script JS autonome hébergé (`/widgets/toast-widget.js`), communication via API Supabase.

Boutons de partage social (share) :

- Plateformes : Facebook, X, LinkedIn, WhatsApp, Telegram, Reddit, Pinterest, Email.
- Modes d'affichage : inline, flottant gauche, flottant droit, barre basse.
- Options : style de bouton (rounded, square, circle, pill), taille (small, medium, large), mode couleur (marque, mono clair, mono sombre, custom), labels, texte de partage, hashtags.
- Intégration : snippet script avec `data-tipote-share`, script JS autonome (`/widgets/social-share.js`).

### 4.25. Pages légales

Pages dynamiques via `/legal/[slug]` : conditions d'utilisation, politique de confidentialité, mentions légales, CGV. Endpoint de suppression de données (`/meta/data-deletion`) pour la conformité Meta.

### 4.26. Multi-projets (plan Elite)

Un utilisateur Elite gère plusieurs projets (marques, sub-business) dans un même compte, avec isolation totale des données.

Tables : `projects` (`id`, `user_id`, `name`, `is_default`, `accent_color`, `icon_emoji`, `use_branding_logo`, RLS user-bound), `business_profiles` per-(`user_id`, `project_id`).

Contexte : cookie `tipote_active_project`, helpers `lib/projects/*` (client, activeProject avec fallback sur le projet par défaut, ensureDefaultProject, upsertByProject, visualIdentity).

Composants : `ProjectSwitcher` (sidebar, avec identité visuelle et bouton nouveau projet), badges et éditeur d'identité, `SessionResetGate` qui ramène l'utilisateur sur son projet par défaut à chaque nouvelle session navigateur.

API : `GET/POST/PATCH/DELETE /api/projects`. La création insère une ligne `projects` et un `business_profiles` vide avec onboarding non complété, et renvoie un flag qui redirige vers l'onboarding. La suppression est une danger zone (confirmation par recopie du nom, cascade FK, refus si projet unique).

Sémantique : un nouveau projet est un profil business neuf et vide, à re-onboarder ; aucune copie depuis le projet courant. Domaines, contenus publics, leads, clients, connexions sociales et clé Systeme.io sont per-projet.

Plan gate : `canUseMultiProjects(plan)` renvoie vrai pour Elite. Le plan d'abonnement reste un attribut global du user (`profiles.plan`), jamais per-projet.

### 4.27. Backoffice Admin (/admin)

Accès restreint aux emails listés dans `lib/adminEmails.ts` (`isAdminEmail()`).

- Vue utilisateurs (recherche, filtres par plan), modification de plan, reset password, désactivation.
- Broadcast de notifications, attribution de crédits bonus, opérations en masse.
- Logs de changements de plan (audit trail).
- Édition des seuils fiscaux (`/admin/compta/fiscal-thresholds`) par pays, année et catégorie.

### 4.28. Dashboard d'affiliation (sous-domaine)

Espace dédié aux affiliés qui promeuvent Tiquiz et Tipote, servi sur `affiliate.tipote.com` (rewrite vers `/affiliate/*`). Le pathname côté client n'a pas le préfixe `/affiliate`, le gating des composants Tipote se fait par host.

Navigation : Vue d'ensemble, Promouvoir, Contenus, Essai gratuit, Support.

- Vue d'ensemble : lien d'affiliation, gains, progression.
- Promouvoir : liens trackés éditables par l'affilié (libellé, description, destination), le paramètre `?sa=` étant ajouté automatiquement. Persistance dans `affiliates.promo_overrides`.
- Contenus : emails, posts réseaux, articles, visuels, tous éditables et personnalisables (le lien et le prénom de l'affilié sont injectés).
- Studio visuels IA (`ImageStudio`, moteur Fabric.js) : l'IA lit le post et choisit le format et le style d'image, le visuel s'accroche automatiquement au post. Copy générée sans clé côté affilié.
- Essai gratuit : accès Tipote Elite offert pour créer du contenu de promo authentique.
- CMS admin (`affiliate_contents`) : un espace admin gaté permet d'ajouter, éditer et publier articles, emails, posts et visuels, avec import des modèles par défaut et repli sur ces modèles tant que rien n'est publié.

Auth affilié : après connexion, navigation dure (`window.location.assign`) pour que le SSR du layout affilié lise le cookie de session.

---

## 5. Interconnexions des données

### 5.1. Matrice des déclencheurs

| Événement | Déclenche | Mécanisme |
| :---- | :---- | :---- |
| Modification des offres | Mise à jour des tâches du plan | Recalcul IA niveau 1 |
| Création d'offre (hub Créer) | Ajout aux offres et nouvelles tâches | Insertion auto |
| Tâche cochée | MAJ progression et stats | Recalcul temps réel |
| Contenu généré | Insert `content_item` et décrément crédits | Insert plus décrément |
| Post publié | MAJ statut et stockage post_id/url | Callback API |
| Modification persona | MAJ contexte de génération | Update `personas.persona_json` |
| Lead capturé | Insert `leads` chiffré plus notification | Insert plus trigger |
| Étape accompagnement cochée | MAJ progression client | Recalcul temps réel |
| Commentaire détecté | Auto-reply, log, décrément crédit | Webhook plus Claude |
| Analytics renseignés | Diagnostic IA | Trigger analyse |
| Clé API SIO sauvegardée | Enregistrement auto des webhooks SIO | Fire-and-forget async |
| Vente SIO (webhook) | Insert `sio_sales`, MAJ `offer_metrics`, toast, notification | Webhook receiver |
| Annulation SIO (webhook) | MAJ `sio_sales`, décrément `offer_metrics`, notification | Webhook receiver |
| Contact SIO créé (webhook) | Upsert `leads` | Webhook receiver |
| Quiz résultat obtenu | Tag SIO, enrichissement contact, inscription formation, ajout communauté | Fire-and-forget async |
| Transaction PSP synchronisée | MAJ dashboard compta, CA réel partout | Cron plus sync manuel |

### 5.2. Flux de données

Onboarding conduit à `business_profiles` et `personas`, puis à `business_plan` (offres et tâches), puis à Créer (contexte pré-rempli), puis à `content_item` et publication sociale, puis à analytics.

Quiz et pages conduisent à `leads` (chiffré) puis export CSV ou Systeme.io. Un résultat de quiz déclenche tag SIO, enrichissement, inscription formation et communauté.

Systeme.io (webhooks user) conduit à `sio_sales`, `offer_metrics`, toasts et notifications, puis alimente le coach IA. Les PSP compta conduisent à `transactions`, agrégées dans le résumé business injecté partout.

---

## 6. Architecture technique

### 6.1. Stack

| Composant | Technologie |
| :---- | :---- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| UI Components | shadcn/ui |
| Internationalisation | next-intl |
| Backend | Route handlers Next.js |
| Base de données | Supabase (PostgreSQL, RLS) |
| Auth | Supabase Auth (email/password, PKCE) |
| Stockage fichiers | Supabase Storage plus serveur TUS dédié pour les vidéos popquiz |
| IA stratégique | OpenAI GPT (clé propriétaire) |
| IA contenu | Claude, Anthropic (clé propriétaire) |
| Social OAuth | LinkedIn, Meta, X, TikTok, Pinterest |
| Automatisations | n8n (webhooks) |
| CRM et paiement | Systeme.io (API plus webhooks) |
| PSP compta | Stripe, PayPal, Mollie |
| Emails transactionnels | Resend |
| Chiffrement | AES-256-GCM (tokens et PII) |
| Hosting | VPS, reverse proxy Caddy |
| Process manager | PM2 |

Les deux applications (Tipote et Tiquiz) tournent sur le même VPS, avec un dispatcher de domaines pour router les hostnames custom. En production, chaque app source son fichier `.env` (pas `.env.local`, qui est une convention de dev).

### 6.2. Tables Supabase principales

Profil et auth : `profiles` (id, email, locale, timezone, `plan` source de vérité globale, onboarding, sio_contact_id), `projects`, `business_profiles` (per-(user, project)), `personas`.

Stratégie : `business_plan` (plan_json), `project_tasks`.

Contenu : `content_item` (type, title, content, status, scheduled_date, channel, tags, meta, ai_provider_used, credits_consumed).

Social : `social_connections` (tokens OAuth chiffrés, `disconnected_at`), `social_automations`, `auto_comment_logs`, `automation_credits`.

Pages et quiz : `hosted_pages`, `page_leads`, `page_clicks`, `quizzes` (mode quiz/scoring/survey, branding, présentation, fermeture), `quiz_results`, `quiz_leads`, `quiz_events`, `quiz_question_events`, `popquizzes`.

Clients : `clients`, `client_templates`, `client_template_items`, `client_processes`, `client_process_items`.

Leads : `leads` (champs chiffrés, blind index HMAC), `user_encryption_keys`.

Billing : `user_credits`, `user_credits_transactions`.

Analytics : `offer_metrics`, `analytics_entries`.

Compta : `payment_connections`, `transactions`, `manual_transactions`, `expense_items`, `fiscal_thresholds`, plus de nombreuses colonnes de configuration sur `business_profiles` selon le pays.

Systeme.io (user) : `sio_sales`, `sio_webhook_registrations`.

Boost : `pods` et appartenances.

Affiliation : `affiliates`, `affiliate_contents`.

Domaines : `custom_domains`.

Notifications : `notifications`.

Widgets : `toast_widgets`, `toast_events`, `share_widgets`.

Admin : `plan_change_log`, `plan_assignments`, `webhook_logs`.

Toutes les tables utilisateur utilisent Row Level Security.

### 6.3. Routes API (aperçu)

Auth et compte : `/api/account/{delete,ensure-profile,reset}`, `GET /api/profile` (retourne `business_profiles` per-projet enrichi de `profiles.plan` global, source unique des plan gates client), callbacks OAuth.

Projets : `GET/POST/PATCH/DELETE /api/projects`.

Social : `POST /api/social/publish`, `GET /api/social/connections`, endpoints de listing par plateforme.

Contenu : `POST /api/content/generate`, `POST /api/content/refine`, `POST /api/content/strategy/generate-all`, `PATCH /api/content/[id]`, `POST /api/content/[id]/duplicate`.

Pages : `POST /api/pages/generate`, `GET/PATCH /api/pages/[pageId]`, `POST /api/pages/[pageId]/publish`, `GET /api/pages/public/[slug]`.

Quiz : `POST /api/quiz/generate`, `GET/POST /api/quiz/[quizId]`, `GET /api/quiz/[quizId]/public`, `POST /api/quiz/[quizId]/sync-systeme`, `GET /api/quiz/[quizId]/analytics` (recompute depuis `quiz_events`), `POST /api/quiz/[quizId]/autosave`, `/api/quiz/[quizId]/survey-results`, `/api/quiz/[quizId]/survey-analysis`, `/api/quiz/[quizId]/duplicate`, `/api/quiz/[quizId]/rewrite`.

Popquiz : `/api/popquiz/upload-token`, `/api/popquiz/playback-url`, `/api/popquiz/[id]/thumbnail`.

Clients : `GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/[id]`, `/api/client-processes`, `/api/client-templates`.

Leads : `GET/POST /api/leads`, `GET/PATCH/DELETE /api/leads/[id]`, `GET /api/leads/export`.

Analytics : `POST /api/analytics/analyze-metrics`, `/api/analytics/offer-metrics`, `POST /api/analytics/sio-sync`, `/api/analytics/compta-totals`.

Compta : `/api/compta/connections` et variantes, `/api/compta/manual-transactions`, `/api/compta/expense-items`, `/api/compta/dashboard`, `/api/compta/fiscal-deadlines`, `/api/compta/fec-export`.

Automatisations : `/api/automations/{linkedin,instagram,twitter,tiktok}-comments`, `/api/automations/webhook`, `/api/n8n/{linkedin,publish-callback,scheduled-posts}`.

Systeme.io : `POST /api/systeme-io/user-webhook`, `GET /api/systeme-io/{tags,courses,communities}`, `POST /api/systeme-io/webhook` (plateforme).

Billing : `POST /api/billing/subscription`, `GET /api/credits/balance`.

Widgets : `/api/widgets/toast`, `/api/widgets/toast/events`, `/api/widgets/share`.

Boost : `/api/pod/{ai-suggest,auth,me,posts,tasks}`.

Admin : `/api/admin/{users,notifications,bulk}`, `/api/admin/sanitize-pages`.

Crons (auth par secret) : sync des paiements, milestones business, check des seuils fiscaux, rappels fiscaux, sync des ventes SIO, posts programmés, rafraîchissement des tokens sociaux.

### 6.4. Variables d'environnement

Supabase : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Application : `NEXT_PUBLIC_APP_URL`, `NODE_ENV`, `CRON_SECRET`, `CUSTOM_DOMAINS_ENABLED`.

IA : `ANTHROPIC_API_KEY` (Claude), `OPENAI_API_KEY` (OpenAI), plus les variables de modèle et de tokens.

Chiffrement : `SOCIAL_TOKENS_ENCRYPTION_KEY`, `PII_MASTER_KEY`, `PII_HMAC_SECRET`.

OAuth réseaux sociaux : identifiants et secrets pour LinkedIn, Meta, Instagram, Threads, X, TikTok, Pinterest.

Intégrations : `SYSTEME_IO_API_KEY`, base et secret n8n, token d'accès Messenger, clé Resend.

---

## 7. CI, tests et garde-fous

- GitHub Actions : typecheck (`npx tsc --noEmit`, exit 0 obligatoire) et lint syntax des scripts sur chaque push ; tests E2E planifiés.
- Tests E2E Playwright (`tests/e2e/`) sur les pages publiques `/q/`, `/p/`, `/pq/` : headers iframe (X-Frame-Options absent, CSP `frame-ancestors *`), contenu visible, OG meta, bouton start, endpoint `/track` qui retourne toujours 200 (soft fail `{ok: false, reason}`).
- Détecteur de migrations manquantes en prod : `npm run check:migrations-pending` parse tous les `.sql` du repo et liste ce qui manque en base ; `npm run check:schema` vérifie un ensemble de migrations critiques.
- Convention : toute migration se termine par `NOTIFY pgrst, 'reload schema';` et utilise `IF NOT EXISTS`.

---

## 8. Sécurité

### 8.1. Authentification

Supabase Auth (JWT avec expiration, refresh tokens), OAuth 2.0 avec PKCE, CSRF tokens sur les flux OAuth, cookies httpOnly.

### 8.2. Chiffrement des données

- Tokens OAuth : AES-256-GCM (`SOCIAL_TOKENS_ENCRYPTION_KEY`).
- PII des leads : AES-256-GCM par utilisateur avec DEK individuelle wrappée par une clé maître, index aveugle HMAC-SHA256 pour la recherche sur champs chiffrés. Ni l'admin ni un accès brut à la DB ne permettent de lire les données.
- Clé API Systeme.io : chiffrée at rest.

### 8.3. Row Level Security

RLS activé sur toutes les tables utilisateur, chaque utilisateur ne voit que ses données, service role réservé aux opérations admin et systèmes.

### 8.4. Webhooks

Validation de signature HMAC (Meta X-Hub-Signature-256, Systeme.io), secret partagé pour n8n, logs de debugging. Les endpoints de tracking public retournent toujours 200.

---

## 9. Monétisation

### 9.1. Plans et tarification

| | Free | Basic | Pro | Elite |
| :---- | :---- | :---- | :---- | :---- |
| Prix mensuel | 0€ | 19€ | 49€ | 99€ |
| Prix annuel | | 190€ | 490€ | 990€ |
| Crédits IA/mois | 25 (one-shot) | 40 | 150 | 500 |
| Connexions sociales | 1 | 2 | 4 | illimitées |
| Tous les modules | Oui | Oui | Oui | Oui |
| Publication directe | Oui | Oui | Oui | Oui |
| Auto-commentaires | Non | Oui | Oui | Oui |
| Analyse stats IA, enrichissement persona, analyse concurrence, achat de crédits | Non | Oui | Oui | Oui |
| Coach IA | Non | Non | Oui | Oui |
| Multi-projets | Non | Non | Non | Oui |

Un plan `beta` existe pour les early adopters lifetime, avec les mêmes fonctionnalités que Pro (150 crédits/mois). La détection du plan payant est permissive : tout ce qui n'est pas explicitement `free` est traité comme payant.

Plafonds du plan gratuit par projet : 1 quiz actif, 1 sondage, 1 page publiée, 1 popquiz, et un quota mensuel de leads visibles au-delà duquel les leads restent capturés mais floutés.

### 9.2. Système de crédits

- Renouvellement mensuel (sauf Free en one-shot), crédits mensuels non cumulables.
- Auto-commentaire : 0,25 crédit. Modification de page via chat IA : 0,5 crédit.
- Les packs achetés n'expirent pas et sont consommés après les crédits mensuels (FIFO).

### 9.3. Packs supplémentaires (Systeme.io)

| Pack | Crédits | Prix |
| :---- | :---- | :---- |
| Starter | 25 | 3€ |
| Standard | 100 | 10€ |
| Pro | 250 | 22€ |

---

## 10. Intégration Systeme.io

Systeme.io est également disponible en whitelabel sur la plateforme Tipote.

### 10.1. Webhook plateforme (abonnements Tipote)

Réception du payload (email, plan, product_id, sio_contact_id), création de compte si inexistant, upgrade de plan et attribution de crédits, email de bienvenue. Le webhook d'annulation rétrograde vers le plan Free.

### 10.2. Clé API utilisateur (multi-projet)

Chaque projet a sa propre clé API SIO indépendante, avec un nom de connexion personnalisable. Stockage chiffré sur `business_profiles`.

### 10.3. Webhooks utilisateur (automatiques)

À la sauvegarde de la clé API, Tipote enregistre automatiquement les webhooks sur le compte SIO de l'utilisateur.

| Événement SIO | Action Tipote |
| :---- | :---- |
| NEW_SALE | Insert `sio_sales`, MAJ `offer_metrics`, toast de preuve sociale, notification i18n |
| SALE_CANCELED | MAJ statut `sio_sales`, décrément `offer_metrics`, notification |
| CONTACT_CREATED | Upsert dans `leads` (source systeme_io) |

Chaque user a un secret token unique dans l'URL de son webhook. Les webhooks plateforme et utilisateur sont séparés.

### 10.4. Sync leads quiz et pages vers SIO

Export des leads avec prénom, nom, téléphone et pays, tags de capture configurables par page et par résultat de quiz, enrichissement du contact avec le résultat du quiz comme champ personnalisé.

### 10.5. Automations quiz vers SIO (par résultat)

Chaque résultat peut déclencher : tag, inscription à une formation SIO, ajout à une communauté SIO. Les cours et communautés disponibles sont récupérés via l'API SIO.

### 10.6. Sync ventes vers analytics

Pull périodique de `GET /api/sales` (manuel via `POST /api/analytics/sio-sync`, automatique via cron). Matching produit SIO vers offre Tipote en cascade (`sio_product_id` explicite, nom exact, nom fuzzy, prix unique, sinon unmatched). Idempotence garantie par remise à zéro des couples (offre, mois) touchés avant réinsertion.

### 10.7. Alimentation du coach IA

Les dernières ventes SIO sont injectées dans le contexte du coach (CA total, ventilation par offre, transactions récentes), combinées avec `offer_metrics` et le résumé business compta.

### 10.8. Lien d'affiliation Tiquiz

Footer permanent sur les popquiz publics et leur embed iframe, et sur les quiz publics gratuits ou sans footer custom, redirigeant vers le hub de vente avec tracking de commission via le paramètre `?sa=<id>` correspondant à l'identifiant affilié Systeme.io du créateur (`business_profiles.tipote_affiliate_id`).

---

## 11. Langues supportées

Interface (next-intl) : FR, EN, ES, IT, AR (avec support RTL), PT, PT-BR. Locale par défaut FR.

Le contenu des quiz peut être généré dans un catalogue de langues bien plus large, découplé de la langue d'interface. Le rendu public des quiz propose plusieurs variantes de copy (FR, FR vouvoiement, EN, ES, DE, PT, IT, AR).

---

## 12. Design system

- Composants UI shadcn/ui, framework CSS Tailwind.
- Un client component par page : `components/<domaine>/<PageName>Client.tsx`.
- Page serveur `app/<route>/page.tsx` : wrapper auth, fetch, retour du client component.
- Règle rédactionnelle sur tout contenu user-visible : aucun em-dash ni en-dash (signature stylistique d'IA bannie). Remplacer par virgule, deux-points, point ou parenthèses.

---

*Fin du cahier des charges.*
