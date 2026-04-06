# CAHIER DES CHARGES Tipote — Version Avril 2026 (État actuel du produit)

Application Web SaaS multilingue (FR/EN/ES/IT/AR) pour analyse business, planification stratégique, génération de contenus IA et publication automatisée sur les réseaux sociaux.

---

## 1\. PRÉSENTATION DU PRODUIT

### 1.1. Vision

Tipote® est le « pote de business » des entrepreneurs. Contrairement aux outils IA génériques qui repartent de zéro à chaque conversation, Tipote® mémorise le profil business de l'utilisateur, son audience cible et ses objectifs pour générer une stratégie solide et des contenus véritablement personnalisés.

La "mémoire" Tipote est structurée (profil \+ diagnostic \+ persona \+ storytelling \+ plan \+ offres \+ tâches) et sert de source de vérité pour tous les prompts de génération.

### 1.2. Problèmes résolus

- 51% des entrepreneurs n'ont pas fait leur première vente → Plan stratégique guidé  
- 46% passent trop de temps sur la création de contenu → Génération IA automatisée \+ publication directe  
- 52% trouvent l'IA trop générique → Personnalisation basée sur le profil mémorisé

### 1.3. Fonctionnalités clés (état actuel)

- Onboarding intelligent qui capture le profil business complet  
- Plan stratégique personnalisé avec offres
- Génération de contenus (posts, emails, articles, scripts, offres, pages, quiz, stratégie éditoriale)
- **Publication directe sur 7 réseaux sociaux** (LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest)
- **Automatisations** (auto-commentaires, comment-to-DM, comment-to-email)  
- Calendrier éditorial centralisé  
- Constructeur de pages (capture, vente, vitrine, link-in-bio)
- Système de quiz avec capture de leads
- Gestion des leads avec chiffrement AES-256
- Gestion des clients (suivi, notes, statuts, processus d'accompagnement)
- Templates Systeme.io  
- Suivi des tâches et progression  
- Analytics avec diagnostic IA  
- Coach IA contextuel (plans Pro/Elite)  
- Système de pépites multilingues (insights traduits automatiquement en 5 langues)
- Didacticiel interactif pas-à-pas  
- Notifications en temps réel (clic pour lire, marquage lu automatique)
- Multi-projets (chaque projet avec sa propre clé API Systeme.io nommée)
- **Intégration Systeme.io avancée** : webhooks temps réel (ventes, annulations, contacts), auto-inscription cours/communautés, enrichissement contacts, preuve sociale
- **Systeme.io disponible en whitelabel** sur la plateforme Tipote
- 5 langues (FR, EN, ES, IT, AR)

---

## 2\. PRINCIPES FONDATEURS

### 2.1. Publication directe (évolution majeure vs V1)

**Contrairement à la V1 qui ne proposait que le copier-coller**, Tipote publie désormais directement sur les réseaux sociaux via OAuth 2.0. L'utilisateur connecte ses comptes dans Paramètres \> Connexions, et les posts sont publiés en un clic (ou programmés).

Plateformes supportées avec publication directe :

- LinkedIn (Posts \+ images)
- Facebook Pages (Posts \+ images \+ carrousels \+ vidéos)
- Instagram (Photos \+ vidéos \+ Reels)
- Threads (Posts)
- Twitter/X (Tweets \+ images)
- TikTok (Photos \+ vidéos)
- Pinterest (Pins avec images \+ liens)

### 2.2. Deux niveaux d'IA

**Niveau 1 — Cerveau stratégique (OpenAI GPT)**

- Onboarding et diagnostic business  
- Génération du plan stratégique  
- Propositions d'offres (onboarding)
- Création des tâches  
- Coach IA  
- Analyse analytics  
- Recherche de ressources (embeddings) → Clé propriétaire, appels backend uniquement

**Niveau 2 — Génération de contenu (Claude Anthropic)**

- Posts réseaux sociaux  
- Emails (newsletters, séquences)  
- Articles de blog  
- Scripts vidéo  
- Copywriting pages
- Quiz  
- Stratégie éditoriale  
- Auto-commentaires → Claude Sonnet comme provider principal, clé propriétaire

### 2.3. Monétisation par crédits

- Crédits inclus mensuellement selon le plan (Free/Basic/Pro/Elite)  
- Packs de crédits supplémentaires via Systeme.io  
- Chaque génération de contenu consomme des crédits  
- Webhook Systeme.io pour délivrer les crédits achetés  
- L'utilisateur n'a besoin de configurer aucune clé IA

---

## 3\. ARCHITECTURE UX

### 3.1. Navigation principale (Sidebar)

**Section principale :**

| Menu | URL | Icône | Description |
| :---- | :---- | :---- | :---- |
| Aujourd'hui | /app | Sun | Dashboard : prochaine tâche \+ stats clés |
| Ma Stratégie | /strategy | Target | Plan d'action en 3 phases \+ tâches |
| Créer | /create | Sparkles | Hub de création (8 types de contenu) |
| Mes Contenus | /contents | FolderOpen | Liste \+ calendrier éditorial |
| Templates | /templates | Layout | Templates Systeme.io |
| Automatisations | /automations | Zap | Automatisations sociales (comment-to-DM/email) |
| Mes Leads | /leads | Users | Gestion des leads capturés |
| Mes Clients | /clients | UserCheck | Gestion et suivi des clients |
| Widgets | /widgets | Bell | Widgets embarquables (toast \+ partage social) |

**Section secondaire :**

| Menu | URL | Icône | Description |
| :---- | :---- | :---- | :---- |
| Analytics | /analytics | BarChart3 | KPIs \+ diagnostic IA |
| Pépites | /pepites | Sparkles | Insights et pépites business |

**Footer sidebar :**

| Menu | URL | Icône | Description |
| :---- | :---- | :---- | :---- |
| Support | /support | HelpCircle | Lien vers le support (nouvel onglet) |

**Note :** Les Paramètres ne sont plus dans la sidebar. Ils sont accessibles via la photo de profil (avatar) en haut à droite du header.

### 3.2. Workflow utilisateur

ONBOARDING (une fois)

    → AUJOURD'HUI (chaque connexion)

        → CRÉER (production)

            → PUBLIER (réseaux sociaux)

                → MES CONTENUS (organisation)

                    → ANALYTICS (suivi)

---

## 4\. PAGES DE L'APPLICATION

### 4.1. Authentification

- Login : email \+ mot de passe (Supabase Auth)  
- Reset password  
- Set password  
- Détection automatique de la langue (user.locale)  
- Callback OAuth pour réseaux sociaux

### 4.2. Onboarding intelligent

**Déclenchement :** Première connexion. Obligatoire avant les fonctionnalités stratégiques.

**Format :** Questionnaire interactif de type Typeform (V3), étapes progressives.

**Données collectées :**

- Profil business complet  
- Offres existantes / absence d'offres / profil affilié  
- Situation réelle, freins, contraintes  
- Différenciation, preuves, positionnement  
- Persona client cible  
- Objectifs prioritaires
- Style et tonalité  
- Non-négociables

**Stockage (Supabase) :**

- `business_profiles.diagnostic_answers` (JSONB) : transcript structuré  
- `business_profiles.diagnostic_profile` (JSONB) : normalisation exploitable  
- `business_profiles.diagnostic_summary` (TEXT) : résumé coach  
- `business_profiles.diagnostic_completed` (BOOLEAN)

**Traitement backend (IA Niveau 1\) :**

1. Génération persona détaillé (basé sur diagnostic\_profile)  
2. Diagnostic business (forces/faiblesses/leviers)  
3. Création de 3 propositions d'offres (si l'utilisateur n'en a pas encore)
4. L'utilisateur en choisit une → ces offres sont ajoutées à ses réglages
5. Génération du plan stratégique en 3 phases
6. Création automatique des tâches

### 4.3. Page « Aujourd'hui » (/app)

Page d'accueil après login. Dashboard "Mode Pilote" — coaching automatique basé sur les données du profil.

**Composants :**

- **Bloc 1 — Ton objectif** : Card gradient avec objectif stratégique de la phase en cours, badge phase, bouton CTA contextuel
- **Bloc 1b — Contenus programmés aujourd'hui** : Liste des contenus planifiés pour la journée (canal, titre, horaire), lien vers le calendrier
- **Bloc 2 — Cette semaine : coaching** : Résumé positif des actions accomplies, dernière tâche réalisée, prochaine étape recommandée, CTA contextuel
- **Bloc 3 — Ta progression** : Analyse intelligente des stats analytics (revenus, ventes, inscrits, taux de conversion) ou invitation à remplir les stats
- **Bloc 4 — Lien stratégie** : Lien discret vers la page stratégie complète

### 4.4. Page « Ma Stratégie » (/strategy)

Page dédiée au plan d'action stratégique en 3 phases.

**Header :**

- Banner « Votre Vision Stratégique »
- 3 badges : Objectif Revenue (éditable), Phase actuelle, Progression (%)

**3 cards stats :**

- Tâches complétées (compteur \+ barre de progression)
- Phase actuelle
- Objectif revenue

**Plan d'action :**

- Phase 1 Fondations : barre progression \+ tâches cochables (tri drag-and-drop)
- Phase 2 Croissance : barre progression \+ tâches cochables
- Phase 3 Scale : barre progression \+ tâches cochables
- Archive des tâches complétées (section dépliable)

**Note :** La pyramide d'offres et le persona ne sont plus affichés sur cette page. Les offres sont gérées dans Paramètres \> Profil, le persona dans Paramètres \> Positionnement.

**Flux des offres :** Lors de l'onboarding, si l'utilisateur n'a pas encore d'offres, Tipote lui propose 3 pyramides d'offres. L'utilisateur en choisit une, et ces offres deviennent ses offres dans les réglages. Il doit ensuite les mettre en œuvre via les tâches générées dans le plan d'action.

### 4.5. Page « Créer » (/create)

Hub unique de création de contenu IA.

**8 types de contenu :**

| Type | Description | Icône | Formulaire |
| :---- | :---- | :---- | :---- |
| Post | Réseaux sociaux (LinkedIn, Instagram, Twitter...) | MessageSquare | PostForm |
| Email | Newsletters, séquences, campaigns | Mail | EmailForm |
| Article | Articles de blog, guides, tutoriels | FileText | ArticleForm |
| Vidéo | Scripts YouTube, Reels, TikTok | Video | VideoForm |
| Offre | Pages de vente, descriptions produit | Package | OfferForm |
| Pages | Pages de vente, de capture, sites vitrine, link-in-bio | Route | PagesForm |
| Quiz | Quiz lead magnets | ClipboardList | QuizForm |
| Stratégie | Stratégie de contenu éditoriale | CalendarDays | ContentStrategyForm |

**Workflow après sélection :**

1. Formulaire contextuel (pré-rempli depuis onboarding/persona)  
2. Bouton « Générer » → appel IA Niveau 2 (Claude)  
3. Prévisualisation du résultat  
4. Actions : Régénérer / Modifier / Sauvegarder / Planifier / **Publier directement**

**Posts réseaux sociaux — Fonctionnalités avancées :**

- Sélection de la plateforme cible  
- Upload d'images (stockage Supabase Storage `content-images`)  
- Upload de vidéos (stockage Supabase Storage `content-videos`)  
- Configuration auto-commentaire à la publication  
- Sélection du board Pinterest (si Pinterest)  
- Lien Pinterest optionnel  
- **Mode édition** : accès via `?edit=<id>` pour modifier un post programmé existant

**Contexte IA :** Tous les prompts réinjectent `persona_json` \+ éléments du diagnostic (objections, vocabulaire, différenciation).

### 4.6. Page « Mes Contenus » (/contents)

Vue centralisée de tous les contenus générés.

**Deux vues :**

- **Vue Liste** : Onglets filtres (Tous / Posts / Emails / Articles / Vidéos / Quiz / Pages) \+ recherche \+ filtres avancés (statut, canal)  
- **Vue Calendrier** : Vue mois avec codes couleur par type, clic pour éditer

**Éléments affichés :**

- Badge statut (Publié, Planifié, Brouillon)  
- Type \+ Canal  
- Titre \+ aperçu  
- Date/délai  
- Menu actions (éditer, marquer comme publié, planifier/modifier date, déplanifier, supprimer)

**Fonctionnalité clé :** Les posts programmés sont éditables. Clic sur un post → ouvre l'éditeur complet (`/create?edit=<id>`) avec images, vidéos, auto-commentaires pré-remplis.

**Sous-sections intégrées :**

- Mes Quiz (liste des quiz créés avec stats vues/partages/leads)  
- Mes Pages (pages hébergées avec stats vues/leads/clics)

### 4.7. Page « Templates » (/templates)

Bibliothèque de templates Systeme.io téléchargeables.

**Fonctionnalités :**

- Prévisualisation des templates
- Téléchargement direct dans Systeme.io

### 4.8. Page « Automatisations » (/automations)

Gestion des automatisations sociales.

**Types d'automatisations (page /automations) :**

- **Comment-to-DM** : Répondre automatiquement en DM aux commentaires contenant certains mots-clés
- **Comment-to-Email** : Capturer l'email des commentateurs via DM automatique

**Note :** Les auto-commentaires (commentaires automatiques sur les posts publiés) sont configurés dans Paramètres \> Connexions et activés lors de la création d'un post. Coût : 0.25 crédit par commentaire, contenu généré par Claude.

**Triggers :**

- Mots-clés configurables
- Variantes de réponses
- Logs d'exécution avec statut (success/fail)

**Intégration n8n :**

- Webhooks pour publication asynchrone
- Callback pour posts programmés
- Health check endpoint

### 4.9. Page « Mes Leads » (/leads)

Gestion centralisée des leads capturés.

**Tableau principal :**

- Colonnes : checkbox, email, nom, source, date de capture, exporté Systeme.io (oui/non)  
- Recherche par email/nom  
- Filtre par source (quiz, page de capture, site vitrine, manuel)  
- Pagination (20 par page)  
- Sélection multiple \+ export CSV

**4 stats :**

- Total leads  
- Leads quiz  
- Exportés Systeme.io  
- Ce mois-ci

**Panel détail (Sheet latéral) :**

- Avatar \+ nom \+ email  
- Téléphone, date de capture  
- Source et origine  
- Résultat quiz (si applicable)  
- Réponses aux questions du quiz  
- Statut d'export Systeme.io  
- Actions : éditer / supprimer

**Sécurité :**

- Chiffrement AES-256-GCM par champ (email, prénom, nom, téléphone, réponses quiz)  
- Clé de chiffrement par utilisateur (DEK), wrappée par clé maître  
- Index aveugle HMAC pour recherche sur email chiffré  
- Badge de sécurité visible : « Vos données sont chiffrées de bout en bout (AES-256) »

### 4.10. Page « Mes Clients » (/clients)

Gestion centralisée des clients pour les coachs, consultants et prestataires de services.

**Positionnement :** Complémentaire à la page Leads. Un lead est un prospect capturé automatiquement ; un client est une personne avec qui l'utilisateur travaille activement. Les clients sont gérés manuellement (pas de promotion automatique depuis les leads pour l'instant).

