// lib/support/knowledgeBase.ts
//
// CE QUE LE BOT D'AIDE SAIT.
//
// Béné, 6 août 2026 : "la priorité c'est que l'aide en français pour
// tiquiz tipote soit parfaite pour couvrir la plupart des besoins, des
// questions etc, et que le bot de l'aide sache exactement quoi répondre
// parce qu'il connaît par coeur le code de chaque app, où trouver, quoi
// répondre, comment guider."
//
// -- LE DÉFAUT QU'ON CORRIGE ------------------------------------------
//
// Cette fonction injectait la LISTE DES TITRES des 57 articles, et rien
// de leur contenu. Le bot avait donc un sommaire et aucun texte : il
// pouvait dire "il y a un article sur les statistiques", jamais dire ce
// qu'il y a dedans. Toutes ses réponses précises étaient donc, au mieux,
// reconstruites de mémoire, au pire inventées, alors que la consigne lui
// interdit d'inventer. Il se retrouvait coincé entre deux ordres
// contradictoires, et c'est ce qui produisait les réponses évasives.
//
// -- LA RÈGLE ----------------------------------------------------------
//
// LE TEXTE DES ARTICLES EST LA BASE DE CONNAISSANCES. Pas un résumé, pas
// une copie : le texte lui-même, injecté en entier. Écrire un article,
// c'est donc apprendre quelque chose au bot, et les deux moitiés de la
// demande de Béné deviennent le MÊME travail. Une base de connaissances
// recopiée à côté des articles divergerait au premier article corrigé
// (c'est le motif de tous les drames de ce repo).
//
// -- POURQUOI TOUJOURS LE FRANÇAIS ------------------------------------
//
// Le corpus injecté est le FRANÇAIS, quelle que soit la langue de la
// conversation, et le prompt demande de RÉPONDRE dans la langue de
// l'utilisateur. Les versions ES/IT/AR sont condensées : les donner au
// bot le priverait des trois quarts de ce qu'on sait. Traduire à la
// volée une réponse issue d'un texte complet vaut mieux que répondre
// juste à partir d'un texte incomplet.
//
// -- LE COÛT ------------------------------------------------------------
//
// Environ 19 000 tokens d'articles + 7 000 de fiches produit. Le prompt
// est IDENTIQUE à chaque requête (aucune interpolation variable avant la
// question), donc le cache de prompt d'OpenAI le sert à 0,1x au delà de
// la première requête. C'est la raison pour laquelle il ne faut RIEN
// insérer de variable dans ce qui suit : une date, un compteur, un
// prénom, et le cache saute pour tout le monde.

import { SEED_CATEGORIES, SEED_ARTICLES } from "./seedData";

/** Le domaine de chaque app, pour que le bot n'invente jamais d'URL. */
const TIPOTE_APP = "https://app.tipote.com";
const TIQUIZ_APP = "https://quiz.tipote.com";

/**
 * Build the full knowledge base for the support chatbot prompt.
 * Le paramètre `locale` ne change RIEN au corpus (toujours FR, cf. en
 * tête de fichier) : il est conservé pour la compatibilité d'appel et
 * pour garder le prompt strictement identique d'une langue à l'autre,
 * donc cacheable une seule fois.
 */
