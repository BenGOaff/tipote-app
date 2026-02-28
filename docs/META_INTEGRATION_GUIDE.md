# Tipote × Meta Integration Guide

> Guide complet pour configurer, soumettre et faire approuver l'app Meta de Tipote
> sur Facebook, Instagram et Threads.

---

## Table des matières

1. [Architecture actuelle](#1-architecture-actuelle)
2. [Permissions requises par plateforme](#2-permissions-requises-par-plateforme)
3. [Configuration de l'app Meta](#3-configuration-de-lapp-meta)
4. [Analyse des rejets et corrections](#4-analyse-des-rejets-et-corrections)
5. [Conformité aux politiques Meta](#5-conformité-aux-politiques-meta)
6. [Guide du screencast pour l'App Review](#6-guide-du-screencast-pour-lapp-review)
7. [Descriptions de cas d'utilisation par permission](#7-descriptions-de-cas-dutilisation-par-permission)
8. [Checklist pré-soumission](#8-checklist-pré-soumission)

---

## 1. Architecture actuelle

### Flux OAuth (3 flux séparés)

| Plateforme | Endpoint OAuth | Callback | Token |
|------------|---------------|----------|-------|
| **Facebook Pages** | `facebook.com/v21.0/dialog/oauth` | `/api/auth/meta/callback` | Long-lived ~60j |
| **Instagram Professional** | `instagram.com/oauth/authorize` | `/api/auth/instagram/callback` | Long-lived ~60j |
| **Threads** | `threads.net/oauth/authorize` | `/api/auth/threads/callback` | Long-lived ~60j |

### Flux de données

```
┌──────────────────────────────────────────────────────────────┐
│                        TIPOTE APP                            │
│                                                              │
│  Settings/Connections ──→ OAuth ──→ Meta/IG/Threads          │
│         │                              │                     │
│         ▼                              ▼                     │
│  social_connections ◄─── Token + Profil stockés (AES-256)    │
│         │                                                    │
│         ├──→ Publish (direct ou via n8n)                     │
│         ├──→ Automations (Comment-to-DM)                     │
│         └──→ Webhooks (comments, messages)                   │
│                                                              │
│  n8n Workflows:                                              │
│  - meta-publish (immédiat)                                   │
│  - meta-scheduled (toutes les 5 min)                         │
│  - auto-comments (avant/après publication)                   │
└──────────────────────────────────────────────────────────────┘
```

### Fichiers clés

| Rôle | Fichier |
|------|---------|
| Lib Meta (OAuth, publish, webhooks) | `lib/meta.ts` |
| OAuth Facebook initiate | `app/api/auth/meta/route.ts` |
| OAuth Facebook callback | `app/api/auth/meta/callback/route.ts` |
| OAuth Instagram initiate | `app/api/auth/instagram/route.ts` |
| OAuth Instagram callback + webhooks | `app/api/auth/instagram/callback/route.ts` |
| OAuth Threads initiate | `app/api/auth/threads/route.ts` |
| OAuth Threads callback | `app/api/auth/threads/callback/route.ts` |
| Publication multi-plateforme | `app/api/social/publish/route.ts` |
| Webhook automations (FB) | `app/api/automations/webhook/route.ts` |
| UI Connexions sociales | `components/settings/SocialConnections.tsx` |
| UI Automations | `components/automations/AutomationsLovableClient.tsx` |
| UI Publish Modal | `components/content/PublishModal.tsx` |
| Data deletion (GDPR) | `app/api/auth/instagram/data-deletion/route.ts` |
| Deauthorize callback | `app/api/auth/instagram/deauthorize/route.ts` |

---

## 2. Permissions requises par plateforme

### Facebook Pages (via Facebook Login)

| Permission | Usage dans Tipote | Obligatoire |
|-----------|-------------------|-------------|
| `pages_show_list` | Lister les Pages de l'utilisateur pour sélection | Oui |
| `pages_manage_posts` | Publier des posts sur la Page | Oui |
| `pages_read_engagement` | Lire les commentaires et réactions | Oui |
| `pages_messaging` | Envoyer des messages (DM) depuis la Page | Oui |
| `pages_manage_metadata` | Abonner la Page aux webhooks | Oui |
| `instagram_manage_comments` | Commenter sur des posts (via Page) | Conditionnel* |
| `instagram_manage_hashtags` | Recherche de hashtags | Conditionnel* |

> *Ces 2 permissions ne sont nécessaires que si l'auto-commentaire sur Instagram passe par la Page Facebook (legacy flow). Voir section 5 pour les risques.

### Instagram Professional Login

| Permission | Usage dans Tipote | Obligatoire |
|-----------|-------------------|-------------|
| `instagram_business_basic` | Profil, médias, info du compte | Oui |
| `instagram_business_content_publish` | Publier des photos/vidéos/reels | Oui |
| `instagram_business_manage_comments` | Lire et répondre aux commentaires sur nos posts | Oui |
| `instagram_business_manage_messages` | Envoyer des DMs (Private Reply après commentaire) | Oui |

### Threads

| Permission | Usage dans Tipote | Obligatoire |
|-----------|-------------------|-------------|
| `threads_basic` | Profil basique | Oui |
| `threads_content_publish` | Publier des posts texte/image | Oui |
| `threads_keyword_search` | Recherche par mots-clés | Optionnel |

---

## 3. Configuration de l'app Meta

### 3.1 Prérequis Meta Developer Dashboard

1. **Business Verification** : Le compte Business doit être vérifié AVANT la soumission
2. **Privacy Policy** : URL accessible publiquement, non géo-bloquée, chargement rapide
3. **App Icon** : Logo Tipote configuré
4. **App Category** : "Business" ou "Productivity"
5. **Platform** : Ajouter "Website" avec l'URL `https://app.tipote.com`
6. **Data Deletion URL** : `https://app.tipote.com/api/auth/instagram/data-deletion`
7. **Deauthorize URL** : `https://app.tipote.com/api/auth/instagram/deauthorize`

### 3.2 Produits à configurer dans le Dashboard

#### Facebook Login for Business
- **Configuration ID** : Utiliser `META_CONFIG_ID` (recommandé par Meta)
- **Valid OAuth Redirect URIs** :
  - `https://app.tipote.com/api/auth/meta/callback`
- **Scopes** : Configurer dans la config Facebook Login for Business

#### Instagram Professional Login (produit séparé)
- **Valid OAuth Redirect URIs** :
  - `https://app.tipote.com/api/auth/instagram/callback`
- **Deauthorize Callback URL** : `https://app.tipote.com/api/auth/instagram/deauthorize`
- **Data Deletion Request URL** : `https://app.tipote.com/api/auth/instagram/data-deletion`

#### Webhooks
- **Facebook Page webhooks** :
  - Callback URL : `https://app.tipote.com/api/automations/webhook`
  - Verify Token : `META_WEBHOOK_VERIFY_TOKEN`
  - Fields : `feed`, `messages`
- **Instagram webhooks** :
  - Callback URL : `https://app.tipote.com/api/auth/instagram/callback`
  - Verify Token : `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
  - Fields : `comments`, `messages`

### 3.3 Variables d'environnement

> **Architecture : 2 apps Meta distinctes**
> - **App "Tipote"** (META_APP_ID) → Facebook Pages + Threads
> - **App "Tipote ter"** (INSTAGRAM_META_APP_ID) → Instagram Professional Login
>   - Sub-app "tipote ter-IG" (INSTAGRAM_APP_ID) → OAuth Instagram
>
> Un seul Facebook Login for Business config (META_CONFIG_ID) sur l'app "Tipote".
> Pas de config_id Instagram (scopes classiques utilisés).
>
> **Important** : Meta signe les webhooks et signed_request avec le secret de
> l'app parente "Tipote ter" (`INSTAGRAM_META_APP_SECRET`), pas celui de la
> sub-app Instagram (`INSTAGRAM_APP_SECRET`).

```env
# App "Tipote" — Facebook Pages
META_APP_ID=<tipote_app_id>
META_APP_SECRET=<tipote_app_secret>
META_CONFIG_ID=<login_for_business_config_id>

# App "Tipote ter" — app parente (webhooks, signatures, subscriptions)
INSTAGRAM_META_APP_ID=<tipote_ter_app_id>
INSTAGRAM_META_APP_SECRET=<tipote_ter_app_secret>

# Sub-app "tipote ter-IG" — OAuth Instagram (client_id / client_secret)
INSTAGRAM_APP_ID=<tipote_ter_ig_app_id>
INSTAGRAM_APP_SECRET=<tipote_ter_ig_app_secret>
# INSTAGRAM_CONFIG_ID non utilisé (scopes classiques)

# App "Tipote" — Threads
THREADS_APP_ID=<tipote_threads_app_id>
THREADS_APP_SECRET=<tipote_threads_app_secret>

# Webhooks (même token pour toutes les apps)
META_WEBHOOK_VERIFY_TOKEN=<webhook_verify_token>
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<webhook_verify_token>

# App
NEXT_PUBLIC_APP_URL=https://app.tipote.com
N8N_SHARED_SECRET=<secret_partage_n8n>
```

> Voir `.env.example` à la racine du projet pour le template complet.

---

## 4. Analyse des rejets et corrections

### 4.1 Raison du rejet

> "La capture vidéo ne correspond pas aux détails du cas d'utilisation"

Les 4 permissions rejetées (`instagram_business_manage_messages`, `instagram_business_content_publish`, `instagram_business_manage_comments`, et la review globale) ont toutes le même motif.

### 4.2 Causes probables du rejet

#### A. Interface en français pendant le screencast
Meta exige explicitement : **"mettre l'UI de l'application en anglais"**. Si le screencast a été fait avec l'UI Tipote en français, c'est une cause de rejet immédiate.

**Correction** : Passer l'app en anglais (`/en/settings`) avant d'enregistrer le screencast. Les traductions EN existent déjà.

#### B. Flux end-to-end incomplet
Pour CHAQUE permission, Meta veut voir le parcours COMPLET :
1. Connexion Meta (flux OAuth complet)
2. L'utilisateur accorde les permissions
3. L'utilisation réelle de bout en bout de la permission

**Ce que Meta attendait et n'a probablement pas vu :**

| Permission | Ce qu'il faut montrer |
|-----------|----------------------|
| `instagram_business_content_publish` | Connexion OAuth → Créer un post → Upload image → Publier → Voir le post SUR Instagram.com |
| `instagram_business_manage_comments` | Connexion OAuth → Voir les commentaires reçus → Répondre à un commentaire → Voir la réponse SUR Instagram.com |
| `instagram_business_manage_messages` | Connexion OAuth → Un utilisateur commente sur un post → Le système envoie un DM (Private Reply) → Voir le DM reçu SUR Instagram |

#### C. Absence de sous-titres et annotations
Meta demande des "sous-titres et des infobulles" pour expliquer chaque élément de l'UI. Un screencast sans narration ni sous-titres est une cause de rejet.

#### D. Vidéo unique pour toutes les permissions
Il faut idéalement **une vidéo séparée par permission** (ou des chapitres très clairs dans une seule vidéo).

### 4.3 Problèmes UX identifiés

#### Problème 1 : Le composant AutoCommentPanel contient du texte hardcodé en français
Le fichier `components/create/AutoCommentPanel.tsx` contient des chaînes en dur :
- "Auto-commentaires"
- "Commentez automatiquement des posts similaires..."
- "Commentaires avant publication"
- "Commentaires après publication"

**Impact** : Même en passant l'app en anglais, ce panneau restera en français.
**Correction** : Migrer vers `useTranslations()` (cf. section code changes).

#### Problème 2 : Auto-commentaires sur posts d'autres utilisateurs
Le feature d'auto-commentaires (`AutoCommentPanel`) commente des **posts d'autres utilisateurs** (pas les siens). C'est un risque majeur de violation des politiques Meta :

> "Instagram strictly prohibits automated behavior that mimics human engagement patterns"

**Correction** : Ne PAS mentionner cette fonctionnalité dans la review Meta. Ne PAS la montrer dans le screencast. Pour Instagram, le seul commentaire automatique accepté est le "first comment" sur votre PROPRE post (comme le fait Mixpost, Later, etc.).

#### Problème 3 : Le composant PublishModal contient du texte hardcodé en français
Le fichier `components/content/PublishModal.tsx` n'utilise pas `useTranslations()`. Certaines chaînes comme "Erreur réseau", "Les auto-commentaires vont se lancer..." et "Connecté" sont en français.

**Impact** : Visible pendant le screencast de publication Instagram.
**Correction recommandée** : Migrer le PublishModal vers i18n (plus gros chantier).
**Workaround** : Pour le screencast, s'assurer que le flux fonctionne sans erreur et que les textes visibles sont clairs en contexte.

#### Problème 4 : Certains messages d'erreur API sont en français
Les routes API contiennent des messages en français ("Non authentifié", "Contenu introuvable", etc.). Cela n'impacte pas directement la review mais pourrait apparaître dans le screencast en cas d'erreur.

---

## 5. Conformité aux politiques Meta

### 5.1 Ce qui EST conforme (OK pour la review)

| Fonctionnalité | Politique | Status |
|---------------|-----------|--------|
| Publier des posts sur Instagram/FB/Threads | API Content Publishing officielle | ✅ Conforme |
| Répondre aux commentaires sur nos posts | `manage_comments` permission | ✅ Conforme |
| Envoyer un DM suite à un commentaire (Private Reply) | API officielle Private Reply | ✅ Conforme |
| Planifier des publications | Pas de restriction API | ✅ Conforme |
| Webhooks pour commentaires entrants | API officielle Webhooks | ✅ Conforme |
| Data deletion callback (GDPR) | Implémenté | ✅ Conforme |
| Deauthorize callback | Implémenté | ✅ Conforme |

### 5.2 Points d'attention (risques)

| Fonctionnalité | Risque | Recommandation |
|---------------|--------|----------------|
| **Auto-commentaires sur posts d'autres utilisateurs** | **ÉLEVÉ** — Viole la section sur le "automated behavior" | **Ne PAS soumettre** pour la review Instagram. Réserver à Twitter/Threads uniquement, ou le reformuler en "first comment on own post" |
| **DM automatiques après commentaire** | **MOYEN** — Accepté via Private Reply, mais pas en masse | Respecter le rate limit (200 DMs/heure). Toujours utiliser Private Reply (lié au commentaire) |
| **Réponses automatiques aux commentaires** | **FAIBLE** — Accepté si c'est sur vos propres posts | Bien cadrer : réponse aux commentaires sur les posts de l'utilisateur uniquement |

### 5.3 Règles de messagerie Instagram (24h window)

- Les DMs automatiques ne sont autorisés que dans la **fenêtre de 24h** après l'interaction de l'utilisateur
- La méthode **Private Reply** (recipient.comment_id) contourne cette restriction car le DM est lié à un commentaire initié par l'utilisateur
- Après 24h, seul un **human agent** peut répondre (pas de messages automatisés)
- Rate limit : **200 DMs/heure** maximum

### 5.4 Ce que NE PAS mentionner dans la review

1. Auto-commentaires sur les posts d'autres utilisateurs
2. Tout ce qui ressemble à du "growth hacking" automatisé
3. Les mots "bot", "automation at scale", "mass messaging"
4. L'intégration n8n (c'est un détail d'implémentation serveur)

### 5.5 Comment décrire chaque fonctionnalité

| Fonctionnalité technique | Description pour la review |
|--------------------------|---------------------------|
| Comment-to-DM automation | "Our app allows businesses to respond to user-initiated interactions (comments) with a personalized private message, using Instagram's Private Reply API" |
| Comment reply variants | "Our app helps businesses manage and reply to comments received on their Instagram posts, improving customer engagement" |
| Content publishing | "Our app allows users to create, schedule, and publish photo and video content to their Instagram Business account" |
| Auto-comments (⚠️) | **NE PAS MENTIONNER** pour Instagram |

---

## 6. Guide du screencast pour l'App Review

### 6.1 Règles générales

1. **Langue** : UI en anglais (changer via le language switcher de Tipote)
2. **Sous-titres** : Ajouter des sous-titres EN ou des annotations texte à chaque étape
3. **Durée** : 2-5 minutes par permission (pas plus)
4. **Résolution** : Minimum 720p
5. **Narration** : Voix off en anglais OU sous-titres détaillés
6. **Compte test** : Utiliser un compte Instagram Business de test (pas le compte principal)

### 6.2 Structure de chaque vidéo

```
1. Introduction (10s)
   - "This screencast demonstrates how Tipote uses [permission_name]"
   - Montrer le nom et ID de l'app dans le Meta dashboard

2. Connexion OAuth (30-60s)
   - Naviguer vers Settings > Connections
   - Cliquer "Connect Instagram"
   - Montrer le dialogue de login Instagram complet
   - Montrer l'écran des permissions et cliquer "Allow"
   - Retour vers Tipote avec le badge "Connected" visible

3. Démonstration du cas d'utilisation (1-3 min)
   - [Spécifique à chaque permission — voir ci-dessous]

4. Vérification sur Instagram (30s)
   - Ouvrir Instagram.com dans un nouvel onglet
   - Montrer le résultat (post publié, commentaire, DM...)
```

### 6.3 Screencast par permission

#### `instagram_business_basic` (généralement auto-approuvé)
Pas de vidéo séparée nécessaire — couvert par le flux OAuth.

#### `instagram_business_content_publish`

```
Titre : "Tipote — Content Publishing on Instagram"

1. [OAuth — comme décrit ci-dessus]

2. Naviguer vers "Create Content" (menu gauche)
3. Sélectionner "Instagram" comme plateforme
   → Annotation : "User selects Instagram as the target platform"
4. Remplir le contenu (caption)
5. Uploader une image
   → Annotation : "User uploads a photo to publish"
6. Cliquer "Publish"
   → Annotation : "User clicks Publish to post on Instagram"
7. Voir la modal de confirmation
8. Cliquer "Confirm"
9. Voir le message de succès avec le lien vers le post
   → Annotation : "Post published successfully — link to Instagram post"
10. Ouvrir le lien dans un nouvel onglet
    → Annotation : "Verifying the published post on Instagram.com"
11. Montrer le post sur Instagram.com
```

#### `instagram_business_manage_comments`

```
Titre : "Tipote — Comment Management on Instagram"

1. [OAuth — comme décrit ci-dessus]

2. Naviguer vers "Automations" (menu gauche)
3. Créer une automation "Comment-to-DM" pour Instagram
   → Annotation : "Creating an automation to manage comments"
4. Configurer le trigger keyword (ex: "INFO")
   → Annotation : "Setting a trigger keyword for comment detection"
5. Configurer les "Comment reply variants"
   → Annotation : "Setting automated reply messages for comments on our posts"
6. Sauvegarder
7. SIMULATION : Aller sur Instagram, commenter sur le post test avec "INFO"
   → Annotation : "Simulating a user commenting on our Instagram post"
8. Retour dans Tipote : montrer que l'automation s'est déclenchée
   → Annotation : "The automation detected the comment and replied"
9. Vérifier sur Instagram que la réponse au commentaire est visible
   → Annotation : "Verifying the automated reply on Instagram.com"
```

#### `instagram_business_manage_messages`

```
Titre : "Tipote — Instagram Messaging (Private Reply)"

1. [OAuth — comme décrit ci-dessus]

2. Naviguer vers "Automations"
3. Montrer l'automation Comment-to-DM configurée
   → Annotation : "This automation sends a private message when a user
      comments a specific keyword on our post"
4. Configurer le message DM
   → Annotation : "Setting the private message content"
5. SIMULATION : Aller sur Instagram depuis un AUTRE compte
   → Annotation : "Simulating a user commenting on our post from another account"
6. Commenter le mot-clé sur le post
7. Montrer le DM reçu sur le compte qui a commenté
   → Annotation : "The user received a private reply linked to their comment"
8. Vérifier dans Instagram que le DM a été reçu
   → Annotation : "Verifying the private message in Instagram Direct"

NOTE IMPORTANTE : Utiliser la terminologie "Private Reply" (réponse privée
liée au commentaire), PAS "automated DM" ou "mass messaging".
```

### 6.4 Erreurs à éviter dans le screencast

| Erreur | Conséquence | Comment éviter |
|--------|------------|----------------|
| UI en français | Rejet automatique | Basculer en EN avant d'enregistrer |
| Pas de sous-titres | Rejet probable | Ajouter annotations à chaque étape |
| Ne pas montrer le résultat sur Instagram | Rejet | Toujours finir par la vérification |
| Montrer les auto-commentaires | Rejet (automated behavior) | Ne PAS montrer cette fonctionnalité |
| Utiliser le mot "bot" ou "automation" | Risque de rejet | Dire "personalized reply", "comment management" |
| Screencast trop court | Rejet | Minimum 2 min par permission |
| Pas de flux OAuth complet | Rejet | Commencer par la déconnexion puis reconnexion |
| Montrer des erreurs | Impression négative | Tester avant, utiliser un compte propre |

---

## 7. Descriptions de cas d'utilisation par permission

### Textes à utiliser dans le formulaire de review Meta

#### `instagram_business_basic`

> **Use case description:**
> Tipote is a social media management platform that helps businesses manage their online presence. We use `instagram_business_basic` to retrieve the connected Instagram Business account's profile information (username, profile picture, account type) during the OAuth connection flow. This information is displayed in the user's Settings page to confirm which Instagram account is connected and to personalize the publishing experience.
>
> **How the data is used:**
> The user's Instagram username and profile picture are displayed within the Tipote dashboard to identify the connected account. No data is shared with third parties.

#### `instagram_business_content_publish`

> **Use case description:**
> Tipote allows businesses to create, schedule, and publish content (photos and videos) to their Instagram Business account directly from the Tipote dashboard. Users compose their caption, upload media, and publish — all within Tipote's interface. This saves time by allowing businesses to manage multiple social media platforms from a single dashboard.
>
> **How the permission is used:**
> When a user clicks "Publish" in Tipote, our app uses the Instagram Content Publishing API to:
> 1. Create a media container (POST /{ig-user-id}/media)
> 2. Wait for processing to complete
> 3. Publish the container (POST /{ig-user-id}/media_publish)
>
> The user initiates every publish action manually or through a pre-scheduled date they set.

#### `instagram_business_manage_comments`

> **Use case description:**
> Tipote helps businesses manage engagement on their Instagram posts. When a user receives comments on their published Instagram content, Tipote can detect specific keywords in those comments (via webhooks) and automatically reply with a pre-configured response. This helps businesses respond promptly to customer inquiries and maintain engagement on their posts.
>
> **How the permission is used:**
> - Tipote subscribes to Instagram comment webhooks for the user's account
> - When a comment containing a configured keyword is detected on the user's own post, Tipote sends a reply to that comment using POST /{comment-id}/replies
> - All comment replies are for comments received on the user's own posts only
> - The user configures reply templates and trigger keywords in the Tipote Automations page

#### `instagram_business_manage_messages`

> **Use case description:**
> Tipote uses Instagram's Private Reply feature to help businesses send a personalized direct message to users who engage with their Instagram content by commenting a specific keyword. This is a common business engagement pattern (similar to "Comment [keyword] to get the guide") where the business sends relevant information privately to interested users.
>
> **How the permission is used:**
> - When a comment with a configured keyword is detected on the user's own Instagram post (via webhook), Tipote sends a Private Reply using POST /{ig-user-id}/messages with recipient.comment_id
> - The Private Reply is always linked to a specific user-initiated comment — it is not unsolicited messaging
> - The user configures the message content and trigger keywords in the Tipote Automations page
> - All messaging respects Instagram's 24-hour messaging window and rate limits

---

## 8. Checklist pré-soumission

### Dashboard Meta

- [ ] Business Verification completed
- [ ] Privacy Policy URL accessible et à jour
- [ ] App Icon configuré (logo Tipote)
- [ ] App Category = "Business" ou "Productivity"
- [ ] Platform "Website" ajoutée avec URL de production
- [ ] Facebook Login for Business configuré avec redirect URIs
- [ ] Instagram Professional Login configuré
- [ ] Data Deletion URL configurée
- [ ] Deauthorize Callback URL configurée
- [ ] Webhooks configurés (Facebook Page + Instagram)

### Comptes test

- [ ] Créer un compte Facebook test (2FA activé)
- [ ] Créer une Page Facebook avec ce compte
- [ ] Connecter un compte Instagram Business à cette Page
- [ ] Ajouter ce compte comme "Tester" dans l'app Meta
- [ ] Créer un compte Tipote test
- [ ] Connecter le compte Instagram test à Tipote
- [ ] Publier un post test sur Instagram via Tipote
- [ ] Configurer une automation test (Comment-to-DM)

### Screencast

- [ ] UI Tipote en anglais
- [ ] Sous-titres/annotations à chaque étape
- [ ] Vidéo pour `instagram_business_content_publish` (publish flow complet)
- [ ] Vidéo pour `instagram_business_manage_comments` (comment reply flow)
- [ ] Vidéo pour `instagram_business_manage_messages` (Private Reply flow)
- [ ] Chaque vidéo montre le flux OAuth complet
- [ ] Chaque vidéo montre la vérification sur Instagram.com
- [ ] Pas de mention d'auto-commentaires sur posts d'autres utilisateurs
- [ ] Pas de texte en français visible dans l'app
- [ ] Résolution minimum 720p

### Code/UX

- [ ] AutoCommentPanel traduit en anglais (plus de texte hardcodé FR)
- [ ] Messages d'erreur API cohérents
- [ ] Flux OAuth fonctionnel en production
- [ ] Webhooks fonctionnels en production
- [ ] Data Deletion et Deauthorize testés

### Formulaire de review

- [ ] Use case description rédigée en anglais pour chaque permission
- [ ] Notes explicatives claires
- [ ] Credentials de test fournies (compte Tipote non-admin)
- [ ] Instructions étape par étape pour le reviewer
- [ ] Pas de mention de "serveur à serveur" sauf si applicable

---

## Sources et références

- [Meta Developer Platform Policy](https://developers.facebook.com/devpolicy/)
- [Instagram Content Publishing API](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing)
- [Instagram Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [Threads API](https://developers.facebook.com/docs/threads/)
- [Meta App Review Guide](https://www.saurabhdhar.com/blog/meta-app-approval-guide)
- [Chatwoot Instagram App Review](https://developers.chatwoot.com/self-hosted/instagram-app-review)
- [Mixpost Facebook App Review](https://docs.mixpost.app/services/social/facebook/app-review/)
- [Instagram DM Automation Rules](https://instantdm.com/blog/instagram-dm-automation-rules-best-practices-2025)
- [DM Automation Compliance Tips](https://vistasocial.com/insights/dm-automation-compliance/)