**4 stats en haut de page :**

- Total clients
- Clients actifs
- Clients complétés
- Taux de complétion moyen

**Tableau principal :**

- Colonnes : nom, email, statut (Prospect / Actif / En pause / Complété), badges accompagnements avec progression (%), date d'ajout
- Recherche par nom/email
- Filtre par statut
- **Filtre par accompagnement** : dropdown permettant de filtrer les clients ayant un accompagnement spécifique en cours
- Pagination

**Statuts disponibles :**

| Statut | Couleur | Description |
| :---- | :---- | :---- |
| Prospect | Bleu | Client récemment ajouté, pas encore démarré |
| Actif | Vert | Accompagnement en cours |
| En pause | Jaune | Accompagnement temporairement suspendu |
| Complété | Gris | Accompagnement terminé |

**Création / Édition (Dialog modal) :**

- Nom, email, téléphone (optionnel)
- Statut
- Notes libres (textarea)

**Panel détail (Sheet latéral) :**

- Informations du client (nom, email, téléphone, statut)
- Notes
- Section « Accompagnements » (anciennement « Processus d'accompagnement ») :
  - Liste d'étapes personnalisables (ex : « Audit initial », « Plan d'action », « Suivi mensuel »)
  - Chaque étape a un statut (checkbox à cocher)
  - Barre de progression calculée automatiquement
  - Ajout/suppression d'étapes
  - **Suivi financier par accompagnement** :
    - Montant closé (montant total du deal)
    - Montant encaissé (mis à jour inline)
    - Type de paiement : comptant ou en tranches
    - Nombre de tranches (si paiement en tranches)
    - Affichage résumé : « X € encaissés sur Y € »
  - Application de « Mes accompagnements » (templates réutilisables) avec possibilité de saisir les infos de paiement lors de l'application