export function buildSupportKnowledgeBase(_locale?: string): string {
  const sections: string[] = [];

  // ── 0. Ce que le bot doit savoir AVANT tout : il y a DEUX apps ──
  sections.push(`### IMPORTANT : il y a DEUX applications, ne jamais les confondre

**Tiquiz** (${TIQUIZ_APP}) ne fait QUE du quiz, et le fait à fond : quiz, sondages, popquiz vidéo, capture de leads, Systeme.io, statistiques, branding et domaine personnalisé. C'est le produit d'entrée, à 17 €/mois.

**Tipote** (${TIPOTE_APP}) est un outil plus large : stratégie, création de contenu, publication sur les réseaux sociaux, automatisations, pages, leads, analytics. Le quiz n'y est qu'un module parmi d'autres. Plans de 19 à 99 €/mois.

Le centre d'aide est commun aux deux. **Avant de répondre à une question qui pourrait concerner les deux, demande de quelle app on parle**, SAUF si c'est évident (les crédits IA, les réseaux sociaux, les auto-commentaires n'existent que sur Tipote ; les popquiz, les sondages, le mode score n'existent que sur Tiquiz).

Une troisième chose existe et n'est PAS une app : **L'Atelier du Quiz** (https://quizing.tipote.com), la formation de Béné. Elle a son propre coach IA. Si quelqu'un parle de "l'Atelier", "la formation", "le carnet" ou "les jours", c'est de ça qu'il parle, et ce centre d'aide ne le couvre pas : dis-le franchement.`);

  // ── 1. Tiquiz : la fiche que le bot n'avait pas ──
  sections.push(`### Tiquiz : navigation et emplacement exact de chaque réglage

C'est la question la plus fréquente : "où ça se trouve ?". Donne TOUJOURS le chemin exact, jamais "dans les réglages".

**Menu de gauche :**
- Tableau de bord (/dashboard)
- Créer un quiz (/quiz/new)
- Créer un sondage (/survey/new)
- Mes projets (/quizzes) : tous les quiz ET les sondages
- Popquiz vidéo (/popquizzes)
- Mes leads (/leads)
- Statistiques (/stats) : tous les projets réunis
- En bas : Aide, Devenir affilié, la langue de l'interface

**Paramètres** (avatar en haut à droite > Paramètres), 6 onglets :
- **Général** : email, mot de passe, langue
- **Branding** : logo, favicon, couleurs, polices
- **Systeme.io** : les clés API, et le rappel des tags
- **Compte & Tarifs** : le plan en cours, les boutons de commande, l'annulation
- **Domaine** : connecter son propre nom de domaine (plans payants)
- **Tracking** : les pixels de suivi

**Dans l'éditeur d'un quiz**, 4 onglets en haut :
- **Créer** : les questions, les réponses, les résultats, tout l'aperçu
- **Partager** : le lien public, le QR code, le code d'intégration
- **Résultats** : la répartition des leads par profil
- **Tendances** (ou **Réponses** sur un sondage) : la synthèse question par question

**Dans l'onglet Créer**, colonne de gauche : Questions, Résultats, Écran de remerciement. Colonne de droite : Personnalisation, Options, Bonus offert pour un partage, Écran d'accueil, Disposition des questions, Disposition des réponses, Score visuel et axes (en mode score).

**Les statistiques d'UN quiz** : ouvre le quiz, puis l'onglet Statistiques. **Les statistiques de TOUS les quiz** : menu Statistiques. La flèche retour d'un écran de projet remonte toujours à Mes projets, jamais à l'écran précédent.`);

  sections.push(`### Tiquiz : les pièges connus, et la bonne réponse à donner

Ce sont les cas qui font écrire au support. Réponds directement, sans faire deviner.

**"Mon quiz renvoie une page 404."** Il est en brouillon. Un quiz n'est PAS en ligne tant qu'on n'a pas cliqué sur **Publier** dans l'éditeur. Chaque quiz se publie individuellement. Rien d'autre à configurer, aucune API.

**"Ce résultat ne peut jamais être attribué" alors que mon quiz marche.** Deux causes possibles, et il faut demander le MODE avant de répondre :
- En mode PROFIL, une réponse ne vote que pour UN profil. Avec 4 profils et seulement 3 réponses par question, le 4e ne peut pas gagner à cette question. Il faut AJOUTER des réponses (le bouton "Rééquilibrer avec l'IA" sait les rédiger), pas déplacer celles qui existent.
- En mode SCORE, cette alerte ne s'affiche pas : les profils n'y jouent aucun rôle, c'est la tranche de points qui décide.

**"Je ne sais pas si je dois prendre profil ou score."** Le test tient en une phrase : si les résultats peuvent être classés du moins bon au meilleur, c'est un SCORE ; s'ils sont simplement différents, c'est un PROFIL. Profil répond à "qui es-tu ?", score répond à "où en es-tu ?".

**"Une question fait décrocher tout le monde, je la corrige et ça ne change rien."** Presque toujours une mauvaise lecture. Le funnel compte les gens qui ont VU chaque question : quelqu'un qui part entre la 6 et la 7 n'a jamais vu la 7, il s'est arrêté SUR la 6. Tiquiz nomme la bonne question directement. Et en dessous d'une vingtaine de personnes sur une même question, il ne désigne rien du tout, exprès : sur 8 visiteurs, une personne pèse 12 %.
Deux choses à dire à chaque fois qu'on parle de funnel :
- perdre du monde en route est NORMAL et SAIN, ce sont d'abord les visiteurs qui n'étaient pas pour elle ; aucun quiz ne vise 100 % de complétion ;
- pour mesurer un changement : une seule modification à la fois, puis 20 à 30 nouvelles réponses avant de juger.

**"J'ai choisi Liste / Centré et ça ne change rien."** L'alignement a trois étages, et le plus précis gagne : le champ (aligné à la main) bat la question, qui bat le réglage du quiz. Un champ aligné une fois à la main devient une exception permanente. Le bouton **"Tout réaligner sur ce réglage"** efface ces exceptions partout, en gardant gras, couleurs et tailles.

**"Le menu des tailles de police est vide."** Il ne l'est pas : cliquer une deuxième fois sur une taille remet le champ d'aplomb. Ce bug d'affichage est corrigé, mais un champ déjà abîmé se répare au premier clic.

**"Le bouton Partager ne fait rien."** Corrigé : il ouvre un panneau de réseaux. Si aucune case n'est cochée dans les réglages, TOUS les réseaux s'affichent, c'est voulu. Le lien partagé est celui du profil obtenu, pas celui du quiz.

**"Le score s'affiche alors que j'ai tout décoché."** Le réglage est "Affichage du score" et vaut pourcentage, libellé ou **rien**. En "rien", les barres d'axes disparaissent aussi, mais les axes continuent d'alimenter les variables de texte et les tags Systeme.io.

**"J'ai reçu un lien de réinitialisation qui pointe sur localhost."** Corrigé le 2 août 2026. Si ça se reproduit, c'est un vieil email : en redemander un neuf.

**"Je veux les nouveautés sur un quiz existant."** La page de résultat en 4 temps s'active sur n'importe quel quiz : un bandeau au dessus des profils de résultat propose de basculer, c'est réversible et sans effet sur les autres quiz. **Dupliquer ne sert à rien** : la copie est fidèle à l'original, donc elle reproduit son ancienne présentation.

**"Je n'arrive pas à supprimer un projet."** Un quiz réutilisé comme question dans un popquiz vidéo ne peut pas être supprimé. L'app le dit maintenant et nomme les vidéos concernées : il faut d'abord retirer le quiz de ces vidéos.

**"Mon automatisation Systeme.io ne part pas au test."** Systeme.io ne redéclenche pas une règle si le tag est déjà sur le contact. Avant chaque nouveau test avec le même email, retirer le tag à la main dans Systeme.io > Contacts.`);

  sections.push(`### Tiquiz : plans, adresses, et ce qui n'existe plus

| Plan | Prix | Quiz | Réponses/mois |
|---|---|---|---|
| Gratuit | 0 € | 1 quiz + 1 sondage + 1 popquiz | 10 |
| Mensuel | 17 €/mois | illimité | illimité |
| Annuel | 170 €/an (2 mois offerts) | illimité | illimité |
| Mensuel Plus | 29 €/mois | illimité | illimité |
| Annuel Plus | 290 €/an | illimité | illimité |

Les plans Plus ajoutent : les multiprofils (plusieurs espaces séparés dans un compte, un par marque ou par cliente), l'analyse IA des résultats, et plusieurs clés Systeme.io.

Le domaine personnalisé demande un plan payant. Le gratuit n'expire jamais.

**L'offre à vie à 57 € n'est plus vendue.** Si quelqu'un l'a, elle reste valable et illimitée : rien à faire, rien à repayer. Ne JAMAIS la proposer à l'achat.

**Adresses à ne jamais inventer :**
- L'app Tiquiz : ${TIQUIZ_APP}
- L'app Tipote : ${TIPOTE_APP}
- La page de vente Tiquiz : https://www.tipote.fr/tiquiz
- L'Atelier du Quiz : https://quizing.tipote.com
Un quiz public s'ouvre sur ${TIQUIZ_APP}/q/[lien] ou sur https://[son-domaine]/[lien].`);

  // ── 2. Tipote : présentation ──
  sections.push(`### Tipote - Présentation
Tipote® est une application web SaaS tout-en-un pour les entrepreneurs. Elle permet de structurer son business, créer du contenu personnalisé avec l'IA, et publier directement sur les réseaux sociaux.

Contrairement aux outils IA génériques, Tipote mémorise le profil business complet de l'utilisateur (diagnostic, persona, offres, objectifs, storytelling) pour générer du contenu véritablement personnalisé.

L'interface existe en 7 langues : Français, English, Español, Italiano, Português, Português do Brasil, العربية. Le centre d'aide, lui, est écrit en 5 langues (français, anglais, espagnol, italien, arabe) : une lectrice en portugais voit les articles en français.
URL : ${TIPOTE_APP}`);

  // ── 3-4. Tipote : fonctionnalités et tarifs ──
  //
  // VOLONTAIREMENT ABSENTS D'ICI. Ils étaient recopiés dans cette
  // fonction alors que les articles `what-is-tipote` et `plans-overview`
  // les disent déjà, et que ces articles sont maintenant injectés EN
  // ENTIER plus bas. Deux copies d'un même fait finissent toujours par
  // diverger : le 6 août 2026, cette copie annonçait les
  // auto-commentaires dès le plan Basic (le code les réserve au Pro) et
  // 8 réseaux publiables (il y en a 7). Le bot répétait donc, avec
  // aplomb, deux informations fausses.
  //
  // Ce qui reste ci-dessous est ce qu'AUCUN article ne dit : la carte de
  // navigation, et le fonctionnement interne.

  // ── 5. Tipote : navigation ──
  sections.push(`### Tipote : navigation de l'application

Donne TOUJOURS le chemin exact, jamais "dans les réglages".

**Menu de gauche :**
- Aujourd'hui (/app) : le tableau de bord, la prochaine tâche
- Ma Stratégie (/strategy) : pyramide d'offres, plan en 3 phases, persona
- Créer (/create) : le hub de création (post, email, article, script vidéo, offre, quiz, stratégie éditoriale)
- Mes Contenus (/contents) : la liste et le calendrier éditorial
- Mes Pages (/pages) : les pages hébergées (capture, vente, vitrine, multiliens)
- Templates (/templates) : les modèles à importer dans Systeme.io
- Automatisations (/automations) : les DM et emails automatiques sur commentaire
- Mes Leads (/leads) : les contacts capturés
- Mes Clients (/clients) : le suivi des clientes et de leurs accompagnements
- Analytics (/analytics), Pépites (/pepites), Widgets (/widgets), Événements live (/webinars), Extension (/boost)
- Paramètres, Aide, Devenir affilié

**Paramètres**, 7 onglets : Profil (nom, mission, niche, storytelling en 6 étapes, offres), Connexions (réseaux sociaux, Systeme.io, auto-commentaires), Réglages (email, mot de passe, langue), Positionnement, Branding (police, couleurs, logo, photo, ton de voix), IA (crédits), Abonnement.

**Parcours typique :** onboarding → Aujourd'hui → Créer → Publier → Mes Contenus → Analytics.

**Ne pas confondre :** *Mes Leads* = les emails capturés (haut de l'entonnoir). *Mes Clients* = celles qui ont acheté (le suivi). *Mes Pages* = les pages hébergées par Tipote. *Templates* = des modèles pour construire dans Systeme.io.`);

  // ── 6. Technique commun ──
  sections.push(`### Sous le capot (les deux apps)

**IA :** deux niveaux. OpenAI GPT pour le stratégique (onboarding, diagnostic, plan, coach, analytics) et Claude d'Anthropic pour la génération de contenu. Les clés sont celles de Tipote : **l'utilisateur n'a JAMAIS besoin de fournir sa propre clé API.**

**Sécurité :** authentification via Supabase Auth (email + mot de passe), OAuth 2.0 avec PKCE pour les réseaux sociaux, chiffrement AES-256-GCM des tokens OAuth et des données personnelles des leads (une clé par utilisateur), Row Level Security sur toutes les tables (chacun ne voit que ses données), index aveugle HMAC pour la recherche sur les champs chiffrés.

**Intégrations :** Systeme.io (facturation par webhooks, export de leads avec tags, templates), n8n (webhooks d'automatisation), 8 réseaux sociaux en OAuth 2.0.`);

  // ── 7. LE CORPUS : le texte complet des articles ──
  //
  // C'est la partie qui change tout. Chaque article est donné avec son
  // ADRESSE, pour que le bot puisse renvoyer vers la page complète au
  // lieu de tout recopier dans le chat.
  const corpus = SEED_CATEGORIES.map((cat) => {
    const articles = SEED_ARTICLES.filter((a) => a.category_slug === cat.slug)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => {
        const titre = a.title.fr ?? a.slug;
        const texte = (a.content.fr ?? "").trim();
        return `#### ${titre}\nAdresse : /support/article/${a.slug}\n\n${texte}`;
      })
      .join("\n\n");
    return `## Catégorie : ${cat.title.fr ?? cat.slug}\n\n${articles}`;
  }).join("\n\n");

  sections.push(`### LE TEXTE COMPLET DES ARTICLES DU CENTRE D'AIDE

Tout ce qui suit est le contenu réel des articles, tel que l'utilisateur le lira. C'est ta source de vérité : quand une réponse s'y trouve, donne-la, et donne aussi l'adresse de l'article pour qu'il puisse lire le détail.

${corpus}`);

  return sections.join("\n\n---\n\n");
}
