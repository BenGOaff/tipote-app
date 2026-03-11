// lib/support/knowledgeBase.ts
// Builds a comprehensive knowledge base string for the support chatbot.
// Combines CAHIER_DES_CHARGES content + seed articles index so the LLM
// can answer any question about Tipote accurately and without inventing.

import { SEED_CATEGORIES, SEED_ARTICLES } from "./seedData";

/**
 * Build the full Tipote knowledge base for the support chatbot prompt.
 * This is injected into the system prompt so the LLM has all the facts.
 */
export function buildSupportKnowledgeBase(locale: string): string {
  const sections: string[] = [];

  // ── 1. Product overview ──
  sections.push(`### Tipote — Présentation
Tipote® est une application web SaaS tout-en-un pour les entrepreneurs. Elle permet de structurer son business, créer du contenu personnalisé avec l'IA, et publier directement sur les réseaux sociaux.

Contrairement aux outils IA génériques, Tipote mémorise le profil business complet de l'utilisateur (diagnostic, persona, offres, objectifs, storytelling) pour générer du contenu véritablement personnalisé.

Disponible en 5 langues : Français, English, Español, Italiano, العربية.
URL : https://app.tipote.com`);

  // ── 2. Features ──
  sections.push(`### Fonctionnalités principales

1. **Onboarding intelligent** — Questionnaire interactif qui capture le profil business complet (offres, persona, objectifs, style, tonalité). Obligatoire à la première connexion.

2. **Plan stratégique IA** — Plan d'action en 3 phases généré par IA avec pyramide d'offres (Lead Magnet → Low/Middle Ticket → High Ticket). 3 phases : Fondations, Croissance, Scale.

3. **Création de contenu IA** — 8 types de contenu :
   - Posts réseaux sociaux (LinkedIn, Instagram, Twitter, etc.)
   - Emails (newsletters, séquences)
   - Articles de blog / guides / tutoriels
   - Scripts vidéo (YouTube, Reels, TikTok)
   - Offres (pages de vente, descriptions produit)
   - Funnels (tunnels de vente)
   - Quiz (lead magnets interactifs)
   - Stratégie éditoriale (calendrier de contenu)

4. **Publication directe sur 8 réseaux sociaux** :
   - LinkedIn (posts + images)
   - Facebook Pages (posts + images + carrousels + vidéos)
   - Instagram (photos + vidéos + Reels)
   - Threads (posts)
   - Twitter/X (tweets + images)
   - TikTok (photos + vidéos)
   - Pinterest (pins avec images + liens)
   - Reddit (posts texte + liens)
   L'utilisateur connecte ses comptes via Paramètres > Connexions (OAuth 2.0).

5. **Automatisations** :
   - Auto-commentaires sur les posts publiés (0.25 crédit/commentaire)
   - Comment-to-DM : réponse automatique en DM aux commentaires avec mots-clés
   - Comment-to-Email : capture d'email via DM automatique
   Disponible à partir du plan Basic.

6. **Constructeur de pages** — Créer des landing pages hébergées :
   - Pages de capture, de vente, ou vitrine
   - Édition inline, preview multi-device
   - Chat IA pour modifier par conversation
   - Analytics intégrés (vues, leads, clics)
   - Tracking pixels (Facebook Pixel, GTM)
   - URL publique : /p/[slug]

7. **Quiz builder** — Créer des quiz lead magnets :
   - Génération par IA
   - Capture email + prénom
   - Résultats personnalisés avec CTA
   - Stats (vues, partages, leads)
   - Sync vers Systeme.io
   - URL publique : /q/[quizId]

8. **Gestion des leads** — Base de données unifiée :
   - Sources multiples (quiz, page de capture, site, manuel)
   - Chiffrement AES-256 de bout en bout
   - Recherche par email/nom
   - Export CSV ou vers Systeme.io

9. **Calendrier éditorial** — Vue calendrier + liste de tous les contenus, filtrable par type/statut/canal. Édition des posts programmés.

10. **Analytics + diagnostic IA** — Saisie manuelle des KPIs (visiteurs, inscrits, ventes, CA). Diagnostic IA avec forces, faiblesses et recommandations.

11. **Coach IA** — Bulle flottante de coaching business :
    - Disponible uniquement sur les plans Pro et Elite (inclus, pas de crédits)
    - Free/Basic : limité à 3 messages/mois (mode teaser)
    - Accès au profil business complet pour des réponses contextuelles

12. **Templates Systeme.io** — Bibliothèque de templates téléchargeables et personnalisables.

13. **Pépites (insights)** — Tips et insights business avec badge de notification.

14. **Didacticiel interactif** — 19 étapes guidées pour les nouveaux utilisateurs (actif les 7 premiers jours, relanceable).

15. **Notifications** — Automatiques, admin broadcast, personnelles. Cloche dans le header.

16. **Multi-projets** — Gérer plusieurs projets avec profils séparés (plan Elite uniquement).

17. **Widgets embarquables** :
    - Toast de preuve sociale (visiteurs en temps réel, inscriptions, achats)
    - Boutons de partage social (8 plateformes)
    - Script JS à intégrer sur son site

18. **Paramètres** — 7 onglets :
    - Profil : nom, mission, niche, storytelling (6 étapes), offres, URLs réseaux sociaux
    - Connexions : OAuth réseaux sociaux, API Systeme.io, auto-commentaires
    - Réglages : email, mot de passe, langue
    - Positionnement : concurrents, positionnement marché, niche
    - Branding : police, couleurs, logo, photo auteur, ton de voix
    - IA : crédits, clés API
    - Abonnement : plan actuel, crédits, upgrade/downgrade`);

  // ── 3. Pricing ──
  sections.push(`### Plans et tarification

| | Free | Basic | Pro | Elite |
|---|---|---|---|---|
| **Prix mensuel** | 0€ | 19€/mois | 49€/mois | 99€/mois |
| **Prix annuel** | — | 190€/an | 490€/an | 990€/an |
| **Crédits IA/mois** | 25 (unique, non renouvelable) | 40 | 150 | 500 |
| **Tous les modules** | Oui | Oui | Oui | Oui |
| **Publication directe** | Oui | Oui | Oui | Oui |
| **Auto-commentaires** | Non | Oui | Oui | Oui |
| **Coach IA** | Non | Non | Oui (illimité) | Oui (illimité) |
| **Multi-projets** | Non | Non | Non | Oui |

Il existe aussi un plan "Beta" pour les early adopters lifetime (150 crédits/mois, toutes fonctionnalités).

**Crédits IA :**
- 1 crédit ≈ 0.01€ de coûts IA réels
- Les crédits mensuels se renouvellent chaque mois (sauf Free = one-shot)
- Les crédits ne se cumulent PAS d'un mois à l'autre
- Auto-commentaires : 0.25 crédit par commentaire
- Le Coach IA (Pro/Elite) ne consomme PAS de crédits

**Packs de crédits supplémentaires (via Systeme.io) :**
| Pack | Crédits | Prix |
|---|---|---|
| Starter | 25 | 3€ |
| Standard | 100 | 10€ |
| Pro | 250 | 22€ |

Les crédits supplémentaires n'expirent pas et sont consommés après les crédits mensuels (FIFO).`);

  // ── 4. Navigation ──
  sections.push(`### Navigation de l'application

**Section principale (sidebar) :**
- Aujourd'hui (/app) — Dashboard avec prochaine tâche + stats
- Ma Stratégie (/strategy) — Pyramide d'offres + plan 30/90j + persona
- Créer (/create) — Hub de création (8 types de contenu)
- Mes Contenus (/contents) — Liste + calendrier éditorial
- Templates (/templates) — Templates Systeme.io
- Automatisations (/automations) — Auto-commentaires et webhooks
- Mes Leads (/leads) — Gestion des leads capturés

**Section secondaire :**
- Analytics (/analytics) — KPIs + diagnostic IA
- Pépites (/pepites) — Insights et pépites
- Aide (/support) — Centre d'aide

**Workflow typique :** Onboarding → Aujourd'hui → Créer → Publier → Mes Contenus → Analytics`);

  // ── 5. Two-level AI ──
  sections.push(`### Architecture IA (deux niveaux)

**Niveau 1 — Cerveau stratégique (OpenAI GPT) :**
Onboarding, diagnostic, plan stratégique, pyramide d'offres, tâches, coach IA, analytics.
Clé propriétaire Tipote (l'utilisateur n'a rien à configurer).

**Niveau 2 — Génération de contenu (Claude Anthropic) :**
Posts, emails, articles, scripts vidéo, funnels, quiz, stratégie éditoriale, auto-commentaires.
Clé propriétaire Tipote (l'utilisateur n'a rien à configurer).

L'utilisateur n'a JAMAIS besoin de fournir sa propre clé API.`);

  // ── 6. Security ──
  sections.push(`### Sécurité

- Authentification JWT via Supabase Auth (email + mot de passe)
- OAuth 2.0 avec PKCE pour les réseaux sociaux
- Chiffrement AES-256-GCM pour les tokens OAuth et les données personnelles des leads
- Chaque utilisateur a sa propre clé de chiffrement (DEK)
- Row Level Security (RLS) sur toutes les tables — chaque utilisateur ne voit que ses propres données
- Index aveugle HMAC pour la recherche sur les champs chiffrés`);

  // ── 7. Integrations ──
  sections.push(`### Intégrations

- **Systeme.io** : facturation (webhooks achat/abonnement/annulation), export de leads avec tags, templates
- **n8n** : webhooks pour automatisations (publication asynchrone, callbacks)
- **8 réseaux sociaux** : LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest, Reddit (OAuth 2.0)`);

  // ── 8. FAQ from seed articles (titles as index) ──
  const articleIndex = SEED_CATEGORIES.map((cat) => {
    const catTitle = cat.title[locale] ?? cat.title.fr;
    const articles = SEED_ARTICLES
      .filter((a) => a.category_slug === cat.slug)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => `  - ${a.title[locale] ?? a.title.fr}`)
      .join("\n");
    return `**${catTitle}**\n${articles}`;
  }).join("\n\n");

  sections.push(`### Articles du centre d'aide (index)
Voici la liste complète des sujets couverts par le centre d'aide. Si l'utilisateur demande un sujet précis, tu peux le diriger vers l'article correspondant sur /support.

${articleIndex}`);

  return sections.join("\n\n---\n\n");
}