- Actions : éditer / supprimer / changer statut

**Section « Mes accompagnements » (anciennement « Mes Templates ») :**

- Templates de processus réutilisables pour les accompagnements clients
- Renommé "accompagnements" (FR), "programs" (EN), "programas" (ES), "programmi" (IT), "برامج" (AR)
- Création : nom, description, couleur, liste d'étapes ordonnées
- Application à un client : sélection du template + saisie optionnelle des informations de paiement (montant, type, nombre de tranches)

**Données stockées côté client (pas de chiffrement PII pour cette V1) :**

- Les clients sont des contacts gérés manuellement par l'utilisateur
- Pas de capture automatique ni d'intégration tierce

### 4.11. Page « Analytics » (/analytics)

Suivi des performances business.

**3 onglets :**

**Onglet Résultats (défaut) :**

- KPIs clés du mois en cours (revenus, ventes, inscrits, conversion)
- Résumé des performances avec tendances
- Lien vers les métriques par offre

**Onglet Saisir mes données :**

- Sélecteur de période (mois \+ année)
- Métriques manuelles :
  - Acquisition : Visiteurs, Nouveaux inscrits, Taux d'ouverture, Taux de clic
  - Conversion : Vues page de vente, Nombre de ventes, Chiffre d'affaires
- Calculs automatiques dérivés
- Boutons : Enregistrer / Enregistrer & Analyser
- Diagnostic IA déclenché après "Enregistrer & Analyser" (résumé, priorité, points forts, points d'attention)

**Onglet Historique :**

- Historique des données analytics par mois

**Métriques d'offres :**

- Suivi par offre (visiteurs, inscrits, ventes, CA, taux de conversion)
- Agrégation \+ analyse IA par offre

### 4.12. Page « Pépites » (/pepites)

Repository d'insights et de pépites business multilingues.

**Fonctionnalités :**

- Collection de pépites délivrées progressivement (intervalle 2-4 jours)
- **Traduction automatique** : chaque pépite ajoutée par l'admin est traduite automatiquement en EN, ES, IT, AR via GPT-4o-mini
- Affichage dans la langue de l'interface utilisateur (cookie `ui_locale`)
- Fallback sur FR si la traduction n'existe pas
- Assignation par `group_key` (un user ne reçoit pas la même pépite dans deux langues)
- Notifications de nouvelles pépites avec badge compteur dans la sidebar
- Interface admin pour ajouter des pépites (auto-traduit en arrière-plan)
- Script de backfill (`scripts/translate-pepites.cjs`) pour traduction en masse

**Tables :** `pepites` (avec `locale` + `group_key`), `user_pepites`, `user_pepites_state`

### 4.13. Page « Paramètres » (/settings)

**Accès :** Clic sur la photo de profil (avatar) en haut à droite du header. Le menu déroulant donne accès direct à chaque onglet.

7 onglets de configuration :

**Onglet Profil :**

- Prénom, mission, formule de niche
- Storytelling fondateur en 6 étapes :
  1. Situation Initiale
  2. Élément Déclencheur
  3. Péripéties
  4. Moment Critique
  5. Résolution
  6. Situation Finale
- Gestion des offres (avec liens)
- URLs réseaux sociaux (LinkedIn, Instagram, YouTube, TikTok, Pinterest, Threads, Facebook)
- Liens personnalisés
- Langue du contenu généré

**Onglet Connexions :**

- Connexion OAuth des réseaux sociaux (7 plateformes)
- Configuration API Systeme.io avec **nom de connexion personnalisé** (ex : "Mon projet", "Affiliation", "Client 1") — chaque projet a sa propre clé API indépendante
- Enregistrement automatique des webhooks SIO à la sauvegarde de la clé (transparent pour l'user)
- Configuration auto-commentaires  
- Gestion des tokens et rafraîchissement

**Onglet Réglages :**

- Email et mot de passe  
- Paramètres du compte  
- Langue par défaut

**Onglet Positionnement :**

- Analyse des concurrents  
- Positionnement marché  
- Définition de niche

**Onglet Branding :**

- Police de marque  
- Couleurs (base \+ accent)  
- Logo (upload)  
- Photo auteur (upload)  
- Ton de voix

**Onglet IA :**

- Panel crédits IA (consommation, solde, historique)
- Style des auto-commentaires

**Onglet Abonnement (Pricing) :**

- Plan actuel avec badge  
- Crédits disponibles / total  
- Tableau comparatif des plans  
- Consommation par type de contenu  
- Actions : Acheter crédits, Upgrade/Downgrade, Gérer abonnement

### 4.14. Constructeur de Pages (/pages)

Constructeur complet de landing pages hébergées, inspiré de Systeme.io avec branding Tipote.

**Types de pages :**

- Page de capture (lead generation)
- Page de vente (conversion)
- Site vitrine (showcase)
- Link-in-bio (page de liens personnalisée)

**Éditeur plein écran (Page Builder) :**

Layout : barre supérieure (logo + responsive toggle + actions) + sidebar gauche bleu + aperçu WYSIWYG + Chat IA intégré.

- Sidebar gauche thème bleu (fond `#1e3a5f`, texte blanc) avec 2 onglets : Builder & Paramètres
- Prévisualisation multi-device (mobile, tablette, desktop) en temps réel
- Édition de texte inline directement dans l'aperçu (contentEditable)
- Sélection d'éléments par clic (section, titre, texte, bouton, image, liste, lien, etc.)
- Panneau de propriétés contextuel par type d'élément sélectionné
- Sélecteur de couleurs inline (texte, fond, bordures)

**Dégradés (Gradients) :**

- Support dégradé linéaire sur fonds de section, rangées et boutons
- Contrôle couleur 1, couleur 2 et angle (0-360°)
- Suppression du dégradé en un clic

**Polices Google Fonts :**

- 20 polices Google pré-sélectionnées (Inter, Poppins, Montserrat, Playfair Display, etc.)
- Sélecteur de police par élément
- Chargement automatique des fonts dans l'aperçu

**Animations CSS :**

- 8 animations disponibles : Fondu, Fondu+haut, Glisser gauche/droite, Zoom, Rebond, Pulsation
- Applicable à tout élément sélectionné

**Styles avancés par élément :**

- Taille de police (10-72px), graisse (Normal, Semi, Gras, Noir)
- Alignement texte (gauche, centre, droite)
- Marges (haut/bas en px)
- Padding (vertical/horizontal) pour sections et rangées
- Bordures (épaisseur, couleur, style) pour boutons
- Arrondi (border-radius) pour boutons, images et rangées

**Palette d'éléments (ajout) :**

- Section, Rangée, Titre, Texte, Bouton, Image, Vidéo, Séparateur, Colonnes (3), Lien
- Ajout en un clic dans la section active

**Duplication d'éléments :**

- Bouton de duplication sur chaque élément sélectionné
- Clone complet (styles + contenu) inséré après l'original

**Gestion des sections :**

- Liste des sections dans la sidebar avec labels auto-détectés
- **ID ancre sur chaque section** (`id="sc-hero"`, `sc-benefits"`, `sc-program"`, `sc-about"`, `sc-testimonials"`, `sc-pricing"`, `sc-faq"`, `sc-services"`, `sc-contact"`, etc.) pour ciblage via liens et menus
- Réorganisation (monter/descendre)
- Suppression de section
- Sélection de section par clic

**Chat IA intégré (compact, 180px) :**

- Chat conversationnel pour modifier la page par instructions naturelles
- Reformulation IA avant application
- Coût 0.5 crédit par modification
- Annulation (undo) de la dernière modification
- Suggestions contextuelles par type de page
- Indication visuelle de l'élément sélectionné pour modifications ciblées

**Design pages publiques :**

- Sections alternées avec contraste visible (fond `--gray-100` pour les sections `.alt`)
- Ombres portées sur les cards (bénéfices, témoignages, FAQ) pour une meilleure lisibilité
- Pas d'illustrations SVG abstraites sans valeur ajoutée

**Publication & configuration :**

- Publication avec slug personnalisé
- Configuration Systeme.io (tags de capture)
- OG Image uploader
- Meta description SEO
- Tracking pixels (Facebook Pixel, Google Tag)
- Page de remerciement configurable (capture uniquement)

**Exports & analytics :**

- Téléchargement HTML / PDF
- Analytics intégrés (vues, leads, taux conversion)
- Export leads CSV
- QR Code de partage

**Sanitisation HTML (défense en profondeur) :**

- Nettoyage serveur (`lib/sanitizeHtml.ts`) à chaque sauvegarde de `html_snapshot` pour supprimer les artefacts de l'éditeur (scripts injectés, overlays toolbar, highlights de sélection)
- Nettoyage client dans `PublicPageClient.tsx` avec CSS safety net + script DOM cleanup dans l'iframe
- Endpoint admin `/api/admin/sanitize-pages` pour nettoyage en masse des pages existantes
- Détection par signatures (classes CSS, z-index, contenu de script) plutôt que par attributs seuls

**Pages publiques :** Accessibles via `/p/[slug]`

### 4.15. Système de Quiz (/quiz)

Constructeur de quiz interactifs pour capture de leads.

**Modes de création :**

- Génération de quiz par IA
- Création manuelle de zéro
- Import d'un quiz existant

**Fonctionnalités :**

- Éditeur de questions/réponses
- Page publique de quiz (`/q/[quizId]`) — **bouton CTA adaptatif** (hauteur auto, plus de troncature)
- Capture d'email + prénom + nom + téléphone + pays (configurable)
- Résultats personnalisés avec CTA par résultat
- **Automations Systeme.io par résultat** (3 actions configurables en un clic) :
  - Tag SIO auto-appliqué
  - Inscription auto dans une **formation SIO** (`sio_course_id`)
  - Ajout auto à une **communauté SIO** (`sio_community_id`)
- **Enrichissement contact SIO** : le résultat du quiz est stocké comme champ personnalisé sur le contact
- Sync leads vers Systeme.io (**avec prénom, nom, téléphone, pays** — corrigé)
- Stats : vues, partages, leads capturés

### 4.16. Coach IA

Bulle flottante de conversation avec coach IA.

**Disponibilité :**

- Free/Basic : verrouillé (CTA upgrade)  
- Pro/Elite : inclus (illimité, pas de consommation de crédits)

**Fonctionnalités :**

- Accès à toutes les données du profil business  
- Réponses personnalisées contextuelles  
- Suggestions basées sur la progression  
- Historique des conversations  
- Panneau latéral avec header "Coach IA"

### 4.17. Didacticiel interactif

Système de tutorial guidé pas-à-pas pour les nouveaux utilisateurs.

**Objectif :** Présenter chaque section clairement et simplement, puis insister sur l'importance de compléter les réglages (offres, positionnement, persona, branding) AVANT de commencer à créer du contenu.

**19 phases séquentielles :**

1. Welcome (modal de bienvenue — présente le tour + insiste sur l'importance des réglages)
2. Tour Aujourd'hui — dashboard avec tâches prioritaires et progression
3. Tour Stratégie — plan d'action personnalisé en 3 phases
4. Tour Créer — hub de création de contenus (posts, emails, articles, etc.)
5. Tour Contenus — organisation et calendrier éditorial
6. Tour Templates — modèles Systeme.io téléchargeables
7. Tour Crédits — compteur de crédits IA (en haut à droite)
8. Tour Analytics — suivi des performances avec diagnostic IA
9. Tour Pépites — insights et conseils business
10. Tour Paramètres/Profil — infos perso, offres, storytelling (accès via avatar en haut à droite)
11. Tour Paramètres/Connexions — connexion des réseaux sociaux et Systeme.io
12. Tour Paramètres/Réglages — langue et infos clés sur l'activité
13. Tour Paramètres/Positionnement — LE réglage le plus important pour des contenus personnalisés
14. Tour Paramètres/Branding — couleurs, polices, logo
15. Tour Paramètres/IA — crédits et style auto-commentaires
16. Tour Paramètres/Abonnement — gestion du plan
17. Tour Coach — conseiller IA personnel (Pro/Elite)
18. Completion (modal de fin — rappelle l'importance de compléter offres, positionnement et persona)

**UX :**

- Tooltips avec compteur d'étapes ("3 / 17")
- Spotlight sur les éléments ciblés (portal-based)
- Opt-out visible (lien souligné, pas checkbox)
- Fenêtre : 7 premiers jours seulement
- Peut être relancé ou réactivé via le bouton d'aide flottant
- Paramètres accessibles via la photo de profil en haut à droite (plus dans la sidebar)

### 4.18. Système de Notifications

**Types :**

- Auto (déclenchées par le système)  
- Admin broadcast (envoyées par l'admin à tous)  
- Personnelles
- **Ventes SIO temps réel** (type `sale` / `sale_canceled`) — messages traduits dans les 5 langues

**Interface :**

- Cloche dans le header avec compteur d'unread  
- Panel de notifications avec deep-linking  
- **Clic pour ouvrir** : le body s'étend pour afficher le texte complet
- **Marquage lu automatique** à la fermeture (pas à l'ouverture, pour laisser le temps de lire)
- Marquage lu/archivé manuel via icônes

### 4.19. Page « Widgets » (/widgets)

Gestion des widgets embarquables à intégrer sur les pages externes (sites, landing pages, pages Systeme.io, etc.).

#### 4.19.1. Notifications de preuve sociale (Toast)

Pop-ups de type « social proof » affichés sur les pages de l'utilisateur pour renforcer la confiance et l'urgence.

**Sources d'événements :**

- Nombre de visiteurs en temps réel (`{count} personnes consultent cette page`)
- Inscriptions récentes (`{name} vient de s'inscrire`)
- Achats récents (`{name} vient d'acheter`)
- Messages personnalisés (promo, urgence, rareté — ex : « Plus que 3 places disponibles »)

**Paramètres de configuration :**

- **Position** : bottom-left, bottom-right, top-left, top-right
- **Thème** : light, dark, minimal
- **Couleur d'accent** : sélecteur de couleur personnalisé
- **Coins** : arrondis ou carrés
- **Durée d'affichage** : 3 à 15 secondes (configurable)
- **Délai entre les toasts** : 5 à 60 secondes (configurable)
- **Max par session** : 1 à 50 notifications
- **Anonymisation** : délai configurable en heures (protection RGPD)
- **Labels personnalisables** : texte avec variables `{count}`, `{name}` (traduits dans les 5 langues)

**Intégration :**

- Snippet `<script>` à copier/coller sur le site cible
- Script JS autonome (`/widgets/toast-widget.js`) hébergé sur Tipote
- Communication via API Supabase (événements + config)
- Activation/désactivation par widget (toggle ON/OFF)

**Interface dashboard :**

- Liste des widgets toast avec badge actif/inactif
- Vue création/édition avec aperçu en temps réel
- Grille responsive : 1 colonne mobile, 2 colonnes tablette, 3 colonnes desktop
- Historique des événements récents (avec badge type d'événement)

#### 4.19.2. Boutons de partage social (Share)

Widget de boutons de partage social embarquable, permettant aux visiteurs de partager le contenu sur leurs réseaux.

**Plateformes supportées (7) :**

- Facebook, X (Twitter), LinkedIn, WhatsApp, Telegram, Reddit, Pinterest, Email

**Modes d'affichage :**

- **Inline** : intégré dans le flux de la page
- **Floating left** : barre flottante à gauche (masquée sur mobile < 640px)
- **Floating right** : barre flottante à droite (masquée sur mobile < 640px)
- **Bottom bar** : barre fixe en bas de page (labels masqués sur mobile, icônes seules)

**Options de personnalisation :**

- **Style de bouton** : rounded, square, circle, pill
- **Taille** : small (32px), medium (40px), large (48px)
- **Mode couleur** : couleurs de marque officielles, mono clair, mono sombre, couleur personnalisée (hex)
- **Afficher/masquer les labels** (noms des plateformes)
- **Texte de partage** : message pré-rempli pour les partages (optionnel)
- **Hashtags** : hashtags séparés par des virgules, ajoutés automatiquement (Twitter, LinkedIn)

**Intégration :**

- Snippet `<script>` avec `data-tipote-share` à copier/coller
- Script JS autonome (`/widgets/social-share.js`) hébergé sur Tipote
- Utilise les API de partage natives de chaque plateforme (URLs d'intent)
- `flex-wrap` + media queries pour adaptation mobile automatique

**Interface dashboard :**

- Liste des widgets share avec badge actif/inactif
- Vue création/édition avec aperçu live de l'overlay
- Sélection des plateformes via grille de checkboxes (2 col mobile, 4 col desktop)
- Code d'intégration copiable avec bouton Copy

### 4.20. Pages légales

Pages dynamiques via `/legal/[slug]` :

- Conditions d'utilisation  
- Politique de confidentialité  
- Mentions légales  
- CGV

### 4.21. Backoffice Admin (/admin)

Accès restreint aux emails admin.

**Fonctionnalités :**

- Vue utilisateurs (search, filtres par plan)  
- Modifier plan, reset password, désactiver  
- Broadcast de notifications  
- Attribution de crédits bonus  
- Opérations en masse  
- Logs de changements de plan (audit trail)

---

## 5\. INTERCONNEXIONS DES DONNÉES

### 5.1. Matrice des déclencheurs

| Événement | Déclenche | Mécanisme |
| :---- | :---- | :---- |
| Modification des offres (réglages) | Mise à jour tâches plan d'action | IA Niveau 1 recalcule |
| Création d'offre (hub Créer) | Ajout aux offres \+ nouvelles tâches | Insertion auto |
| Tâche cochée | MAJ progression \+ stats dashboard | Recalcul temps réel |
| Contenu généré | Ajout content\_item \+ consommation crédits | Insert DB \+ décrément |
| Post publié sur réseau social | MAJ statut \+ stockage post\_id/post\_url | Callback API |
| Modification persona | MAJ contexte génération contenu | personas.persona\_json update |
| Lead capturé (quiz/page) | Insert leads (chiffré) \+ notification | Insert \+ trigger |
| Étape accompagnement client cochée | MAJ progression client \+ stats | Recalcul temps réel |
| Montant encaissé mis à jour | MAJ résumé financier accompagnement | Update inline |
| Commentaire détecté (automation) | Auto-reply \+ log \+ consommation crédit | Webhook \+ Claude |
| Analytics renseignés | Diagnostic IA | Trigger analyse |
| Clé API SIO sauvegardée | Enregistrement auto 3 webhooks SIO | Fire-and-forget async |
| Vente SIO (webhook) | Insert sio\_sales \+ MAJ offer\_metrics \+ toast\_event \+ notification | Webhook receiver |
| Annulation SIO (webhook) | MAJ sio\_sales \+ décrémentation offer\_metrics \+ notification | Webhook receiver |
| Contact SIO créé (webhook) | Upsert leads | Webhook receiver |
| Quiz résultat obtenu | Tag SIO \+ enrichissement contact \+ inscription formation \+ ajout communauté | Fire-and-forget async |

### 5.2. Flux de données

Onboarding → business\_profiles → personas

    → business\_plan (offres \+ tâches)

        → Créer (contexte pré-rempli)

            → content\_item → social/publish (réseaux sociaux)

                → analytics

Quiz/Pages → leads (chiffré) → export CSV / Systeme.io
    Quiz résultat → tag SIO + enrichissement contact + inscription formation + communauté

Systeme.io (webhooks user) → sio\_sales → offer\_metrics + toast\_events + notifications → coach IA

Automatisations → auto\_comment\_logs → webhook\_logs

---

## 6\. ARCHITECTURE TECHNIQUE

### 6.1. Stack

| Composant | Technologie |
| :---- | :---- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| UI Components | shadcn/ui |
| Internationalisation | next-intl (5 langues) |
| Backend | API Routes Next.js |
| Base de données | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Stockage fichiers | Supabase Storage (images \+ vidéos) |
| IA Stratégique | OpenAI GPT (clé propriétaire) |
| IA Contenu | Claude Anthropic (clé propriétaire) |
| Social OAuth | LinkedIn, Meta, Twitter, TikTok, Pinterest |
| Automatisations | n8n (webhooks) |
| CRM / Paiement | Systeme.io (API \+ webhooks) |
| Chiffrement | AES-256-GCM (tokens \+ PII) |
| Hosting | Hostinger VPS |
| Process Manager | PM2 |

### 6.2. Tables Supabase principales

**Profil & Auth :**

- `users` — id, email, locale, timezone, plan, is\_owner, onboarding\_completed, sio\_contact\_id  
- `business_profiles` — profil business, diagnostic, storytelling (JSONB), offres  
- `personas` — persona\_json (role \= client\_ideal)

**Stratégie :**

- `business_plan` — plan\_json (offres \+ phases)
- `project_tasks` — tâches avec statut, soft delete

**Contenu :**

- `content_item` — type, title, content, status, scheduled\_date, channel, tags, meta (JSONB), ai\_provider\_used, credits\_consumed

**Social :**

- `social_connections` — tokens OAuth chiffrés (AES-256-GCM) pour 7 plateformes
- `social_automations` — comment-to-DM/email, trigger keywords  
- `auto_comment_logs` — logs d'exécution des auto-commentaires  
- `automation_credits` — crédits d'automatisation

**Pages & Quiz :**

- `hosted_pages` — pages hébergées (capture, vente, vitrine, link-in-bio) avec slug, analytics, pixels
- `page_leads` — leads capturés par les pages  
- `page_clicks` — tracking des clics  
- `quizzes` — quiz avec questions, résultats, CTA  
- `quiz_leads` — leads capturés par les quiz

**Clients :**

- `clients` — clients gérés manuellement (nom, email, téléphone, statut, notes, lead_id)
- `client_templates` — templates d'accompagnement réutilisables (nom, description, couleur)
- `client_template_items` — étapes d'un template (title, position)
- `client_processes` — accompagnements appliqués à un client (name, status, template_id, due_date, amount_total, amount_collected, payment_type, installments_count)
- `client_process_items` — étapes d'un accompagnement en cours (title, is_done, position, due_date)

**Leads :**

- `leads` — leads unifiés (toutes sources), champs chiffrés (email\_encrypted, first\_name\_encrypted, etc.), blind index HMAC  
- `user_encryption_keys` — DEK wrappées par clé maître (par utilisateur)

**Billing :**

- `user_credits` — balance, monthly\_allotment, total\_purchased, total\_consumed  
- `user_credits_transactions` — historique audité des mouvements

**Analytics :**

- `offer_metrics` — métriques par offre par mois (alimenté auto par webhooks SIO NEW_SALE)
- `analytics_entries` — données analytics manuelles

**Systeme.io (utilisateur) :**

- `sio_sales` — ventes SIO de l'user (montant, client, offre, statut, payload brut)
- `sio_webhook_registrations` — webhooks enregistrés par user (event_type, secret_token, statut, last_received_at)

**Notifications :**

- `notifications` — auto, admin broadcast, personnelles, ventes SIO temps réel

**Widgets :**

- `toast_widgets` — configuration des widgets toast (position, thème, durée, sources d'événements, messages personnalisés)
- `toast_events` — événements enregistrés (signup, purchase, visitor_count) avec anonymisation configurable
- `share_widgets` — configuration des widgets de partage social (plateformes, style, taille, mode d'affichage, couleurs)

**Admin :**

- `plan_change_log` — audit des changements de plan  
- `plan_assignments` — attributions de crédits bonus  
- `webhook_logs` — logs de debugging des webhooks

**Toutes les tables utilisent Row Level Security (RLS).**

### 6.3. Routes API (150+ endpoints)

**Auth & Compte :**

- POST /api/account/delete, /ensure-profile, /reset  
- GET/POST /api/auth/{linkedin,twitter,tiktok,pinterest,instagram,meta,threads}/callback

**Social :**

- POST /api/social/publish — Publication directe (7 plateformes, images, vidéos, carrousels)
- GET /api/social/connections  
- GET /api/social/{linkedin-posts, facebook-posts, instagram-posts, twitter-tweets, tiktok-videos, pinterest-boards}

**Contenu :**

- POST /api/content/generate — Génération IA  
- POST /api/content/refine — Raffinement  
- POST /api/content/strategy/generate-all — Génération en masse  
- PATCH /api/content/\[id\] — Mise à jour  
- POST /api/content/\[id\]/duplicate

**Pages :**

- POST /api/pages/generate — Génération IA de page  
- GET/PATCH /api/pages/\[pageId\]  
- POST /api/pages/\[pageId\]/publish  
- GET /api/pages/public/\[slug\] — Rendu public

**Quiz :**

- POST /api/quiz/generate  
- GET/POST /api/quiz/\[quizId\]  
- GET /api/quiz/\[quizId\]/public  
- POST /api/quiz/\[quizId\]/sync-systeme

**Clients :**

- GET/POST /api/clients — Liste \+ création (GET inclut process\_summaries par client)
- GET/PATCH/DELETE /api/clients/\[id\]
- POST /api/client-processes — Créer un accompagnement (appliquer un template à un client, avec infos de paiement)
- PATCH /api/client-processes/\[processId\] — Mise à jour d'un accompagnement (statut, paiement, échéance)
- PATCH /api/client-processes/\[processId\]/items/\[itemId\] — Toggle étape
- GET/POST /api/client-templates — CRUD templates d'accompagnement

**Leads :**

- GET/POST /api/leads — Liste \+ création (avec chiffrement)
- GET/PATCH/DELETE /api/leads/\[id\]
- GET /api/leads/export — Export CSV (avec déchiffrement)

**Analytics :**

- POST /api/analytics/analyze-metrics — Analyse IA  
- GET/POST /api/analytics/offer-metrics

**Automatisations :**

- POST /api/automations/{linkedin,instagram,twitter,tiktok}-comments  
- POST /api/automations/webhook — Webhook Meta  
- POST /api/n8n/{linkedin, publish-callback, scheduled-posts}

**Systeme.io (utilisateur) :**

- POST /api/systeme-io/user-webhook — Réception webhooks SIO (NEW\_SALE, SALE\_CANCELED, CONTACT\_CREATED)
- GET /api/systeme-io/tags — Tags SIO de l'user
- GET /api/systeme-io/courses — Formations SIO de l'user
- GET /api/systeme-io/communities — Communautés SIO de l'user

**Billing :**

- POST /api/billing/subscription — Webhook Systeme.io  
- GET /api/credits/balance

**Widgets :**

- GET/POST /api/widgets/toast — CRUD widgets toast
- GET/POST /api/widgets/toast/events — événements de preuve sociale
- GET/POST /api/widgets/share — CRUD widgets partage social

**Admin :**

- POST /api/admin/{users, notifications, bulk}
- POST /api/admin/sanitize-pages — Nettoyage en masse des html\_snapshot (artefacts éditeur)

### 6.4. Variables d'environnement

**Supabase :**

- NEXT\_PUBLIC\_SUPABASE\_URL, NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY, SUPABASE\_SERVICE\_ROLE\_KEY

**Application :**

- NEXT\_PUBLIC\_APP\_URL, NODE\_ENV

**IA :**

- CLAUDE\_API\_KEY\_OWNER / ANTHROPIC\_API\_KEY — Claude Anthropic  
- OPENAI\_API\_KEY\_OWNER / OPENAI\_API\_KEY — OpenAI  
- TIPOTE\_CLAUDE\_MODEL, TIPOTE\_OPENAI\_MODEL, TIPOTE\_ARTICLE\_MAX\_TOKENS

**Chiffrement :**

- SOCIAL\_TOKENS\_ENCRYPTION\_KEY — AES-256 pour tokens OAuth  
- PII\_MASTER\_KEY — Clé maître chiffrement PII (64 hex)  
- PII\_HMAC\_SECRET — Secret HMAC pour blind indexes (64 hex)

**OAuth Réseaux Sociaux :**

- LINKEDIN\_CLIENT\_ID, LINKEDIN\_CLIENT\_SECRET  
- META\_APP\_ID, META\_APP\_SECRET, META\_WEBHOOK\_VERIFY\_TOKEN  
- INSTAGRAM\_APP\_ID, INSTAGRAM\_APP\_SECRET  
- THREADS\_APP\_ID, THREADS\_APP\_SECRET  
- TWITTER\_CLIENT\_ID, TWITTER\_CLIENT\_SECRET  
- TIKTOK\_CLIENT\_KEY, TIKTOK\_CLIENT\_SECRET  
- PINTEREST\_APP\_ID, PINTEREST\_APP\_SECRET

**Intégrations :**

- SYSTEME\_IO\_API\_KEY  
- N8N\_WEBHOOK\_BASE\_URL, N8N\_SHARED\_SECRET  
- MESSENGER\_PAGE\_ACCESS\_TOKEN

---

## 7\. SÉCURITÉ

### 7.1. Authentification

- JWT tokens avec expiration (Supabase Auth)  
- Refresh tokens  
- OAuth 2.0 avec PKCE (Twitter/X)  
- CSRF tokens pour tous les flux OAuth

### 7.2. Chiffrement des données

- **Tokens OAuth** : AES-256-GCM (env SOCIAL\_TOKENS\_ENCRYPTION\_KEY)  
- **PII des leads** : AES-256-GCM par utilisateur avec DEK individuelle  
  - Clé par utilisateur wrappée par clé maître  
  - Index aveugle HMAC-SHA256 pour recherche sur champs chiffrés  
  - Ni l'admin ni un pirate ayant accès à la DB ne peut lire les données

### 7.3. Row Level Security

- RLS activé sur toutes les tables utilisateur  
- Chaque utilisateur ne voit que ses propres données  
- Service role pour les opérations admin

### 7.4. Webhooks

- Validation signature HMAC (Meta X-Hub-Signature-256)  
- Secret partagé pour n8n  
- Logs de debugging

---

## 8\. MONÉTISATION

### 8.1. Plans et tarification

|  | Free | Basic | Pro | Elite |
| :---- | :---- | :---- | :---- | :---- |
| **Prix mensuel** | 0€ | 19€ | 49€ | 99€ |
| **Prix annuel** | — | 190€ | 490€ | 990€ |
| **Crédits IA/mois** | 25 (one-shot) | 40 | 150 | 500 |
| **Tous les modules** | Oui | Oui | Oui | Oui |
| **Publication directe** | Oui | Oui | Oui | Oui |
| **Auto-commentaires** | Non | Oui | Oui | Oui |
| **Coach IA** | Non | Non | Oui | Oui |
| **Multi-projets** | Non | Non | Non | Oui |

*Note : Plan "beta" (150 crédits/mois) existe pour les early adopters lifetime.*

### 8.2. Système de crédits

- 1 crédit ≈ 0.01€ de coûts IA réels  
- Renouvellement mensuel (sauf Free \= one-shot)  
- Crédits non cumulables d'un mois à l'autre  
- Auto-commentaires : 0.25 crédit par commentaire

### 8.3. Packs supplémentaires (Systeme.io)

| Pack | Crédits | Prix |
| :---- | :---- | :---- |
| Starter | 25 | 3€ |
| Standard | 100 | 10€ |
| Pro | 250 | 22€ |

- Pas d'expiration  
- S'ajoutent au solde existant  
- Consommés après les crédits mensuels (FIFO)

---

## 9\. INTÉGRATION SYSTEME.IO

**Note :** Systeme.io est également disponible en whitelabel sur la plateforme Tipote.

### 9.1. Webhook plateforme (abonnements Tipote)

- Réception du payload (email, plan, product\_id, sio\_contact\_id)  
- Création de compte si inexistant  
- Upgrade plan \+ attribution crédits  
- Email de bienvenue
- Webhook annulation → rétrogradation vers plan Free (conservation données 90 jours)

### 9.2. Clé API utilisateur (multi-projet)

- Chaque projet Tipote a sa propre clé API SIO, indépendante
- Nom de connexion personnalisable (ex: "Mon projet", "Affiliation", "Client 1")
- La même clé API peut être utilisée dans plusieurs projets
- Stockage dans `business_profiles.sio_user_api_key` + `sio_api_key_name`

### 9.3. Webhooks utilisateur (automatiques, transparents)

À la sauvegarde de la clé API, Tipote enregistre automatiquement 3 webhooks sur le compte SIO de l'user :

| Événement SIO | Action Tipote |
| :---- | :---- |
| **NEW_SALE** | Insert `sio_sales` + MAJ `offer_metrics` (CA + ventes) + toast widget (preuve sociale) + notification i18n |
| **SALE_CANCELED** | MAJ statut `sio_sales` + décrémentation `offer_metrics` + notification |
| **CONTACT_CREATED** | Upsert dans `leads` (source: systeme_io) |

**Architecture :** Chaque user a un secret token unique dans l'URL du webhook (`/api/systeme-io/user-webhook?token=<secret>`). Les webhooks plateforme (`/api/systeme-io/webhook`) et utilisateur sont séparés.

### 9.4. Sync leads quiz/pages → SIO

- Export leads de quiz vers Systeme.io (avec prénom, nom, téléphone, pays)
- Tags de capture configurables par page et par résultat de quiz
- **Enrichissement contact** : le résultat du quiz est ajouté comme champ personnalisé `tipote_quiz_result`

### 9.5. Automations quiz → SIO (par résultat)

Chaque résultat de quiz peut déclencher 3 actions SIO configurables :

- **Tag** : appliqué automatiquement au contact
- **Formation** : inscription auto dans un cours SIO (`POST /school/courses/{id}/enrollments`)
- **Communauté** : ajout auto à une communauté SIO (`POST /community/communities/{id}/memberships`)

Les cours et communautés disponibles sont récupérés via l'API SIO (`GET /api/systeme-io/courses`, `GET /api/systeme-io/communities`).

### 9.6. Alimentation du coach IA

Les 50 dernières ventes SIO sont injectées dans le contexte du coach IA :
- CA total, nombre de ventes, ventilation par offre
- 10 dernières transactions détaillées
- Combiné avec `offer_metrics` pour une analyse stratégique basée sur les vrais chiffres

### 9.7. Tables SIO

- `sio_sales` — historique des ventes (montant, client, offre, statut)
- `sio_webhook_registrations` — webhooks enregistrés par user (event_type, secret_token, statut)

---

## 10\. LANGUES SUPPORTÉES

| Code | Langue | Statut |
| :---- | :---- | :---- |
| fr | Français | Complet |
| en | English | Complet |
| es | Español | Complet |
| it | Italiano | Complet |
| ar | العربية | Complet |

Gestion via next-intl avec fichiers de messages (\~1800+ clés par langue).

---

## 11\. DESIGN SYSTEM

### Règle de parité Lovable (Pixel-perfect)

- La maquette Lovable est la source de vérité UI/UX  
- 1 client component par page : `components/<domaine>/<PageName>LovableClient.tsx`  
- Page server : `app/<route>/page.tsx` \= wrapper auth \+ fetch \+ return client component  
- Composants UI : shadcn/ui (Card, Button, Badge, Input, Select, Sheet, Dialog, Table, etc.)  
- Framework CSS : Tailwind CSS

---

## 12\. ROADMAP

### V1 (État actuel — Mars 2026\) ✅

- Architecture complète (9+ pages principales)  
- Onboarding intelligent  
- Plan stratégique IA avec offres personnalisées  
- Hub création unifié (8 types de contenu)  
- **Publication directe sur 7 réseaux sociaux**
- **Automatisations** (auto-commentaires, comment-to-DM/email)  
- **Constructeur de pages** (capture, vente, vitrine, link-in-bio)  
- **Système de quiz** avec capture de leads  
- **Gestion des leads** avec chiffrement AES-256
- **Gestion des clients** (suivi, notes, statuts, accompagnements avec suivi financier et progression)
- Calendrier éditorial (édition des posts programmés)  
- Système de crédits (achat \+ consommation)  
- Templates Systeme.io  
- Analytics avec diagnostic IA  
- Coach IA (Pro/Elite)  
- Pépites (insights)  
- Didacticiel interactif complet  
- Notifications
- **Widgets embarquables** (notifications preuve sociale + boutons de partage social)
- Multi-projets (Elite)  
- Storytelling fondateur  
- Branding personnalisé  
- 5 langues (FR/EN/ES/IT/AR)  
- Intégration Systeme.io (webhooks \+ sync leads)  
- Intégration n8n  
- Backoffice admin

### V2 (Prochaines étapes)

- Génération images IA  
- Blog auto-publishing  
- Ads Engine (création de publicités)  
- App mobile

---

*— Fin du cahier des charges — Mars 2026*  
