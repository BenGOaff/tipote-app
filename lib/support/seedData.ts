// lib/support/seedData.ts
// Comprehensive help center content.
//
// Chaque article porte FR/EN/ES/IT/AR. FR et EN sont complets, ES/IT/AR
// sont des versions condensees mais autonomes : elles doivent rester
// utilisables seules, jamais un renvoi vers le francais.
//
// ATTENTION : ce fichier ne suffit PAS. Les articles vivent en base, et
// modifier ce fichier ne change RIEN en production tant que personne n'a
// cliqué sur "Mettre à jour le contenu d'aide" dans Admin > Support.
// C'est le meme piege qu'une migration SQL jamais appliquee : le code est
// juste, l'ecran ne bouge pas. A rappeler dans chaque message de livraison
// qui touche a ce fichier.

export type SeedCategory = {
  slug: string;
  icon: string;
  sort_order: number;
  title: Record<string, string>;
  description: Record<string, string>;
};

export type SeedArticle = {
  category_slug: string;
  slug: string;
  sort_order: number;
  title: Record<string, string>;
  content: Record<string, string>;
  related_slugs: string[];
  tags: string[];
};

// ─── CATEGORIES ──────────────────────────────────────────────────────
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: "getting-started",
    icon: "Rocket",
    sort_order: 1,
    title: {
      fr: "Premiers pas",
      en: "Getting Started",
      es: "Primeros pasos",
      it: "Per iniziare",
      ar: "البداية",
    },
    description: {
      fr: "Découvrez Tipote et lancez-vous en quelques minutes",
      en: "Discover Tipote and get started in minutes",
      es: "Descubre Tipote y empieza en minutos",
      it: "Scopri Tipote e inizia in pochi minuti",
      ar: "اكتشف Tipote وابدأ في دقائق",
    },
  },
  {
    slug: "account-settings",
    icon: "Settings",
    sort_order: 2,
    title: {
      fr: "Compte & Paramètres",
      en: "Account & Settings",
      es: "Cuenta y Configuración",
      it: "Account e Impostazioni",
      ar: "الحساب والإعدادات",
    },
    description: {
      fr: "Gérez votre profil, mot de passe, langue et préférences",
      en: "Manage your profile, password, language and preferences",
      es: "Gestiona tu perfil, contraseña, idioma y preferencias",
      it: "Gestisci il tuo profilo, password, lingua e preferenze",
      ar: "إدارة ملفك الشخصي وكلمة المرور واللغة والتفضيلات",
    },
  },
  {
    slug: "strategy-plan",
    icon: "Target",
    sort_order: 3,
    title: {
      fr: "Stratégie & Plan d'action",
      en: "Strategy & Action Plan",
      es: "Estrategia y Plan de acción",
      it: "Strategia e Piano d'azione",
      ar: "الاستراتيجية وخطة العمل",
    },
    description: {
      fr: "Comprenez votre plan stratégique, pyramide d'offres et persona",
      en: "Understand your strategic plan, offer pyramid and persona",
      es: "Entiende tu plan estratégico, pirámide de ofertas y persona",
      it: "Comprendi il tuo piano strategico, piramide delle offerte e persona",
      ar: "فهم خطتك الاستراتيجية وهرم العروض والشخصية",
    },
  },
  {
    slug: "content-creation",
    icon: "Sparkles",
    sort_order: 4,
    title: {
      fr: "Création de contenu",
      en: "Content Creation",
      es: "Creación de contenido",
      it: "Creazione di contenuti",
      ar: "إنشاء المحتوى",
    },
    description: {
      fr: "Générez des posts, emails, articles, vidéos et plus avec l'IA",
      en: "Generate posts, emails, articles, videos and more with AI",
      es: "Genera posts, emails, artículos, vídeos y más con IA",
      it: "Genera post, email, articoli, video e altro con l'IA",
      ar: "إنشاء منشورات ورسائل بريد إلكتروني ومقالات وفيديوهات والمزيد باستخدام الذكاء الاصطناعي",
    },
  },
  {
    slug: "social-publishing",
    icon: "Share2",
    sort_order: 5,
    title: {
      fr: "Publication sur les réseaux sociaux",
      en: "Social Media Publishing",
      es: "Publicación en redes sociales",
      it: "Pubblicazione sui social media",
      ar: "النشر على وسائل التواصل الاجتماعي",
    },
    description: {
      fr: "Connectez vos réseaux, publiez et planifiez vos contenus",
      en: "Connect your networks, publish and schedule your content",
      es: "Conecta tus redes, publica y programa tu contenido",
      it: "Collega i tuoi social, pubblica e programma i tuoi contenuti",
      ar: "اربط شبكاتك الاجتماعية وانشر وجدول محتواك",
    },
  },
  {
    slug: "automations",
    icon: "Zap",
    sort_order: 6,
    title: {
      fr: "Automatisations",
      en: "Automations",
      es: "Automatizaciones",
      it: "Automazioni",
      ar: "الأتمتة",
    },
    description: {
      fr: "Auto-commentaires, comment-to-DM et comment-to-email",
      en: "Auto-comments, comment-to-DM and comment-to-email",
      es: "Auto-comentarios, comment-to-DM y comment-to-email",
      it: "Auto-commenti, comment-to-DM e comment-to-email",
      ar: "التعليقات التلقائية والتعليق إلى رسالة مباشرة والتعليق إلى بريد إلكتروني",
    },
  },
  {
    slug: "pages-quiz",
    icon: "Layout",
    sort_order: 7,
    title: {
      fr: "Pages & Quiz",
      en: "Pages & Quizzes",
      es: "Páginas y Quizzes",
      it: "Pagine e Quiz",
      ar: "الصفحات والاختبارات",
    },
    description: {
      fr: "Créez des pages de capture, vente, vitrine et des quiz lead magnet",
      en: "Create landing pages, sales pages, showcase sites and lead magnet quizzes",
      es: "Crea páginas de captura, venta, escaparate y quizzes de lead magnet",
      it: "Crea pagine di cattura, vendita, vetrina e quiz lead magnet",
      ar: "إنشاء صفحات التقاط وبيع وعرض واختبارات جذب العملاء المحتملين",
    },
  },
  {
    slug: "leads-crm",
    icon: "Users",
    sort_order: 8,
    title: {
      fr: "Leads & CRM",
      en: "Leads & CRM",
      es: "Leads y CRM",
      it: "Lead e CRM",
      ar: "العملاء المحتملون وإدارة العلاقات",
    },
    description: {
      fr: "Gérez vos leads, exportez-les et synchronisez avec Systeme.io",
      en: "Manage your leads, export them and sync with Systeme.io",
      es: "Gestiona tus leads, expórtalos y sincroniza con Systeme.io",
      it: "Gestisci i tuoi lead, esportali e sincronizza con Systeme.io",
      ar: "إدارة العملاء المحتملين وتصديرهم ومزامنتهم مع Systeme.io",
    },
  },
  {
    slug: "billing-credits",
    icon: "CreditCard",
    sort_order: 9,
    title: {
      fr: "Abonnements & Crédits",
      en: "Subscriptions & Credits",
      es: "Suscripciones y Créditos",
      it: "Abbonamenti e Crediti",
      ar: "الاشتراكات والرصيد",
    },
    description: {
      fr: "Plans, tarifs, crédits IA et packs supplémentaires",
      en: "Plans, pricing, AI credits and additional packs",
      es: "Planes, precios, créditos IA y packs adicionales",
      it: "Piani, prezzi, crediti IA e pacchetti aggiuntivi",
      ar: "الخطط والأسعار ورصيد الذكاء الاصطناعي والحزم الإضافية",
    },
  },
  {
    slug: "analytics-pepites",
    icon: "BarChart3",
    sort_order: 10,
    title: {
      fr: "Analytics & Pépites",
      en: "Analytics & Insights",
      es: "Analytics e Insights",
      it: "Analytics e Intuizioni",
      ar: "التحليلات والأفكار",
    },
    description: {
      fr: "Suivez vos performances et découvrez les pépites business",
      en: "Track your performance and discover business insights",
      es: "Sigue tu rendimiento y descubre insights de negocio",
      it: "Monitora le tue prestazioni e scopri insight di business",
      ar: "تتبع أدائك واكتشف الأفكار التجارية",
    },
  },
  {
    slug: "widgets",
    icon: "Box",
    sort_order: 11,
    title: {
      fr: "Widgets embarquables",
      en: "Embeddable Widgets",
      es: "Widgets integrables",
      it: "Widget incorporabili",
      ar: "الأدوات القابلة للتضمين",
    },
    description: {
      fr: "Notifications de preuve sociale et boutons de partage à intégrer sur vos sites",
      en: "Social proof notifications and share buttons to embed on your sites",
      es: "Notificaciones de prueba social y botones de compartir para integrar en tus sitios",
      it: "Notifiche di prova sociale e pulsanti di condivisione da incorporare nei tuoi siti",
      ar: "إشعارات الإثبات الاجتماعي وأزرار المشاركة لتضمينها في مواقعك",
    },
  },
  {
    slug: "tiquiz",
    icon: "ClipboardList",
    sort_order: 12,
    title: {
      fr: "Tiquiz - Quiz & Leads",
      en: "Tiquiz - Quiz & Leads",
      es: "Tiquiz - Quiz y Leads",
      it: "Tiquiz - Quiz e Lead",
      ar: "Tiquiz - اختبارات وعملاء",
    },
    description: {
      fr: "Créez des quiz interactifs, capturez des leads et synchronisez avec Systeme.io",
      en: "Create interactive quizzes, capture leads, and sync with Systeme.io",
      es: "Crea quiz interactivos, captura leads y sincroniza con Systeme.io",
      it: "Crea quiz interattivi, cattura lead e sincronizza con Systeme.io",
      ar: "أنشئ اختبارات تفاعلية واجمع عملاء محتملين وزامن مع Systeme.io",
    },
  },
];

// ─── ARTICLES ────────────────────────────────────────────────────────
export const SEED_ARTICLES: SeedArticle[] = [
  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 1: GETTING STARTED
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "getting-started",
    slug: "what-is-tipote",
    sort_order: 1,
    title: {
      fr: "Qu'est-ce que Tipote ?",
      en: "What is Tipote?",
      es: "¿Qué es Tipote?",
      it: "Cos'è Tipote?",
      ar: "ما هو Tipote؟",
    },
    content: {
      fr: `## Tipote, votre pote de business

Tipote® est une application web SaaS tout-en-un conçue pour les entrepreneurs qui veulent **structurer leur business et créer du contenu personnalisé grâce à l'IA**.

### Le problème que Tipote résout

- **51%** des entrepreneurs n'ont pas encore fait leur première vente
- **46%** passent trop de temps sur la création de contenu
- **52%** trouvent l'IA trop générique et inutile pour leur cas

### Ce qui rend Tipote unique

Contrairement aux outils IA génériques (ChatGPT, etc.) qui repartent de zéro à chaque conversation, **Tipote mémorise tout votre profil business** :
- Votre activité, vos offres, votre audience cible
- Votre style de communication et votre tonalité
- Vos objectifs business et vos jalons par phase (Fondations / Croissance / Scaling)
- Votre positionnement et différenciation

Chaque contenu généré est **réellement personnalisé** pour votre business.

### Les grandes fonctionnalités

1. **Onboarding intelligent** - Un questionnaire complet qui crée votre profil business
2. **Plan stratégique IA** - Un plan d'action en 3 phases (Fondations / Croissance / Scaling) avec pyramide d'offres
3. **Création de contenu IA** - Posts, emails, articles, vidéos, quiz, pages et plus
4. **Publication directe** - Publiez sur LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok et Pinterest en un clic
5. **Automatisations** - Auto-commentaires, comment-to-DM, comment-to-email
6. **Pages & Quiz** - Créez des landing pages et des quiz lead magnet hébergés
7. **Gestion des leads** - Centralisez et exportez vos prospects (chiffrement AES-256)
8. **Analytics IA** - Suivez vos KPIs et recevez un diagnostic business

### Disponible en 7 langues

L'interface existe en Français, English, Español, Italiano, Português, Português do Brasil et العربية. Cette aide, elle, est écrite en 5 langues (français, anglais, espagnol, italien, arabe) : si tu lis en portugais, les articles s'affichent en français.

> **Prochaine étape :** [Créer votre compte et compléter l'onboarding](/support/article/create-account)`,
      en: `## Tipote, your business buddy

Tipote® is an all-in-one SaaS web application designed for entrepreneurs who want to **structure their business and create personalized content with AI**.

### The problem Tipote solves

- **51%** of entrepreneurs haven't made their first sale yet
- **46%** spend too much time on content creation
- **52%** find AI too generic and useless for their case

### What makes Tipote unique

Unlike generic AI tools (ChatGPT, etc.) that start from scratch every conversation, **Tipote remembers your entire business profile**:
- Your business, offers, target audience
- Your communication style and tone
- Your business goals and milestones per phase (Foundations / Growth / Scaling)
- Your positioning and differentiation

Every generated content is **truly personalized** for your business.

### Main features

1. **Smart onboarding** - A complete questionnaire that creates your business profile
2. **AI strategic plan** - A 3-phase action plan (Foundations / Growth / Scaling) with offer pyramid
3. **AI content creation** - Posts, emails, articles, videos, quizzes, pages and more
4. **Direct publishing** - Publish on LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok and Pinterest in one click
5. **Automations** - Auto-comments, comment-to-DM, comment-to-email
6. **Pages & Quizzes** - Create hosted landing pages and lead magnet quizzes
7. **Lead management** - Centralize and export your prospects (AES-256 encryption)
8. **AI Analytics** - Track your KPIs and get a business diagnosis

### Available in 7 languages

The interface exists in Français, English, Español, Italiano, Português, Português do Brasil and العربية. This help centre is written in 5 of them (French, English, Spanish, Italian, Arabic): if you read in Portuguese, articles show in French.

> **Next step:** [Create your account and complete onboarding](/support/article/create-account)`,
      es: `## Tipote, tu compañero de negocios

Tipote® es una aplicación web SaaS todo en uno diseñada para emprendedores que quieren **estructurar su negocio y crear contenido personalizado con IA**.

### El problema que Tipote resuelve

- **51%** de los emprendedores no han hecho su primera venta
- **46%** pasan demasiado tiempo creando contenido
- **52%** encuentran la IA demasiado genérica

### Lo que hace único a Tipote

A diferencia de herramientas genéricas, **Tipote memoriza todo tu perfil de negocio** para generar contenido realmente personalizado.

### Funcionalidades principales

1. **Onboarding inteligente** - Cuestionario completo que crea tu perfil
2. **Plan estratégico IA** - Plan de acción en 3 fases (Cimientos / Crecimiento / Escalado)
3. **Creación de contenido IA** - Posts, emails, artículos, vídeos y más
4. **Publicación directa** - Publica en 7 redes sociales en un clic
5. **Automatizaciones** - Auto-comentarios, comment-to-DM
6. **Páginas y Quiz** - Landing pages y quizzes alojados
7. **Gestión de leads** - Centraliza y exporta tus prospectos
8. **Analytics IA** - KPIs y diagnóstico de negocio

> **Siguiente paso:** [Crear tu cuenta y completar el onboarding](/support/article/create-account)`,
      it: `## Tipote, il tuo amico di business

Tipote® è un'applicazione web SaaS tutto-in-uno progettata per imprenditori che vogliono **strutturare il loro business e creare contenuti personalizzati con l'IA**.

### Le funzionalità principali

1. **Onboarding intelligente** - Questionario completo che crea il tuo profilo
2. **Piano strategico IA** - Piano d'azione in 3 fasi (Fondamenta / Crescita / Scaling)
3. **Creazione contenuti IA** - Post, email, articoli, video e altro
4. **Pubblicazione diretta** - Pubblica su 7 social network in un clic
5. **Automazioni** - Auto-commenti, comment-to-DM
6. **Pagine e Quiz** - Landing page e quiz lead magnet ospitati
7. **Gestione lead** - Centralizza e esporta i tuoi contatti
8. **Analytics IA** - KPI e diagnosi di business

> **Prossimo passo:** [Crea il tuo account e completa l'onboarding](/support/article/create-account)`,
      ar: `## Tipote، رفيقك في الأعمال

Tipote® هو تطبيق ويب SaaS متكامل مصمم لرواد الأعمال الذين يريدون **هيكلة أعمالهم وإنشاء محتوى مخصص باستخدام الذكاء الاصطناعي**.

### الميزات الرئيسية

1. **إعداد ذكي** - استبيان كامل ينشئ ملفك التجاري
2. **خطة استراتيجية بالذكاء الاصطناعي** - خطة عمل من 3 مراحل (الأسس / النمو / التوسع)
3. **إنشاء محتوى بالذكاء الاصطناعي** - منشورات ورسائل ومقالات وفيديوهات
4. **نشر مباشر** - انشر على 7 شبكات اجتماعية بنقرة واحدة
5. **أتمتة** - تعليقات تلقائية
6. **صفحات واختبارات** - صفحات هبوط واختبارات مستضافة
7. **إدارة العملاء المحتملين** - مركزة وتصدير العملاء المحتملين
8. **تحليلات بالذكاء الاصطناعي** - مؤشرات الأداء وتشخيص الأعمال`,
    },
    related_slugs: ["create-account", "onboarding-guide", "plans-overview"],
    tags: ["introduction", "overview", "features"],
  },
  {
    category_slug: "getting-started",
    slug: "create-account",
    sort_order: 2,
    title: {
      fr: "Créer son compte Tipote",
      en: "Create your Tipote account",
      es: "Crear tu cuenta Tipote",
      it: "Creare il tuo account Tipote",
      ar: "إنشاء حساب Tipote",
    },
    content: {
      fr: `## Créer votre compte en 2 minutes

### Étape 1 : Inscription

1. Rendez-vous sur **app.tipote.com**
2. Cliquez sur **"Créer un compte"**
3. Entrez votre **adresse email** et choisissez un **mot de passe**
4. Confirmez votre email via le lien reçu dans votre boîte mail

> 💡 **Astuce :** Vérifiez votre dossier spam si vous ne recevez pas l'email de confirmation.

### Étape 2 : Choisir votre langue

Tipote détecte automatiquement la langue de votre navigateur. Vous pouvez la changer à tout moment dans **Paramètres > Réglages**.

Les langues disponibles sont : Français, English, Español, Italiano, العربية.

### Étape 3 : Compléter l'onboarding

Dès votre première connexion, Tipote vous guide à travers un **questionnaire intelligent de type Typeform** qui capture :

- Votre **activité et secteur**
- Vos **offres** (ou votre situation si vous débutez)
- Votre **audience cible**
- Vos **objectifs à 90 jours**
- Votre **style de communication**
- Vos **différenciateurs et preuves**

Ce questionnaire est **obligatoire** pour débloquer toutes les fonctionnalités stratégiques. Il prend environ **10-15 minutes**.

### Que se passe-t-il après l'onboarding ?

Tipote utilise vos réponses pour :
1. **Créer votre persona client idéal** détaillé
2. **Diagnostiquer** les forces et faiblesses de votre business
3. **Proposer 3 à 5 pyramides d'offres** (vous en choisissez une)
4. **Générer un plan d'action en 3 phases** (Fondations / Croissance / Scaling) avec des tâches concrètes

Vous êtes ensuite redirigé vers votre **dashboard "Aujourd'hui"**.

> **Voir aussi :** [Guide complet de l'onboarding](/support/article/onboarding-guide)`,
      en: `## Create your account in 2 minutes

### Step 1: Sign up

1. Go to **app.tipote.com**
2. Click **"Create an account"**
3. Enter your **email address** and choose a **password**
4. Confirm your email via the link received in your inbox

> 💡 **Tip:** Check your spam folder if you don't receive the confirmation email.

### Step 2: Choose your language

Tipote automatically detects your browser language. You can change it anytime in **Settings > General**.

Available languages: Français, English, Español, Italiano, العربية.

### Step 3: Complete the onboarding

On your first login, Tipote guides you through a **smart Typeform-style questionnaire** that captures:

- Your **business and sector**
- Your **offers** (or situation if you're starting out)
- Your **target audience**
- Your **90-day goals**
- Your **communication style**
- Your **differentiators and proof**

This questionnaire is **mandatory** to unlock all strategic features. It takes about **10-15 minutes**.

### What happens after onboarding?

Tipote uses your answers to:
1. **Create your ideal customer persona**
2. **Diagnose** your business strengths and weaknesses
3. **Propose 3-5 offer pyramids** (you choose one)
4. **Generate a 3-phase action plan** (Foundations / Growth / Scaling) with concrete tasks

You're then redirected to your **"Today" dashboard**.

> **See also:** [Complete onboarding guide](/support/article/onboarding-guide)`,
      es: `## Crea tu cuenta en 2 minutos

1. Ve a **app.tipote.com**
2. Haz clic en **"Crear cuenta"**
3. Introduce tu **email** y elige una **contraseña**
4. Confirma tu email con el enlace recibido

Después del registro, completa el **onboarding inteligente** (10-15 min) para desbloquear todas las funcionalidades.

> **Ver también:** [Guía completa del onboarding](/support/article/onboarding-guide)`,
      it: `## Crea il tuo account in 2 minuti

1. Vai su **app.tipote.com**
2. Clicca su **"Crea account"**
3. Inserisci la tua **email** e scegli una **password**
4. Conferma la tua email con il link ricevuto

Dopo la registrazione, completa l'**onboarding intelligente** (10-15 min) per sbloccare tutte le funzionalità.

> **Vedi anche:** [Guida completa all'onboarding](/support/article/onboarding-guide)`,
      ar: `## أنشئ حسابك في دقيقتين

1. اذهب إلى **app.tipote.com**
2. انقر على **"إنشاء حساب"**
3. أدخل **بريدك الإلكتروني** واختر **كلمة مرور**
4. أكد بريدك الإلكتروني عبر الرابط المرسل

بعد التسجيل، أكمل **الإعداد الذكي** (10-15 دقيقة) لفتح جميع الميزات.`,
    },
    related_slugs: ["what-is-tipote", "onboarding-guide", "dashboard-overview"],
    tags: ["account", "signup", "registration"],
  },
  {
    category_slug: "getting-started",
    slug: "onboarding-guide",
    sort_order: 3,
    title: {
      fr: "Guide complet de l'onboarding",
      en: "Complete onboarding guide",
      es: "Guía completa del onboarding",
      it: "Guida completa all'onboarding",
      ar: "دليل الإعداد الكامل",
    },
    content: {
      fr: `## L'onboarding Tipote : votre passeport vers la réussite

L'onboarding est le **cœur de Tipote**. C'est grâce à ces informations que l'IA pourra générer du contenu véritablement personnalisé.

### Format du questionnaire

Le questionnaire est de type **Typeform** : une question à la fois, progression visuelle, ambiance conversationnelle.

### Les informations collectées

#### 1. Votre profil business
- Nom de votre entreprise/activité
- Secteur et niche
- Depuis quand vous êtes en activité

#### 2. Vos offres
Trois scénarios possibles :
- **Vous avez déjà des offres** → décrivez-les (nom, prix, cible)
- **Vous n'avez pas encore d'offre** → Tipote vous aidera à en créer
- **Vous êtes affilié** → décrivez les produits que vous promouvez

#### 3. Votre situation réelle
- Chiffre d'affaires actuel
- Freins et difficultés rencontrés
- Contraintes de temps et ressources

#### 4. Votre positionnement
- Ce qui vous différencie de la concurrence
- Vos preuves (témoignages, résultats, certifications)
- Votre « formule de niche »

#### 5. Votre audience cible
- Qui est votre client idéal
- Ses problèmes et frustrations
- Ses objectifs et aspirations

#### 6. Vos objectifs à 90 jours
- Objectif de revenu
- Nombre de clients visé
- Actions prioritaires

#### 7. Votre style de communication
- Tonalité (formel, amical, expert, provocateur...)
- Non-négociables (ce que vous ne voulez jamais dire/faire)

### Après l'onboarding

Tipote traite vos réponses avec l'**IA stratégique (GPT)** pour :

1. ✅ Créer votre **persona client idéal** détaillé
2. ✅ Produire un **diagnostic business** (forces, faiblesses, leviers)
3. ✅ Proposer **3 à 5 pyramides d'offres** adaptées
4. ✅ Vous laisser **choisir et personnaliser** votre pyramide
5. ✅ Générer un **plan d'action en 3 phases (Fondations / Croissance / Scaling)**
6. ✅ Créer automatiquement les **tâches** associées

> **Astuce :** Prenez votre temps pour répondre honnêtement. Plus vos réponses sont détaillées, meilleure sera la stratégie générée.

> **Voir aussi :** [Comprendre votre plan stratégique](/support/article/strategic-plan) • [La pyramide d'offres](/support/article/offer-pyramid)`,
      en: `## Tipote Onboarding: your passport to success

Onboarding is the **heart of Tipote**. This information allows the AI to generate truly personalized content.

### Questionnaire format

The questionnaire is **Typeform-style**: one question at a time, visual progress, conversational feel.

### Information collected

#### 1. Your business profile
- Business name, sector, niche, how long you've been active

#### 2. Your offers
- Existing offers, no offers yet, or affiliate products

#### 3. Your real situation
- Current revenue, obstacles, time constraints

#### 4. Your positioning
- What makes you different, proof points, niche formula

#### 5. Your target audience
- Ideal customer, their problems, goals

#### 6. Your 90-day goals
- Revenue target, number of clients, priorities

#### 7. Your communication style
- Tone, non-negotiables

### After onboarding

Tipote processes your answers with **strategic AI (GPT)** to create your persona, business diagnosis, offer pyramid, and 3-phase action plan (Foundations / Growth / Scaling).

> **See also:** [Understanding your strategic plan](/support/article/strategic-plan) • [The offer pyramid](/support/article/offer-pyramid)`,
      es: `## El onboarding de Tipote

El onboarding captura tu perfil de negocio completo para que la IA genere contenido realmente personalizado. Formato Typeform, una pregunta a la vez.

Después del onboarding, Tipote genera tu persona, diagnóstico, pirámide de ofertas y plan de acción.

> **Ver también:** [Tu plan estratégico](/support/article/strategic-plan)`,
      it: `## L'onboarding di Tipote

L'onboarding cattura il tuo profilo business completo per permettere all'IA di generare contenuti personalizzati. Formato Typeform, una domanda alla volta.

Dopo l'onboarding, Tipote genera persona, diagnosi, piramide delle offerte e piano d'azione.

> **Vedi anche:** [Il tuo piano strategico](/support/article/strategic-plan)`,
      ar: `## إعداد Tipote

يلتقط الإعداد ملفك التجاري الكامل حتى يتمكن الذكاء الاصطناعي من إنشاء محتوى مخصص حقًا. تنسيق Typeform، سؤال واحد في كل مرة.

بعد الإعداد، ينشئ Tipote شخصيتك وتشخيصك وهرم العروض وخطة العمل.`,
    },
    related_slugs: ["create-account", "strategic-plan", "offer-pyramid", "dashboard-overview"],
    tags: ["onboarding", "setup", "profile"],
  },
  {
    category_slug: "getting-started",
    slug: "dashboard-overview",
    sort_order: 4,
    title: {
      fr: "Le dashboard « Aujourd'hui »",
      en: "The \"Today\" Dashboard",
      es: "El panel \"Hoy\"",
      it: "La dashboard \"Oggi\"",
      ar: "لوحة \"اليوم\"",
    },
    content: {
      fr: `## Votre page d'accueil après connexion

Le dashboard **"Aujourd'hui"** est la première page que vous voyez à chaque connexion. Il vous donne une **vue d'ensemble rapide** de votre activité.

### Ce que vous y trouvez

#### 1. Banner d'action prioritaire
En haut de page, un banner vous indique votre **prochaine action recommandée** avec :
- Le type d'action (création de contenu, tâche stratégique...)
- Le canal concerné (LinkedIn, Instagram...)
- Des boutons d'action rapide : **"Créer en 1 clic"** et **"Voir la stratégie"**

#### 2. Statistiques clés (4 cartes)
- **Contenus publiés** ce mois
- **Tâches complétées**
- **Engagement** (interactions sur vos publications)
- **Prochaine échéance**

#### 3. Progression de la semaine
Des barres de progression montrent votre avancement sur les objectifs de la semaine.

#### 4. Actions rapides
Trois boutons d'accès rapide :
- 📝 **Créer du contenu** → Hub de création
- 📂 **Voir mes contenus** → Liste et calendrier
- 🎯 **Ma stratégie** → Plan d'action et pyramide

#### 5. À venir cette semaine
La liste de vos contenus **planifiés** pour les prochains jours.

> **Navigation :** Utilisez la **sidebar** à gauche pour accéder à toutes les sections de Tipote.

> **Voir aussi :** [Naviguer dans Tipote](/support/article/navigation-guide) • [Créer du contenu](/support/article/create-content-overview)`,
      en: `## Your homepage after login

The **"Today"** dashboard is the first page you see on each login. It gives you a **quick overview** of your activity.

### What you'll find

1. **Priority action banner** - Your next recommended action with quick action buttons
2. **Key stats** (4 cards) - Published content, completed tasks, engagement, next deadline
3. **Week progress** - Progress bars for weekly goals
4. **Quick actions** - Fast access to content creation, content list, and strategy
5. **Coming this week** - List of scheduled content

> **See also:** [Navigate Tipote](/support/article/navigation-guide) • [Create content](/support/article/create-content-overview)`,
      es: `## Tu página principal

El panel **"Hoy"** te da una vista rápida de tu actividad: acción prioritaria, estadísticas, progreso semanal y contenido programado.

> **Ver también:** [Crear contenido](/support/article/create-content-overview)`,
      it: `## La tua homepage

La dashboard **"Oggi"** ti offre una panoramica rapida: azione prioritaria, statistiche, progresso settimanale e contenuti programmati.

> **Vedi anche:** [Creare contenuti](/support/article/create-content-overview)`,
      ar: `## صفحتك الرئيسية

لوحة **"اليوم"** تمنحك نظرة سريعة على نشاطك: الإجراء الأولوي والإحصائيات والتقدم الأسبوعي والمحتوى المجدول.`,
    },
    related_slugs: ["navigation-guide", "create-content-overview", "strategic-plan"],
    tags: ["dashboard", "today", "homepage"],
  },
  {
    category_slug: "getting-started",
    slug: "navigation-guide",
    sort_order: 5,
    title: {
      fr: "Naviguer dans Tipote",
      en: "Navigate Tipote",
      es: "Navegar en Tipote",
      it: "Navigare in Tipote",
      ar: "التنقل في Tipote",
    },
    content: {
      fr: `## La sidebar : votre menu principal

La **sidebar** à gauche de l'écran est votre point d'accès principal à toutes les fonctionnalités.

### Menu principal

| Icône | Menu | Ce que vous y trouvez |
|-------|------|----------------------|
| ☀️ | **Aujourd'hui** | Dashboard avec stats et prochaine action |
| 🎯 | **Ma Stratégie** | Plan d'action, pyramide d'offres, persona |
| ✨ | **Créer** | Hub de création (8 types de contenu) |
| 📂 | **Mes Contenus** | Liste + calendrier éditorial |
| 📄 | **Templates** | Templates Systeme.io |
| ⚡ | **Automatisations** | Auto-commentaires et webhooks |
| 👥 | **Mes Leads** | Gestion des prospects |

### Menu secondaire

| Icône | Menu | Ce que vous y trouvez |
|-------|------|----------------------|
| 📊 | **Analytics** | KPIs + diagnostic IA |
| 💎 | **Pépites** | Insights business |
| ⚙️ | **Paramètres** | 7 onglets de configuration |

### Le header (barre du haut)

De gauche à droite :
- **Titre de la page** actuelle
- **Crédits IA** restants (cliquez pour voir le détail)
- **Sélecteur de projet** (si plan Elite avec multi-projets)
- **Cloche de notifications** avec badge
- **Avatar** avec menu (profil, déconnexion)

### Replier la sidebar

Cliquez sur l'icône **flèche** en bas de la sidebar pour la replier et gagner de l'espace. Sur mobile, la sidebar s'ouvre en overlay.

### Le didacticiel interactif

Lors de vos **7 premiers jours**, un tutoriel guidé vous accompagne page par page avec des tooltips et des spotlights. Vous pouvez le relancer depuis le **bouton d'aide** (icône "?").

> **Voir aussi :** [Le dashboard Aujourd'hui](/support/article/dashboard-overview) • [Les paramètres](/support/article/settings-overview)`,
      en: `## The sidebar: your main menu

The **sidebar** on the left is your main access point to all features.

### Main menu
- **Today** - Dashboard with stats and next action
- **My Strategy** - Action plan, offer pyramid, persona
- **Create** - Creation hub (8 content types)
- **My Content** - List + editorial calendar
- **Templates** - Systeme.io templates
- **Automations** - Auto-comments and webhooks
- **My Leads** - Prospect management

### Secondary menu
- **Analytics** - KPIs + AI diagnosis
- **Insights** - Business insights
- **Settings** - 7 configuration tabs

### Header bar
Credits remaining, project switcher (Elite), notification bell, avatar menu.

### Interactive tutorial
During your first 7 days, a guided tutorial walks you through each page.

> **See also:** [Today dashboard](/support/article/dashboard-overview) • [Settings](/support/article/settings-overview)`,
      es: `## La barra lateral: tu menú principal

Accede a todas las funcionalidades desde la barra lateral izquierda. Incluye: Hoy, Estrategia, Crear, Contenidos, Templates, Automatizaciones, Leads, Analytics, Pépites y Configuración.`,
      it: `## La sidebar: il tuo menu principale

Accedi a tutte le funzionalità dalla sidebar a sinistra. Include: Oggi, Strategia, Crea, Contenuti, Templates, Automazioni, Lead, Analytics, Intuizioni e Impostazioni.`,
      ar: `## الشريط الجانبي: قائمتك الرئيسية

الوصول إلى جميع الميزات من الشريط الجانبي الأيسر. يشمل: اليوم، الاستراتيجية، الإنشاء، المحتوى، القوالب، الأتمتة، العملاء المحتملون، التحليلات والإعدادات.`,
    },
    related_slugs: ["dashboard-overview", "settings-overview", "interactive-tutorial"],
    tags: ["navigation", "sidebar", "menu", "ui"],
  },
  {
    category_slug: "getting-started",
    slug: "interactive-tutorial",
    sort_order: 6,
    title: {
      fr: "Le didacticiel interactif",
      en: "The interactive tutorial",
      es: "El tutorial interactivo",
      it: "Il tutorial interattivo",
      ar: "البرنامج التعليمي التفاعلي",
    },
    content: {
      fr: `## Apprenez Tipote en vous laissant guider

### Comment ça marche ?

Dès votre première connexion (après l'onboarding), un **didacticiel interactif** se lance automatiquement. Il vous guide à travers **18 étapes** couvrant toutes les pages de l'application.

### Les 18 phases du tutoriel

1. **Bienvenue** - Modal d'introduction avec 4 étapes prévisualisées
2. **Tour Aujourd'hui** - Découverte du dashboard
3. **Tour Stratégie** - Plan d'action et pyramide
4. **Tour Créer** - Hub de création
5. **Tour Contenus** - Liste et calendrier
6. **Tour Templates** - Bibliothèque de templates
7. **Tour Crédits** - Comprendre les crédits IA
8. **Tour Analytics** - Suivi des performances
9. **Tour Pépites** - Les insights business
10. **Tour Paramètres Profil** - Configuration du profil
11. **Tour Connexions** - Connecter les réseaux sociaux
12. **Tour Réglages** - Email, mot de passe, langue
13. **Tour Positionnement** - Analyse concurrentielle
14. **Tour Branding** - Identité visuelle
15. **Tour IA** - Gestion des crédits et paramètres IA
16. **Tour Abonnement** - Plans et facturation
17. **Tour Coach** - Le coach IA
18. **Complétion** - Félicitations et prochaines étapes

### Fonctionnement UX

- **Tooltips** avec compteur d'étapes (ex: "3 / 18")
- **Spotlight** sur l'élément ciblé (le reste est assombri)
- **Opt-out** possible via un lien discret en bas du tooltip
- **Fenêtre de 7 jours** - Le tutoriel n'apparaît que pendant vos 7 premiers jours

### Relancer le tutoriel

Vous pouvez **relancer ou réactiver** le tutoriel à tout moment via le **bouton d'aide** (icône "?" en bas à droite de l'écran).

> **Voir aussi :** [Naviguer dans Tipote](/support/article/navigation-guide)`,
      en: `## Learn Tipote with guided tours

### How it works

On first login (after onboarding), an **interactive tutorial** launches automatically, guiding you through **18 steps** covering all app pages.

The tutorial uses tooltips with step counters, spotlights on target elements, and runs for your first 7 days. You can opt out anytime.

### Relaunch the tutorial

Relaunch or reactivate the tutorial anytime via the **help button** ("?" icon, bottom right).

> **See also:** [Navigate Tipote](/support/article/navigation-guide)`,
      es: `## Aprende Tipote con tours guiados

Un tutorial interactivo de 18 pasos te guía por toda la aplicación durante tus primeros 7 días. Puedes relanzarlo desde el botón de ayuda.`,
      it: `## Impara Tipote con tour guidati

Un tutorial interattivo di 18 passaggi ti guida attraverso tutta l'applicazione durante i primi 7 giorni. Puoi rilanciarlo dal pulsante di aiuto.`,
      ar: `## تعلم Tipote مع جولات إرشادية

برنامج تعليمي تفاعلي من 18 خطوة يرشدك عبر التطبيق بالكامل خلال أول 7 أيام. يمكنك إعادة تشغيله من زر المساعدة.`,
    },
    related_slugs: ["navigation-guide", "dashboard-overview"],
    tags: ["tutorial", "guide", "onboarding"],
  },
  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 2: ACCOUNT & SETTINGS
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "account-settings",
    slug: "settings-overview",
    sort_order: 1,
    title: {
      fr: "Les paramètres : vue d'ensemble",
      en: "Settings overview",
      es: "Configuración: vista general",
      it: "Impostazioni: panoramica",
      ar: "الإعدادات: نظرة عامة",
    },
    content: {
      fr: `## 7 onglets pour tout configurer

Accédez aux paramètres via **⚙️ Paramètres** dans la sidebar. Vous y trouverez 7 onglets :

### 1. Profil
- Prénom et mission
- **Storytelling fondateur** en 6 étapes (Situation initiale → Élément déclencheur → Péripéties → Moment critique → Résolution → Situation finale)
- Gestion des offres avec liens
- URLs de vos réseaux sociaux
- Liens personnalisés
- Langue du contenu généré

### 2. Connexions
- Connexion OAuth de vos **7 réseaux sociaux** (LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest)
- Configuration **API Systeme.io**
- Configuration des **auto-commentaires**

### 3. Réglages
- Modifier votre **email** et **mot de passe**
- **Langue par défaut** de l'interface

### 4. Positionnement
- Analyse de vos **concurrents**
- Positionnement sur le **marché**
- Définition de votre **niche**

### 5. Branding
- **Police** de marque
- **Couleurs** (base + accent)
- **Logo** (upload)
- **Photo auteur** (upload)
- **Ton de voix**

### 6. IA
- Panel de **crédits IA** restants
- Gestion des **clés API** (optionnel)
- Paramètres du modèle

### 7. Abonnement
- Plan actuel avec badge
- Crédits disponibles / total
- **Tableau comparatif** des plans
- Consommation par type de contenu
- Actions : acheter crédits, upgrade/downgrade

> **Voir aussi :** [Connecter vos réseaux sociaux](/support/article/connect-social-networks) • [Gérer votre abonnement](/support/article/manage-subscription)`,
      en: `## 7 tabs to configure everything

Access settings via **⚙️ Settings** in the sidebar. You'll find 7 tabs: Profile, Connections, General, Positioning, Branding, AI, and Subscription.

Each tab lets you configure a specific aspect of your Tipote experience.

> **See also:** [Connect social networks](/support/article/connect-social-networks) • [Manage subscription](/support/article/manage-subscription)`,
      es: `## 7 pestañas para configurar todo

Accede a la configuración desde **⚙️ Configuración** en la barra lateral. 7 pestañas: Perfil, Conexiones, Ajustes, Posicionamiento, Branding, IA y Suscripción.`,
      it: `## 7 schede per configurare tutto

Accedi alle impostazioni da **⚙️ Impostazioni** nella sidebar. 7 schede: Profilo, Connessioni, Impostazioni, Posizionamento, Branding, IA e Abbonamento.`,
      ar: `## 7 علامات تبويب لتهيئة كل شيء

الوصول إلى الإعدادات من **⚙️ الإعدادات** في الشريط الجانبي. 7 علامات تبويب: الملف الشخصي، الاتصالات، الإعدادات، التموضع، العلامة التجارية، الذكاء الاصطناعي والاشتراك.`,
    },
    related_slugs: ["connect-social-networks", "manage-subscription", "branding-settings", "change-language"],
    tags: ["settings", "configuration", "profile"],
  },
  {
    category_slug: "account-settings",
    slug: "change-language",
    sort_order: 2,
    title: {
      fr: "Changer la langue de l'interface",
      en: "Change the interface language",
      es: "Cambiar el idioma de la interfaz",
      it: "Cambiare la lingua dell'interfaccia",
      ar: "تغيير لغة الواجهة",
    },
    content: {
      fr: `## Changer de langue en 2 clics

Tipote est disponible en **7 langues** : Français, English, Español, Italiano, Português, Português do Brasil et العربية.

### Méthode 1 : Depuis les paramètres

1. Allez dans **Paramètres > Réglages**
2. Cherchez le champ **"Langue par défaut"**
3. Sélectionnez la langue souhaitée
4. L'interface change immédiatement

### Méthode 2 : Depuis la sidebar

En bas de la sidebar, un **sélecteur de langue** vous permet de changer rapidement.

### Langue du contenu vs langue de l'interface

**Important :** la langue de l'interface et la langue du contenu généré sont **indépendantes**.

- **Langue d'interface** : affecte les menus, boutons, textes de l'app
- **Langue du contenu** : affecte le contenu généré par l'IA (configurable dans Paramètres > Profil)

Vous pouvez utiliser Tipote en français mais générer du contenu en anglais !

### Support RTL (arabe)

L'interface passe automatiquement en mode **droite-à-gauche (RTL)** quand vous sélectionnez l'arabe.

> **Voir aussi :** [Les paramètres](/support/article/settings-overview)`,
      en: `## Change language in 2 clicks

Tipote is available in **7 languages**: Français, English, Español, Italiano, Português, Português do Brasil and العربية.

### From Settings
Go to **Settings > General** and select your preferred language.

### From the sidebar
Use the **language switcher** at the bottom of the sidebar.

### Interface language vs content language
These are **independent** settings. You can use Tipote in French but generate content in English!

> **See also:** [Settings overview](/support/article/settings-overview)`,
      es: `## Cambia el idioma en 2 clics

Tipote está disponible en 7 idiomas. Ve a **Configuración > Ajustes** o usa el selector en la barra lateral.`,
      it: `## Cambia lingua in 2 clic

Tipote è disponibile in 7 lingue. Vai in **Impostazioni > Impostazioni** o usa il selettore nella sidebar.`,
      ar: `## غيّر اللغة بنقرتين

Tipote متاح بـ 5 لغات. اذهب إلى **الإعدادات > الإعدادات** أو استخدم محدد اللغة في الشريط الجانبي.`,
    },
    related_slugs: ["settings-overview"],
    tags: ["language", "locale", "interface", "rtl"],
  },
  {
    category_slug: "account-settings",
    slug: "change-password",
    sort_order: 3,
    title: {
      fr: "Changer votre mot de passe",
      en: "Change your password",
      es: "Cambiar tu contraseña",
      it: "Cambiare la password",
      ar: "تغيير كلمة المرور",
    },
    content: {
      fr: `## Modifier votre mot de passe

### Depuis l'application

1. Allez dans **Paramètres > Réglages**
2. Section **"Mot de passe"**
3. Entrez votre nouveau mot de passe
4. Confirmez et sauvegardez

### Mot de passe oublié ?

1. Sur la page de connexion, cliquez sur **"Mot de passe oublié ?"**
2. Entrez votre adresse email
3. Vous recevrez un **lien de réinitialisation** par email
4. Cliquez sur le lien et choisissez un nouveau mot de passe

> 💡 **Astuce :** Utilisez un mot de passe fort d'au moins 8 caractères avec des majuscules, chiffres et caractères spéciaux.

> **Voir aussi :** [Les paramètres](/support/article/settings-overview)`,
      en: `## Change your password

### From the app
Go to **Settings > General**, find the password section, enter your new password and save.

### Forgot password?
On the login page, click **"Forgot password?"**, enter your email, and follow the reset link.

> **See also:** [Settings overview](/support/article/settings-overview)`,
      es: `## Cambiar contraseña

Ve a **Configuración > Ajustes** para cambiarla. ¿Olvidaste tu contraseña? Usa "¿Olvidaste tu contraseña?" en la página de inicio de sesión.`,
      it: `## Cambiare password

Vai in **Impostazioni > Impostazioni**. Password dimenticata? Usa "Password dimenticata?" nella pagina di login.`,
      ar: `## تغيير كلمة المرور

اذهب إلى **الإعدادات > الإعدادات**. نسيت كلمة المرور؟ استخدم "نسيت كلمة المرور؟" في صفحة تسجيل الدخول.`,
    },
    related_slugs: ["settings-overview"],
    tags: ["password", "security", "reset"],
  },
  {
    category_slug: "account-settings",
    slug: "branding-settings",
    sort_order: 4,
    title: {
      fr: "Personnaliser votre branding",
      en: "Customize your branding",
      es: "Personalizar tu branding",
      it: "Personalizzare il tuo branding",
      ar: "تخصيص علامتك التجارية",
    },
    content: {
      fr: `## Votre identité visuelle dans Tipote

Le branding que vous configurez est utilisé dans les **pages hébergées**, les **quiz** et les **contenus générés**.

### Accès

**Paramètres > Branding**

### Ce que vous pouvez personnaliser

#### Police de marque
Choisissez la police qui représente votre marque. Elle sera appliquée aux pages et quiz.

#### Couleurs
- **Couleur de base** : couleur principale de votre marque
- **Couleur d'accent** : couleur des boutons et éléments d'action

#### Logo
Uploadez votre logo (format recommandé : PNG transparent, 500x500px min).

#### Photo auteur
Votre photo sera affichée dans certains templates de pages et les contenus qui le nécessitent.

#### Ton de voix
Définissez votre tonalité préférée (ex: "Professionnel mais accessible", "Amical et expert"). L'IA adaptera le contenu généré.

> **Voir aussi :** [Créer une page](/support/article/create-page) • [Créer un quiz](/support/article/create-quiz)`,
      en: `## Your visual identity in Tipote

Your branding is used in **hosted pages**, **quizzes**, and **generated content**.

Go to **Settings > Branding** to customize: font, colors (base + accent), logo, author photo, and voice tone.

> **See also:** [Create a page](/support/article/create-page) • [Create a quiz](/support/article/create-quiz)`,
      es: `## Tu identidad visual en Tipote

Personaliza en **Configuración > Branding**: fuente, colores, logo, foto de autor y tono de voz.`,
      it: `## La tua identità visiva in Tipote

Personalizza in **Impostazioni > Branding**: font, colori, logo, foto autore e tono di voce.`,
      ar: `## هويتك البصرية في Tipote

خصص في **الإعدادات > العلامة التجارية**: الخط والألوان والشعار وصورة المؤلف ونبرة الصوت.`,
    },
    related_slugs: ["settings-overview", "create-page", "create-quiz"],
    tags: ["branding", "design", "logo", "colors"],
  },
  {
    category_slug: "account-settings",
    slug: "storytelling-settings",
    sort_order: 5,
    title: {
      fr: "Configurer votre storytelling fondateur",
      en: "Set up your founder storytelling",
      es: "Configurar tu storytelling de fundador",
      it: "Configurare il tuo storytelling fondatore",
      ar: "إعداد قصة المؤسس",
    },
    content: {
      fr: `## Racontez votre histoire pour connecter avec votre audience

Le **storytelling fondateur** est un outil puissant pour humaniser votre marque. Tipote l'utilise dans la génération de contenus pour ajouter de l'authenticité.

### Accès

**Paramètres > Profil** → Section "Storytelling fondateur"

### Les 6 étapes de votre histoire

1. **Situation Initiale** - Où étiez-vous avant ? Quel était votre quotidien ?
2. **Élément Déclencheur** - Qu'est-ce qui a tout changé ? Le déclic ?
3. **Péripéties** - Les obstacles rencontrés, les essais, les erreurs
4. **Moment Critique** - Le point de bascule, la plus grande difficulté
5. **Résolution** - Comment vous avez surmonté et trouvé la solution
6. **Situation Finale** - Où vous en êtes aujourd'hui et votre mission

### Comment c'est utilisé ?

L'IA intègre ces éléments de storytelling dans :
- Les **posts** sur les réseaux sociaux (quand le contexte s'y prête)
- Les **pages de vente** et **pages vitrine**
- Les **emails** de séquences narratives
- Le **copywriting** de vos offres

> 💡 **Astuce :** Soyez authentique et spécifique. Les histoires concrètes résonnent plus que les généralités.

> **Voir aussi :** [Les paramètres](/support/article/settings-overview) • [Créer un post](/support/article/create-post)`,
      en: `## Tell your story to connect with your audience

**Founder storytelling** humanizes your brand. Tipote uses it in content generation. Set it up in **Settings > Profile**.

The 6 steps: Initial Situation → Trigger → Challenges → Critical Moment → Resolution → Current Situation.

> **See also:** [Settings overview](/support/article/settings-overview)`,
      es: `## Cuenta tu historia

El **storytelling fundador** humaniza tu marca. Configúralo en **Configuración > Perfil** en 6 pasos.`,
      it: `## Racconta la tua storia

Lo **storytelling fondatore** umanizza il tuo brand. Configuralo in **Impostazioni > Profilo** in 6 passaggi.`,
      ar: `## اروِ قصتك

**قصة المؤسس** تضفي الطابع الإنساني على علامتك التجارية. قم بإعدادها في **الإعدادات > الملف الشخصي** في 6 خطوات.`,
    },
    related_slugs: ["settings-overview", "create-post"],
    tags: ["storytelling", "profile", "branding"],
  },
  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 3: STRATEGY & PLAN
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "strategy-plan",
    slug: "strategic-plan",
    sort_order: 1,
    title: {
      fr: "Comprendre votre plan stratégique",
      en: "Understand your strategic plan",
      es: "Entender tu plan estratégico",
      it: "Capire il tuo piano strategico",
      ar: "فهم خطتك الاستراتيجية",
    },
    content: {
      fr: `## Votre feuille de route personnalisée

Le plan stratégique est généré par l'IA après l'onboarding. Il est accessible depuis **🎯 Ma Stratégie** dans la sidebar.

### Structure du plan

Le plan est divisé en **3 phases** :

#### Phase 1 - Fondations (Jours 1-30)
Mise en place des bases : profil optimisé, premiers contenus, audience initiale.

#### Phase 2 - Croissance (Jours 31-60)
Accélération : plus de contenu, premières offres, nurturing.

#### Phase 3 - Scale (Jours 61-90)
Optimisation et montée en puissance : automatisations, conversion, scaling.

### Les tâches

Chaque phase contient des **tâches cochables** concrètes. Quand vous cochez une tâche :
- La **barre de progression** de la phase se met à jour
- Les **stats du dashboard** se recalculent en temps réel
- La **prochaine action recommandée** est mise à jour

### Header de la page Stratégie

3 badges vous donnent une vue rapide :
- 💰 **Objectif Revenue** - votre objectif financier à 90 jours
- ⏳ **Horizon** - jours restants
- 📊 **Progression** - pourcentage global d'avancement

### Modifier le plan

Le plan est **modifiable**. Si vous changez votre pyramide d'offres, l'IA **recalcule automatiquement** les tâches.

> **Voir aussi :** [La pyramide d'offres](/support/article/offer-pyramid) • [Le persona client](/support/article/persona)`,
      en: `## Your personalized roadmap

The strategic plan is AI-generated after onboarding. Access it from **🎯 My Strategy** in the sidebar.

### Structure
3 phases: **Foundations** (Days 1-30), **Growth** (Days 31-60), **Scale** (Days 61-90). Each with checkable tasks.

> **See also:** [Offer pyramid](/support/article/offer-pyramid) • [Customer persona](/support/article/persona)`,
      es: `## Tu hoja de ruta personalizada

Plan estratégico generado por IA tras el onboarding. 3 fases: Fundamentos (1-30 días), Crecimiento (31-60) y Escala (61-90).

> **Ver también:** [Pirámide de ofertas](/support/article/offer-pyramid)`,
      it: `## La tua roadmap personalizzata

Piano strategico generato dall'IA dopo l'onboarding. 3 fasi: Fondamenta (1-30 giorni), Crescita (31-60) e Scala (61-90).

> **Vedi anche:** [Piramide delle offerte](/support/article/offer-pyramid)`,
      ar: `## خارطة الطريق المخصصة لك

خطة استراتيجية يولدها الذكاء الاصطناعي بعد الإعداد. 3 مراحل: الأساسيات (1-30 يوم)، النمو (31-60) والتوسع (61-90).`,
    },
    related_slugs: ["offer-pyramid", "persona", "onboarding-guide"],
    tags: ["strategy", "plan", "phases", "tasks"],
  },
  {
    category_slug: "strategy-plan",
    slug: "offer-pyramid",
    sort_order: 2,
    title: {
      fr: "La pyramide d'offres",
      en: "The offer pyramid",
      es: "La pirámide de ofertas",
      it: "La piramide delle offerte",
      ar: "هرم العروض",
    },
    content: {
      fr: `## Structurez vos offres pour maximiser vos revenus

La **pyramide d'offres** est un concept stratégique fondamental : elle organise vos produits/services en niveaux progressifs de valeur et de prix.

### Les 3 niveaux

#### 🆓 Lead Magnet (gratuit ou très bas prix)
Contenu gratuit qui attire votre audience cible :
- Ebook, checklist, webinaire gratuit
- Quiz Tipote, page de capture
- **But :** Capturer des leads

#### 💰 Low/Middle Ticket (prix accessible)
Première offre payante qui crée la confiance :
- Formation en ligne, template, coaching de groupe
- **But :** Première conversion, prouver votre expertise

#### 💎 High Ticket (prix premium)
Offre haute valeur pour vos meilleurs clients :
- Coaching individuel, accompagnement, mastermind
- **But :** Maximiser la valeur par client

### Comment ça marche dans Tipote ?

1. Après l'onboarding, l'IA **propose 3 à 5 pyramides** adaptées à votre profil
2. Vous **choisissez** celle qui vous correspond le mieux
3. Vous pouvez la **modifier** : renommer les offres, changer les prix, ajouter/supprimer
4. Toute modification **déclenche une mise à jour automatique** des tâches du plan d'action

### Accès

**Ma Stratégie > Onglet "Pyramide d'offres"**

Chaque offre affiche : nom, prix, statut (active/en création).

> **Voir aussi :** [Le plan stratégique](/support/article/strategic-plan) • [Créer une offre](/support/article/create-offer)`,
      en: `## Structure your offers to maximize revenue

The **offer pyramid** organizes your products/services in progressive value levels: Lead Magnet (free) → Low/Middle Ticket → High Ticket.

After onboarding, AI proposes 3-5 pyramids. You choose and customize. Changes auto-update your action plan tasks.

Access: **My Strategy > "Offer Pyramid" tab**

> **See also:** [Strategic plan](/support/article/strategic-plan) • [Create an offer](/support/article/create-offer)`,
      es: `## La pirámide de ofertas

Organiza tus productos en 3 niveles: Lead Magnet → Low/Middle Ticket → High Ticket. La IA propone opciones tras el onboarding.`,
      it: `## La piramide delle offerte

Organizza i tuoi prodotti in 3 livelli: Lead Magnet → Low/Middle Ticket → High Ticket. L'IA propone opzioni dopo l'onboarding.`,
      ar: `## هرم العروض

نظم منتجاتك في 3 مستويات: مغناطيس العملاء → تذكرة منخفضة/متوسطة → تذكرة مرتفعة. يقترح الذكاء الاصطناعي خيارات بعد الإعداد.`,
    },
    related_slugs: ["strategic-plan", "create-offer", "persona"],
    tags: ["pyramid", "offers", "strategy", "pricing"],
  },
  {
    category_slug: "strategy-plan",
    slug: "persona",
    sort_order: 3,
    title: {
      fr: "Votre persona client idéal",
      en: "Your ideal customer persona",
      es: "Tu persona de cliente ideal",
      it: "La tua persona cliente ideale",
      ar: "شخصية العميل المثالي",
    },
    content: {
      fr: `## Connaissez votre client mieux que lui-même

Le **persona** est un portrait détaillé de votre client idéal, généré par l'IA à partir de vos réponses d'onboarding.

### Ce que contient le persona

- **Profil démographique** - Âge, profession, situation
- **Problèmes principaux** - Les frustrations et douleurs de votre cible
- **Objectifs** - Ce qu'ils veulent accomplir
- **Objections** - Ce qui les empêche d'acheter
- **Vocabulaire** - Les mots et expressions qu'ils utilisent
- **Canaux préférés** - Où ils consomment du contenu

### Pourquoi c'est crucial ?

Le persona est **injecté dans chaque prompt IA** de génération de contenu. C'est grâce à lui que :
- Vos posts parlent **le langage de votre audience**
- Vos emails touchent les **bonnes douleurs**
- Vos pages de vente utilisent les **bonnes objections**
- Votre contenu est **pertinent et engageant**

### Accès

**Ma Stratégie > Onglet "Persona cible"**

### Modifier le persona

Vous pouvez modifier le persona depuis la page Stratégie. Les changements seront pris en compte dans les prochaines générations de contenu.

> **Voir aussi :** [Le plan stratégique](/support/article/strategic-plan) • [Créer du contenu](/support/article/create-content-overview)`,
      en: `## Know your customer better than they know themselves

The **persona** is a detailed portrait of your ideal customer, AI-generated from your onboarding answers. It's injected into every AI content prompt.

Access: **My Strategy > "Target Persona" tab**

> **See also:** [Strategic plan](/support/article/strategic-plan) • [Create content](/support/article/create-content-overview)`,
      es: `## Conoce a tu cliente ideal

La **persona** es un retrato detallado generado por IA. Se inyecta en cada prompt de generación de contenido.

Acceso: **Mi Estrategia > pestaña "Persona"**`,
      it: `## Conosci il tuo cliente ideale

La **persona** è un ritratto dettagliato generato dall'IA. Viene iniettata in ogni prompt di generazione contenuti.

Accesso: **La mia Strategia > scheda "Persona"**`,
      ar: `## اعرف عميلك المثالي

**الشخصية** هي صورة مفصلة يولدها الذكاء الاصطناعي. يتم حقنها في كل أمر لتوليد المحتوى.`,
    },
    related_slugs: ["strategic-plan", "create-content-overview", "onboarding-guide"],
    tags: ["persona", "audience", "targeting"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 4: CONTENT CREATION
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "content-creation",
    slug: "create-content-overview",
    sort_order: 1,
    title: {
      fr: "Le hub de création : vue d'ensemble",
      en: "The creation hub: overview",
      es: "El hub de creación: vista general",
      it: "L'hub di creazione: panoramica",
      ar: "مركز الإنشاء: نظرة عامة",
    },
    content: {
      fr: `## 8 types de contenu, un seul endroit

Le hub de création (**✨ Créer** dans la sidebar) est votre atelier de production. Vous pouvez créer :

| Type | Description | Exemple |
|------|-------------|---------|
| 📱 **Post** | Réseaux sociaux | Post LinkedIn, story Instagram |
| 📧 **Email** | Newsletters, séquences | Newsletter hebdo, séquence de bienvenue |
| 📝 **Article** | Blog, guides | Article SEO, tutoriel |
| 🎬 **Vidéo** | Scripts vidéo | Script YouTube, Reel |
| 📦 **Offre** | Pages de vente | Description produit |
| 🔀 **Funnel** | Tunnels de vente | Funnel de webinaire |
| ❓ **Quiz** | Lead magnets | Quiz de diagnostic |
| 📅 **Stratégie** | Planning éditorial | Calendrier du mois |

### Workflow de création

1. **Choisissez le type** de contenu
2. **Remplissez le formulaire** (pré-rempli avec votre persona et profil)
3. **Cliquez sur "Générer"** - L'IA (Claude) crée le contenu
4. **Prévisualisez** le résultat
5. **Affinez** : régénérer, modifier manuellement
6. **Agissez** : sauvegarder en brouillon, planifier, ou publier directement

### Personnalisation automatique

Grâce à votre onboarding, chaque contenu est pré-personnalisé avec :
- Le vocabulaire de votre **persona**
- Votre **tonalité** de communication
- Vos **offres** et **positionnement**
- Votre **storytelling** fondateur

### Consommation de crédits

Chaque génération consomme des **crédits IA**. Le nombre exact dépend de la longueur et complexité du contenu.

> **Voir aussi :** [Créer un post](/support/article/create-post) • [Créer un email](/support/article/create-email) • [Créer un article](/support/article/create-article)`,
      en: `## 8 content types, one place

The creation hub (**✨ Create** in the sidebar) lets you create: Posts, Emails, Articles, Videos, Offers, Funnels, Quizzes, and Editorial Strategy.

Workflow: Choose type → Fill form (pre-filled) → Generate → Preview → Refine → Save/Schedule/Publish.

> **See also:** [Create a post](/support/article/create-post) • [Create an email](/support/article/create-email)`,
      es: `## 8 tipos de contenido, un solo lugar

El hub de creación permite crear: Posts, Emails, Artículos, Vídeos, Ofertas, Funnels, Quizzes y Estrategia Editorial.`,
      it: `## 8 tipi di contenuto, un solo posto

L'hub di creazione permette di creare: Post, Email, Articoli, Video, Offerte, Funnel, Quiz e Strategia Editoriale.`,
      ar: `## 8 أنواع محتوى في مكان واحد

مركز الإنشاء يتيح إنشاء: منشورات، رسائل بريد، مقالات، فيديوهات، عروض، أنفاق مبيعات، اختبارات واستراتيجية تحريرية.`,
    },
    related_slugs: ["create-post", "create-email", "create-article", "create-video", "credits-explained"],
    tags: ["create", "content", "ai", "generation"],
  },
  {
    category_slug: "content-creation",
    slug: "create-post",
    sort_order: 2,
    title: {
      fr: "Créer un post pour les réseaux sociaux",
      en: "Create a social media post",
      es: "Crear un post para redes sociales",
      it: "Creare un post per i social media",
      ar: "إنشاء منشور لوسائل التواصل الاجتماعي",
    },
    content: {
      fr: `## Publiez sur 7 réseaux en un clic

### Étape 1 : Accédez au formulaire

**Créer > Post** (ou cliquez sur l'icône 📱 dans le hub)

### Étape 2 : Configurez votre post

- **Plateforme cible** - Choisissez : LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok ou Pinterest
- **Sujet** - De quoi parle le post (l'IA s'adapte à la plateforme)
- **Tonalité** - Pré-remplie depuis vos paramètres
- **Longueur** - Court, moyen ou long

### Étape 3 : Générez

Cliquez sur **"Générer"**. L'IA Claude crée un post optimisé pour la plateforme choisie (hashtags, format, longueur adaptée).

### Étape 4 : Enrichissez

- 📸 **Ajoutez une image** (upload depuis votre appareil)
- 🎬 **Ajoutez une vidéo** (pour Instagram Reels, TikTok, Facebook)
- 💬 **Auto-commentaire** - Programmez un commentaire automatique sous votre post (plan Basic+)

### Options Pinterest spécifiques
- Sélection du **board** Pinterest
- Ajout d'un **lien** vers votre site

### Étape 5 : Publiez ou planifiez

- **Publier maintenant** - Publication directe via OAuth
- **Planifier** - Choisissez date et heure (calendrier éditorial)
- **Sauvegarder en brouillon** - Pour y revenir plus tard

### Modifier un post programmé

Allez dans **Mes Contenus** (vue calendrier ou liste), cliquez sur le post → vous êtes redirigé vers l'éditeur avec tout pré-rempli (texte, images, vidéos, auto-commentaire).

> **Voir aussi :** [Connecter vos réseaux](/support/article/connect-social-networks) • [Le calendrier éditorial](/support/article/editorial-calendar) • [Les auto-commentaires](/support/article/auto-comments)`,
      en: `## Publish on 7 networks in one click

1. Go to **Create > Post**
2. Choose platform (LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest)
3. Set topic, tone, length
4. Click **Generate** - AI creates an optimized post
5. Add images/videos, configure auto-comment
6. **Publish now**, **Schedule**, or **Save as draft**

> **See also:** [Connect networks](/support/article/connect-social-networks) • [Editorial calendar](/support/article/editorial-calendar)`,
      es: `## Publica en 7 redes en un clic

Crear > Post → elige plataforma → configura tema/tono → Genera → añade imágenes → Publica o programa.`,
      it: `## Pubblica su 7 social in un clic

Crea > Post → scegli piattaforma → configura argomento/tono → Genera → aggiungi immagini → Pubblica o programma.`,
      ar: `## انشر على 7 شبكات بنقرة واحدة

إنشاء > منشور ← اختر المنصة ← حدد الموضوع ← أنشئ ← أضف صور ← انشر أو جدوّل.`,
    },
    related_slugs: ["connect-social-networks", "editorial-calendar", "auto-comments", "create-content-overview"],
    tags: ["post", "social", "publish", "linkedin", "instagram", "facebook"],
  },
  {
    category_slug: "content-creation",
    slug: "create-email",
    sort_order: 3,
    title: {
      fr: "Créer un email ou une newsletter",
      en: "Create an email or newsletter",
      es: "Crear un email o newsletter",
      it: "Creare un'email o newsletter",
      ar: "إنشاء بريد إلكتروني أو نشرة إخبارية",
    },
    content: {
      fr: `## Emails qui convertissent, générés par l'IA

### Types d'emails disponibles

- **Newsletter** - Actualités, valeur, engagement
- **Séquence de bienvenue** - Onboarding de vos nouveaux abonnés
- **Email de vente** - Promotion d'une offre
- **Séquence de nurturing** - Éducation progressive

### Comment créer ?

1. **Créer > Email**
2. Choisissez le **type** d'email
3. Indiquez le **sujet** et le **contexte**
4. **Générez** - L'IA crée l'email avec objet, corps et CTA
5. **Copiez** le résultat dans votre outil d'emailing (Systeme.io, Mailchimp, etc.)

### Personnalisation

L'IA utilise votre persona, vos offres et votre tonalité pour créer des emails qui :
- Parlent les **douleurs** de votre audience
- Utilisent le bon **vocabulaire**
- Incluent des **CTAs** pertinents

> **Voir aussi :** [Hub de création](/support/article/create-content-overview) • [Templates Systeme.io](/support/article/systemeio-templates)`,
      en: `## Emails that convert, AI-generated

Create > Email → Choose type (newsletter, welcome, sales, nurturing) → Set subject/context → Generate → Copy to your email tool.

> **See also:** [Creation hub](/support/article/create-content-overview)`,
      es: `## Emails que convierten

Crear > Email → elige tipo → indica asunto → Genera → Copia en tu herramienta de email.`,
      it: `## Email che convertono

Crea > Email → scegli tipo → indica argomento → Genera → Copia nel tuo strumento email.`,
      ar: `## رسائل بريد إلكتروني تُحوّل

إنشاء > بريد إلكتروني ← اختر النوع ← حدد الموضوع ← أنشئ ← انسخ في أداة البريد الخاصة بك.`,
    },
    related_slugs: ["create-content-overview", "systemeio-templates"],
    tags: ["email", "newsletter", "sequence", "nurturing"],
  },
  {
    category_slug: "content-creation",
    slug: "create-article",
    sort_order: 4,
    title: {
      fr: "Créer un article de blog",
      en: "Create a blog article",
      es: "Crear un artículo de blog",
      it: "Creare un articolo di blog",
      ar: "إنشاء مقال مدونة",
    },
    content: {
      fr: `## Articles longs et structurés par l'IA

### Comment créer ?

1. **Créer > Article**
2. Indiquez le **sujet** et les **mots-clés** SEO
3. Choisissez le **format** : tutoriel, guide, article d'opinion, étude de cas
4. **Générez** - L'IA crée un article complet avec titres, sous-titres, introduction et conclusion
5. **Modifiez** si nécessaire, puis sauvegardez ou copiez

### Optimisation SEO

L'IA génère automatiquement :
- Des **titres et sous-titres** (H2, H3) structurés
- Une **introduction** accrocheuse
- Une **conclusion** avec CTA
- Des suggestions de **mots-clés**

> **Voir aussi :** [Hub de création](/support/article/create-content-overview)`,
      en: `## Long-form articles, AI-structured

Create > Article → Set topic and SEO keywords → Choose format → Generate → Edit and save.

> **See also:** [Creation hub](/support/article/create-content-overview)`,
      es: `## Artículos largos estructurados por IA

Crear > Artículo → tema y palabras clave → formato → Genera.`,
      it: `## Articoli lunghi strutturati dall'IA

Crea > Articolo → argomento e parole chiave → formato → Genera.`,
      ar: `## مقالات طويلة منظمة بالذكاء الاصطناعي

إنشاء > مقال ← الموضوع والكلمات المفتاحية ← التنسيق ← أنشئ.`,
    },
    related_slugs: ["create-content-overview", "create-post"],
    tags: ["article", "blog", "seo", "writing"],
  },
  {
    category_slug: "content-creation",
    slug: "create-video",
    sort_order: 5,
    title: {
      fr: "Créer un script vidéo",
      en: "Create a video script",
      es: "Crear un guion de vídeo",
      it: "Creare uno script video",
      ar: "إنشاء نص فيديو",
    },
    content: {
      fr: `## Des scripts vidéo prêts à tourner

### Formats supportés

- **YouTube** - Scripts longs avec chapitres
- **Reels / TikTok** - Scripts courts et percutants
- **Stories** - Scripts de stories séquentielles

### Comment créer ?

1. **Créer > Vidéo**
2. Choisissez le **format** et la **plateforme**
3. Indiquez le **sujet** et l'**angle**
4. **Générez** - L'IA crée un script structuré avec intro hook, développement et CTA
5. **Tournez** en suivant le script !

> **Voir aussi :** [Hub de création](/support/article/create-content-overview) • [Créer un post](/support/article/create-post)`,
      en: `## Video scripts ready to shoot

Formats: YouTube (long), Reels/TikTok (short), Stories. Create > Video → Choose format → Set topic → Generate.

> **See also:** [Creation hub](/support/article/create-content-overview)`,
      es: `## Guiones de vídeo listos para grabar

Crear > Vídeo → formato → tema → Genera.`,
      it: `## Script video pronti da girare

Crea > Video → formato → argomento → Genera.`,
      ar: `## نصوص فيديو جاهزة للتصوير

إنشاء > فيديو ← التنسيق ← الموضوع ← أنشئ.`,
    },
    related_slugs: ["create-content-overview", "create-post"],
    tags: ["video", "script", "youtube", "reels", "tiktok"],
  },
  {
    category_slug: "content-creation",
    slug: "create-offer",
    sort_order: 6,
    title: {
      fr: "Créer une offre commerciale",
      en: "Create a commercial offer",
      es: "Crear una oferta comercial",
      it: "Creare un'offerta commerciale",
      ar: "إنشاء عرض تجاري",
    },
    content: {
      fr: `## Du copywriting de vente, par l'IA

### Comment créer ?

1. **Créer > Offre**
2. Décrivez votre **offre** (nom, prix, bénéfices)
3. **Générez** - L'IA crée un descriptif complet avec headline, bénéfices, preuves sociales, prix et CTA
4. Utilisez-le sur votre **page de vente**, **email** ou **site**

### Lien avec la pyramide

Quand vous créez une offre dans le hub, elle peut être **automatiquement ajoutée à votre pyramide d'offres** et déclencher de nouvelles tâches dans le plan d'action.

> **Voir aussi :** [La pyramide d'offres](/support/article/offer-pyramid) • [Créer une page de vente](/support/article/create-page)`,
      en: `## Sales copywriting, by AI

Create > Offer → Describe your offer → Generate → Use on your sales page or email. New offers can be auto-added to your pyramid.

> **See also:** [Offer pyramid](/support/article/offer-pyramid)`,
      es: `## Copywriting de venta por IA

Crear > Oferta → describe tu oferta → Genera. Se puede añadir a tu pirámide automáticamente.`,
      it: `## Copywriting di vendita dall'IA

Crea > Offerta → descrivi la tua offerta → Genera. Può essere aggiunta alla piramide automaticamente.`,
      ar: `## كتابة إعلانية بالذكاء الاصطناعي

إنشاء > عرض ← وصف عرضك ← أنشئ. يمكن إضافته تلقائيًا إلى هرمك.`,
    },
    related_slugs: ["offer-pyramid", "create-page", "create-content-overview"],
    tags: ["offer", "copywriting", "sales"],
  },
  {
    category_slug: "content-creation",
    slug: "create-funnel",
    sort_order: 7,
    title: {
      fr: "Créer un tunnel de vente (funnel)",
      en: "Create a sales funnel",
      es: "Crear un funnel de venta",
      it: "Creare un funnel di vendita",
      ar: "إنشاء قمع مبيعات",
    },
    content: {
      fr: `## Des funnels complets en quelques clics

Un **funnel** (tunnel de vente) est une séquence de pages et emails qui guide un prospect vers l'achat.

### Comment créer ?

1. **Créer > Funnel**
2. Décrivez votre **offre cible** et votre **objectif**
3. **Générez** - L'IA crée le copywriting complet du funnel :
   - Page de capture
   - Séquence d'emails
   - Page de vente
   - Page de remerciement
4. **Utilisez** le contenu généré dans vos outils (Systeme.io, etc.)

> **Voir aussi :** [Hub de création](/support/article/create-content-overview) • [Templates Systeme.io](/support/article/systemeio-templates)`,
      en: `## Complete funnels in a few clicks

Create > Funnel → Describe target offer and goal → Generate → Get complete copywriting (capture page, email sequence, sales page, thank you page).

> **See also:** [Creation hub](/support/article/create-content-overview)`,
      es: `## Funnels completos en pocos clics

Crear > Funnel → describe oferta y objetivo → Genera → Obtén todo el copywriting.`,
      it: `## Funnel completi in pochi clic

Crea > Funnel → descrivi offerta e obiettivo → Genera → Ottieni tutto il copywriting.`,
      ar: `## أنفاق مبيعات كاملة في نقرات قليلة

إنشاء > قمع ← وصف العرض والهدف ← أنشئ ← احصل على كل النصوص الإعلانية.`,
    },
    related_slugs: ["create-content-overview", "systemeio-templates", "create-offer"],
    tags: ["funnel", "sales", "tunnel", "conversion"],
  },
  {
    category_slug: "content-creation",
    slug: "editorial-calendar",
    sort_order: 8,
    title: {
      fr: "Le calendrier éditorial",
      en: "The editorial calendar",
      es: "El calendario editorial",
      it: "Il calendario editoriale",
      ar: "التقويم التحريري",
    },
    content: {
      fr: `## Visualisez et gérez vos contenus planifiés

### Accès

**📂 Mes Contenus** dans la sidebar, puis basculez en **vue Calendrier** (icône calendrier en haut à droite).

### Vue mois

Le calendrier affiche tous vos contenus avec des **codes couleur par type** :
- 📱 Posts = bleu
- 📧 Emails = vert
- 📝 Articles = violet
- etc.

### Actions possibles

- **Cliquer sur un contenu** → Ouvre l'éditeur complet (\`/create?edit=<id>\`)
- **Voir les détails** → Titre, statut, canal, date prévue
- **Filtrer** par type de contenu ou statut

### Vue Liste

La vue liste offre :
- **Onglets** de filtre : Tous, Posts, Emails, Articles, Vidéos, Quiz, Pages
- **Recherche** par titre
- **Filtres avancés** : statut (Publié, Planifié, Brouillon), canal
- **Menu d'actions** : voir, éditer, copier, supprimer, dupliquer

### Badges de statut

- 🟢 **Publié** - Déjà publié sur un réseau
- 🔵 **Planifié** - Programmé pour une date future
- ⚪ **Brouillon** - Sauvegardé mais non planifié

> **Voir aussi :** [Créer un post](/support/article/create-post) • [Hub de création](/support/article/create-content-overview)`,
      en: `## Visualize and manage your scheduled content

Access: **My Content** in sidebar → Calendar view.

Color-coded by content type. Click content to edit. Filter by type/status. List view with search and advanced filters.

> **See also:** [Create a post](/support/article/create-post)`,
      es: `## Visualiza y gestiona tu contenido programado

Mis Contenidos → Vista Calendario. Contenido codificado por color. Haz clic para editar.`,
      it: `## Visualizza e gestisci i contenuti programmati

I miei Contenuti → Vista Calendario. Contenuti codificati per colore. Clicca per modificare.`,
      ar: `## عرض وإدارة المحتوى المجدول

المحتوى الخاص بي ← عرض التقويم. محتوى مصنف بالألوان. انقر للتعديل.`,
    },
    related_slugs: ["create-post", "create-content-overview"],
    tags: ["calendar", "schedule", "planning", "editorial"],
  },
  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 5: SOCIAL PUBLISHING
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "social-publishing",
    slug: "connect-social-networks",
    sort_order: 1,
    title: {
      fr: "Connecter vos réseaux sociaux",
      en: "Connect your social networks",
      es: "Conectar tus redes sociales",
      it: "Collegare i tuoi social network",
      ar: "ربط شبكاتك الاجتماعية",
    },
    content: {
      fr: `## Publiez directement depuis Tipote

Tipote peut publier directement sur **7 plateformes** via OAuth 2.0. Aucune API key à configurer !

### Plateformes supportées

| Plateforme | Formats supportés |
|-----------|-------------------|
| **LinkedIn** | Posts + images |
| **Facebook Pages** | Posts + images + carrousels + vidéos |
| **Instagram** | Photos + vidéos + Reels |
| **Threads** | Posts texte |
| **Twitter/X** | Tweets + images |
| **TikTok** | Photos + vidéos |
| **Pinterest** | Pins avec images + liens |

### Comment connecter ?

1. Allez dans **Paramètres > Connexions**
2. Cliquez sur le bouton **"Connecter"** à côté du réseau souhaité
3. Vous êtes redirigé vers la page de **login du réseau** (ex: LinkedIn)
4. **Autorisez** Tipote à publier en votre nom
5. Vous êtes redirigé vers Tipote - le réseau est maintenant **connecté** ✅

### Sécurité des tokens

Vos tokens d'authentification sont **chiffrés en AES-256-GCM** dans notre base de données. Même en cas de compromission de la base, les tokens restent illisibles.

### Rafraîchissement automatique

Les tokens sont **rafraîchis automatiquement** avant expiration. Si un token expire (cas rare), vous verrez un badge "Reconnexion nécessaire" et pourrez reconnecter en un clic.

### Déconnecter un réseau

Dans **Paramètres > Connexions**, cliquez sur **"Déconnecter"** à côté du réseau. Vos contenus existants ne sont pas affectés.

> **Voir aussi :** [Créer un post](/support/article/create-post) • [Les auto-commentaires](/support/article/auto-comments)`,
      en: `## Publish directly from Tipote

Tipote publishes on **7 platforms** via OAuth 2.0: LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest.

### How to connect
Go to **Settings > Connections** → Click "Connect" → Authorize on the network → Done!

Tokens are **AES-256 encrypted** and auto-refreshed.

> **See also:** [Create a post](/support/article/create-post) • [Auto-comments](/support/article/auto-comments)`,
      es: `## Publica directamente desde Tipote

7 plataformas via OAuth: LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest. Conecta en **Configuración > Conexiones**.`,
      it: `## Pubblica direttamente da Tipote

7 piattaforme via OAuth: LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest. Collega in **Impostazioni > Connessioni**.`,
      ar: `## انشر مباشرة من Tipote

7 منصات عبر OAuth: LinkedIn، Facebook، Instagram، Threads، Twitter/X، TikTok، Pinterest. اربط في **الإعدادات > الاتصالات**.`,
    },
    related_slugs: ["create-post", "auto-comments", "settings-overview"],
    tags: ["social", "connect", "oauth", "linkedin", "instagram", "facebook", "twitter", "tiktok", "pinterest"],
  },
  {
    category_slug: "social-publishing",
    slug: "publish-post",
    sort_order: 2,
    title: {
      fr: "Publier ou planifier un post",
      en: "Publish or schedule a post",
      es: "Publicar o programar un post",
      it: "Pubblicare o programmare un post",
      ar: "نشر أو جدولة منشور",
    },
    content: {
      fr: `## Trois options de publication

Après avoir généré un post, vous avez 3 choix :

### 1. Publier maintenant
Cliquez sur **"Publier"** - Le post est envoyé immédiatement sur le réseau connecté. Vous recevez une **notification** de confirmation avec le lien vers le post publié.

### 2. Planifier
Cliquez sur **"Planifier"** - Choisissez une **date et heure** de publication. Le post apparaît dans votre **calendrier éditorial** avec le statut "Planifié". Tipote publie automatiquement à l'heure prévue.

### 3. Sauvegarder en brouillon
Cliquez sur **"Sauvegarder"** - Le post est sauvegardé dans **Mes Contenus** avec le statut "Brouillon". Vous pourrez y revenir, le modifier et le publier plus tard.

### Suivi des publications

Dans **Mes Contenus**, chaque post publié affiche :
- Le **statut** (publié, planifié, brouillon)
- Le **réseau** social ciblé
- La **date** de publication
- Le **lien direct** vers le post publié (quand disponible)

> **Voir aussi :** [Le calendrier éditorial](/support/article/editorial-calendar) • [Connecter vos réseaux](/support/article/connect-social-networks)`,
      en: `## Three publication options

After generating a post: **Publish now** (instant), **Schedule** (pick date/time), or **Save as draft**.

Track all posts in **My Content** with status badges.

> **See also:** [Editorial calendar](/support/article/editorial-calendar)`,
      es: `## Tres opciones de publicación

Publicar ahora, Programar (elige fecha/hora) o Guardar como borrador.`,
      it: `## Tre opzioni di pubblicazione

Pubblica ora, Programma (scegli data/ora) o Salva come bozza.`,
      ar: `## ثلاث خيارات للنشر

انشر الآن، جدوّل (اختر التاريخ/الوقت) أو احفظ كمسودة.`,
    },
    related_slugs: ["editorial-calendar", "connect-social-networks", "create-post"],
    tags: ["publish", "schedule", "draft", "post"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 6: AUTOMATIONS
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "automations",
    slug: "auto-comments",
    sort_order: 1,
    title: {
      fr: "Les auto-commentaires",
      en: "Auto-comments",
      es: "Auto-comentarios",
      it: "Auto-commenti",
      ar: "التعليقات التلقائية",
    },
    content: {
      fr: `## Boostez l'engagement automatiquement

Les **auto-commentaires** publient automatiquement un commentaire sous votre post après sa publication. C'est une technique éprouvée pour booster l'engagement (l'algorithme favorise les posts avec des commentaires rapides).

### Comment ça marche ?

1. Lors de la **création d'un post**, activez l'option **"Auto-commentaire"**
2. L'IA génère un commentaire **contextuel** (en rapport avec le contenu du post)
3. Quand le post est publié, le commentaire est posté automatiquement quelques minutes après

### Plateformes supportées

- ✅ LinkedIn
- ✅ Instagram
- ✅ Twitter/X
- ✅ TikTok
- ✅ Facebook

### Coût

**0.25 crédit** par auto-commentaire (le commentaire est généré par l'IA Claude).

### Disponibilité

- ❌ Free : non disponible
- ✅ Basic / Pro / Elite : inclus

### Configuration

Vous pouvez configurer les auto-commentaires dans **Paramètres > Connexions**.

> **Voir aussi :** [Comment-to-DM](/support/article/comment-to-dm) • [Comment-to-Email](/support/article/comment-to-email) • [Les crédits IA](/support/article/credits-explained)`,
      en: `## Boost engagement automatically

**Auto-comments** post a comment under your post after publication. Costs **0.25 credit** each. Available on Basic+ plans.

Activate when creating a post. AI generates a contextual comment.

> **See also:** [Comment-to-DM](/support/article/comment-to-dm) • [Credits explained](/support/article/credits-explained)`,
      es: `## Aumenta el engagement automáticamente

Los auto-comentarios publican un comentario bajo tu post automáticamente. 0.25 crédito cada uno. Plan Basic+.`,
      it: `## Aumenta l'engagement automaticamente

Gli auto-commenti pubblicano un commento sotto il tuo post automaticamente. 0.25 credito ciascuno. Piano Basic+.`,
      ar: `## عزز التفاعل تلقائيًا

التعليقات التلقائية تنشر تعليقًا تحت منشورك تلقائيًا. 0.25 رصيد لكل تعليق. خطة Basic+.`,
    },
    related_slugs: ["comment-to-dm", "comment-to-email", "credits-explained", "create-post"],
    tags: ["automation", "comments", "engagement"],
  },
  {
    category_slug: "automations",
    slug: "comment-to-dm",
    sort_order: 2,
    title: {
      fr: "Comment-to-DM : répondre automatiquement en privé",
      en: "Comment-to-DM: automatic private replies",
      es: "Comment-to-DM: respuestas privadas automáticas",
      it: "Comment-to-DM: risposte private automatiche",
      ar: "التعليق إلى رسالة مباشرة",
    },
    content: {
      fr: `## Convertissez les commentaires en conversations privées

Le **Comment-to-DM** détecte des **mots-clés** dans les commentaires de vos posts et envoie automatiquement un **message privé** au commentateur.

### Cas d'usage

- "Écrivez **GUIDE** en commentaire pour recevoir le guide gratuit"
- "Commentez **OUI** pour en savoir plus"
- Détection de mots comme "intéressé", "prix", "info"

### Configuration

1. **Automatisations** dans la sidebar
2. Créez une nouvelle automatisation **Comment-to-DM**
3. Définissez les **mots-clés déclencheurs**
4. Rédigez les **variantes de réponse** (Tipote alterne pour éviter la détection de spam)
5. Activez l'automatisation

### Logs

Chaque exécution est loguée avec :
- Date/heure
- Commentaire détecté
- Réponse envoyée
- Statut (succès/échec)

> **Voir aussi :** [Comment-to-Email](/support/article/comment-to-email) • [Les auto-commentaires](/support/article/auto-comments)`,
      en: `## Convert comments into private conversations

**Comment-to-DM** detects keywords in comments and auto-sends a DM. Set trigger words and response variants in **Automations**.

> **See also:** [Comment-to-Email](/support/article/comment-to-email) • [Auto-comments](/support/article/auto-comments)`,
      es: `## Convierte comentarios en conversaciones privadas

Comment-to-DM detecta palabras clave en comentarios y envía DM automáticamente. Configura en **Automatizaciones**.`,
      it: `## Converti i commenti in conversazioni private

Comment-to-DM rileva parole chiave nei commenti e invia DM automaticamente. Configura in **Automazioni**.`,
      ar: `## حوّل التعليقات إلى محادثات خاصة

التعليق إلى رسالة مباشرة يكتشف الكلمات المفتاحية ويرسل رسالة خاصة تلقائيًا.`,
    },
    related_slugs: ["comment-to-email", "auto-comments"],
    tags: ["automation", "dm", "keywords", "engagement"],
  },
  {
    category_slug: "automations",
    slug: "comment-to-email",
    sort_order: 3,
    title: {
      fr: "Comment-to-Email : capturer des emails depuis les commentaires",
      en: "Comment-to-Email: capture emails from comments",
      es: "Comment-to-Email: capturar emails desde comentarios",
      it: "Comment-to-Email: catturare email dai commenti",
      ar: "التعليق إلى بريد إلكتروني",
    },
    content: {
      fr: `## Transformez l'engagement en leads

Le **Comment-to-Email** combine Comment-to-DM avec une étape de capture d'email : après avoir envoyé un DM automatique, il demande l'email du commentateur pour lui envoyer une ressource.

### Fonctionnement

1. Le commentateur écrit un **mot-clé** sous votre post
2. Tipote envoie un **DM automatique** avec un message et une demande d'email
3. Quand l'email est fourni, il est **capturé comme lead** dans votre base (chiffré)
4. La ressource promise est envoyée

### Configuration

Identique au Comment-to-DM, avec en plus le message de capture d'email et le contenu à envoyer.

> **Voir aussi :** [Comment-to-DM](/support/article/comment-to-dm) • [Gérer vos leads](/support/article/manage-leads)`,
      en: `## Turn engagement into leads

**Comment-to-Email** sends a DM after keyword detection, asks for email, captures it as a lead.

> **See also:** [Comment-to-DM](/support/article/comment-to-dm) • [Manage leads](/support/article/manage-leads)`,
      es: `## Convierte el engagement en leads

Comment-to-Email envía DM, pide email y lo captura como lead.`,
      it: `## Trasforma l'engagement in lead

Comment-to-Email invia DM, chiede l'email e lo cattura come lead.`,
      ar: `## حوّل التفاعل إلى عملاء محتملين

التعليق إلى بريد إلكتروني يرسل رسالة مباشرة ويطلب البريد الإلكتروني ويسجله كعميل محتمل.`,
    },
    related_slugs: ["comment-to-dm", "manage-leads"],
    tags: ["automation", "email", "leads", "capture"],
  },
  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 7: PAGES & QUIZ
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "pages-quiz",
    slug: "create-page",
    sort_order: 1,
    title: {
      fr: "Créer une page (capture, vente, vitrine)",
      en: "Create a page (landing, sales, showcase)",
      es: "Crear una página (captura, venta, escaparate)",
      it: "Creare una pagina (cattura, vendita, vetrina)",
      ar: "إنشاء صفحة (التقاط، بيع، عرض)",
    },
    content: {
      fr: `## Des landing pages hébergées par Tipote

Le constructeur de pages vous permet de créer des **pages professionnelles hébergées** directement dans Tipote.

### 3 types de pages

| Type | Usage | Exemple |
|------|-------|---------|
| 📥 **Page de capture** | Collecter des emails | "Téléchargez mon guide gratuit" |
| 💰 **Page de vente** | Vendre un produit/service | "Formation XYZ - 297€" |
| 🏪 **Site vitrine** | Présenter votre activité | "Découvrez mon expertise" |

### Fonctionnalités de l'éditeur

- **Prévisualisation multi-device** - Mobile, tablette, desktop
- **Édition de texte inline** - Cliquez et modifiez directement
- **Sélecteur de couleurs** - Personnalisez chaque élément
- **Upload d'illustrations** - Ajoutez vos visuels
- **Chat IA** - Demandez à l'IA de modifier la page par conversation
- **OG Image** - Uploadez l'image de partage social
- **Meta description** - Pour le SEO
- **Tracking pixels** - Facebook Pixel et Google Tag Manager
- **URL de paiement** - Lien vers votre page de paiement (Systeme.io, Stripe...)
- **Mentions légales** - Auto-générées

### Publication

1. Choisissez un **slug personnalisé** (ex: mon-guide-gratuit)
2. Cliquez sur **"Publier"**
3. Votre page est accessible à l'URL : \`tipote.com/p/mon-guide-gratuit\`

### Analytics intégrés

Chaque page publiée dispose de **stats automatiques** :
- 👀 Nombre de **vues**
- 👥 Nombre de **leads** capturés
- 🖱️ Nombre de **clics** sur le CTA

### Export

Vous pouvez **télécharger** votre page en **HTML** ou **PDF**.

> **Voir aussi :** [Créer un quiz](/support/article/create-quiz) • [Gérer vos leads](/support/article/manage-leads) • [Personnaliser votre branding](/support/article/branding-settings)`,
      en: `## Hosted landing pages by Tipote

Create **capture pages**, **sales pages**, or **showcase sites** with the built-in page builder. Features inline editing, AI chat, multi-device preview, tracking pixels, and analytics.

Publish to \`tipote.com/p/your-slug\`.

> **See also:** [Create a quiz](/support/article/create-quiz) • [Manage leads](/support/article/manage-leads)`,
      es: `## Páginas de aterrizaje alojadas

Crea páginas de captura, venta o escaparate con el constructor integrado. Publica en \`tipote.com/p/tu-slug\`.`,
      it: `## Landing page ospitate

Crea pagine di cattura, vendita o vetrina con il page builder integrato. Pubblica su \`tipote.com/p/tuo-slug\`.`,
      ar: `## صفحات هبوط مستضافة

أنشئ صفحات التقاط أو بيع أو عرض مع المحرر المدمج. انشر على \`tipote.com/p/your-slug\`.`,
    },
    related_slugs: ["create-quiz", "manage-leads", "branding-settings", "ordre-mobile-desktop"],
    tags: ["page", "landing", "sales", "capture", "builder"],
  },
  {
    category_slug: "pages-quiz",
    slug: "ordre-mobile-desktop",
    sort_order: 2,
    title: {
      fr: "Changer l'ordre des blocs sur mobile (sans toucher au PC)",
      en: "Change block order on mobile (without affecting desktop)",
      es: "Cambiar el orden de los bloques en móvil (sin tocar el ordenador)",
      it: "Cambiare l'ordine dei blocchi su mobile (senza toccare il desktop)",
      ar: "تغيير ترتيب الكتل على الهاتف (دون المساس بالكمبيوتر)",
    },
    content: {
      fr: `## Le mobile et l'ordinateur peuvent avoir un ordre différent

Sur un téléphone, on voit les choses **l'une en dessous de l'autre**. Sur un ordinateur, on a plus de place : **côte à côte** ou dans un ordre différent. Sur Tipote, tu peux décider d'un ordre **différent pour chaque écran**, sans rien casser.

> **Bonne nouvelle :** tu peux tout faire depuis ton ordinateur. Pas besoin d'éditer depuis ton téléphone pour modifier la version mobile.

### Comment ça marche, en 3 étapes

**1. Ouvre l'éditeur de ta page** sur ton ordinateur.

**2. En haut, tu vois 3 petits boutons :** 📱 Mobile / 📱 Tablette / 🖥️ Ordinateur. Clique sur celui qui correspond à l'écran que tu veux **personnaliser**.

**3. Déplace tes blocs dans la barre de gauche** (glisser-déposer ou flèches ↑ ↓). Une petite étiquette bleue t'indique en temps réel **"Tu modifies l'ordre mobile"** ou **"Tu modifies l'ordre ordinateur"**.

### Exemple concret

Imagine une page avec 3 blocs :
- 🎨 Illustration
- 📝 Texte de présentation
- 📧 Formulaire de capture

#### Sur ordinateur (la version qui a de la place)
\`\`\`
┌─────────────────────────┐
│  🎨 Illustration         │
├─────────────────────────┤
│  📝 Texte                │
├─────────────────────────┤
│  📧 Formulaire           │
└─────────────────────────┘
\`\`\`

#### Sur mobile (tu veux que le formulaire soit plus visible)
\`\`\`
┌──────────────┐
│  📝 Texte     │
├──────────────┤
│  📧 Formulaire│
├──────────────┤
│  🎨 Illustration│
└──────────────┘
\`\`\`

👉 Tu as changé l'ordre **uniquement sur mobile**. Sur ordinateur, rien n'a bougé. Magique !

### À retenir

- ✅ Tu **peux tout faire depuis ton ordinateur** (pas besoin de prendre ton téléphone)
- ✅ L'ordre mobile et l'ordre ordinateur sont **indépendants**
- ✅ Pour voir le rendu exact, clique sur 📱 Mobile en haut
- ⚠️ Si tu veux que les deux ordres restent identiques, ne touche à rien : par défaut ils sont alignés

> **Astuce :** si tu te sens perdue, regarde toujours l'étiquette bleue au-dessus de ta liste de blocs. Elle te dit quel ordre tu es en train de modifier.`,
      en: `## Mobile and desktop can have different orders

On a phone, things stack **one below the other**. On a desktop, there's more space. Tipote lets you set a **different order for each screen** without breaking anything.

> **Good news:** you can do everything from your computer. No need to edit from your phone to change the mobile version.

### How it works, in 3 steps

**1. Open the page editor** on your computer.

**2. At the top, you'll see 3 small buttons:** 📱 Mobile / 📱 Tablet / 🖥️ Desktop. Click the one for the screen you want to **customize**.

**3. Drag your blocks in the left sidebar** (drag-and-drop or ↑ ↓ arrows). A small blue label tells you in real time **"You're editing the mobile order"** or **"You're editing the desktop order"**.

### Concrete example

A page with 3 blocks: 🎨 Illustration / 📝 Description text / 📧 Capture form

- **Desktop** → Illustration, Text, Form
- **Mobile** → Text, Form, Illustration (the form is more visible, first thing thumb reaches)

You changed the order **only on mobile**. On desktop, nothing moved.

### To remember

- ✅ You can do everything from your computer
- ✅ Mobile and desktop orders are **independent**
- ✅ Click 📱 Mobile at the top to preview the mobile version
- ⚠️ If you don't touch anything, both orders stay aligned by default`,
      es: `## Móvil y ordenador pueden tener órdenes diferentes

En el móvil, los bloques se apilan. En el ordenador hay más espacio. Tipote te permite definir un **orden diferente para cada pantalla** sin romper nada.

> **Buena noticia:** puedes hacerlo todo desde tu ordenador.

### Cómo funciona

1. **Abre el editor** en el ordenador.
2. **Arriba hay 3 botones:** 📱 Móvil / 📱 Tablet / 🖥️ Ordenador. Haz clic en la pantalla que quieres personalizar.
3. **Arrastra los bloques** en la barra izquierda. Una etiqueta azul indica **"Estás editando el orden móvil"** o **"el orden escritorio"**.

Los órdenes móvil y escritorio son **independientes**. Si no tocas nada, quedan iguales por defecto.`,
      it: `## Mobile e desktop possono avere ordini diversi

Su mobile i blocchi si impilano. Su desktop c'è più spazio. Tipote ti permette di impostare un **ordine diverso per ogni schermo** senza rompere nulla.

> **Buona notizia:** puoi fare tutto dal computer.

### Come funziona

1. **Apri l'editor** sul computer.
2. **In alto ci sono 3 pulsanti:** 📱 Mobile / 📱 Tablet / 🖥️ Desktop. Clicca sullo schermo che vuoi personalizzare.
3. **Trascina i blocchi** nella barra laterale. Un'etichetta blu indica **"Stai modificando l'ordine mobile"** o **"l'ordine desktop"**.

Gli ordini mobile e desktop sono **indipendenti**. Se non tocchi nulla, rimangono allineati di default.`,
      ar: `## يمكن أن يكون لديك ترتيب مختلف على الهاتف والكمبيوتر

على الهاتف تتراص الكتل. على الكمبيوتر مساحة أكبر. يتيح لك Tipote تعيين **ترتيب مختلف لكل شاشة** دون كسر أي شيء.

> **خبر جيد:** يمكنك فعل كل شيء من الكمبيوتر.

### كيف يعمل

1. **افتح المحرر** على الكمبيوتر.
2. **في الأعلى توجد 3 أزرار:** 📱 هاتف / 📱 جهاز لوحي / 🖥️ كمبيوتر. انقر على الشاشة التي تريد تخصيصها.
3. **اسحب الكتل** في الشريط الجانبي الأيسر. تُعلمك ملصقة زرقاء **"أنت تعدل ترتيب الهاتف"** أو **"ترتيب الكمبيوتر"**.

ترتيب الهاتف والكمبيوتر **مستقلان**. إذا لم تلمس شيئًا، فسيبقى الترتيبان متطابقين افتراضيًا.`,
    },
    related_slugs: ["create-page", "branding-settings"],
    tags: ["page", "mobile", "desktop", "ordre", "éditeur", "responsive"],
  },
  {
    category_slug: "pages-quiz",
    slug: "create-quiz",
    sort_order: 3,
    title: {
      fr: "Créer un quiz lead magnet",
      en: "Create a lead magnet quiz",
      es: "Crear un quiz lead magnet",
      it: "Creare un quiz lead magnet",
      ar: "إنشاء اختبار جذب العملاء",
    },
    content: {
      fr: `## Capturez des leads avec des quiz interactifs

Les quiz sont un excellent moyen de **capturer des emails** tout en apportant de la valeur à votre audience.

### Comment créer un quiz ?

1. **Créer > Quiz** (ou depuis la section Quiz de Mes Contenus)
2. Décrivez le **thème** et l'**objectif** du quiz
3. L'IA **génère** les questions, réponses et résultats personnalisés
4. **Éditez** les questions si besoin
5. **Publiez** le quiz

### Page publique du quiz

Votre quiz est accessible à l'URL : \`tipote.com/q/[quizId]\`

### Capture de leads

Avant d'afficher le résultat, le quiz demande :
- **Email** (obligatoire)
- **Prénom** (optionnel)

Le lead est automatiquement ajouté à votre base de leads (chiffré AES-256).

### Résultats personnalisés

Chaque résultat peut inclure :
- Un **texte personnalisé** selon les réponses
- Un **CTA** vers votre offre
- Un lien vers votre **page de vente**

### Stats

- 👀 Nombre de **vues**
- 🔄 Nombre de **partages**
- 👥 Nombre de **leads** capturés

### Synchronisation Systeme.io

Vous pouvez **synchroniser les leads** de vos quiz directement vers votre compte Systeme.io avec les tags de votre choix.

> **Voir aussi :** [Créer une page](/support/article/create-page) • [Gérer vos leads](/support/article/manage-leads) • [Intégration Systeme.io](/support/article/systemeio-integration)`,
      en: `## Capture leads with interactive quizzes

Create > Quiz → Describe theme → AI generates questions → Edit → Publish at \`tipote.com/q/[id]\`.

Captures email + name before showing results. Auto-syncs to Systeme.io.

> **See also:** [Create a page](/support/article/create-page) • [Manage leads](/support/article/manage-leads)`,
      es: `## Captura leads con quizzes interactivos

Crear > Quiz → tema → la IA genera preguntas → Publica en \`tipote.com/q/[id]\`. Captura email antes del resultado.`,
      it: `## Cattura lead con quiz interattivi

Crea > Quiz → tema → l'IA genera domande → Pubblica su \`tipote.com/q/[id]\`. Cattura email prima del risultato.`,
      ar: `## اجذب العملاء المحتملين بالاختبارات التفاعلية

إنشاء > اختبار ← الموضوع ← الذكاء الاصطناعي يولد الأسئلة ← انشر. يلتقط البريد الإلكتروني قبل النتيجة.`,
    },
    related_slugs: ["create-page", "manage-leads", "systemeio-integration"],
    tags: ["quiz", "leads", "capture", "lead-magnet"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 8: LEADS & CRM
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "leads-crm",
    slug: "manage-leads",
    sort_order: 1,
    title: {
      fr: "Gérer vos leads",
      en: "Manage your leads",
      es: "Gestionar tus leads",
      it: "Gestire i tuoi lead",
      ar: "إدارة العملاء المحتملين",
    },
    content: {
      fr: `## Centralisez tous vos prospects

Tous les leads capturés (quiz, pages, formulaires, automatisations) sont centralisés dans **👥 Mes Leads**.

### Le tableau principal

| Colonne | Description |
|---------|-------------|
| ✅ | Checkbox de sélection |
| 📧 Email | Adresse email du lead |
| 👤 Nom | Prénom et nom |
| 📍 Source | Quiz, page de capture, site vitrine, manuel |
| 📅 Date | Date de capture |
| 🔄 Systeme.io | Exporté oui/non |

### Fonctionnalités

- **Recherche** par email ou nom
- **Filtre** par source
- **Pagination** (20 par page)
- **Sélection multiple** + **export CSV**
- **Panel détail** (Sheet latéral) avec toutes les infos du lead

### Panel détail

En cliquant sur un lead, un panel latéral s'ouvre avec :
- Avatar, nom, email, téléphone
- Date de capture et source
- Résultat du quiz (si applicable)
- Réponses aux questions
- Statut d'export Systeme.io
- Actions : éditer / supprimer

### Statistiques (4 cartes)

- 📊 **Total leads** - Nombre total
- ❓ **Leads quiz** - Provenant des quiz
- 🔄 **Exportés Systeme.io** - Synchronisés
- 📅 **Ce mois-ci** - Nouveaux ce mois

### Sécurité des données

Vos leads sont protégés par un **chiffrement AES-256-GCM** :
- Chaque champ sensible (email, nom, téléphone) est chiffré individuellement
- Vous avez une **clé de chiffrement unique** (DEK)
- Même l'admin de Tipote ne peut pas lire vos leads
- Un badge de sécurité confirme : *"Vos données sont chiffrées de bout en bout (AES-256)"*

> **Voir aussi :** [Intégration Systeme.io](/support/article/systemeio-integration) • [Créer un quiz](/support/article/create-quiz) • [Créer une page](/support/article/create-page)`,
      en: `## Centralize all your prospects

All captured leads (quizzes, pages, forms, automations) are centralized in **My Leads**.

Features: search, filter by source, CSV export, detail panel, AES-256 encryption.

> **See also:** [Systeme.io integration](/support/article/systemeio-integration) • [Create a quiz](/support/article/create-quiz)`,
      es: `## Centraliza todos tus prospectos

Todos los leads capturados se centralizan en **Mis Leads**. Búsqueda, filtros, export CSV y cifrado AES-256.`,
      it: `## Centralizza tutti i tuoi contatti

Tutti i lead catturati sono centralizzati in **I miei Lead**. Ricerca, filtri, export CSV e crittografia AES-256.`,
      ar: `## مركزة جميع العملاء المحتملين

جميع العملاء المحتملين المسجلين مركزيون في **العملاء المحتملون**. بحث وفلاتر وتصدير CSV وتشفير AES-256.`,
    },
    related_slugs: ["systemeio-integration", "create-quiz", "create-page"],
    tags: ["leads", "crm", "prospects", "security", "encryption"],
  },
  {
    category_slug: "leads-crm",
    slug: "systemeio-integration",
    sort_order: 2,
    title: {
      fr: "Intégration Systeme.io",
      en: "Systeme.io integration",
      es: "Integración Systeme.io",
      it: "Integrazione Systeme.io",
      ar: "تكامل Systeme.io",
    },
    content: {
      fr: `## Connectez Tipote à votre CRM Systeme.io

### Configuration

1. **Paramètres > Connexions** → Section Systeme.io
2. Entrez votre **clé API Systeme.io**
3. Sauvegardez

### Ce que vous pouvez faire

- **Exporter les leads** de vos quiz et pages vers Systeme.io
- **Tags de capture** - Ajoutez des tags spécifiques par quiz/page
- **Synchronisation automatique** - Les nouveaux leads sont envoyés automatiquement
- **Acheter des crédits** supplémentaires via Systeme.io

### Templates Systeme.io

Tipote propose aussi une bibliothèque de **templates Systeme.io** téléchargeables et personnalisables via l'IA (accessible depuis **Templates** dans la sidebar).

> **Voir aussi :** [Gérer vos leads](/support/article/manage-leads) • [Templates Systeme.io](/support/article/systemeio-templates)`,
      en: `## Connect Tipote to Systeme.io

Go to **Settings > Connections**, enter your Systeme.io API key. Export leads, add capture tags, auto-sync.

> **See also:** [Manage leads](/support/article/manage-leads) • [Systeme.io templates](/support/article/systemeio-templates)`,
      es: `## Conecta Tipote a Systeme.io

Ve a **Configuración > Conexiones**, introduce tu API key de Systeme.io. Exporta leads y sincroniza.`,
      it: `## Collega Tipote a Systeme.io

Vai in **Impostazioni > Connessioni**, inserisci la tua API key Systeme.io. Esporta lead e sincronizza.`,
      ar: `## ربط Tipote بـ Systeme.io

اذهب إلى **الإعدادات > الاتصالات**، أدخل مفتاح API الخاص بـ Systeme.io. صدّر العملاء المحتملين وزامن.`,
    },
    related_slugs: ["manage-leads", "systemeio-templates", "create-quiz"],
    tags: ["systemeio", "integration", "crm", "api"],
  },
  {
    category_slug: "leads-crm",
    slug: "systemeio-templates",
    sort_order: 3,
    title: {
      fr: "Templates Systeme.io",
      en: "Systeme.io Templates",
      es: "Templates de Systeme.io",
      it: "Templates Systeme.io",
      ar: "قوالب Systeme.io",
    },
    content: {
      fr: `## Des templates prêts à l'emploi

### Accès

**📄 Templates** dans la sidebar.

### Fonctionnalités

- **Prévisualisation** des templates avant téléchargement
- **Téléchargement direct** dans votre compte Systeme.io
- **Itération IA** - Demandez à l'IA de modifier le contenu
- **Reformulation** - Adaptez le texte à votre tonalité
- **Personnalisation** - Le contenu est adapté à votre profil business

> **Voir aussi :** [Intégration Systeme.io](/support/article/systemeio-integration) • [Hub de création](/support/article/create-content-overview)`,
      en: `## Ready-to-use templates

Access: **Templates** in sidebar. Preview, download, customize with AI, and import into Systeme.io.

> **See also:** [Systeme.io integration](/support/article/systemeio-integration)`,
      es: `## Templates listos para usar

Accede desde **Templates** en la barra lateral. Previsualiza, descarga y personaliza con IA.`,
      it: `## Template pronti all'uso

Accedi da **Templates** nella sidebar. Anteprima, scarica e personalizza con l'IA.`,
      ar: `## قوالب جاهزة للاستخدام

الوصول من **القوالب** في الشريط الجانبي. معاينة وتنزيل وتخصيص باستخدام الذكاء الاصطناعي.`,
    },
    related_slugs: ["systemeio-integration", "create-content-overview"],
    tags: ["templates", "systemeio", "download"],
  },
  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 9: BILLING & CREDITS
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "billing-credits",
    slug: "plans-overview",
    sort_order: 1,
    title: {
      fr: "Les plans et tarifs",
      en: "Plans and pricing",
      es: "Planes y precios",
      it: "Piani e prezzi",
      ar: "الخطط والأسعار",
    },
    content: {
      fr: `## Choisissez le plan qui vous correspond

### Tableau comparatif

| | Free | Basic | Pro | Elite |
|---|---|---|---|---|
| **Prix/mois** | 0€ | 19€ | 49€ | 99€ |
| **Prix/an** | - | 190€ | 490€ | 990€ |
| **Crédits IA/mois** | 25 (one-shot) | 40 | 150 | 500 |
| **Tous les modules** | ✅ | ✅ | ✅ | ✅ |
| **Publication directe** | ✅ | ✅ | ✅ | ✅ |
| **Auto-commentaires** | ❌ | ✅ | ✅ | ✅ |
| **Coach IA** | ❌ | ❌ | ✅ | ✅ |
| **Multi-projets** | ❌ | ❌ | ❌ | ✅ |

### Détails par plan

#### 🆓 Free
- **25 crédits** en une seule fois (pas de renouvellement)
- Accès à tous les modules de base
- Publication directe sur les réseaux sociaux
- Idéal pour **tester** Tipote

#### 💙 Basic - 19€/mois
- **40 crédits/mois** (renouvelés automatiquement)
- Auto-commentaires débloqués
- Parfait pour les **débutants** qui publient régulièrement

#### ⭐ Pro - 49€/mois (Populaire)
- **150 crédits/mois**
- **Coach IA** inclus (conversations illimitées)
- Idéal pour les **entrepreneurs actifs** qui produisent beaucoup de contenu

#### 💎 Elite - 99€/mois
- **500 crédits/mois**
- **Multi-projets** - Gérez plusieurs business depuis un compte
- Pour les **entrepreneurs avancés** et **agences**

### Économisez avec l'abonnement annuel

Les plans annuels offrent l'équivalent de **2 mois gratuits** :
- Basic : 190€/an (au lieu de 228€)
- Pro : 490€/an (au lieu de 588€)
- Elite : 990€/an (au lieu de 1 188€)

> **Voir aussi :** [Les crédits IA expliqués](/support/article/credits-explained) • [Acheter des crédits supplémentaires](/support/article/buy-extra-credits) • [Gérer votre abonnement](/support/article/manage-subscription)`,
      en: `## Choose the right plan

| | Free | Basic (19€/mo) | Pro (49€/mo) | Elite (99€/mo) |
|---|---|---|---|---|
| AI Credits/mo | 25 (one-time) | 40 | 150 | 500 |
| All modules | ✅ | ✅ | ✅ | ✅ |
| Direct publishing | ✅ | ✅ | ✅ | ✅ |
| Auto-comments | ❌ | ✅ | ✅ | ✅ |
| AI Coach | ❌ | ❌ | ✅ | ✅ |
| Multi-projects | ❌ | ❌ | ❌ | ✅ |

Annual plans save ~2 months.

> **See also:** [Credits explained](/support/article/credits-explained) • [Buy extra credits](/support/article/buy-extra-credits)`,
      es: `## Elige el plan adecuado

Free (0€), Basic (19€/mes), Pro (49€/mes), Elite (99€/mes). Planes anuales ahorran 2 meses.

> **Ver también:** [Créditos explicados](/support/article/credits-explained)`,
      it: `## Scegli il piano giusto

Free (0€), Basic (19€/mese), Pro (49€/mese), Elite (99€/mese). Piani annuali risparmiano 2 mesi.

> **Vedi anche:** [Crediti spiegati](/support/article/credits-explained)`,
      ar: `## اختر الخطة المناسبة

Free (0€)، Basic (19€/شهر)، Pro (49€/شهر)، Elite (99€/شهر). الخطط السنوية توفر شهرين.`,
    },
    related_slugs: ["credits-explained", "buy-extra-credits", "manage-subscription"],
    tags: ["plans", "pricing", "subscription", "free", "basic", "pro", "elite"],
  },
  {
    category_slug: "billing-credits",
    slug: "credits-explained",
    sort_order: 2,
    title: {
      fr: "Comment fonctionnent les crédits IA ?",
      en: "How do AI credits work?",
      es: "¿Cómo funcionan los créditos IA?",
      it: "Come funzionano i crediti IA?",
      ar: "كيف تعمل أرصدة الذكاء الاصطناعي؟",
    },
    content: {
      fr: `## Le système de crédits Tipote

### Qu'est-ce qu'un crédit ?

Un crédit ≈ **0.01€ de coût IA réel**. Chaque fois que l'IA génère du contenu, elle consomme des crédits.

### Combien de crédits par génération ?

Le coût varie selon la **longueur et complexité** :
- Un **post court** = ~1 crédit
- Un **article long** = ~3-5 crédits
- Un **funnel complet** = ~5-10 crédits
- Un **auto-commentaire** = 0.25 crédit

### Renouvellement

- **Free** : 25 crédits en one-shot (pas de renouvellement)
- **Basic/Pro/Elite** : Crédits renouvelés **chaque mois**
- Les crédits mensuels **ne sont pas cumulables** d'un mois à l'autre

### Voir votre solde

- **Header** : le compteur de crédits est toujours visible en haut
- **Paramètres > IA** : panel détaillé avec historique

### Quand les crédits sont épuisés ?

Vous ne pouvez plus générer de contenu IA. Deux options :
1. **Attendre le renouvellement** du mois suivant
2. **Acheter un pack** de crédits supplémentaires

> **Voir aussi :** [Acheter des crédits](/support/article/buy-extra-credits) • [Les plans et tarifs](/support/article/plans-overview)`,
      en: `## The Tipote credit system

1 credit ≈ 0.01€ of AI cost. Credits renew monthly (except Free = one-time). Not cumulative.

Check balance in the header or **Settings > AI**.

> **See also:** [Buy extra credits](/support/article/buy-extra-credits) • [Plans overview](/support/article/plans-overview)`,
      es: `## El sistema de créditos

1 crédito ≈ 0.01€. Se renuevan mensualmente (excepto Free). No acumulables.`,
      it: `## Il sistema di crediti

1 credito ≈ 0.01€. Si rinnovano mensilmente (tranne Free). Non cumulabili.`,
      ar: `## نظام الأرصدة

رصيد واحد ≈ 0.01€. يتجدد شهريًا (باستثناء Free). غير تراكمي.`,
    },
    related_slugs: ["buy-extra-credits", "plans-overview"],
    tags: ["credits", "ai", "billing", "consumption"],
  },
  {
    category_slug: "billing-credits",
    slug: "buy-extra-credits",
    sort_order: 3,
    title: {
      fr: "Acheter des crédits supplémentaires",
      en: "Buy extra credits",
      es: "Comprar créditos adicionales",
      it: "Acquistare crediti aggiuntivi",
      ar: "شراء أرصدة إضافية",
    },
    content: {
      fr: `## Des packs pour ne jamais manquer de crédits

### Packs disponibles

| Pack | Crédits | Prix |
|------|---------|------|
| 🟢 **Starter** | 25 crédits | 3€ |
| 🔵 **Standard** | 100 crédits | 10€ |
| ⭐ **Pro** | 250 crédits | 22€ |

### Caractéristiques

- **Pas d'expiration** - Les crédits achetés ne périment pas
- **Cumulables** - Ils s'ajoutent à votre solde existant
- **Consommation FIFO** - Les crédits mensuels sont utilisés en premier, puis les crédits achetés

### Comment acheter ?

1. **Paramètres > Abonnement** → Section "Crédits"
2. Choisissez votre pack
3. Vous êtes redirigé vers **Systeme.io** pour le paiement
4. Après paiement, les crédits sont **ajoutés automatiquement** via webhook

> **Voir aussi :** [Les crédits expliqués](/support/article/credits-explained) • [Les plans et tarifs](/support/article/plans-overview)`,
      en: `## Packs to never run out

| Pack | Credits | Price |
|------|---------|-------|
| Starter | 25 | 3€ |
| Standard | 100 | 10€ |
| Pro | 250 | 22€ |

No expiration. Added to your balance. Monthly credits consumed first (FIFO).

Buy from **Settings > Subscription**.

> **See also:** [Credits explained](/support/article/credits-explained)`,
      es: `## Packs de créditos adicionales

Starter (25/3€), Standard (100/10€), Pro (250/22€). Sin expiración. Compra en Configuración > Suscripción.`,
      it: `## Pacchetti di crediti aggiuntivi

Starter (25/3€), Standard (100/10€), Pro (250/22€). Senza scadenza. Acquista in Impostazioni > Abbonamento.`,
      ar: `## حزم أرصدة إضافية

Starter (25/3€)، Standard (100/10€)، Pro (250/22€). بدون انتهاء صلاحية. اشترِ من الإعدادات > الاشتراك.`,
    },
    related_slugs: ["credits-explained", "plans-overview"],
    tags: ["credits", "packs", "buy", "systemeio"],
  },
  {
    category_slug: "billing-credits",
    slug: "manage-subscription",
    sort_order: 4,
    title: {
      fr: "Gérer votre abonnement",
      en: "Manage your subscription",
      es: "Gestionar tu suscripción",
      it: "Gestire il tuo abbonamento",
      ar: "إدارة اشتراكك",
    },
    content: {
      fr: `## Upgrade, downgrade ou annulation

### Accès

**Paramètres > Abonnement**

### Ce que vous voyez

- Votre **plan actuel** avec badge
- Vos **crédits** disponibles / total
- Le **tableau comparatif** des plans
- Votre **consommation** par type de contenu

### Changer de plan (Upgrade)

1. Cliquez sur **"Upgrade"** sur le plan souhaité
2. Vous êtes redirigé vers Systeme.io pour le paiement
3. Le changement est **immédiat** après paiement

### Downgrade

Le downgrade prend effet au **prochain renouvellement**. Vous conservez les avantages de votre plan actuel jusqu'à la fin de la période payée.

### Annulation

Si vous annulez :
- Votre plan revient à **Free** au prochain renouvellement
- Vos données sont **conservées 90 jours**
- Vous pouvez vous réabonner à tout moment

> **Voir aussi :** [Les plans et tarifs](/support/article/plans-overview) • [Les crédits IA](/support/article/credits-explained)`,
      en: `## Upgrade, downgrade or cancel

Go to **Settings > Subscription**. Upgrade is immediate. Downgrade takes effect at next renewal. Cancellation = Free plan, data kept 90 days.

> **See also:** [Plans overview](/support/article/plans-overview)`,
      es: `## Upgrade, downgrade o cancelar

En **Configuración > Suscripción**. Upgrade inmediato. Downgrade al próximo mes. Cancelación = plan Free, datos 90 días.`,
      it: `## Upgrade, downgrade o annulla

In **Impostazioni > Abbonamento**. Upgrade immediato. Downgrade al prossimo rinnovo. Annullamento = piano Free, dati 90 giorni.`,
      ar: `## ترقية أو تخفيض أو إلغاء

في **الإعدادات > الاشتراك**. الترقية فورية. التخفيض عند التجديد. الإلغاء = خطة مجانية، البيانات محفوظة 90 يومًا.`,
    },
    related_slugs: ["plans-overview", "credits-explained"],
    tags: ["subscription", "upgrade", "downgrade", "cancel"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 10: ANALYTICS & PEPITES
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "analytics-pepites",
    slug: "analytics-overview",
    sort_order: 1,
    title: {
      fr: "Suivre vos performances avec Analytics",
      en: "Track your performance with Analytics",
      es: "Seguir tu rendimiento con Analytics",
      it: "Monitorare le prestazioni con Analytics",
      ar: "تتبع أدائك مع التحليلات",
    },
    content: {
      fr: `## Mesurez, analysez, progressez

### Accès

**📊 Analytics** dans la sidebar.

### Les 3 blocs

#### 1. KPIs du mois (Header)
4 cartes avec vos métriques clés du mois en cours.

#### 2. Saisie des données
- Sélecteur de **période** (mois + année)
- **8 métriques** à renseigner :
  - **Acquisition** : Visiteurs, Nouveaux inscrits, Taux d'ouverture, Taux de clic
  - **Conversion** : Vues page de vente, Nombre de ventes, Chiffre d'affaires
- Calculs **automatiques** dérivés
- Boutons : **Enregistrer** / **Enregistrer & Analyser**

#### 3. Diagnostic IA
Après avoir cliqué sur "Enregistrer & Analyser", l'IA produit :
- Un **diagnostic rapide** (résumé de votre situation)
- La **priorité #1** (action la plus impactante)
- Vos **points forts** (2-3 éléments)
- Vos **points d'attention** (2-3 éléments avec conseils)

### Métriques par offre

Vous pouvez aussi suivre les métriques **par offre** : visiteurs, inscrits, ventes, CA, taux de conversion.

> **Voir aussi :** [Les pépites business](/support/article/pepites) • [Le plan stratégique](/support/article/strategic-plan)`,
      en: `## Measure, analyze, grow

**Analytics** in sidebar. 3 sections: Monthly KPIs, Data entry (8 metrics), AI Diagnosis (strengths, weaknesses, priority).

Also tracks per-offer metrics.

> **See also:** [Business insights](/support/article/pepites) • [Strategic plan](/support/article/strategic-plan)`,
      es: `## Mide, analiza, crece

**Analytics** en la barra lateral. KPIs, entrada de datos (8 métricas) y diagnóstico IA.`,
      it: `## Misura, analizza, cresci

**Analytics** nella sidebar. KPI, inserimento dati (8 metriche) e diagnosi IA.`,
      ar: `## قِس، حلّل، انمُ

**التحليلات** في الشريط الجانبي. مؤشرات الأداء وإدخال البيانات (8 مقاييس) وتشخيص الذكاء الاصطناعي.`,
    },
    related_slugs: ["pepites", "strategic-plan"],
    tags: ["analytics", "kpi", "diagnosis", "performance"],
  },
  {
    category_slug: "analytics-pepites",
    slug: "pepites",
    sort_order: 2,
    title: {
      fr: "Les pépites business",
      en: "Business insights (Pépites)",
      es: "Insights de negocio (Pépites)",
      it: "Intuizioni di business (Pépites)",
      ar: "أفكار الأعمال (Pépites)",
    },
    content: {
      fr: `## Des insights qui font la différence

Les **pépites** sont des insights et recommandations business que Tipote vous envoie régulièrement.

### Accès

**💎 Pépites** dans la sidebar.

### Types de pépites

- **Conseils stratégiques** basés sur votre progression
- **Opportunités** détectées dans votre marché
- **Bonnes pratiques** adaptées à votre niche
- **Alertes** si votre engagement baisse

### Notifications

Quand une nouvelle pépite arrive, un **badge compteur** apparaît sur l'icône Pépites dans la sidebar. Vous recevez aussi une notification.

> **Voir aussi :** [Analytics](/support/article/analytics-overview) • [Le plan stratégique](/support/article/strategic-plan)`,
      en: `## Insights that make a difference

**Insights** are business tips and recommendations Tipote sends regularly. Access via **Insights** in sidebar. Badge counter for new ones.

> **See also:** [Analytics](/support/article/analytics-overview)`,
      es: `## Insights que marcan la diferencia

Recomendaciones de negocio que Tipote envía regularmente. Acceso desde **Pépites** en la barra lateral.`,
      it: `## Intuizioni che fanno la differenza

Raccomandazioni di business che Tipote invia regolarmente. Accesso da **Pépites** nella sidebar.`,
      ar: `## أفكار تصنع الفارق

توصيات أعمال يرسلها Tipote بانتظام. الوصول من **Pépites** في الشريط الجانبي.`,
    },
    related_slugs: ["analytics-overview", "strategic-plan"],
    tags: ["pepites", "insights", "tips", "recommendations"],
  },
  {
    category_slug: "analytics-pepites",
    slug: "coach-ia",
    sort_order: 3,
    title: {
      fr: "Le Coach IA",
      en: "The AI Coach",
      es: "El Coach IA",
      it: "Il Coach IA",
      ar: "المدرب الذكي",
    },
    content: {
      fr: `## Votre coach business personnel, disponible 24/7

### Qu'est-ce que le Coach IA ?

Le Coach IA est un **assistant conversationnel** qui connaît tout votre business. Il est accessible via une **bulle flottante** en bas de l'écran.

### Disponibilité

| Plan | Accès |
|------|-------|
| Free | ❌ Verrouillé (CTA upgrade) |
| Basic | ❌ Verrouillé (CTA upgrade) |
| **Pro** | ✅ Inclus (illimité) |
| **Elite** | ✅ Inclus (illimité) |

### Ce que le Coach sait

Le Coach a accès à **toutes vos données business** :
- Votre profil et diagnostic
- Votre persona client
- Votre pyramide d'offres
- Votre plan d'action et progression
- Vos analytics

### Exemples de questions

- "Quelle devrait être ma prochaine action prioritaire ?"
- "Comment améliorer mon taux de conversion ?"
- "Aide-moi à rédiger un email pour relancer mes prospects"
- "Analyse mes dernières stats et donne-moi des conseils"

### Pas de consommation de crédits

Le Coach IA est **illimité** et ne consomme **aucun crédit**. Utilisez-le autant que vous voulez !

### Historique

Les conversations sont sauvegardées et accessibles dans le **panneau latéral** Coach IA.

> **Voir aussi :** [Les plans et tarifs](/support/article/plans-overview)`,
      en: `## Your personal business coach, 24/7

The AI Coach is a conversational assistant that knows your entire business. Available on **Pro and Elite** plans. No credit consumption.

Access via the floating bubble at the bottom of the screen.

> **See also:** [Plans overview](/support/article/plans-overview)`,
      es: `## Tu coach de negocios personal, 24/7

El Coach IA es un asistente conversacional disponible en planes **Pro y Elite**. Sin consumo de créditos.`,
      it: `## Il tuo coach di business personale, 24/7

Il Coach IA è un assistente conversazionale disponibile nei piani **Pro ed Elite**. Nessun consumo di crediti.`,
      ar: `## مدربك الشخصي للأعمال، متاح 24/7

المدرب الذكي هو مساعد محادثة متاح في خطط **Pro وElite**. بدون استهلاك أرصدة.`,
    },
    related_slugs: ["plans-overview", "credits-explained"],
    tags: ["coach", "ai", "assistant", "chat"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY 11: WIDGETS
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "widgets",
    slug: "toast-widgets",
    sort_order: 1,
    title: {
      fr: "Widgets de preuve sociale (Toast)",
      en: "Social proof widgets (Toast)",
      es: "Widgets de prueba social (Toast)",
      it: "Widget di prova sociale (Toast)",
      ar: "أدوات الإثبات الاجتماعي (Toast)",
    },
    content: {
      fr: `## Renforcez la confiance avec des notifications de preuve sociale

### Qu'est-ce qu'un Toast Widget ?

Les **toast widgets** sont des petites notifications pop-up qui s'affichent sur vos pages (site, landing page, page Systeme.io) pour montrer l'activité récente et renforcer la confiance.

### Types de notifications

- 👥 **Visiteurs en temps réel** - "15 personnes consultent cette page"
- ✅ **Inscriptions récentes** - "Marie vient de s'inscrire"
- 💰 **Achats récents** - "Thomas vient d'acheter"
- 📢 **Messages personnalisés** - "Plus que 3 places disponibles"

### Configuration

1. **Widgets** dans la sidebar → **Notifications Toast**
2. Créez un nouveau widget
3. Configurez :
   - **Position** : bas-gauche, bas-droite, haut-gauche, haut-droite
   - **Thème** : clair, sombre, minimal
   - **Couleur d'accent** : personnalisable
   - **Durée** : 3 à 15 secondes
   - **Délai entre toasts** : 5 à 60 secondes
   - **Max par session** : 1 à 50
   - **Anonymisation** : configurable (RGPD)

### Intégration

Copiez le **snippet \`<script>\`** généré et collez-le sur votre site. Le widget fonctionne automatiquement !

> **Voir aussi :** [Widgets de partage social](/support/article/share-widgets) • [Créer une page](/support/article/create-page)`,
      en: `## Build trust with social proof notifications

Toast widgets show pop-up notifications on your pages (visitors, signups, purchases, custom messages).

Configure position, theme, timing, and GDPR anonymization. Copy-paste the generated script tag onto your site.

> **See also:** [Share widgets](/support/article/share-widgets)`,
      es: `## Genera confianza con notificaciones de prueba social

Los widgets toast muestran notificaciones pop-up en tus páginas. Configura posición, tema, timing y anonimización RGPD.`,
      it: `## Costruisci fiducia con notifiche di prova sociale

I widget toast mostrano notifiche pop-up sulle tue pagine. Configura posizione, tema, timing e anonimizzazione GDPR.`,
      ar: `## ابنِ الثقة مع إشعارات الإثبات الاجتماعي

أدوات Toast تعرض إشعارات منبثقة على صفحاتك. تهيئة الموضع والمظهر والتوقيت وإخفاء الهوية.`,
    },
    related_slugs: ["share-widgets", "create-page"],
    tags: ["widgets", "toast", "social-proof", "notifications"],
  },
  {
    category_slug: "widgets",
    slug: "share-widgets",
    sort_order: 2,
    title: {
      fr: "Widgets de partage social (Share)",
      en: "Social share widgets",
      es: "Widgets de compartir social",
      it: "Widget di condivisione social",
      ar: "أدوات المشاركة الاجتماعية",
    },
    content: {
      fr: `## Facilitez le partage de votre contenu

### Qu'est-ce qu'un Share Widget ?

Les **share widgets** ajoutent des **boutons de partage** sur vos pages pour que vos visiteurs puissent partager votre contenu sur leurs réseaux.

### Plateformes supportées (8)

Facebook, X (Twitter), LinkedIn, WhatsApp, Telegram, Reddit, Pinterest, Email.

### Modes d'affichage

- **Inline** - Intégré dans le flux de la page
- **Floating left/right** - Barre flottante sur le côté
- **Bottom bar** - Barre fixe en bas de page

### Personnalisation

- **Style** : rounded, square, circle, pill
- **Taille** : small, medium, large
- **Couleurs** : marque officielle, mono clair/sombre, couleur personnalisée
- **Labels** : afficher/masquer les noms
- **Texte de partage** pré-rempli
- **Hashtags** automatiques

### Intégration

Copiez le snippet avec \`data-tipote-share\` et collez-le sur votre site.

> **Voir aussi :** [Widgets toast](/support/article/toast-widgets) • [Créer une page](/support/article/create-page)`,
      en: `## Make sharing easy

Share widgets add share buttons on your pages. 8 platforms supported. 4 display modes. Fully customizable.

Copy-paste the generated script tag.

> **See also:** [Toast widgets](/support/article/toast-widgets)`,
      es: `## Facilita el compartir

Widgets de compartir con botones para 8 plataformas. 4 modos de display. Personalizables.`,
      it: `## Rendi facile la condivisione

Widget di condivisione con pulsanti per 8 piattaforme. 4 modalità di visualizzazione. Personalizzabili.`,
      ar: `## اجعل المشاركة سهلة

أدوات مشاركة بأزرار لـ 8 منصات. 4 أوضاع عرض. قابلة للتخصيص بالكامل.`,
    },
    related_slugs: ["toast-widgets", "create-page"],
    tags: ["widgets", "share", "social", "buttons"],
  },
  {
    category_slug: "billing-credits",
    slug: "multi-projects",
    sort_order: 5,
    title: {
      fr: "Multi-projets (Elite)",
      en: "Multi-projects (Elite)",
      es: "Multi-proyectos (Elite)",
      it: "Multi-progetti (Elite)",
      ar: "مشاريع متعددة (Elite)",
    },
    content: {
      fr: `## Gérez plusieurs business depuis un seul compte

### Disponibilité

Le multi-projets est une fonctionnalité **exclusive au plan Elite** (99€/mois).

### Comment ça marche ?

- Un **sélecteur de projet** apparaît dans le header
- Chaque projet a son propre **profil business**, **persona**, **plan stratégique**, **contenus** et **leads**
- Vous basculez d'un projet à l'autre en un clic
- Les crédits sont **partagés** entre les projets

### Cas d'usage

- Vous gérez **plusieurs entreprises**
- Vous êtes une **agence** qui gère des clients
- Vous avez un **side project** en plus de votre activité principale

> **Voir aussi :** [Les plans et tarifs](/support/article/plans-overview)`,
      en: `## Manage multiple businesses from one account

Multi-projects is **Elite-only** (99€/mo). Each project has its own business profile, persona, plan, content and leads. Credits are shared.

> **See also:** [Plans overview](/support/article/plans-overview)`,
      es: `## Gestiona múltiples negocios desde una cuenta

Multi-proyectos es exclusivo del plan **Elite** (99€/mes). Cada proyecto tiene su propio perfil, persona, plan y contenidos.`,
      it: `## Gestisci più business da un account

Multi-progetti è esclusivo del piano **Elite** (99€/mese). Ogni progetto ha il proprio profilo, persona, piano e contenuti.`,
      ar: `## إدارة أعمال متعددة من حساب واحد

المشاريع المتعددة حصرية لخطة **Elite** (99€/شهر). كل مشروع له ملفه الخاص وشخصيته وخطته ومحتواه.`,
    },
    related_slugs: ["plans-overview"],
    tags: ["multi-projects", "elite", "agency"],
  },
  {
    category_slug: "account-settings",
    slug: "delete-account",
    sort_order: 6,
    title: {
      fr: "Supprimer votre compte",
      en: "Delete your account",
      es: "Eliminar tu cuenta",
      it: "Eliminare il tuo account",
      ar: "حذف حسابك",
    },
    content: {
      fr: `## Suppression de compte

### Comment supprimer votre compte ?

1. Allez dans **Paramètres > Réglages**
2. Descendez jusqu'à la section **"Zone de danger"**
3. Cliquez sur **"Supprimer mon compte"**
4. Confirmez en tapant votre email
5. Votre compte est supprimé

### Ce qui est supprimé

- Votre profil et données business
- Tous vos contenus générés
- Vos leads (données chiffrées)
- Vos connexions réseaux sociaux
- Vos crédits restants

### Ce qui n'est PAS supprimé

- Les posts déjà publiés sur vos réseaux sociaux (ils restent sur les plateformes)
- Les pages publiques (elles deviennent inaccessibles)

### Puis-je récupérer mon compte ?

Non. La suppression est **définitive et irréversible**. Exportez vos données (leads CSV) avant de supprimer.

> ⚠️ **Important :** Si vous avez un abonnement actif, annulez-le d'abord sur Systeme.io pour éviter d'être facturé.

> **Voir aussi :** [Gérer votre abonnement](/support/article/manage-subscription)`,
      en: `## Account deletion

Go to **Settings > General** → "Danger zone" → "Delete my account" → Confirm with email. Deletion is **permanent and irreversible**.

Export your data first. Cancel active subscriptions on Systeme.io.

> **See also:** [Manage subscription](/support/article/manage-subscription)`,
      es: `## Eliminar cuenta

En **Configuración > Ajustes** → "Zona de peligro" → "Eliminar mi cuenta". La eliminación es permanente e irreversible.`,
      it: `## Eliminazione account

In **Impostazioni > Impostazioni** → "Zona pericolosa" → "Elimina il mio account". L'eliminazione è permanente e irreversibile.`,
      ar: `## حذف الحساب

في **الإعدادات > الإعدادات** ← "منطقة الخطر" ← "حذف حسابي". الحذف نهائي ولا رجعة فيه.`,
    },
    related_slugs: ["manage-subscription", "settings-overview"],
    tags: ["delete", "account", "danger"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CATEGORY: TIQUIZ
  // ═══════════════════════════════════════════════════════════════════
  {
    category_slug: "tiquiz",
    slug: "what-is-tiquiz",
    sort_order: 1,
    title: {
      fr: "Qu'est-ce que Tiquiz ?",
      en: "What is Tiquiz?",
      es: "¿Qué es Tiquiz?",
      it: "Cos'è Tiquiz?",
      ar: "ما هو Tiquiz؟",
    },
    content: {
      fr: `## Tiquiz en bref

**Tiquiz** est un outil de création de quiz interactifs conçu pour capturer des leads qualifiés. C'est la version quiz de Tipote : simple côté utilisateur, puissant côté backend.

### Ce que tu peux faire avec Tiquiz

- **Créer des quiz** à la main ou les **faire écrire par l'IA** à partir d'une phrase
- **Créer des sondages** pour poser tes questions à ton audience et lire les réponses
- **Créer des popquizzes** : un quiz incrusté dans une vidéo, qui capture pendant le visionnage
- **Capturer des leads** (email, prénom, nom, téléphone, pays)
- **Synchroniser avec Systeme.io** tout seul : contact créé, tag du résultat posé, inscription en formation ou en communauté
- **Offrir un bonus contre un partage** pour que ton quiz circule
- **Suivre ce qui se passe** : vues, taux de complétion, où les gens s'arrêtent, résultats obtenus, partages
- **Mettre ta marque partout** : logo, couleurs, polices, et ton propre nom de domaine

### Accès

Tiquiz s'utilise sur **quiz.tipote.com**, dans le navigateur, sans rien installer.

L'interface existe en 7 langues : français, anglais, espagnol, italien, portugais, portugais du Brésil et arabe. Tes quiz publics, eux, peuvent être dans n'importe quelle langue : c'est toi qui écris le texte.

### Tiquiz ou Tipote ?

**Tiquiz** ne fait que du quiz, et le fait à fond. **Tipote** est un outil plus large (contenus, réseaux sociaux, automatisations, pages) dont le quiz n'est qu'un module. Si tu ne veux que du quiz, reste sur Tiquiz.`,
      en: `## Tiquiz in a nutshell

**Tiquiz** is an interactive quiz creation tool designed to capture qualified leads. It's the quiz-only version of Tipote: simple for users, powerful under the hood.

### What you can do with Tiquiz

- **Create quizzes** by hand, or **have the AI write one** from a single sentence
- **Create surveys** to ask your audience questions and read the answers
- **Create popquizzes**: a quiz embedded in a video that captures while people watch
- **Capture leads** (email, first name, last name, phone, country)
- **Sync with Systeme.io** on its own: contact created, result tag applied, course or community enrolment
- **Offer a bonus in exchange for a share** so your quiz travels
- **See what happens**: views, completion rate, where people stop, results obtained, shares
- **Put your brand everywhere**: logo, colours, fonts, and your own domain name

### Access

Tiquiz runs at **quiz.tipote.com**, in the browser, nothing to install.

The interface exists in 7 languages: French, English, Spanish, Italian, Portuguese, Brazilian Portuguese and Arabic. Your public quizzes can be in any language: you write the text.

### Tiquiz or Tipote?

**Tiquiz** only does quizzes, and does them thoroughly. **Tipote** is a wider tool (content, social, automations, pages) where quizzes are one module. If you only want quizzes, stay on Tiquiz.`,
      es: `## Tiquiz en resumen

**Tiquiz** es una herramienta de creación de quiz interactivos para capturar leads cualificados. Es la versión quiz de Tipote: simple para el usuario, potente por detrás.

- Crea quiz manualmente o con IA (Claude)
- Captura leads (email, nombre, teléfono, país)
- Sincronización automática con Systeme.io
- Viralidad: los participantes comparten para desbloquear un bonus
- También encuestas y popquizzes (quiz dentro de un vídeo)\n- Estadísticas: vistas, finalización, dónde se detiene la gente\n- Tu marca y tu propio dominio\n- Acceso en **quiz.tipote.com**, interfaz en 7 idiomas`,
      it: `## Tiquiz in breve

**Tiquiz** è uno strumento per creare quiz interattivi e catturare lead qualificati. È la versione quiz di Tipote: semplice per l'utente, potente nel backend.

- Crea quiz manualmente o con IA (Claude)
- Cattura lead (email, nome, telefono, paese)
- Sincronizzazione automatica con Systeme.io
- Viralità: i partecipanti condividono per sbloccare un bonus
- Anche sondaggi e popquiz (quiz dentro un video)\n- Statistiche: visite, completamento, dove le persone si fermano\n- Il tuo brand e il tuo dominio\n- Accesso su **quiz.tipote.com**, interfaccia in 7 lingue`,
      ar: `## Tiquiz باختصار

**Tiquiz** هو أداة لإنشاء اختبارات تفاعلية لجمع عملاء محتملين مؤهلين. هو نسخة الاختبارات من Tipote: بسيط للمستخدم، قوي في الخلفية.

- إنشاء اختبارات يدوياً أو بالذكاء الاصطناعي
- جمع العملاء المحتملين (بريد، اسم، هاتف، بلد)
- مزامنة تلقائية مع Systeme.io
- كذلك استطلاعات وبوب كويز (اختبار داخل فيديو)\n- إحصاءات: المشاهدات، نسبة الإكمال، أين يتوقف الناس\n- علامتك التجارية ونطاقك الخاص\n- متاح على **quiz.tipote.com**، بواجهة بسبع لغات`,
    },
    related_slugs: ["tiquiz-create-quiz", "tiquiz-plans"],
    tags: ["tiquiz", "quiz", "leads", "overview"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-create-quiz",
    sort_order: 2,
    title: {
      fr: "Créer un quiz (manuel ou IA)",
      en: "Create a quiz (manual or AI)",
      es: "Crear un quiz (manual o IA)",
      it: "Creare un quiz (manuale o IA)",
      ar: "إنشاء اختبار (يدوي أو بالذكاء الاصطناعي)",
    },
    content: {
      fr: `## Créer un quiz sur Tiquiz

Rendez-vous sur **Créer un quiz** dans la sidebar. Tu as 3 options :

### Option 1 : Manuel
- Donne un **titre** et une **introduction** à ton quiz
- Ajoute tes **questions** avec les options de réponse
- Configure les **résultats** (titre, description, insight, projection, CTA)
- Associe chaque option à un résultat
- Configure les **champs de capture** (email, prénom, nom, téléphone, pays)

### Option 2 : Génération IA
- Choisis un **objectif** parmi 16 objectifs stratégiques
- Décris ton **public cible** et le **ton** souhaité
- Choisis le **format** (court : 3-5 questions, long : 6-10)
- Choisis le type de quiz : **par profil** (qui es-tu ?) ou **avec un score** (où en es-tu ?). C'est la seule décision difficile : si tu hésites, lis « Profil ou score : lequel choisir ? » avant de continuer
- Clique sur **Générer** - l'IA crée tout en temps réel !

### Option 3 : Importer depuis un fichier
- Tu as déjà un quiz rédigé ailleurs ? Importe-le en **.txt** (max 50 000 caractères).
- L'IA structure automatiquement ton contenu en questions, options et résultats.
- **Formats supportés :** .txt uniquement pour l'instant. Pour un PDF ou un DOCX, copie-colle le texte dans un fichier .txt avant d'importer.
- Astuce : structure ton .txt avec des sections claires (questions numérotées, options A/B/C/D, résultats nommés) → l'IA respectera mieux ta structure.

> Tu peux toujours modifier le quiz généré ou importé avant de le publier.

---

## Publier ton quiz pour le voir en ligne

Un quiz fraîchement créé est en **brouillon** : il n'est PAS encore accessible en ligne. Si tu ouvres son lien public avant de l'avoir publié, tu tombes sur une page **404** (c'est normal, personne d'autre que toi ne peut y accéder tant qu'il est en brouillon).

Pour le mettre en ligne :
1. Ouvre ton quiz dans l'éditeur.
2. Clique sur **Publier** (bouton en haut à droite). Le statut passe de "brouillon" à "actif".
3. Ton lien public devient accessible : \`https://quiz.tipote.com/q/ton-slug\` (ou \`https://ton-domaine/ton-slug\` si tu as connecté ton propre domaine).

**Pas besoin d'API ni de réglage par quiz.** Tu peux créer autant de quiz que tu veux sur le même domaine, chacun avec son propre slug. Il suffit de **publier chaque quiz** pour qu'il soit accessible. Un quiz non publié renverra toujours une 404, même si le slug est correct : dans ce cas, retourne dans l'éditeur et clique sur Publier.

---

## Personnalisation dynamique (prénom & genre)

Active **"Demander le prénom"** et/ou **"Demander le genre"** dans la barre latérale pour afficher un écran optionnel avant la 1ʳᵉ question. Les visiteurs choisissent leur genre (Il / Elle / Iel) → tes questions, résultats et CTA s'adaptent automatiquement.

**Comment ça marche :**
- Clique sur le **bouton ✨** à côté de n'importe quel champ → l'IA génère 3 variantes (masculin, féminin, inclusif) et les stocke au format \`{prêt|prête|prêt·e}\`.
- Tu peux éditer chaque variante à la main après génération.
- Le placeholder \`{name}\` s'insère dans tes textes pour afficher le prénom.
- Si tu actives "genre" **après** avoir généré le quiz, un bouton **"Genrer tout le quiz"** balaie tous les champs d'un coup.

**Cas des langues non-genrées (anglais, etc.) :** l'IA renvoie le même texte 3× → le rendu public reste identique sans faire d'erreur grammaticale.`,
      en: `## Create a quiz on Tiquiz

Go to **Create a quiz** in the sidebar. You have 3 options:

### Option 1: Manual
- Give your quiz a **title** and **introduction**
- Add **questions** with answer options
- Configure **results** (title, description, insight, projection, CTA)
- Map each option to a result
- Set up **capture fields** (email, first name, last name, phone, country)

### Option 2: AI Generation
- Choose an **objective** from 16 strategic objectives
- Describe your **target audience** and desired **tone**
- Pick the **format** (short: 3-5 questions, long: 6-10)
- Choose the quiz type: **by profile** (who are you?) or **scored** (where are you at?). This is the one hard decision: if you hesitate, read "Profile or score: which one?" first
- Click **Generate** - AI creates everything in real time!

### Option 3: Import from a file
- Already have a quiz drafted elsewhere? Import it as **.txt** (max 10,000 characters).
- AI auto-structures it into questions, options and results.
- **Supported formats:** .txt only for now. For PDF/DOCX, copy the text into a .txt file before importing.
- Tip: structure your .txt with clear sections (numbered questions, A/B/C/D options, named results) so the AI respects your structure.

> You can always edit the generated or imported quiz before publishing.

---

## Publish your quiz to see it online

A freshly created quiz is a **draft**: it is NOT reachable online yet. If you open its public link before publishing, you get a **404** page (this is expected, nobody but you can access a draft).

To make it live:
1. Open your quiz in the editor.
2. Click **Publish** (button top right). The status changes from "draft" to "active".
3. Your public link becomes reachable: \`https://quiz.tipote.com/q/your-slug\` (or \`https://your-domain/your-slug\` if you connected your own domain).

**No API or per-quiz setup needed.** You can create as many quizzes as you want on the same domain, each with its own slug. Just **publish each quiz** to make it reachable. An unpublished quiz always returns a 404, even if the slug is correct: go back to the editor and click Publish.

---

## Dynamic personalization (first name & gender)

Enable **"Ask for first name"** and/or **"Ask for gender"** in the sidebar to display an optional screen before the first question. Visitors pick their gender (He / She / They) → your questions, results and CTAs adapt automatically.

**How it works:**
- Click the **✨ button** next to any field → AI generates 3 variants (masculine, feminine, inclusive) stored as \`{ready|ready|ready}\`.
- You can edit each variant by hand after generation.
- The \`{name}\` placeholder inserts the visitor's first name into your copy.
- If you enable "gender" **after** generating the quiz, a **"Genderize entire quiz"** button sweeps every field at once.

**Non-gendered languages (English, etc.):** AI returns the same text 3× → the public render stays identical, no grammar mistakes.`,
      es: `## Crear un quiz en Tiquiz

Ve a **Crear un quiz**. Tienes 3 opciones: **Manual** (añade preguntas y resultados tú mismo), **IA** (elige un objetivo, público y tono, la IA genera todo), o **Importar** un archivo .txt (la IA estructura tu contenido existente). Para PDF/DOCX, copia el texto a .txt antes de importar. Puedes editar el quiz antes de publicar.

**Publica tu quiz para verlo en línea:** un quiz recién creado está en **borrador** y no es accesible. Su enlace público devuelve un **404** hasta que hagas clic en **Publicar** en el editor. No necesitas ninguna API: crea todos los quiz que quieras en el mismo dominio, cada uno con su slug, y publica cada uno para que sea accesible.

---

## Personalización dinámica (nombre y género)

Activa **"Pedir el nombre"** y/o **"Pedir el género"** en la barra lateral para mostrar una pantalla opcional antes de la 1ª pregunta. Los visitantes eligen su género (Él / Ella / Elle) → tus preguntas, resultados y CTA se adaptan automáticamente.

**Cómo funciona:** haz clic en el botón **✨** junto a cualquier campo → la IA genera 3 variantes (masculino, femenino, inclusivo) almacenadas como \`{listo|lista|liste}\`. El placeholder \`{name}\` inserta el nombre del visitante. Si activas "género" **después** de generar el quiz, el botón **"Generar todas las variantes"** procesa todos los campos de una vez.`,
      it: `## Creare un quiz su Tiquiz

Vai su **Crea un quiz**. Hai 3 opzioni: **Manuale** (aggiungi domande e risultati), **IA** (scegli obiettivo, pubblico e tono, l'IA genera tutto), o **Importa** un file .txt (l'IA struttura i tuoi contenuti). Per PDF/DOCX, copia il testo in .txt prima dell'import. Puoi modificare il quiz prima di pubblicare.

**Pubblica il tuo quiz per vederlo online:** un quiz appena creato è in **bozza** e non è accessibile. Il suo link pubblico restituisce un **404** finché non clicchi su **Pubblica** nell'editor. Non serve alcuna API: crea tutti i quiz che vuoi sullo stesso dominio, ognuno con il suo slug, e pubblica ciascuno per renderlo accessibile.

---

## Personalizzazione dinamica (nome e genere)

Attiva **"Chiedi il nome"** e/o **"Chiedi il genere"** nella barra laterale per mostrare una schermata opzionale prima della 1ª domanda. I visitatori scelgono il genere (Lui / Lei / Neutro) → le tue domande, risultati e CTA si adattano automaticamente.

**Come funziona:** clicca il pulsante **✨** accanto a qualsiasi campo → l'IA genera 3 varianti (maschile, femminile, inclusiva) memorizzate come \`{pronto|pronta|pronto}\`. Il placeholder \`{name}\` inserisce il nome del visitatore. Se attivi "genere" **dopo** aver generato il quiz, il pulsante **"Genera tutte le varianti"** elabora tutti i campi in una volta.`,
      ar: `## إنشاء اختبار على Tiquiz

اذهب إلى **إنشاء اختبار**. لديك 3 خيارات: **يدوي**، **ذكاء اصطناعي**، أو **استيراد** ملف .txt (يقوم الذكاء الاصطناعي بهيكلة محتواك). بالنسبة لـ PDF/DOCX، انسخ النص إلى .txt قبل الاستيراد. يمكنك تعديل الاختبار قبل النشر.

**انشر اختبارك لرؤيته على الإنترنت:** الاختبار المُنشأ حديثًا يكون في وضع **المسودة** وغير متاح. يُرجع رابطه العام خطأ **404** حتى تنقر على **نشر** في المحرر. لا تحتاج إلى أي واجهة برمجية (API): أنشئ كل الاختبارات التي تريدها على نفس النطاق، لكل منها الـ slug الخاص به، وانشر كل واحد ليصبح متاحًا.

---

## التخصيص الديناميكي (الاسم والجنس)

فعّل **"اسأل عن الاسم"** و/أو **"اسأل عن الجنس"** في الشريط الجانبي لعرض شاشة اختيارية قبل السؤال الأول. يختار الزوار جنسهم (هو / هي / محايد) → تتكيّف أسئلتك ونتائجك ودعواتك للإجراء تلقائيًا.

**كيف يعمل:** انقر زر **✨** بجانب أي حقل → يُولّد الذكاء الاصطناعي 3 صيغ (مذكر، مؤنث، محايد) محفوظة بصيغة \`{جاهز|جاهزة|جاهز}\`. عنصر النائب \`{name}\` يُدرج اسم الزائر. إذا فعّلت "الجنس" **بعد** توليد الاختبار، زر **"توليد جميع الصيغ"** يعالج كل الحقول دفعة واحدة.`,
    },
    related_slugs: ["tiquiz-profil-ou-score", "what-is-tiquiz", "tiquiz-mise-en-page"],
    tags: ["tiquiz", "quiz", "create", "ai", "manual", "import", "personalization", "gender", "genderize"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-leads",
    sort_order: 4,
    title: {
      fr: "Capturer et gérer les leads",
      en: "Capture and manage leads",
      es: "Capturar y gestionar leads",
      it: "Catturare e gestire i lead",
      ar: "جمع وإدارة العملاء المحتملين",
    },
    content: {
      fr: `## Capture de leads

Quand un participant termine ton quiz, il doit entrer son **email** avant de voir son résultat. Tu peux aussi activer des champs optionnels : **prénom, nom, téléphone, pays**.

### Où retrouver tes leads ?

Dans la page **Mes leads** ou dans l'onglet **Leads** de chaque quiz. Tu y vois : email, prénom, résultat obtenu, date, statut de partage.

### Exporter

Clique sur **Exporter les leads** pour télécharger un fichier CSV avec tous tes contacts.

### Synchronisation Systeme.io

Si ta clé API est configurée, chaque lead est **automatiquement synchronisé** : création du contact, application du tag du résultat, inscription en formation et ajout en communauté (si configurés).`,
      en: `## Lead capture

When a participant completes your quiz, they must enter their **email** before seeing their result. You can also enable optional fields: **first name, last name, phone, country**.

### Where to find your leads

On the **My Leads** page or in the **Leads** tab of each quiz. You'll see: email, first name, result, date, share status.

### Export

Click **Export leads** to download a CSV file with all your contacts.

### Systeme.io sync

If your API key is configured, each lead is **automatically synced**: contact creation, result tag, course enrollment, and community addition (if configured).`,
      es: `## Captura de leads

El participante debe ingresar su email antes de ver su resultado. Puedes activar campos opcionales (nombre, teléfono, país). Encuentra tus leads en **Mis leads** o en la pestaña Leads de cada quiz. Exporta en CSV o sincroniza automáticamente con Systeme.io.`,
      it: `## Cattura lead

Il partecipante deve inserire la sua email prima di vedere il risultato. Puoi attivare campi opzionali (nome, telefono, paese). Trova i tuoi lead in **I miei lead** o nella scheda Lead di ogni quiz. Esporta in CSV o sincronizza con Systeme.io.`,
      ar: `## جمع العملاء المحتملين

يجب على المشارك إدخال بريده الإلكتروني قبل رؤية نتيجته. يمكنك تفعيل حقول اختيارية (الاسم، الهاتف، البلد). اعثر على عملائك في **عملائي** أو في تبويب العملاء لكل اختبار. صدّر كـ CSV أو زامن مع Systeme.io.`,
    },
    related_slugs: ["tiquiz-systeme-io", "tiquiz-create-quiz", "tiquiz-virality"],
    tags: ["tiquiz", "leads", "capture", "export", "csv"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-systeme-io",
    sort_order: 5,
    title: {
      fr: "Connecter Systeme.io",
      en: "Connect Systeme.io",
      es: "Conectar Systeme.io",
      it: "Collegare Systeme.io",
      ar: "ربط Systeme.io",
    },
    content: {
      fr: `## Intégration Systeme.io

### Configurer ta clé API
Va dans **Paramètres → Systeme.io** et colle ta **clé API Systeme.io** (Systeme.io > Paramètres > API). Donne-lui un nom pour t'y retrouver.

### Ce qui se passe automatiquement quand un lead répond
1. Le contact est **créé ou mis à jour** dans Systeme.io
2. Le **tag du résultat** est appliqué (ex: \`quiz-visionnaire\`)
3. Le champ personnalisé **tiquiz_result** est rempli
4. Si configuré : **inscription en formation** et **ajout en communauté**
5. Si la viralité est activée et que le participant partage : un **tag de partage** est aussi posé

### 🚀 Automatiser la suite (campagnes, formations, communautés…)

Tiquiz pose le **tag**. Ce tag peut déclencher n'importe quelle automatisation Systeme.io.

**Étape 1 - Crée tes tags dans Systeme.io AVANT de créer ton quiz**

Dans Systeme.io > **Contacts > Tags**, crée un tag par résultat : \`quiz-visionnaire\`, \`quiz-strategique\`, \`quiz-partage\`, etc.

Puis, en créant ton quiz dans Tiquiz, associe chaque résultat à son tag dans l'onglet **Systeme.io** du quiz.

**Étape 2 - Crée une règle d'automatisation dans Systeme.io**

Dans Systeme.io > **Automatisations > Règles** → *Créer une règle* :

- **Déclencheur** : \`Tag ajouté à un contact\` → sélectionne ton tag
- **Actions** (enchaîne-en autant que tu veux) :
  - Abonner à une **campagne email** (séquence onboarding, newsletter…)
  - Donner **accès à une formation** de ton école Systeme.io
  - Donner **accès à une communauté**
  - **Envoyer un email** unique (bienvenue, bonus…)
  - Ajouter un autre tag, déclencher un webhook, etc.

**Étape 3 - C'est tout.** Le participant entre son email → Tiquiz pose le tag → Systeme.io déclenche toutes les actions. Zéro clic de ta part.

### ⚠️ Tester ton quiz : retire le tag avant chaque test

Systeme.io **ne redéclenche pas** une règle si le tag est déjà présent sur le contact. Avant chaque nouveau test avec le même email :

1. Va dans Systeme.io > **Contacts**
2. Ouvre ton contact test
3. **Retire manuellement le tag** correspondant au résultat

Sinon : le contact sera bien mis à jour mais l'automatisation **ne partira pas** et tu croiras que c'est cassé.

### Sync en masse
Dans l'onglet **Leads** d'un quiz, clique sur **Synchroniser avec Systeme.io** pour forcer la sync de tous les leads en attente (retry après erreur API, changement de clé, etc.).

> **En savoir plus :** [Guide officiel Systeme.io - workflows & automatisations](https://aide.systeme.io/article/1214-comment-fonctionne-le-workflow-de-systemeio)`,
      en: `## Systeme.io Integration

### Set up your API key
Go to **Settings → Systeme.io** and paste your **Systeme.io API key** (Systeme.io > Settings > API).

### What happens automatically
When a lead submits your quiz:
1. Contact is **created or updated** in Systeme.io
2. The **result tag** is applied (e.g., \`quiz-visionary\`)
3. Custom field **tiquiz_result** is filled
4. If configured: **course enrollment** and **community addition**

### 🚀 Automate the rest (campaigns, courses, communities…)

Tiquiz applies the **tag**. The tag can trigger any Systeme.io automation.

**Step 1** - In Systeme.io > **Contacts > Tags**, create one tag per quiz result *before* creating the quiz. Then map each tag to a result in your quiz's **Systeme.io** tab.

**Step 2** - In Systeme.io > **Automations > Rules** → *Create rule*:
- **Trigger**: \`Tag added to contact\` → pick your tag
- **Actions**: subscribe to email campaign, enroll in course, add to community, send an email, add another tag, fire a webhook…

**Step 3** - Done. Lead submits → Tiquiz tags → Systeme.io fires all actions.

### ⚠️ Testing your quiz: remove the tag before each test

Systeme.io **won't re-fire** a rule if the tag is already on the contact. Before each re-test with the same email, go to **Contacts**, open your test contact, and **manually remove the tag** - otherwise the automation won't trigger and you'll think it's broken.

### Bulk sync
In a quiz's **Leads** tab, click **Sync with Systeme.io** to force-sync pending leads.

> **Learn more:** [Systeme.io workflows guide](https://help.systeme.io/)`,
      es: `## Integración Systeme.io

Configura tu clave API en **Ajustes → Systeme.io**. Cuando un lead completa tu quiz, Tiquiz crea el contacto y le añade el **tag del resultado**. Ese tag puede disparar cualquier automatización en Systeme.io.

**Flujo recomendado:**

1. Crea tus **tags** en Systeme.io > Contactos > Tags *antes* de crear el quiz
2. En Systeme.io > Automatizaciones > Reglas, crea una regla: *Trigger: Tag añadido → Acciones: suscribir a campaña, inscribir a curso, añadir a comunidad, enviar email…*
3. Al responder el quiz, el contacto es taggeado y la automatización se dispara sola

⚠️ **Al testear** con el mismo email, retira el tag manualmente desde Systeme.io > Contactos, sino la regla no se re-dispara.

[Guía oficial Systeme.io](https://aide.systeme.io/article/1214-comment-fonctionne-le-workflow-de-systemeio)`,
      it: `## Integrazione Systeme.io

Configura la chiave API in **Impostazioni → Systeme.io**. Quando un lead completa il quiz, Tiquiz crea il contatto e applica il **tag del risultato**. Quel tag può attivare qualsiasi automazione Systeme.io.

**Flusso consigliato:**

1. Crea i tuoi **tag** in Systeme.io > Contatti > Tag *prima* di creare il quiz
2. In Systeme.io > Automazioni > Regole, crea una regola: *Trigger: Tag aggiunto → Azioni: iscrizione a campagna, accesso al corso, comunità, invio email…*
3. Quando il lead completa il quiz, il contatto viene taggato e l'automazione parte da sola

⚠️ **Per testare** con la stessa email, rimuovi il tag manualmente da Systeme.io > Contatti, altrimenti la regola non si riattiva.

[Guida ufficiale Systeme.io](https://aide.systeme.io/article/1214-comment-fonctionne-le-workflow-de-systemeio)`,
      ar: `## تكامل Systeme.io

قم بإعداد مفتاح API في **الإعدادات ← Systeme.io**. عند إكمال الاختبار، يُنشئ Tiquiz جهة الاتصال ويضيف **وسم النتيجة**. يمكن لهذا الوسم تشغيل أي أتمتة في Systeme.io.

**الخطوات:**

1. أنشئ **الوسوم** في Systeme.io > جهات الاتصال > الوسوم *قبل* إنشاء الاختبار
2. في Systeme.io > الأتمتة > القواعد، أنشئ قاعدة: *المحفز: إضافة وسم ← الإجراءات: الاشتراك في حملة، الوصول إلى دورة، مجتمع، إرسال بريد…*
3. عند إجابة الاختبار، يتم وسم جهة الاتصال وتنطلق الأتمتة تلقائيًا

⚠️ **عند الاختبار** بنفس البريد، أزل الوسم يدويًا من Systeme.io > جهات الاتصال، وإلا فلن يعاد تشغيل القاعدة.

[الدليل الرسمي Systeme.io](https://aide.systeme.io/article/1214-comment-fonctionne-le-workflow-de-systemeio)`,
    },
    related_slugs: ["tiquiz-leads", "tiquiz-create-quiz", "tiquiz-virality"],
    tags: ["tiquiz", "systeme.io", "integration", "tags", "sync"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-virality",
    sort_order: 6,
    title: {
      fr: "Activer la viralité (bonus de partage)",
      en: "Enable virality (share bonus)",
      es: "Activar la viralidad (bonus de compartir)",
      it: "Attivare la viralità (bonus condivisione)",
      ar: "تفعيل الانتشار (مكافأة المشاركة)",
    },
    content: {
      fr: `## Le bonus de partage

Active la **viralité** dans les paramètres de ton quiz pour que chaque participant puisse partager le quiz et débloquer un bonus.

### Comment ça marche
1. Le participant voit son résultat
2. Un écran lui propose de **partager le quiz** (lien + message pré-rempli)
3. S'il partage, il **débloque le bonus** que tu as défini (ex : guide PDF, accès privé…)
4. Un **tag Systeme.io dédié** est appliqué au contact pour identifier les partageurs

### Configuration
- **Description du bonus** : ce que le participant reçoit en échange
- **Message de partage** : le texte pré-rempli pour le partage
- **Tag SIO share** : le tag appliqué dans Systeme.io aux partageurs`,
      en: `## Share bonus

Enable **virality** in your quiz settings so participants can share the quiz and unlock a bonus.

### How it works
1. Participant sees their result
2. A screen invites them to **share the quiz** (pre-filled link + message)
3. If they share, they **unlock the bonus** you defined (e.g., PDF guide, private access…)
4. A **dedicated Systeme.io tag** is applied to identify sharers

### Configuration
- **Bonus description**: what the participant gets
- **Share message**: pre-filled sharing text
- **SIO share tag**: Systeme.io tag for sharers`,
      es: `## Bonus de compartir

Activa la **viralidad** en los ajustes de tu quiz para que cada participante pueda compartirlo y desbloquear un bonus.

### Cómo funciona
1. El participante ve su resultado.
2. Una pantalla le propone **compartir el quiz** (enlace y mensaje ya preparados).
3. Si comparte, **desbloquea el bonus** que hayas definido (una guía en PDF, un acceso privado…).
4. Se le aplica un **tag dedicado de Systeme.io** para identificar a quienes comparten.

### Qué configurar
- **Descripción del bonus**: lo que recibe a cambio.
- **Mensaje de compartir**: el texto ya escrito.
- **Tag SIO de compartir**: el tag que reciben en Systeme.io.

Un porcentaje bajo de compartidos no siempre significa que el bonus sea flojo: en temas íntimos (salud, dinero, peso, familia), compartir en público es exponerse.`,
      it: `## Bonus condivisione

Attiva la **viralità** nelle impostazioni del quiz, così ogni partecipante può condividerlo e sbloccare un bonus.

### Come funziona
1. Il partecipante vede il suo risultato.
2. Una schermata gli propone di **condividere il quiz** (link e messaggio già pronti).
3. Se condivide, **sblocca il bonus** che hai definito (una guida PDF, un accesso privato…).
4. Gli viene applicato un **tag dedicato di Systeme.io** per riconoscere chi condivide.

### Cosa configurare
- **Descrizione del bonus**: cosa riceve in cambio.
- **Messaggio di condivisione**: il testo già scritto.
- **Tag SIO condivisione**: il tag che riceve in Systeme.io.

Una percentuale di condivisione bassa non significa sempre che il bonus sia debole: su temi intimi (salute, denaro, peso, famiglia), condividere in pubblico significa esporsi.`,
      ar: `## مكافأة المشاركة

فعّل **الانتشار** في إعدادات اختبارك ليتمكن كل مشارك من مشاركته وفتح مكافأة.

### كيف تعمل
1. يرى المشارك نتيجته.
2. تظهر له شاشة تقترح **مشاركة الاختبار** (رابط ورسالة جاهزان).
3. إذا شارك، **يفتح المكافأة** التي حددتها (دليل PDF، وصول خاص…).
4. يُطبَّق عليه **وسم مخصص في Systeme.io** للتعرّف على من يشارك.

### ما الذي تضبطه
- **وصف المكافأة**: ما يحصل عليه في المقابل.
- **رسالة المشاركة**: النص الجاهز.
- **وسم المشاركة في SIO**: الوسم الذي يحصل عليه.

انخفاض نسبة المشاركة لا يعني دائمًا أن المكافأة ضعيفة: في المواضيع الحساسة (الصحة، المال، الوزن، العائلة)، المشاركة العلنية تعني كشف النفس.`,
    },
    related_slugs: ["tiquiz-leads", "tiquiz-systeme-io"],
    tags: ["tiquiz", "virality", "share", "bonus"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-plans",
    sort_order: 13,
    title: {
      fr: "Plans et tarifs Tiquiz",
      en: "Tiquiz plans and pricing",
      es: "Planes y precios Tiquiz",
      it: "Piani e prezzi Tiquiz",
      ar: "خطط وأسعار Tiquiz",
    },
    content: {
      fr: `## Les plans Tiquiz

| Plan | Prix | Quiz | Réponses/mois |
|------|------|------|---------------|
| **Free** | 0 € | 1 | 10 |
| **Mensuel** | 17 €/mois | Illimité | Illimité |
| **Annuel** | 170 €/an | Illimité | Illimité |
| **Mensuel Plus** | 29 €/mois | Illimité | Illimité |
| **Annuel Plus** | 290 €/an | Illimité | Illimité |

Les tarifs à jour et les boutons de commande sont toujours dans **Paramètres > Abonnement**, dans ton compte. C'est la seule page qui ne peut pas se tromper.

### Le plan gratuit
- 1 quiz, 1 sondage et 1 popquiz
- 10 réponses par mois (le compteur repart tout seul après 30 jours)
- Toutes les fonctions de base : génération par l'IA, Systeme.io, bonus de partage

Le gratuit n'expire pas. Tu peux rester dessus le temps que tu veux pour tester sur ta vraie audience.

### Mensuel et Annuel
Quiz, sondages, popquizzes et réponses **illimités**. L'annuel revient à 10 mois payés pour 12 : deux mois offerts.

### Mensuel Plus et Annuel Plus
Tout le plan simple, plus :
- les **multiprofils** : plusieurs espaces séparés dans le même compte, un par marque ou par cliente
- l'**analyse IA** de tes résultats (quiz et sondages)
- **plusieurs clés Systeme.io**, une par espace

C'est le plan des agences, des freelances qui montent des quiz pour leurs clientes, et de celles qui gèrent plusieurs marques. Si tu n'as qu'une marque, le plan simple suffit.

### Changer de plan
Le passage d'un plan à l'autre est automatique : le nouveau démarre, l'ancien est annulé chez Systeme.io. Tu n'es jamais facturée deux fois.

### Tu as un accès à vie ?
L'offre à vie à 57 € des tout débuts n'est plus vendue. Si tu l'as prise, elle reste **valable et illimitée** : tu n'as rien à faire et rien à repayer.`,
      en: `## Tiquiz Plans

| Plan | Price | Quizzes | Responses/month |
|------|-------|---------|-----------------|
| **Free** | €0 | 1 | 10 |
| **Monthly** | €17/mo | Unlimited | Unlimited |
| **Yearly** | €170/yr | Unlimited | Unlimited |
| **Monthly Plus** | €29/mo | Unlimited | Unlimited |
| **Yearly Plus** | €290/yr | Unlimited | Unlimited |

Current prices and checkout buttons always live in **Settings > Subscription**, inside your account. That page cannot be out of date.

### Free plan
- 1 quiz, 1 survey and 1 popquiz
- 10 responses per month (the counter resets on its own after 30 days)
- All core features: AI generation, Systeme.io, share bonus

Free does not expire. Stay on it as long as you need to test with your real audience.

### Monthly and Yearly
Unlimited quizzes, surveys, popquizzes and responses. Yearly is 10 months paid for 12: two months free.

### Monthly Plus and Yearly Plus
Everything in the simple plan, plus:
- **multi-workspaces**: separate spaces in one account, one per brand or per client
- **AI analysis** of your results (quizzes and surveys)
- **multiple Systeme.io keys**, one per workspace

This is the plan for agencies, freelancers building quizzes for clients, and anyone running several brands. One brand only? The simple plan is enough.

### Switching plans
Switching is automatic: the new plan starts, the old one is cancelled at Systeme.io. You are never billed twice.

### Do you have lifetime access?
The early €57 lifetime offer is no longer sold. If you bought it, it stays **valid and unlimited**: nothing to do, nothing to pay again.`,
      es: `## Planes Tiquiz\n\n- **Free**: 0€, 1 quiz + 1 encuesta + 1 popquiz, 10 respuestas/mes\n- **Mensual**: 17€/mes, ilimitado\n- **Anual**: 170€/año, ilimitado (dos meses gratis)\n- **Mensual Plus**: 29€/mes, con multiperfiles, análisis IA y varias claves Systeme.io\n- **Anual Plus**: 290€/año\n\nLos precios al día están siempre en **Ajustes > Suscripción**. La oferta de por vida a 57€ ya no se vende, pero sigue siendo válida e ilimitada para quien la compró.`,
      it: `## Piani Tiquiz\n\n- **Free**: 0€, 1 quiz + 1 sondaggio + 1 popquiz, 10 risposte/mese\n- **Mensile**: 17€/mese, illimitato\n- **Annuale**: 170€/anno, illimitato (due mesi gratis)\n- **Mensile Plus**: 29€/mese, con multiprofili, analisi IA e più chiavi Systeme.io\n- **Annuale Plus**: 290€/anno\n\nI prezzi aggiornati sono sempre in **Impostazioni > Abbonamento**. L'offerta a vita da 57€ non è più in vendita, ma resta valida e illimitata per chi l'ha acquistata.`,
      ar: `## خطط Tiquiz\n\n- **مجاني**: 0€، اختبار واحد + استطلاع واحد + بوب كويز واحد، 10 ردود/شهر\n- **شهري**: 17€/شهر، غير محدود\n- **سنوي**: 170€/سنة، غير محدود (شهران مجانًا)\n- **شهري بلس**: 29€/شهر، مع تعدد الملفات وتحليل الذكاء الاصطناعي وعدة مفاتيح Systeme.io\n- **سنوي بلس**: 290€/سنة\n\nالأسعار المحدّثة موجودة دائمًا في **الإعدادات > الاشتراك**. عرض مدى الحياة بـ 57€ لم يعد معروضًا للبيع، لكنه يبقى ساريًا وغير محدود لمن اشتراه.`,
    },
    related_slugs: ["what-is-tiquiz", "tiquiz-create-quiz"],
    tags: ["tiquiz", "plans", "pricing", "free", "plus", "abonnement", "tarifs"],
  },

  {
    category_slug: "tiquiz",
    slug: "tiquiz-profil-ou-score",
    sort_order: 3,
    title: {
      fr: "Profil ou score : lequel choisir ?",
      en: "Profile or score: which one?",
      es: "¿Perfil o puntuación?",
      it: "Profilo o punteggio?",
      ar: "ملف شخصي أم نتيجة رقمية؟",
    },
    content: {
      fr: `## La seule décision qui compte au départ

Tiquiz sait faire deux quiz différents. Le choix se fait à la création, et c'est le seul réglage qu'on ne devine pas tout seul. Prends trente secondes ici : ça t'évite de refaire ton quiz plus tard.

La question à te poser n'est pas technique, c'est : **de quoi parle mon quiz ?**

### Quiz par profil : « qui es-tu ? »

Chaque réponse mène vers un profil, et le profil le plus choisi gagne.

C'est le plus courant. Tu l'utilises quand tes résultats sont des **types**, des personnalités, des façons de faire : « Quel entrepreneur es-tu ? », « Quel est ton style de communication ? », « Quel format de contenu te correspond ? ».

Aucun profil n'est meilleur qu'un autre. Ils sont différents.

### Quiz avec un score : « où en es-tu ? »

Chaque réponse rapporte des points, et c'est le **total** qui décide du résultat.

Tu l'utilises quand tes résultats sont des **niveaux** : un bilan, un diagnostic, une maturité. « Où en est ton offre ? », « Ton tunnel est-il prêt ? ». Il y a un ordre : un score bas et un score haut ne disent pas la même chose.

Tu peux aussi découper le score en **axes** (sommeil, alimentation, stress…) : chacun s'affiche avec sa propre barre.

### Le test en une phrase

> Si tes résultats peuvent être classés du moins bon au meilleur, c'est un **score**. S'ils sont juste différents, c'est un **profil**.

### Et si je me suis trompée ?

Ça arrive, et ça se voit à des signes précis : en mode score, les réglages qui parlent de profils (« quelles questions mènent à ce résultat », les ex aequo) ne s'affichent pas, parce qu'ils ne veulent rien dire là. À l'inverse, en mode profil, tu ne verras jamais de tranches de points.

Tout le reste de ton travail est réutilisable : le plus simple est de recréer le quiz dans le bon mode et de recopier tes textes. Si tu hésites encore, écris-nous avant de tout refaire.

### Les réponses en mode profil

En mode profil, une réponse ne peut voter que pour **un** profil. Donc s'il te faut 4 profils, il faut au moins 4 réponses par question de choix, sinon un profil ne peut pas gagner à cette question. L'éditeur te prévient quand un profil ne peut jamais être attribué, et le bouton « Rééquilibrer avec l'IA » peut te rédiger les réponses qui manquent.`,
      en: `## The one decision that matters up front

Tiquiz builds two different kinds of quiz. You pick at creation time, and it is the one setting nobody guesses right on their own. Spend thirty seconds here and you save yourself a rebuild later.

The question is not technical. It is: **what is my quiz about?**

### Profile quiz: "who are you?"

Each answer votes for a profile, and the most-voted profile wins.

This is the common one. Use it when your results are **types**, personalities, ways of doing things: "What kind of founder are you?", "What's your communication style?".

No profile is better than another. They are different.

### Scored quiz: "where are you at?"

Each answer is worth points, and the **total** decides the result.

Use it when your results are **levels**: an assessment, a diagnosis, a maturity stage. "How ready is your offer?". There is an order: a low score and a high score do not mean the same thing.

You can also split the score into **axes** (sleep, food, stress…): each gets its own bar.

### The one-line test

> If your results can be ranked from worst to best, it's a **score**. If they are simply different, it's a **profile**.

### What if I picked wrong?

It happens, and it shows: in score mode, the checks that talk about profiles (which questions lead to this result, ties) do not appear, because they mean nothing there. In profile mode you will never see point ranges.

Everything else you wrote is reusable: the simplest route is to recreate the quiz in the right mode and paste your texts across. Still unsure? Write to us before rebuilding.

### Answers in profile mode

In profile mode, one answer votes for exactly **one** profile. So if you want 4 profiles, you need at least 4 answers per choice question, otherwise one profile cannot win there. The editor warns you when a result can never be awarded, and "Rebalance with AI" can write the missing answers for you.`,
      es: `## Perfil o puntuación

Se elige al crear el quiz y es el ajuste que nadie acierta por intuición.

- **Por perfil, "¿quién eres?"**: cada respuesta vota por un perfil y gana el más votado. Para tipos y personalidades. Ningún perfil es mejor que otro.
- **Con puntuación, "¿en qué punto estás?"**: cada respuesta suma puntos y el total decide. Para diagnósticos y niveles. Hay un orden.

**La prueba:** si tus resultados se pueden ordenar de peor a mejor, es una **puntuación**. Si solo son distintos, es un **perfil**.

En modo perfil, una respuesta vota por un solo perfil: con 4 perfiles necesitas al menos 4 respuestas por pregunta, si no un perfil nunca puede ganar. El editor te avisa.`,
      it: `## Profilo o punteggio

Si sceglie alla creazione ed è l'unica impostazione che non si indovina da soli.

- **Per profilo, "chi sei?"**: ogni risposta vota un profilo e vince il più votato. Per tipi e personalità. Nessun profilo è migliore di un altro.
- **Con punteggio, "a che punto sei?"**: ogni risposta vale dei punti e decide il totale. Per diagnosi e livelli. C'è un ordine.

**La prova:** se i tuoi risultati si possono ordinare dal peggiore al migliore, è un **punteggio**. Se sono solo diversi, è un **profilo**.

In modalità profilo una risposta vota un solo profilo: con 4 profili servono almeno 4 risposte per domanda, altrimenti un profilo non può mai vincere. L'editor ti avvisa.`,
      ar: `## ملف شخصي أم نتيجة رقمية؟

يتم الاختيار عند إنشاء الاختبار، وهو الإعداد الوحيد الذي لا يمكن تخمينه.

- **حسب الملف الشخصي، "من أنت؟"**: كل إجابة تصوّت لملف، ويفوز الأكثر تصويتًا. للأنماط والشخصيات. لا يوجد ملف أفضل من آخر.
- **بالنقاط، "أين أنت الآن؟"**: كل إجابة تمنح نقاطًا، والمجموع يقرر. للتشخيص والمستويات. هناك ترتيب.

**الاختبار:** إذا كانت نتائجك قابلة للترتيب من الأسوأ إلى الأفضل، فهي **نقاط**. إذا كانت مختلفة فقط، فهي **ملفات شخصية**.

في وضع الملفات، كل إجابة تصوّت لملف واحد: مع 4 ملفات تحتاج 4 إجابات على الأقل لكل سؤال، وإلا لن يفوز أحد الملفات أبدًا. المحرر ينبهك.`,
    },
    related_slugs: ["tiquiz-create-quiz", "tiquiz-page-resultat"],
    tags: ["tiquiz", "profil", "score", "scoring", "mode", "diagnostic", "quiz"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-page-resultat",
    sort_order: 7,
    title: {
      fr: "La page de résultat",
      en: "The result page",
      es: "La página de resultado",
      it: "La pagina del risultato",
      ar: "صفحة النتيجة",
    },
    content: {
      fr: `## C'est la page qui vend

Le visiteur a répondu, il a laissé son email : il est au maximum de son attention. La page de résultat est le seul endroit où il te lit vraiment.

### Les quatre temps

Tiquiz peut présenter chaque résultat en quatre blocs qui s'enchaînent. Chacun a un rôle, et l'ordre compte :

1. **Il se reconnaît.** Le titre du profil et sa description. S'il ne se reconnaît pas ici, il ne lit pas la suite.
2. **Il comprend ce qui bloque.** Souvent autre chose que ce qu'il croyait. C'est ce bloc qui crée le déclic.
3. **Il voit le chemin.** Les étapes, concrètes, pour que ça devienne faisable.
4. **Il voit la suite.** Ton offre, présentée comme la suite logique de ce qu'il vient de lire, pas comme une publicité.

Ces mots (reconnaissance, blocage, chemin, suite) sont là pour **toi**. Ils ne doivent jamais apparaître dans le texte que lit le visiteur : sinon il lit la structure au lieu du message.

### L'activer sur un quiz existant

Un quiz créé avant cette présentation garde son affichage d'origine, exprès : on ne change jamais une page déjà en ligne sans te demander. Pour passer aux quatre temps, ouvre ton quiz et cherche le bandeau au-dessus de tes profils de résultat. C'est **réversible**, et ça ne touche aucun de tes autres quiz.

Dupliquer un quiz ne suffit pas : la copie est fidèle à l'original, donc elle reproduit aussi son ancienne présentation.

### Les images

Chaque temps peut porter sa propre image. Tu choisis si elle s'ajoute au texte ou si elle le **remplace**.

### Le bouton de partage

En bas du résultat, un bouton propose au visiteur de partager. Tu choisis les réseaux dans les réglages du quiz. **Si tu n'en coches aucun, tous s'affichent** : c'est voulu, mieux vaut trop de choix que priver ton visiteur d'Instagram ou de WhatsApp sans le savoir.

Le lien partagé est celui du **profil obtenu**, pas celui du quiz : la personne qui clique voit le résultat de son amie, ce qui donne beaucoup plus envie de le passer à son tour.

Tu peux masquer complètement ce bouton avec « Afficher le bouton de partage ».

### Afficher ou cacher le score

En mode score, tu décides de ce que voit le visiteur : le pourcentage, un libellé, ou **rien du tout**. Si tu caches le score, les barres d'axes disparaissent aussi. Les axes restent utilisables dans tes textes et dans tes tags Systeme.io : ils continuent à travailler sans être affichés.`,
      en: `## This is the page that sells

They answered, they gave their email: their attention is at its peak. The result page is the only place where they truly read you.

### The four beats

Tiquiz can lay each result out in four blocks that build on each other. Each has a job, and the order matters:

1. **They recognise themselves.** The profile title and its description. If they don't recognise themselves here, they stop reading.
2. **They understand what's blocking.** Usually something other than what they assumed. This is the block that clicks.
3. **They see the path.** Concrete steps, so it feels doable.
4. **They see what's next.** Your offer, presented as the logical continuation of what they just read, not as an ad.

Those words (recognition, blocker, path, next) are for **you**. They must never appear in the text the visitor reads, or they read the skeleton instead of the message.

### Turning it on for an existing quiz

A quiz created before this layout keeps its original display on purpose: we never change a live page without asking. To switch, open your quiz and look for the banner above your result profiles. It is **reversible** and affects no other quiz.

Duplicating a quiz will not do it: the copy is faithful to the original, so it reproduces the old layout too.

### Images

Each beat can carry its own image. You choose whether it sits alongside the text or **replaces** it.

### The share button

At the bottom of the result, a button invites the visitor to share. You pick the networks in the quiz settings. **If you tick none, all of them show**: that is deliberate, better too much choice than silently denying your visitor Instagram or WhatsApp.

The shared link points at the **result they got**, not the quiz: whoever clicks sees their friend's result, which is far more tempting to take.

You can hide the button entirely with "Show share button".

### Showing or hiding the score

In score mode you decide what the visitor sees: the percentage, a label, or **nothing at all**. Hiding the score hides the axis bars too. Axes keep working inside your texts and your Systeme.io tags: they still do their job without being displayed.`,
      es: `## La página que vende

Ha respondido y ha dejado su email: su atención está al máximo.

**Los cuatro tiempos.** Tiquiz puede presentar cada resultado en cuatro bloques encadenados: se reconoce, entiende qué le bloquea, ve el camino, ve lo que sigue (tu oferta como consecuencia lógica). Ese vocabulario es para ti, nunca debe aparecer en el texto que lee el visitante.

Un quiz creado antes conserva su presentación original a propósito. Para cambiar, abre el quiz y busca el aviso encima de tus perfiles de resultado. Es reversible y no afecta a tus otros quiz. Duplicar no basta: la copia es fiel al original.

**Compartir.** Eliges las redes en los ajustes. Si no marcas ninguna, se muestran todas. El enlace compartido es el del **perfil obtenido**, no el del quiz.

**Puntuación.** En modo puntuación puedes mostrar el porcentaje, una etiqueta o nada. Si la ocultas, también desaparecen las barras de ejes, pero los ejes siguen funcionando en tus textos y tags de Systeme.io.`,
      it: `## La pagina che vende

Ha risposto e ha lasciato la sua email: la sua attenzione è al massimo.

**I quattro tempi.** Tiquiz può presentare ogni risultato in quattro blocchi concatenati: si riconosce, capisce cosa lo blocca, vede il percorso, vede il seguito (la tua offerta come conseguenza logica). Quel vocabolario è per te, non deve mai comparire nel testo che legge il visitatore.

Un quiz creato prima mantiene la presentazione originale di proposito. Per cambiare, apri il quiz e cerca il banner sopra i profili di risultato. È reversibile e non tocca gli altri quiz. Duplicare non basta: la copia è fedele all'originale.

**Condivisione.** Scegli i social nelle impostazioni. Se non ne spunti nessuno, si mostrano tutti. Il link condiviso è quello del **profilo ottenuto**, non del quiz.

**Punteggio.** In modalità punteggio puoi mostrare la percentuale, un'etichetta o niente. Nascondendolo spariscono anche le barre degli assi, ma gli assi continuano a funzionare nei testi e nei tag Systeme.io.`,
      ar: `## الصفحة التي تبيع

لقد أجاب وترك بريده الإلكتروني: انتباهه في ذروته.

**الأزمنة الأربعة.** يمكن لـ Tiquiz عرض كل نتيجة في أربع كتل متتابعة: يتعرّف على نفسه، يفهم ما يعيقه، يرى الطريق، يرى ما يليه (عرضك كنتيجة منطقية). هذه المصطلحات لك أنت، ويجب ألا تظهر أبدًا في النص الذي يقرأه الزائر.

الاختبار المنشأ سابقًا يحتفظ بعرضه الأصلي عمدًا. للتغيير، افتح اختبارك وابحث عن الشريط فوق ملفات النتائج. القرار قابل للتراجع ولا يمس اختباراتك الأخرى. النسخ لا يكفي: النسخة مطابقة للأصل.

**المشاركة.** تختار الشبكات من الإعدادات. إذا لم تحدد أيًا منها، تظهر كلها. الرابط المشارك هو رابط **الملف الذي حصل عليه**، لا رابط الاختبار.

**النتيجة الرقمية.** يمكنك عرض النسبة أو تسمية أو لا شيء. إخفاؤها يخفي أيضًا أشرطة المحاور، لكن المحاور تظل تعمل في نصوصك ووسوم Systeme.io.`,
    },
    related_slugs: ["tiquiz-profil-ou-score", "tiquiz-virality", "tiquiz-mise-en-page"],
    tags: ["tiquiz", "resultat", "result", "partage", "share", "score", "page"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-stats",
    sort_order: 8,
    title: {
      fr: "Lire tes statistiques sans te tromper",
      en: "Reading your stats without being misled",
      es: "Leer tus estadísticas sin equivocarte",
      it: "Leggere le statistiche senza sbagliare",
      ar: "قراءة إحصاءاتك دون خطأ",
    },
    content: {
      fr: `## Ce que les chiffres disent vraiment

Tu trouves tes chiffres dans **Statistiques** (tous tes quiz) et dans l'onglet du même nom sur chaque quiz.

### Les quatre chiffres du haut

- **Vues** : les personnes qui ont ouvert le quiz.
- **Démarrages** : celles qui ont commencé à répondre.
- **Complétés** : celles qui sont allées au bout.
- **Leads** : celles qui ont laissé leur email. C'est le seul chiffre qui te fait gagner quelque chose.

### Perdre du monde en route est NORMAL

C'est le point le plus important de cette page, et celui qui fait perdre le plus de temps quand on l'ignore.

Un quiz ne vise pas 100 % de complétion, et ne le doit pas. Les premiers à partir sont les visiteurs qui n'étaient pas pour toi : ils se sont qualifiés eux-mêmes, en partant. C'est le travail du quiz.

Si tu lis chaque départ comme une faute, tu vas réécrire un quiz qui va très bien.

### « Où décrochent tes répondants ? »

Le graphique montre, question par question, combien de personnes l'ont **vue**. La barre rétrécit à chaque abandon.

Deux choses à savoir pour ne pas corriger la mauvaise question :

**1. Quelqu'un qui part entre la question 6 et la 7 n'a jamais vu la 7.** Il s'est arrêté **sur la 6**. C'est celle-là qu'il faut regarder. Tiquiz te la nomme directement, tu n'as pas à faire le calcul.

**2. Tiquiz distingue deux formes d'abandon**, et elles ne se corrigent pas pareil :
- **Ils voient la question et ne répondent pas** : elle bloque. Trop intime, mal comprise, ou une réponse qui manque. Reformuler sert à quelque chose.
- **Ils répondent puis s'arrêtent** : la question passe bien, c'est la suite qui les perd. Reformuler cette question ne changera rien.

### Attends d'avoir assez de monde

En dessous d'une vingtaine de personnes sur une même question, Tiquiz **ne désigne aucun point de fuite**, et ce n'est pas une limitation : sur 8 visiteurs, une seule personne pèse 12 %. On te ferait courir après du bruit.

Tant que l'échantillon est petit, Tiquiz te dit franchement qu'il n'y a pas encore de quoi conclure.

### Comment mesurer un changement

> **Une seule modification à la fois**, puis 20 à 30 nouvelles réponses avant de juger.

Deux changements en même temps et tu ne sauras jamais lequel a agi. C'est la seule méthode qui donne une réponse.

### Le taux de partage

Un taux de partage bas n'est pas toujours un défaut du quiz ni un cadeau trop faible. Sur un sujet intime ou qui expose (santé, santé mentale, argent, poids, famille, neuroatypie), partager publiquement revient à se dévoiler. Le taux sera bas, et c'est normal.`,
      en: `## What the numbers actually say

Your numbers live in **Statistics** (all quizzes) and in the tab of the same name on each quiz.

### The four headline numbers

- **Views**: people who opened the quiz.
- **Starts**: those who began answering.
- **Completions**: those who reached the end.
- **Leads**: those who left their email. The only number that earns you anything.

### Losing people along the way is NORMAL

This is the most important line on this page, and the one that costs the most time when ignored.

A quiz does not aim for 100% completion, and should not. The first to leave are the visitors who were not for you: they qualified themselves out. That is the quiz doing its job.

Read every exit as a mistake and you will rewrite a quiz that is working fine.

### "Where do respondents drop off?"

The chart shows, question by question, how many people **saw** it. The bar shrinks at each exit.

Two things, so you don't fix the wrong question:

**1. Someone who leaves between question 6 and 7 never saw 7.** They stopped **on 6**. That is the one to look at. Tiquiz names it for you, you don't do the maths.

**2. Tiquiz separates two kinds of drop-off**, and they need opposite fixes:
- **They see the question and don't answer**: it blocks. Too personal, unclear, or a missing answer. Rewording helps.
- **They answer, then stop**: the question landed fine, what follows loses them. Rewording it changes nothing.

### Wait until you have enough people

Below roughly twenty people on the same question, Tiquiz **names no drop-off point**, and that is not a limitation: with 8 visitors, one person is worth 12%. We'd be sending you after noise.

While the sample is small, Tiquiz says plainly that there is nothing to conclude yet.

### How to measure a change

> **One change at a time**, then 20 to 30 fresh responses before judging.

Two changes at once and you will never know which one worked. This is the only method that gives an answer.

### Share rate

A low share rate is not always a flaw in the quiz or a weak bonus. On an intimate or exposing subject (health, mental health, money, weight, family, neurodivergence), sharing publicly means outing yourself. The rate will be low, and that is normal.`,
      es: `## Lo que dicen de verdad los números

Los tienes en **Estadísticas** y en la pestaña de cada quiz: vistas, inicios, finalizados y leads.

**Perder gente por el camino es NORMAL.** Ningún quiz busca el 100% de finalización. Los primeros que se van son los visitantes que no eran para ti: se han descalificado solos, y ése es el trabajo del quiz.

**Dónde se detienen.** Quien abandona entre la pregunta 6 y la 7 nunca vio la 7: se detuvo **en la 6**. Tiquiz te la señala directamente. Y distingue dos formas de abandono: la ven y no responden (la pregunta bloquea, reformular sirve) o responden y se van (la pregunta va bien, es lo que sigue).

**Espera a tener gente.** Por debajo de unas veinte personas en una misma pregunta, Tiquiz no señala ningún punto de fuga: con 8 visitantes, una sola persona vale el 12%.

**Para medir un cambio:** una sola modificación cada vez, y luego 20 a 30 respuestas nuevas antes de juzgar.

Un porcentaje bajo de compartidos no siempre es un defecto: en temas íntimos (salud, dinero, peso, familia), compartir es exponerse.`,
      it: `## Cosa dicono davvero i numeri

Li trovi in **Statistiche** e nella scheda di ogni quiz: visite, avvii, completati e lead.

**Perdere persone lungo il percorso è NORMALE.** Nessun quiz punta al 100% di completamento. I primi ad andarsene sono i visitatori che non erano per te: si sono squalificati da soli, ed è il lavoro del quiz.

**Dove si fermano.** Chi abbandona tra la domanda 6 e la 7 non ha mai visto la 7: si è fermato **sulla 6**. Tiquiz te la indica direttamente. E distingue due forme di abbandono: la vedono e non rispondono (la domanda blocca, riformulare serve) oppure rispondono e se ne vanno (la domanda va bene, è il seguito).

**Aspetta di avere abbastanza persone.** Sotto la ventina sulla stessa domanda, Tiquiz non indica nessun punto di fuga: con 8 visitatori, una sola persona vale il 12%.

**Per misurare un cambiamento:** una sola modifica alla volta, poi 20-30 nuove risposte prima di giudicare.

Una percentuale di condivisione bassa non è sempre un difetto: su temi intimi (salute, denaro, peso, famiglia), condividere significa esporsi.`,
      ar: `## ما تقوله الأرقام حقًا

تجدها في **الإحصاءات** وفي تبويب كل اختبار: المشاهدات، البدايات، المكتملة، والعملاء المحتملون.

**فقدان بعض الزوار في الطريق أمر طبيعي.** لا يستهدف أي اختبار إكمالًا بنسبة 100%. أول من يغادر هم الزوار الذين لم يكونوا لك: لقد استبعدوا أنفسهم، وهذا هو عمل الاختبار.

**أين يتوقفون.** من يغادر بين السؤال 6 و7 لم يرَ السؤال 7 أبدًا: توقف **عند السؤال 6**. يشير Tiquiz إليه مباشرة. ويميّز بين نوعين من الانسحاب: يرون السؤال ولا يجيبون (السؤال يعيقهم، إعادة الصياغة مفيدة)، أو يجيبون ثم يغادرون (السؤال جيد، المشكلة فيما يليه).

**انتظر عددًا كافيًا.** تحت عشرين شخصًا على السؤال نفسه، لا يحدد Tiquiz أي نقطة تسرب: مع 8 زوار، شخص واحد يساوي 12%.

**لقياس أي تغيير:** تعديل واحد فقط في كل مرة، ثم 20 إلى 30 إجابة جديدة قبل الحكم.

انخفاض نسبة المشاركة ليس دائمًا عيبًا: في المواضيع الحساسة (الصحة، المال، الوزن، العائلة)، المشاركة تعني كشف النفس.`,
    },
    related_slugs: ["tiquiz-leads", "tiquiz-page-resultat"],
    tags: ["tiquiz", "stats", "statistiques", "funnel", "analytics", "completion", "abandon"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-mise-en-page",
    sort_order: 9,
    title: {
      fr: "Mise en page : alignement, colonnes, tailles",
      en: "Layout: alignment, columns, sizes",
      es: "Maquetación: alineación, columnas, tamaños",
      it: "Impaginazione: allineamento, colonne, dimensioni",
      ar: "التنسيق: المحاذاة والأعمدة والأحجام",
    },
    content: {
      fr: `## Trois étages, du plus fort au plus faible

C'est la clé pour ne pas s'énerver sur l'éditeur. Trois endroits peuvent décider de l'alignement, et le plus précis gagne toujours :

1. **Le champ** : l'alignement que tu poses à la main dans un texte, avec les boutons d'alignement.
2. **La question** : un réglage qui ne vaut que pour cette question.
3. **Le quiz** : le réglage général, qui s'applique à tout ce qui ne s'est pas prononcé.

Par défaut, la question et le champ ne se prononcent pas : tout suit le réglage du quiz. Le jour où tu alignes un champ à la main, ce champ devient une exception permanente.

### Tout remettre d'équerre

C'est ce qui fait croire que « le réglage général ne marche pas » : il marche, mais toutes les exceptions posées à la main passent devant.

Le bouton **« Tout réaligner sur ce réglage »** efface les exceptions, sur les questions **et** dans les textes. Tes gras, tes couleurs et tes tailles sont conservés, seul l'alignement est effacé.

C'est ce qui te permet d'appliquer un nouveau réglage à un quiz **déjà en ligne** sans le refaire.

### Liste ou colonnes

Même logique pour les réponses : le réglage du quiz, qu'une question peut contredire.

- **Auto** : Tiquiz décide selon le nombre de réponses.
- **Liste** : une réponse par ligne, toujours.
- **Colonnes** : deux colonnes sur ordinateur.

Sur mobile, c'est toujours une colonne, quel que soit le réglage : deux colonnes sur un téléphone ne sont pas lisibles.

### Taille du texte

Le sélecteur de taille agit sur **tout le champ**, pas sur le mot sélectionné. Si tu as l'impression qu'il ne se passe rien, clique une deuxième fois sur une taille : le champ se remet d'aplomb tout seul.

### Les images

Une image de réponse garde **son format**. Une photo en hauteur reste en hauteur, une capture d'écran large reste large. Rien n'est recadré, donc rien n'est coupé.

Conséquence normale : deux photos de formats différents donnent deux cartes de hauteurs différentes.

### Le logo

Le logo est indépendant du titre : tu peux l'aligner à gauche, au centre ou à droite, et régler sa largeur, même si ton titre est aligné autrement. Par défaut il suit le titre.`,
      en: `## Three levels, strongest first

This is the key to not fighting the editor. Three places can decide alignment, and the most specific always wins:

1. **The field**: alignment you set by hand inside a text, with the alignment buttons.
2. **The question**: a setting that applies to that question only.
3. **The quiz**: the general setting, applied to anything that hasn't spoken up.

By default the question and the field don't speak up: everything follows the quiz setting. The day you align a field by hand, that field becomes a permanent exception.

### Straightening everything back

This is what makes people think "the general setting doesn't work": it does, but every hand-placed exception outranks it.

The **"Realign everything on this setting"** button clears the exceptions, on questions **and** inside texts. Your bold, colours and sizes are kept, only alignment is cleared.

That is what lets you apply a new setting to a quiz that is **already live** without rebuilding it.

### List or columns

Same logic for answers: a quiz setting that a question can override.

- **Auto**: Tiquiz decides based on how many answers there are.
- **List**: one answer per line, always.
- **Columns**: two columns on desktop.

On mobile it is always one column whatever the setting: two columns on a phone are not readable.

### Text size

The size picker acts on **the whole field**, not on the selected word. If it seems to do nothing, click a size a second time: the field repairs itself.

### Images

An answer image keeps **its own shape**. A tall photo stays tall, a wide screenshot stays wide. Nothing is cropped, so nothing is cut off.

Expected consequence: two photos of different shapes give two cards of different heights.

### The logo

The logo is independent from the title: you can align it left, centre or right and set its width, even with a title aligned differently. By default it follows the title.`,
      es: `## Tres niveles, del más fuerte al más débil

Tres sitios pueden decidir la alineación, y gana siempre el más preciso: **el campo** (lo que alineas a mano), **la pregunta** y **el quiz** (el ajuste general).

Por defecto la pregunta y el campo no se pronuncian. El día que alineas un campo a mano, ese campo se convierte en excepción permanente. Por eso parece que "el ajuste general no funciona".

El botón **"Realinear todo con este ajuste"** borra las excepciones, en las preguntas y dentro de los textos. Se conservan negritas, colores y tamaños. Es lo que permite aplicar un ajuste a un quiz **ya publicado** sin rehacerlo.

**Lista o columnas:** misma lógica. En móvil siempre una columna, sea cual sea el ajuste.

**Tamaño del texto:** el selector actúa sobre todo el campo, no sobre la palabra seleccionada.

**Imágenes:** una imagen de respuesta conserva su formato, no se recorta. Dos fotos distintas dan dos tarjetas de alturas distintas: es normal.

**Logo:** independiente del título, con su propia alineación y anchura.`,
      it: `## Tre livelli, dal più forte al più debole

Tre punti possono decidere l'allineamento e vince sempre il più preciso: **il campo** (quello che allinei a mano), **la domanda** e **il quiz** (l'impostazione generale).

Di default la domanda e il campo non si pronunciano. Il giorno in cui allinei un campo a mano, quel campo diventa un'eccezione permanente. Ecco perché sembra che "l'impostazione generale non funzioni".

Il pulsante **"Riallinea tutto su questa impostazione"** cancella le eccezioni, sulle domande e dentro i testi. Grassetti, colori e dimensioni restano. È ciò che permette di applicare una nuova impostazione a un quiz **già online** senza rifarlo.

**Elenco o colonne:** stessa logica. Su mobile sempre una colonna, qualunque sia l'impostazione.

**Dimensione del testo:** il selettore agisce su tutto il campo, non sulla parola selezionata.

**Immagini:** l'immagine di una risposta conserva il suo formato, non viene ritagliata. Due foto diverse danno due schede di altezze diverse: è normale.

**Logo:** indipendente dal titolo, con allineamento e larghezza propri.`,
      ar: `## ثلاثة مستويات، من الأقوى إلى الأضعف

ثلاثة مواضع يمكنها تحديد المحاذاة، ويفوز الأكثر تحديدًا دائمًا: **الحقل** (ما تحاذيه يدويًا)، **السؤال**، و**الاختبار** (الإعداد العام).

افتراضيًا لا يحدد السؤال ولا الحقل شيئًا. لكن حين تحاذي حقلًا يدويًا، يصبح ذلك الحقل استثناءً دائمًا. لهذا يبدو أن "الإعداد العام لا يعمل".

زر **"إعادة محاذاة كل شيء على هذا الإعداد"** يمسح الاستثناءات، في الأسئلة وداخل النصوص. يبقى الخط العريض والألوان والأحجام. وهذا ما يتيح تطبيق إعداد جديد على اختبار **منشور بالفعل** دون إعادة بنائه.

**قائمة أم أعمدة:** المنطق نفسه. على الهاتف عمود واحد دائمًا مهما كان الإعداد.

**حجم النص:** المحدد يؤثر على الحقل كله، لا على الكلمة المحددة.

**الصور:** صورة الإجابة تحتفظ بنسبتها ولا يتم اقتصاصها. صورتان بنسبتين مختلفتين تعطيان بطاقتين بارتفاعين مختلفين: هذا طبيعي.

**الشعار:** مستقل عن العنوان، بمحاذاة وعرض خاصين به.`,
    },
    related_slugs: ["tiquiz-create-quiz", "tiquiz-page-resultat"],
    tags: ["tiquiz", "design", "alignement", "colonnes", "images", "logo", "mise en page"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-sondages",
    sort_order: 10,
    title: {
      fr: "Les sondages",
      en: "Surveys",
      es: "Las encuestas",
      it: "I sondaggi",
      ar: "الاستطلاعات",
    },
    content: {
      fr: `## Un sondage, c'est pour écouter

Le quiz **donne** un résultat à celui qui répond. Le sondage, lui, ne lui donne rien : c'est **toi** qui récupères les réponses. Les deux se créent depuis **Mes projets**.

Utilise un sondage pour savoir ce que veut vraiment ton audience, tester une idée d'offre, comprendre pourquoi quelqu'un n'a pas acheté.

### Le créer

Trois façons, comme pour un quiz :
- **Manuellement**, question par question.
- **Avec l'IA** : tu décris ta cible et ce que tu veux apprendre, elle rédige les questions.
- **En important** un fichier .txt que tu as déjà écrit.

Plus ta cible est précise (« mes clientes qui ont acheté la formation X ces 6 derniers mois » plutôt que « mon audience »), meilleures sont les questions.

### Les types de questions

Au delà du choix multiple, un sondage sait poser :
- du **texte libre** : la personne écrit ce qu'elle veut ;
- une **échelle** (par exemple de 1 à 10) ;
- des **étoiles**.

Ces trois là n'ont pas d'options à cocher, et c'est normal.

### Lire les réponses

L'onglet **Réponses** te donne, pour chaque question : le compte par option, la **liste complète** des textes libres (avec un bouton pour tout copier), et la répartition des notes avec leur moyenne pour les échelles.

Le texte libre est souvent la partie la plus utile : ce sont les mots exacts de ta cliente, ceux que tu peux reprendre tels quels dans ta page de vente.

### Ce qui marche pareil que pour un quiz

La capture d'email, la synchronisation Systeme.io, ton branding, ton domaine personnalisé, le suivi des abandons : tout fonctionne à l'identique.`,
      en: `## A survey is for listening

A quiz **gives** a result to the person answering. A survey gives them nothing: **you** are the one collecting answers. Both are created from **My projects**.

Use a survey to find out what your audience actually wants, test an offer idea, or understand why someone didn't buy.

### Creating one

Three ways, same as a quiz:
- **By hand**, question by question.
- **With AI**: describe your target and what you want to learn, it writes the questions.
- **By importing** a .txt file you already wrote.

The more precise your target ("clients who bought course X in the last 6 months" rather than "my audience"), the better the questions.

### Question types

Beyond multiple choice, a survey can ask for:
- **free text**: they write whatever they want;
- a **scale** (1 to 10, for instance);
- **stars**.

Those three have no options to tick, and that is normal.

### Reading the answers

The **Responses** tab gives you, per question: the count per option, the **full list** of free-text answers (with a copy-all button), and the spread of ratings with their average for scales.

Free text is often the most useful part: those are your customer's exact words, the ones you can lift straight into your sales page.

### What works exactly like a quiz

Email capture, Systeme.io sync, your branding, your custom domain, drop-off tracking: all identical.`,
      es: `## Una encuesta sirve para escuchar

El quiz **da** un resultado a quien responde. La encuesta no le da nada: eres **tú** quien recoge las respuestas. Ambos se crean desde **Mis proyectos**.

Se crea manualmente, con IA (describe tu objetivo y tu público) o importando un .txt. Cuanto más precisa sea la descripción del público, mejores serán las preguntas.

Además de la opción múltiple, una encuesta admite **texto libre**, **escalas** (por ejemplo de 1 a 10) y **estrellas**. Esos tres tipos no tienen opciones que marcar: es normal.

La pestaña **Respuestas** muestra el recuento por opción, la lista completa de textos libres (con botón para copiar) y el reparto de notas con su media. El texto libre suele ser lo más útil: son las palabras exactas de tu clienta.

Captura de email, Systeme.io, branding, dominio propio y seguimiento de abandonos funcionan igual que en un quiz.`,
      it: `## Un sondaggio serve ad ascoltare

Il quiz **dà** un risultato a chi risponde. Il sondaggio non gli dà nulla: sei **tu** a raccogliere le risposte. Entrambi si creano da **I miei progetti**.

Si crea manualmente, con l'IA (descrivi il tuo target e cosa vuoi sapere) o importando un .txt. Più il target è preciso, migliori sono le domande.

Oltre alla scelta multipla, un sondaggio permette **testo libero**, **scale** (per esempio da 1 a 10) e **stelle**. Questi tre tipi non hanno opzioni da spuntare: è normale.

La scheda **Risposte** mostra il conteggio per opzione, l'elenco completo dei testi liberi (con pulsante per copiare tutto) e la distribuzione dei voti con la media. Il testo libero è spesso la parte più utile: sono le parole esatte della tua cliente.

Cattura email, Systeme.io, branding, dominio personalizzato e monitoraggio degli abbandoni funzionano come in un quiz.`,
      ar: `## الاستطلاع للاستماع

الاختبار **يمنح** نتيجة لمن يجيب. أما الاستطلاع فلا يمنحه شيئًا: **أنت** من يجمع الإجابات. كلاهما يُنشأ من **مشاريعي**.

يمكن إنشاؤه يدويًا، أو بالذكاء الاصطناعي (صف جمهورك وما تريد معرفته)، أو باستيراد ملف ‎.txt. كلما كان وصف الجمهور أدق، كانت الأسئلة أفضل.

إلى جانب الاختيار المتعدد، يدعم الاستطلاع **النص الحر** و**المقاييس** (من 1 إلى 10 مثلًا) و**النجوم**. هذه الأنواع الثلاثة بلا خيارات للتحديد، وهذا طبيعي.

يعرض تبويب **الإجابات** العدد لكل خيار، والقائمة الكاملة للنصوص الحرة (مع زر نسخ الكل)، وتوزيع الدرجات ومتوسطها. النص الحر غالبًا هو الأنفع: إنها كلمات عميلتك بالحرف.

جمع البريد، ومزامنة Systeme.io، والعلامة التجارية، والنطاق الخاص، وتتبع الانسحاب: كلها تعمل كما في الاختبار.`,
    },
    related_slugs: ["tiquiz-create-quiz", "tiquiz-stats"],
    tags: ["tiquiz", "sondage", "survey", "questions", "texte libre", "echelle"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-popquiz",
    sort_order: 11,
    title: {
      fr: "Le popquiz : un quiz dans ta vidéo",
      en: "Popquiz: a quiz inside your video",
      es: "El popquiz: un quiz dentro de tu vídeo",
      it: "Il popquiz: un quiz dentro il video",
      ar: "البوب كويز: اختبار داخل الفيديو",
    },
    content: {
      fr: `## Capturer pendant qu'on te regarde

Un popquiz, c'est ta vidéo avec des questions qui apparaissent aux moments que tu choisis. La personne répond sans quitter la vidéo, et tu récupères ses réponses comme pour un quiz normal.

C'est fait pour les webinaires, les vidéos de vente, les modules de formation : les moments où quelqu'un t'accorde déjà plusieurs minutes.

### Avant de commencer

**Il te faut un quiz existant.** Le popquiz ne crée pas les questions, il les emprunte à un quiz de Mes projets. Crée d'abord le quiz, ensuite le popquiz.

### Trois étapes

1. **Ta vidéo.** Soit un lien (YouTube, Vimeo…), soit un fichier que tu importes (MP4, WebM, MOV). L'import reprend là où il s'était arrêté si ta connexion coupe, à condition de laisser l'onglet ouvert.
2. **Tes marqueurs.** Lance la lecture, puis clique sur la barre de temps à l'endroit où tu veux qu'une question apparaisse. Autant de marqueurs que tu veux.
3. **Publie.** Tant que c'est un brouillon, personne d'autre que toi ne peut l'ouvrir.

### Le partager

Deux façons, au choix :
- **Le lien direct**, à envoyer ou à poster.
- **Le code à intégrer**, à coller dans une page de ton site ou de Systeme.io. La vidéo s'affiche dedans, avec les questions.

Si tu as connecté ton propre domaine, le lien porte ton domaine.

### Où placer les marqueurs

Juste **après** avoir donné quelque chose d'utile, jamais avant. Une question qui arrive avant la valeur ressemble à un péage ; la même question trente secondes plus tard ressemble à un échange.`,
      en: `## Capture while they're watching

A popquiz is your video with questions appearing at moments you choose. The viewer answers without leaving the video, and you collect their answers exactly like a normal quiz.

It is built for webinars, sales videos and course modules: the moments when someone is already giving you several minutes.

### Before you start

**You need an existing quiz.** A popquiz does not write questions, it borrows them from a quiz in My projects. Create the quiz first, the popquiz second.

### Three steps

1. **Your video.** Either a link (YouTube, Vimeo…) or a file you upload (MP4, WebM, MOV). Uploads resume where they stopped if your connection drops, as long as you leave the tab open.
2. **Your markers.** Hit play, then click the timeline where you want a question to appear. As many markers as you like.
3. **Publish.** While it is a draft, nobody but you can open it.

### Sharing it

Two ways:
- **The direct link**, to send or post.
- **The embed code**, to paste into a page on your site or in Systeme.io. The video shows up inside, questions included.

If you connected your own domain, the link carries your domain.

### Where to put markers

Just **after** you've given something useful, never before. A question that lands before the value feels like a toll gate; the same question thirty seconds later feels like an exchange.`,
      es: `## Capturar mientras te miran

Un popquiz es tu vídeo con preguntas que aparecen en los momentos que elijas. La persona responde sin salir del vídeo.

**Necesitas un quiz que ya exista:** el popquiz no crea preguntas, las toma de un quiz de Mis proyectos.

Tres pasos: **el vídeo** (un enlace de YouTube o Vimeo, o un archivo MP4, WebM o MOV que subes), **los marcadores** (dale al play y haz clic en la barra de tiempo donde quieras una pregunta) y **publicar**. Mientras sea borrador, nadie más puede abrirlo.

Se comparte con el enlace directo o con el código para insertar en una página de tu web o de Systeme.io. Si tienes dominio propio, el enlace lo lleva.

Coloca los marcadores **justo después** de dar algo útil, nunca antes: una pregunta antes del valor parece un peaje.`,
      it: `## Catturare mentre ti guardano

Un popquiz è il tuo video con domande che compaiono nei momenti che scegli. La persona risponde senza uscire dal video.

**Serve un quiz già esistente:** il popquiz non crea le domande, le prende da un quiz in I miei progetti.

Tre passi: **il video** (un link YouTube o Vimeo, oppure un file MP4, WebM o MOV che carichi), **i marcatori** (avvia la riproduzione e clicca sulla barra del tempo dove vuoi una domanda) e **pubblica**. Finché è una bozza, nessun altro può aprirlo.

Si condivide con il link diretto o con il codice da incorporare in una pagina del tuo sito o di Systeme.io. Se hai un dominio personalizzato, il link lo usa.

Metti i marcatori **subito dopo** aver dato qualcosa di utile, mai prima: una domanda prima del valore sembra un pedaggio.`,
      ar: `## اجمع بياناتهم وهم يشاهدونك

البوب كويز هو الفيديو الخاص بك مع أسئلة تظهر في اللحظات التي تختارها. يجيب المشاهد دون مغادرة الفيديو.

**تحتاج إلى اختبار موجود مسبقًا:** البوب كويز لا ينشئ الأسئلة، بل يأخذها من اختبار في "مشاريعي".

ثلاث خطوات: **الفيديو** (رابط YouTube أو Vimeo، أو ملف MP4 أو WebM أو MOV ترفعه)، و**العلامات** (شغّل الفيديو ثم انقر على شريط الوقت حيث تريد سؤالًا)، ثم **النشر**. ما دام مسودة، لا يمكن لأحد غيرك فتحه.

تتم المشاركة عبر الرابط المباشر أو عبر كود التضمين في صفحة على موقعك أو في Systeme.io. إن كان لديك نطاق خاص، فالرابط يحمله.

ضع العلامات **مباشرة بعد** تقديم شيء مفيد، لا قبله: السؤال قبل القيمة يبدو كرسوم عبور.`,
    },
    related_slugs: ["tiquiz-create-quiz", "tiquiz-leads"],
    tags: ["tiquiz", "popquiz", "video", "embed", "integration", "marqueurs"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-domaine",
    sort_order: 12,
    title: {
      fr: "Utiliser ton propre nom de domaine",
      en: "Using your own domain name",
      es: "Usar tu propio dominio",
      it: "Usare il tuo dominio",
      ar: "استخدام نطاقك الخاص",
    },
    content: {
      fr: `## Tes quiz à ton nom

Par défaut, tes quiz s'ouvrent sur \`quiz.tipote.com\`. Tu peux les servir depuis ta propre adresse, par exemple \`quiz.ta-marque.com\`. Le visiteur ne voit plus Tiquiz nulle part.

C'est une fonction des **plans payants**.

### Comment faire

Va dans **Paramètres > Domaine**, puis :

1. **Donne ton adresse.** Un sous-domaine que tu contrôles est recommandé (\`quiz.ta-marque.com\`), mais ton domaine principal marche aussi. Il faut simplement que tu aies accès à sa configuration DNS.
2. **Ajoute l'enregistrement DNS** que Tiquiz t'affiche, chez ton hébergeur (OVH, Gandi, Cloudflare, Hostinger…). Tiquiz te donne les trois cases à remplir : le type, le nom et la cible. Tu copies, tu colles.
3. **Attends.** Tiquiz surveille tout seul pendant dix minutes et te prévient dès que c'est en ligne.

### Si ça reste en attente

C'est presque toujours le DNS qui n'a pas encore fait le tour du monde. Ça peut prendre quelques minutes comme quelques heures, ça ne dépend pas de Tiquiz. Reviens plus tard et clique sur **Vérifier**.

Si ça échoue vraiment, la cause la plus fréquente est un enregistrement déjà existant sur le même nom, qui entre en conflit avec le nouveau.

### Une fois vérifié

Tous tes quiz, sondages et popquizzes sont servis depuis ton domaine, sans réglage par projet. Chacun garde son propre lien court.

Tu peux retirer le domaine quand tu veux : tes quiz redeviennent accessibles sur l'adresse Tiquiz, rien n'est perdu.`,
      en: `## Your quizzes under your own name

By default your quizzes open on \`quiz.tipote.com\`. You can serve them from your own address instead, e.g. \`quiz.your-brand.com\`. The visitor never sees Tiquiz.

This is a **paid plan** feature.

### How to do it

Go to **Settings > Domain**, then:

1. **Enter your address.** A subdomain you control is recommended (\`quiz.your-brand.com\`), but your main domain works too. You just need access to its DNS settings.
2. **Add the DNS record** Tiquiz shows you, at your registrar (OVH, Gandi, Cloudflare, Hostinger…). Tiquiz gives you the three fields to fill in: type, name and target. Copy, paste.
3. **Wait.** Tiquiz watches on its own for ten minutes and tells you the moment it goes live.

### If it stays pending

It is almost always DNS still travelling around the world. It can take minutes or hours, and it does not depend on Tiquiz. Come back later and hit **Verify**.

If it genuinely fails, the most common cause is an existing record on the same name conflicting with the new one.

### Once verified

All your quizzes, surveys and popquizzes are served from your domain, with no per-project setting. Each keeps its own short link.

You can remove the domain whenever you like: your quizzes go back to the Tiquiz address, nothing is lost.`,
      es: `## Tus quiz con tu nombre

Por defecto tus quiz se abren en \`quiz.tipote.com\`. Puedes servirlos desde tu propia dirección, por ejemplo \`quiz.tu-marca.com\`. Es una función de los **planes de pago**.

En **Ajustes > Dominio**: indica tu dirección (mejor un subdominio que controles), añade en tu proveedor de DNS el registro que Tiquiz te muestra (te da el tipo, el nombre y el destino: copiar y pegar) y espera. Tiquiz vigila solo durante diez minutos y te avisa.

Si sigue pendiente, casi siempre es el DNS que aún se está propagando: puede tardar minutos u horas y no depende de Tiquiz. Vuelve más tarde y pulsa **Verificar**. Si falla de verdad, la causa más común es un registro ya existente con el mismo nombre.

Una vez verificado, todos tus quiz, encuestas y popquizzes se sirven desde tu dominio. Puedes quitarlo cuando quieras sin perder nada.`,
      it: `## I tuoi quiz a tuo nome

Di default i tuoi quiz si aprono su \`quiz.tipote.com\`. Puoi servirli dal tuo indirizzo, per esempio \`quiz.il-tuo-brand.com\`. È una funzione dei **piani a pagamento**.

In **Impostazioni > Dominio**: indica il tuo indirizzo (meglio un sottodominio che controlli), aggiungi presso il tuo provider DNS il record che Tiquiz ti mostra (ti dà tipo, nome e destinazione: copia e incolla) e aspetta. Tiquiz controlla da solo per dieci minuti e ti avvisa.

Se resta in attesa, quasi sempre è il DNS che si sta ancora propagando: può volerci da qualche minuto a qualche ora e non dipende da Tiquiz. Torna più tardi e clicca **Verifica**. Se fallisce davvero, la causa più comune è un record già esistente con lo stesso nome.

Una volta verificato, tutti i tuoi quiz, sondaggi e popquiz vengono serviti dal tuo dominio. Puoi rimuoverlo quando vuoi senza perdere nulla.`,
      ar: `## اختباراتك باسمك

افتراضيًا تُفتح اختباراتك على \`quiz.tipote.com\`. يمكنك تقديمها من عنوانك الخاص، مثل \`quiz.your-brand.com\`. هذه ميزة في **الخطط المدفوعة**.

من **الإعدادات > النطاق**: أدخل عنوانك (يُفضّل نطاق فرعي تتحكم فيه)، ثم أضف لدى مزود النطاق سجل DNS الذي يعرضه Tiquiz (يعطيك النوع والاسم والوجهة: انسخ والصق)، ثم انتظر. يراقب Tiquiz تلقائيًا لمدة عشر دقائق ويخبرك.

إذا بقي قيد الانتظار، فغالبًا لأن DNS لم ينتشر بعد: قد يستغرق دقائق أو ساعات ولا يعتمد على Tiquiz. عد لاحقًا واضغط **تحقق**. إذا فشل فعلًا، فالسبب الأشيع هو سجل موجود مسبقًا بالاسم نفسه.

بعد التحقق، تُقدَّم كل اختباراتك واستطلاعاتك وبوب كويزاتك من نطاقك. يمكنك إزالته متى شئت دون فقدان أي شيء.`,
    },
    related_slugs: ["tiquiz-plans", "tiquiz-create-quiz"],
    tags: ["tiquiz", "domaine", "domain", "dns", "cname", "marque", "branding"],
  },
  {
    category_slug: "account-settings",
    slug: "connexion-mot-de-passe",
    sort_order: 2,
    title: {
      fr: "Se connecter, et que faire si tu n'y arrives pas",
      en: "Signing in, and what to do when you can't",
      es: "Conectarse, y qué hacer si no lo consigues",
      it: "Accedere, e cosa fare se non ci riesci",
      ar: "تسجيل الدخول، وماذا تفعل إن لم تستطع",
    },
    content: {
      fr: `## Deux façons d'entrer

Sur Tipote comme sur Tiquiz, l'écran de connexion propose deux chemins, et les deux mènent au même compte :

- **Email + mot de passe.** Le plus rapide quand tu l'as défini.
- **Lien magique.** Tu entres ton email, tu reçois un lien, tu cliques, tu es connectée. Aucun mot de passe à retenir.

Le lien magique est pratique le temps de choisir un mot de passe, mais il oblige à ouvrir sa boîte mail à chaque fois. Si tu te connectes souvent, définis un mot de passe : **Paramètres > Général** (Tiquiz) ou **Paramètres > Réglages** (Tipote).

## Mot de passe oublié

1. Sur l'écran de connexion, clique sur **Mot de passe oublié ?**
2. Entre ton email et valide.
3. Ouvre le message reçu et clique sur le bouton.
4. Choisis ton nouveau mot de passe : **8 caractères minimum**, et il doit être différent de l'ancien.

**Le message n'arrive pas ?** Trois causes, dans cet ordre de fréquence :
- il est dans les **spams** (ou dans l'onglet Promotions de Gmail) ;
- l'adresse saisie n'est pas exactement celle du compte (une faute de frappe, ou une autre boîte) ;
- l'envoi peut prendre une à deux minutes.

Par sécurité, l'écran affiche toujours le même message que l'email existe ou non : ça évite qu'un inconnu puisse deviner qui a un compte.

## "Le lien m'envoie sur localhost"

Si un lien reçu par email affiche **"localhost n'autorise pas la connexion"**, c'est un vieux message : ce défaut a été corrigé le 2 août 2026. Redemande simplement un nouveau lien, celui-là pointera au bon endroit. Ce n'est ni ton navigateur, ni ton pare-feu, ni ton antivirus.

## "Session expirée, reconnecte-toi"

Un lien de réinitialisation ne sert qu'**une fois** et il expire. Si tu as cliqué deux fois, ou attendu trop longtemps, il faut en redemander un.

## Changer de mot de passe quand tu es connectée

**Paramètres > Général** (Tiquiz) ou **Paramètres > Réglages** (Tipote), section Mot de passe. Pas besoin de l'ancien : tu es déjà identifiée.

## Deux comptes séparés

Tipote et Tiquiz sont **deux applications avec deux comptes distincts**. Le même email peut exister des deux côtés sans que les mots de passe soient liés : changer l'un ne change pas l'autre.`,
      en: `## Two ways in

On Tipote and on Tiquiz alike, the sign-in screen offers two paths to the same account:

- **Email + password.** Fastest once you've set one.
- **Magic link.** Enter your email, get a link, click it, you're in. No password to remember.

The magic link is handy while you decide on a password, but it means opening your inbox every time. If you sign in often, set a password: **Settings > General** (Tiquiz) or **Settings > Preferences** (Tipote).

## Forgotten password

1. On the sign-in screen, click **Forgot password?**
2. Enter your email and confirm.
3. Open the message and click the button.
4. Pick your new password: **8 characters minimum**, and different from the old one.

**Nothing arrives?** Three causes, most common first:
- it's in **spam** (or Gmail's Promotions tab);
- the address you typed isn't exactly the account's one;
- delivery can take a minute or two.

For safety the screen shows the same message whether the account exists or not: that stops a stranger from finding out who has an account.

## "The link sends me to localhost"

If an emailed link shows **"localhost refused to connect"**, it's an old message: that defect was fixed on 2 August 2026. Just request a fresh link. It is not your browser, your firewall or your antivirus.

## "Session expired"

A reset link works **once** and expires. Clicked twice, or waited too long? Request a new one.

## Changing your password while signed in

**Settings > General** (Tiquiz) or **Settings > Preferences** (Tipote), Password section. You don't need the old one: you're already identified.

## Two separate accounts

Tipote and Tiquiz are **two apps with two separate accounts**. The same email can exist on both without the passwords being linked.`,
      es: `## Dos formas de entrar

En Tipote y en Tiquiz: **email + contraseña**, o **enlace mágico** (introduces tu email, recibes un enlace, haces clic y entras).

**Contraseña olvidada:** en la pantalla de acceso, "¿Contraseña olvidada?" > tu email > abre el mensaje > elige la nueva (mínimo 8 caracteres, distinta de la anterior).

**¿No llega el mensaje?** Mira en **spam** (o la pestaña Promociones de Gmail), comprueba que la dirección sea exactamente la de la cuenta, y espera uno o dos minutos. Por seguridad la pantalla muestra siempre el mismo mensaje exista o no la cuenta.

**"El enlace lleva a localhost":** es un correo antiguo, ese fallo se corrigió el 2 de agosto de 2026. Pide un enlace nuevo. No es tu navegador ni tu cortafuegos.

**"Sesión expirada":** un enlace de restablecimiento sirve una sola vez y caduca. Pide otro.

Tipote y Tiquiz son **dos cuentas distintas**: cambiar una contraseña no cambia la otra.`,
      it: `## Due modi per entrare

Su Tipote e su Tiquiz: **email + password**, oppure **link magico** (inserisci l'email, ricevi un link, clicchi ed entri).

**Password dimenticata:** nella schermata di accesso, "Password dimenticata?" > la tua email > apri il messaggio > scegli la nuova (minimo 8 caratteri, diversa dalla precedente).

**Il messaggio non arriva?** Controlla lo **spam** (o la scheda Promozioni di Gmail), verifica che l'indirizzo sia esattamente quello dell'account, e aspetta uno o due minuti. Per sicurezza la schermata mostra sempre lo stesso messaggio, che l'account esista o no.

**"Il link porta a localhost":** è una vecchia email, il difetto è stato corretto il 2 agosto 2026. Chiedi un link nuovo. Non è il tuo browser né il firewall.

**"Sessione scaduta":** un link di reimpostazione vale una sola volta e scade. Chiedine un altro.

Tipote e Tiquiz sono **due account distinti**: cambiare una password non cambia l'altra.`,
      ar: `## طريقتان للدخول

في Tipote وفي Tiquiz: **البريد وكلمة المرور**، أو **الرابط السحري** (تُدخل بريدك، تستقبل رابطًا، تنقر فتدخل).

**نسيت كلمة المرور:** في شاشة الدخول، "نسيت كلمة المرور؟" ثم بريدك، ثم افتح الرسالة، واختر كلمة جديدة (8 أحرف على الأقل، مختلفة عن السابقة).

**الرسالة لا تصل؟** تفقّد **البريد المزعج** (أو تبويب العروض في Gmail)، وتأكد أن العنوان هو نفسه عنوان الحساب تمامًا، وانتظر دقيقة أو دقيقتين. لأسباب أمنية تعرض الشاشة الرسالة نفسها سواء وُجد الحساب أم لا.

**"الرابط يقودني إلى localhost":** إنها رسالة قديمة، أُصلح هذا الخلل في 2 أغسطس 2026. اطلب رابطًا جديدًا. المشكلة ليست في متصفحك ولا في جدار الحماية.

**"انتهت الجلسة":** رابط إعادة التعيين يعمل مرة واحدة وينتهي. اطلب رابطًا آخر.

Tipote و Tiquiz **حسابان منفصلان**: تغيير كلمة مرور أحدهما لا يغيّر الآخر.`,
    },
    related_slugs: ["change-password", "settings-overview"],
    tags: ["connexion", "login", "mot de passe", "password", "lien magique", "acces"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-facturation",
    sort_order: 14,
    title: {
      fr: "Changer de plan, annuler, être facturée",
      en: "Changing plan, cancelling, getting billed",
      es: "Cambiar de plan, cancelar, facturación",
      it: "Cambiare piano, annullare, fatturazione",
      ar: "تغيير الخطة، الإلغاء، الفوترة",
    },
    content: {
      fr: `## Où ça se passe

**Paramètres > Compte & Tarifs.** Tu y vois ton plan en cours, les cartes des autres plans avec leur prix, et le bouton d'annulation.

## Passer à un plan supérieur

Clique sur le bouton du plan voulu : tu arrives sur la page de commande. **Le changement est automatique** : le nouveau plan démarre, l'ancien est annulé côté Systeme.io.

**Tu ne seras jamais facturée deux fois.** C'est la question qui revient le plus, et la réponse est non : les deux abonnements ne coexistent pas.

## Redescendre d'un plan

Même chemin : tu commandes le plan inférieur, l'ancien s'annule. Tu gardes toutes tes données. Si le nouveau plan a des limites plus basses, ce sont les limites qui s'appliquent, pas une suppression : rien n'est effacé.

## Annuler

Bouton **Annuler mon abonnement**, dans Paramètres > Compte & Tarifs.

- Tu gardes ton accès **complet jusqu'à la fin de la période déjà payée**.
- Ensuite tu repasses automatiquement en plan gratuit.
- **Tes quiz, sondages, popquizzes et leads existants restent en place.** Ce sont les limites du gratuit qui s'appliquent (1 quiz + 1 sondage + 1 popquiz actifs, 10 réponses par mois), pas un effacement.

Si le bouton ne fonctionne pas, l'abonnement se gère aussi directement depuis ton compte Systeme.io, ou en écrivant à hello@ethilife.fr.

## Le paiement passe par Systeme.io

Tiquiz ne stocke aucune donnée bancaire : les paiements, les factures et les reçus sont gérés par **Systeme.io**. Une facture se retrouve donc dans ton espace Systeme.io ou dans l'email de confirmation d'achat.

## Le compteur du plan gratuit

Le gratuit donne **10 réponses par mois**, et le compteur repart tout seul 30 jours après. Il n'expire jamais : tu peux rester dessus le temps qu'il faut pour tester sur ta vraie audience.

## L'accès à vie à 57 €

Il n'est **plus vendu**. Si tu l'as pris, il reste valable et illimité : tu n'as rien à faire et rien à repayer. Ne cherche pas la carte dans les tarifs, elle n'y est plus.`,
      en: `## Where it happens

**Settings > Account & Pricing.** Your current plan, the other plans with their prices, and the cancel button.

## Upgrading

Click the button of the plan you want and you land on the checkout page. **The switch is automatic**: the new plan starts, the old one is cancelled at Systeme.io.

**You are never billed twice.** That's the most common question, and the answer is no: the two subscriptions never overlap.

## Downgrading

Same path: order the lower plan, the old one cancels. You keep all your data. Lower limits apply as limits, not as deletion: nothing is erased.

## Cancelling

**Cancel my subscription**, in Settings > Account & Pricing.

- You keep **full access until the end of the period you already paid for**.
- Then you drop automatically to the free plan.
- **Your existing quizzes, surveys, popquizzes and leads stay.** Free-plan limits apply (1 quiz + 1 survey + 1 popquiz active, 10 responses per month), nothing is deleted.

If the button fails, the subscription can also be managed from your Systeme.io account, or by writing to hello@ethilife.fr.

## Payment goes through Systeme.io

Tiquiz stores no card data: payments, invoices and receipts are handled by **Systeme.io**. Look for an invoice in your Systeme.io account or in the purchase confirmation email.

## The free-plan counter

Free gives **10 responses per month**, and the counter resets on its own after 30 days. It never expires: stay on it as long as you need to test with your real audience.

## The €57 lifetime access

It is **no longer sold**. If you bought it, it stays valid and unlimited: nothing to do, nothing to pay again. Don't look for the card in the pricing table, it's gone.`,
      es: `## Dónde se hace

**Ajustes > Cuenta y Tarifas**: tu plan actual, los demás planes con su precio, y el botón de cancelación.

**Subir de plan:** pulsa el botón del plan que quieras y llegas a la página de pedido. El cambio es automático: el nuevo plan empieza y el anterior se cancela en Systeme.io. **Nunca se factura dos veces**, es la pregunta más frecuente y la respuesta es no.

**Bajar de plan:** mismo camino. Conservas todos tus datos; se aplican los límites del nuevo plan, no se borra nada.

**Cancelar:** botón "Cancelar mi suscripción". Mantienes el acceso completo hasta el final del periodo ya pagado, luego pasas al plan gratuito. Tus quiz, encuestas, popquizzes y leads **siguen ahí**: se aplican los límites del gratuito (1 quiz + 1 encuesta + 1 popquiz activos, 10 respuestas al mes), no un borrado.

**Los pagos pasan por Systeme.io:** Tiquiz no guarda ningún dato bancario. Las facturas están en tu cuenta Systeme.io o en el email de confirmación.

**El acceso de por vida a 57 €** ya no se vende, pero sigue siendo válido e ilimitado para quien lo compró.`,
      it: `## Dove si fa

**Impostazioni > Account e Tariffe**: il piano attuale, gli altri piani con il prezzo, e il pulsante di annullamento.

**Passare a un piano superiore:** clicca sul pulsante del piano desiderato e arrivi alla pagina d'ordine. Il cambio è automatico: il nuovo piano parte, il vecchio viene annullato su Systeme.io. **Non si viene mai fatturati due volte**: è la domanda più frequente e la risposta è no.

**Scendere di piano:** stesso percorso. Conservi tutti i dati; si applicano i limiti del nuovo piano, non una cancellazione.

**Annullare:** pulsante "Annulla il mio abbonamento". Mantieni l'accesso completo fino alla fine del periodo già pagato, poi torni al piano gratuito. Quiz, sondaggi, popquiz e lead **restano**: si applicano i limiti del gratuito (1 quiz + 1 sondaggio + 1 popquiz attivi, 10 risposte al mese), non una cancellazione.

**I pagamenti passano da Systeme.io:** Tiquiz non conserva alcun dato bancario. Le fatture sono nel tuo account Systeme.io o nell'email di conferma.

**L'accesso a vita da 57 €** non è più in vendita, ma resta valido e illimitato per chi l'ha acquistato.`,
      ar: `## أين يتم ذلك

**الإعدادات > الحساب والأسعار**: خطتك الحالية، والخطط الأخرى بأسعارها، وزر الإلغاء.

**الترقية:** اضغط زر الخطة المطلوبة لتصل إلى صفحة الطلب. التبديل تلقائي: تبدأ الخطة الجديدة وتُلغى القديمة في Systeme.io. **لن تُفوتر مرتين أبدًا**، وهذا أكثر سؤال يتكرر والجواب لا.

**التخفيض:** المسار نفسه. تحتفظ بكل بياناتك؛ تُطبَّق حدود الخطة الجديدة، ولا يُحذف شيء.

**الإلغاء:** زر "إلغاء اشتراكي". تحتفظ بالوصول الكامل حتى نهاية الفترة المدفوعة، ثم تعود إلى الخطة المجانية. اختباراتك واستطلاعاتك وبوب كويزاتك وعملاؤك المحتملون **يبقون**: تُطبَّق حدود المجاني (اختبار واحد + استطلاع واحد + بوب كويز واحد نشط، 10 ردود شهريًا)، لا الحذف.

**المدفوعات تمر عبر Systeme.io:** لا يحتفظ Tiquiz بأي بيانات مصرفية. الفواتير في حسابك على Systeme.io أو في بريد التأكيد.

**الوصول مدى الحياة بـ 57 €** لم يعد معروضًا للبيع، لكنه يبقى ساريًا وغير محدود لمن اشتراه.`,
    },
    related_slugs: ["tiquiz-plans", "connexion-mot-de-passe"],
    tags: ["tiquiz", "facturation", "abonnement", "annuler", "plan", "billing", "systeme.io"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-variables",
    sort_order: 15,
    title: {
      fr: "Personnaliser tes textes : prénom, score, genre",
      en: "Personalising your texts: first name, score, gender",
      es: "Personalizar tus textos: nombre, puntuación, género",
      it: "Personalizzare i testi: nome, punteggio, genere",
      ar: "تخصيص نصوصك: الاسم والنتيجة والصيغة",
    },
    content: {
      fr: `## Écrire un texte qui parle à chaque visiteur

Dans tes textes de quiz, certains morceaux entre accolades sont remplacés au moment de l'affichage par ce qui concerne **la personne qui répond**. Tu n'as rien à programmer : tu les écris, ou tu utilises le bouton d'insertion à côté du champ.

## Le prénom

\`{name}\` affiche le prénom du visiteur.

Pour qu'il ait une valeur, active **"Demander le prénom"** dans la colonne de droite de l'éditeur : un petit écran s'affiche avant la première question.

> Bravo \`{name}\`, tu fais partie des rares à... → **Bravo Sophie, tu fais partie des rares à...**

## Le score (mode score uniquement)

- \`{score}\` : le score global, **en pourcentage** (0 à 100).
- \`{label}\` : le libellé de la tranche, par exemple "Score 40 à 69".
- \`{score_sommeil}\` : le score de l'axe nommé Sommeil, toujours en pourcentage.
- \`{label_sommeil}\` : le libellé de ce même axe.

Un axe donne donc deux variables, construites sur son nom. Elles apparaissent dans l'éditeur dès que tu ajoutes un axe : pas besoin de deviner l'orthographe, le bouton d'insertion les liste.

**Elles marchent aussi dans l'URL du bouton d'action.** C'est ce qui permet d'envoyer le visiteur vers une page différente selon son score, ou de transmettre son résultat à ton outil.

Bon à savoir : ces variables continuent de fonctionner **même si tu as choisi de ne pas afficher le score**. Cacher le score ne l'efface pas, ça le rend juste invisible.

## Le genre

\`{prêt|prête|prêt·e}\` affiche la bonne forme selon ce que le visiteur a indiqué : masculin, féminin, ou non binaire, dans cet ordre.

Active **"Demander le genre"** pour que la question soit posée. Le bouton **✨** à côté de chaque champ demande à l'IA d'écrire les trois variantes d'un coup, et tu peux les corriger à la main ensuite. Si tu actives le genre après avoir écrit ton quiz, le bouton **"Genrer tout le quiz"** repasse sur tous les champs.

En anglais ou dans une autre langue non genrée, l'IA renvoie trois fois le même texte : l'affichage reste correct.

## Si une variable s'affiche telle quelle

Tu vois \`{score}\` à l'écran au lieu d'un nombre ? C'est normal et c'est voulu : une variable inconnue reste visible plutôt que de disparaître en silence. Les causes habituelles :
- une faute de frappe dans le nom ;
- \`{score}\` utilisé sur un quiz en mode profil, où il n'existe pas ;
- \`{name}\` sans avoir activé "Demander le prénom" ;
- un axe renommé depuis que tu as écrit le texte.`,
      en: `## Writing text that speaks to each visitor

In your quiz texts, anything in braces is replaced at display time by something about **the person answering**. Nothing to code: type them, or use the insert button next to the field.

## First name

\`{name}\` shows the visitor's first name.

For it to have a value, turn on **"Ask for first name"** in the editor's right column: a small screen appears before the first question.

> Well done \`{name}\`, you're one of the few who... → **Well done Sophie, you're one of the few who...**

## Score (score mode only)

- \`{score}\`: the global score, **as a percentage** (0 to 100).
- \`{label}\`: the band label, e.g. "Score 40 to 69".
- \`{score_sleep}\`: the score of the axis named Sleep, also a percentage.
- \`{label_sleep}\`: that axis's label.

So each axis gives two variables built from its name. They appear in the editor as soon as you add an axis: no need to guess the spelling, the insert button lists them.

**They also work inside the action button's URL.** That's how you send a visitor to a different page depending on their score, or pass the result to your own tool.

Worth knowing: they keep working **even when you've chosen not to display the score**. Hiding the score doesn't erase it, it just makes it invisible.

## Gender

\`{ready|ready|ready}\` shows the right form based on what the visitor picked: masculine, feminine, non-binary, in that order. In French: \`{prêt|prête|prêt·e}\`.

Turn on **"Ask for gender"** so the question gets asked. The **✨** button next to each field asks the AI to write all three variants at once, and you can edit them afterwards. If you turn gender on after writing your quiz, **"Gender the whole quiz"** sweeps every field.

In English or another ungendered language, the AI returns the same text three times: the display stays correct.

## If a variable shows up as-is

Seeing \`{score}\` on screen instead of a number? That's deliberate: an unknown variable stays visible rather than vanishing silently. Usual causes:
- a typo in the name;
- \`{score}\` on a profile-mode quiz, where it doesn't exist;
- \`{name}\` without "Ask for first name" turned on;
- an axis renamed since you wrote the text.`,
      es: `## Textos que hablan a cada visitante

Lo que va entre llaves se sustituye al mostrarse por algo de **la persona que responde**. No hay que programar nada: escríbelas o usa el botón de inserción junto al campo.

- \`{name}\`: el nombre del visitante. Requiere activar **"Pedir el nombre"** en la columna derecha del editor.
- \`{score}\`: la puntuación global, **en porcentaje** (0 a 100). Solo en modo puntuación.
- \`{label}\`: la etiqueta del tramo.
- \`{score_sueno}\` y \`{label_sueno}\`: lo mismo para el eje llamado Sueño. Cada eje da dos variables, y el editor las lista en cuanto añades un eje.
- \`{listo|lista|listo·a}\`: la forma correcta según el género indicado (masculino, femenino, no binario, en ese orden). Requiere activar **"Pedir el género"**; el botón ✨ escribe las tres variantes con IA.

Las variables de puntuación funcionan **también en la URL del botón de acción**, y siguen funcionando aunque hayas elegido no mostrar la puntuación.

**¿Ves \`{score}\` tal cual en pantalla?** Es intencionado: una variable desconocida queda visible en vez de desaparecer en silencio. Suele ser una errata, una variable de puntuación en un quiz de perfiles, o un eje renombrado.`,
      it: `## Testi che parlano a ogni visitatore

Ciò che sta tra parentesi graffe viene sostituito al momento della visualizzazione con qualcosa che riguarda **chi risponde**. Niente da programmare: scrivile o usa il pulsante di inserimento accanto al campo.

- \`{name}\`: il nome del visitatore. Richiede di attivare **"Chiedere il nome"** nella colonna destra dell'editor.
- \`{score}\`: il punteggio globale, **in percentuale** (0-100). Solo in modalità punteggio.
- \`{label}\`: l'etichetta della fascia.
- \`{score_sonno}\` e \`{label_sonno}\`: lo stesso per l'asse chiamato Sonno. Ogni asse dà due variabili, e l'editor le elenca appena aggiungi un asse.
- \`{pronto|pronta|pront*}\`: la forma giusta secondo il genere indicato (maschile, femminile, non binario, in quest'ordine). Richiede di attivare **"Chiedere il genere"**; il pulsante ✨ scrive le tre varianti con l'IA.

Le variabili di punteggio funzionano **anche nell'URL del pulsante d'azione**, e continuano a funzionare anche se hai scelto di non mostrare il punteggio.

**Vedi \`{score}\` così com'è sullo schermo?** È voluto: una variabile sconosciuta resta visibile invece di sparire in silenzio. Di solito è un refuso, una variabile di punteggio su un quiz a profili, o un asse rinominato.`,
      ar: `## نصوص تخاطب كل زائر

ما بين الأقواس المعقوفة يُستبدل عند العرض بما يخص **الشخص الذي يجيب**. لا برمجة مطلوبة: اكتبها أو استخدم زر الإدراج بجانب الحقل.

- \`{name}\`: اسم الزائر. يتطلب تفعيل **"طلب الاسم"** في العمود الأيمن من المحرر.
- \`{score}\`: النتيجة الإجمالية **بالنسبة المئوية** (من 0 إلى 100). في وضع النقاط فقط.
- \`{label}\`: تسمية الشريحة.
- \`{score_sleep}\` و\`{label_sleep}\`: الشيء نفسه للمحور المسمى Sleep. كل محور يعطي متغيّرين، والمحرر يعرضها فور إضافة محور.
- صيغة الجنس: الشكل الصحيح حسب ما اختاره الزائر (مذكر، مؤنث، غير ثنائي، بهذا الترتيب). يتطلب تفعيل **"طلب الجنس"**؛ زر ✨ يكتب الصيغ الثلاث بالذكاء الاصطناعي.

متغيّرات النتيجة تعمل **أيضًا داخل رابط زر الإجراء**، وتظل تعمل حتى لو اخترت عدم عرض النتيجة.

**ترى \`{score}\` كما هي على الشاشة؟** هذا مقصود: المتغيّر غير المعروف يبقى ظاهرًا بدل أن يختفي بصمت. السبب غالبًا خطأ إملائي، أو متغيّر نقاط في اختبار بالملفات الشخصية، أو محور أُعيدت تسميته.`,
    },
    related_slugs: ["tiquiz-create-quiz", "tiquiz-page-resultat", "tiquiz-profil-ou-score"],
    tags: ["tiquiz", "variables", "prenom", "score", "genre", "personnalisation", "placeholder"],
  },
  {
    category_slug: "tiquiz",
    slug: "tiquiz-depannage",
    sort_order: 16,
    title: {
      fr: "Ça ne marche pas : le symptôme, la cause, la solution",
      en: "It's not working: symptom, cause, fix",
      es: "No funciona: síntoma, causa, solución",
      it: "Non funziona: sintomo, causa, soluzione",
      ar: "لا يعمل: العَرَض والسبب والحل",
    },
    content: {
      fr: `## À lire en premier quand quelque chose cloche

Cette page liste les cas réels, dans l'ordre de fréquence. Cherche ton symptôme.

---

### "Mon lien de quiz affiche une page 404"

**Cause :** le quiz est en brouillon. Un quiz n'est pas en ligne tant qu'on n'a pas cliqué sur **Publier**.

**Solution :** ouvre le quiz, bouton **Publier** en haut à droite. Chaque quiz se publie séparément : si ton 2e quiz est en 404 alors que le 1er marche, c'est celui-là qui n'est pas publié. Aucune configuration technique n'est nécessaire.

---

### "L'éditeur m'affiche : ce résultat ne peut jamais être attribué"

**Cause, en mode profil :** il te manque des réponses. Une réponse ne vote que pour UN profil. Avec 4 profils et seulement 3 réponses à une question, le 4e profil ne peut pas gagner à cette question.

**Solution :** ajoute des réponses, ou clique sur **Rééquilibrer avec l'IA**, qui les rédige dans le ton de ta question. Déplacer les réponses existantes d'un profil à l'autre ne résoudra rien : ça laissera toujours un profil découvert.

**En mode score,** cette alerte ne s'affiche pas : les profils n'y décident rien, c'est la tranche de points. Si tu la vois quand même, c'est que ton quiz est en mode profil alors que tu le croyais scoré.

---

### "Une question fait décrocher tout le monde, je la corrige et rien ne change"

**Cause :** presque toujours une erreur de lecture, pas un problème de contenu. Quelqu'un qui part entre la question 6 et la 7 **n'a jamais vu la 7** : il s'est arrêté sur la 6.

**Solution :** regarde la question que Tiquiz désigne, il fait déjà ce calcul. Et vérifie combien de personnes sont concernées : en dessous d'une vingtaine sur une même question, aucune conclusion n'est solide. Une seule modification à la fois, puis 20 à 30 nouvelles réponses avant de juger.

Rappel utile : perdre du monde en route est normal et sain. Les premiers à partir sont ceux qui n'étaient pas pour toi.

---

### "J'ai choisi Liste (ou Centré) et l'écran ne change pas"

**Cause :** un alignement posé à la main dans un champ est une exception permanente, et elle bat le réglage général.

**Solution :** bouton **"Tout réaligner sur ce réglage"**. Il efface les exceptions sur les questions et dans les textes, en gardant gras, couleurs et tailles.

---

### "Le menu des tailles de police est vide"

**Cause :** un défaut d'affichage sur les boutons, où le menu s'écrivait en blanc sur blanc. Corrigé.

**Solution :** si un champ garde une taille qui ne bouge pas, clique une deuxième fois sur une taille : il se remet d'aplomb tout seul.

---

### "Le bouton Partager ne déclenche rien"

**Cause :** corrigé. Il ouvre maintenant un panneau de réseaux.

**Bon à savoir :** si tu ne coches aucun réseau dans les réglages, **tous** s'affichent. C'est voulu. Et le lien partagé est celui du profil obtenu, pas celui du quiz : c'est ça qui donne envie de le passer.

---

### "Le pourcentage s'affiche alors que j'ai tout décoché"

**Solution :** le réglage s'appelle **Affichage du score** et vaut pourcentage, libellé, ou **rien**. Choisis "rien" : le score global et les barres d'axes disparaissent. Les axes continuent d'alimenter tes variables de texte et tes tags Systeme.io.

---

### "Je n'arrive pas à supprimer un projet"

**Cause :** ce quiz sert de question dans un popquiz vidéo. Le supprimer casserait la vidéo.

**Solution :** l'app te nomme les vidéos concernées. Retire le quiz de ces vidéos, puis supprime-le.

---

### "Mon automatisation Systeme.io ne part pas quand je teste"

**Cause :** Systeme.io ne redéclenche pas une règle si le tag est déjà sur le contact.

**Solution :** avant chaque nouveau test avec le même email, va dans Systeme.io > Contacts, ouvre ton contact de test, et **retire le tag à la main**. Sinon le contact est bien mis à jour, mais rien ne part, et tu crois que c'est cassé.

---

### "Mon domaine personnalisé reste en attente"

**Cause :** le DNS n'a pas encore fait le tour du monde. Ça prend de quelques minutes à quelques heures, et ça ne dépend pas de Tiquiz.

**Solution :** reviens plus tard et clique sur **Vérifier**. Si ça échoue vraiment, cherche un enregistrement déjà existant sur le même nom, qui entre en conflit avec le nouveau.

---

### "Mon Atelier du Quiz est relié au mauvais compte"

**Cause :** la connexion entre l'Atelier et ton espace quiz se fait une fois, en autorisant l'accès. Si tu étais connectée à un autre compte ce jour-là, c'est celui-là qui est relié.

**Solution :** dans l'Atelier, ton profil, onglet **Connexion**, refais la liaison en étant connectée au bon compte Tiquiz dans le même navigateur.

---

### "Une variable s'affiche telle quelle, genre {score}"

**Cause :** c'est voulu. Une variable inconnue reste visible au lieu de disparaître en silence.

**Solution :** vérifie l'orthographe, le mode du quiz ({score} n'existe qu'en mode score), et que l'axe cité existe toujours sous ce nom.

---

### Rien de tout ça ?

Décris ce que tu voyais à l'écran et ce que tu attendais à la place : c'est la paire d'informations qui fait gagner le plus de temps.`,
      en: `## Read this first when something is off

Real cases, most frequent first. Find your symptom.

---

### "My quiz link shows a 404"

**Cause:** the quiz is a draft. It isn't live until you click **Publish**.

**Fix:** open the quiz, **Publish** button top right. Each quiz is published separately: if your 2nd quiz 404s while the 1st works, that one isn't published. No technical setup needed.

---

### "The editor says: this result can never be awarded"

**Cause, in profile mode:** you're short of answers. One answer votes for ONE profile. With 4 profiles and only 3 answers on a question, the 4th cannot win there.

**Fix:** add answers, or click **Rebalance with AI**, which writes them in your question's tone. Moving existing answers between profiles fixes nothing: some profile stays uncovered.

**In score mode** this alert doesn't appear: profiles decide nothing there. If you see it anyway, your quiz is in profile mode when you thought it was scored.

---

### "One question loses everyone, I fix it and nothing changes"

**Cause:** almost always a reading error, not a content problem. Someone leaving between question 6 and 7 **never saw 7**: they stopped on 6.

**Fix:** look at the question Tiquiz names, it already does that maths. And check how many people are involved: under about twenty on the same question, no conclusion holds. One change at a time, then 20 to 30 fresh responses before judging.

Worth repeating: losing people along the way is normal and healthy. The first to leave were not for you.

---

### "I chose List (or Centre) and the screen doesn't change"

**Cause:** alignment set by hand inside a field is a permanent exception, and it outranks the general setting.

**Fix:** the **"Realign everything on this setting"** button. It clears exceptions on questions and inside texts, keeping bold, colours and sizes.

---

### "The font-size menu is empty"

**Cause:** a display defect on buttons, where the menu rendered white on white. Fixed.

**Fix:** if a field keeps a size that won't move, click a size a second time: it repairs itself.

---

### "The Share button does nothing"

**Cause:** fixed. It now opens a panel of networks.

**Worth knowing:** if you tick no network in the settings, **all** of them show. That's deliberate. And the shared link points at the result they got, not the quiz.

---

### "The percentage shows even though I unticked everything"

**Fix:** the setting is **Score display** and it takes percentage, label, or **nothing**. Pick "nothing": the global score and axis bars disappear. Axes keep feeding your text variables and Systeme.io tags.

---

### "I can't delete a project"

**Cause:** that quiz is used as a question inside a video popquiz. Deleting it would break the video.

**Fix:** the app names the videos involved. Remove the quiz from them, then delete it.

---

### "My Systeme.io automation doesn't fire when I test"

**Cause:** Systeme.io won't re-trigger a rule if the tag is already on the contact.

**Fix:** before each new test with the same email, go to Systeme.io > Contacts, open your test contact, and **remove the tag by hand**.

---

### "My custom domain stays pending"

**Cause:** DNS hasn't propagated yet. Minutes to hours, and it doesn't depend on Tiquiz.

**Fix:** come back later and hit **Verify**. If it truly fails, look for an existing record on the same name conflicting with the new one.

---

### "A variable shows up as-is, like {score}"

**Cause:** deliberate. An unknown variable stays visible instead of vanishing silently.

**Fix:** check the spelling, the quiz mode ({score} only exists in score mode), and that the axis still exists under that name.

---

### None of these?

Describe what you saw on screen and what you expected instead: that pair saves the most time.`,
      es: `## Léelo primero cuando algo falla

- **"Mi enlace da 404":** el quiz está en borrador. Ábrelo y pulsa **Publicar**. Cada quiz se publica por separado.
- **"Este resultado nunca puede asignarse":** en modo perfiles, faltan respuestas (una respuesta vota por un solo perfil). Añade respuestas o usa **Reequilibrar con IA**. En modo puntuación esta alerta no aparece.
- **"Una pregunta pierde a todos y corregirla no cambia nada":** quien abandona entre la 6 y la 7 nunca vio la 7, se detuvo en la 6. Mira la pregunta que Tiquiz señala, y espera unas veinte personas antes de concluir. Un solo cambio cada vez.
- **"He elegido Lista o Centrado y no cambia":** una alineación puesta a mano es una excepción permanente. Usa **"Realinear todo con este ajuste"**.
- **"El botón Compartir no hace nada":** corregido, ahora abre un panel de redes. Sin ninguna casilla marcada se muestran todas.
- **"Se ve el porcentaje aunque lo desmarqué":** el ajuste "Mostrar la puntuación" acepta porcentaje, etiqueta o **nada**.
- **"No puedo borrar un proyecto":** ese quiz se usa en un popquiz de vídeo. La app te dice cuáles.
- **"Mi automatización de Systeme.io no se dispara al probar":** Systeme.io no reactiva una regla si el tag ya está en el contacto. Quítalo a mano antes de cada prueba.
- **"Mi dominio sigue pendiente":** es el DNS propagándose. Vuelve más tarde y pulsa **Verificar**.
- **"Veo {score} tal cual":** es intencionado. Revisa la ortografía, el modo del quiz y el nombre del eje.`,
      it: `## Da leggere per primo quando qualcosa non va

- **"Il mio link dà 404":** il quiz è in bozza. Aprilo e clicca **Pubblica**. Ogni quiz si pubblica separatamente.
- **"Questo risultato non può mai essere assegnato":** in modalità profili mancano risposte (una risposta vota un solo profilo). Aggiungi risposte o usa **Riequilibra con l'IA**. In modalità punteggio questo avviso non compare.
- **"Una domanda perde tutti e correggerla non cambia nulla":** chi abbandona tra la 6 e la 7 non ha mai visto la 7, si è fermato sulla 6. Guarda la domanda che Tiquiz indica, e aspetta una ventina di persone prima di concludere. Una sola modifica alla volta.
- **"Ho scelto Elenco o Centrato e non cambia":** un allineamento messo a mano è un'eccezione permanente. Usa **"Riallinea tutto su questa impostazione"**.
- **"Il pulsante Condividi non fa nulla":** corretto, ora apre un pannello di social. Senza nessuna casella spuntata si mostrano tutti.
- **"Si vede la percentuale anche se ho tolto tutto":** l'impostazione "Mostrare il punteggio" accetta percentuale, etichetta o **niente**.
- **"Non riesco a eliminare un progetto":** quel quiz è usato in un popquiz video. L'app ti dice quali.
- **"La mia automazione Systeme.io non parte quando provo":** Systeme.io non riattiva una regola se il tag è già sul contatto. Toglilo a mano prima di ogni prova.
- **"Il mio dominio resta in attesa":** è il DNS che si propaga. Torna più tardi e clicca **Verifica**.
- **"Vedo {score} così com'è":** è voluto. Controlla l'ortografia, la modalità del quiz e il nome dell'asse.`,
      ar: `## اقرأ هذا أولًا حين يعطل شيء ما

- **"رابط اختباري يعرض 404":** الاختبار مسودة. افتحه واضغط **نشر**. كل اختبار يُنشر على حدة.
- **"هذه النتيجة لا يمكن منحها أبدًا":** في وضع الملفات تنقصك إجابات (كل إجابة تصوّت لملف واحد). أضف إجابات أو استخدم **إعادة التوازن بالذكاء الاصطناعي**. في وضع النقاط لا يظهر هذا التنبيه.
- **"سؤال يفقدني الجميع، وتصحيحه لا يغيّر شيئًا":** من يغادر بين السؤال 6 و7 لم يرَ السؤال 7 قط، بل توقف عند 6. انظر إلى السؤال الذي يحدده Tiquiz، وانتظر نحو عشرين شخصًا قبل الاستنتاج. تعديل واحد في كل مرة.
- **"اخترت قائمة أو توسيط ولا يتغير شيء":** المحاذاة اليدوية استثناء دائم. استخدم **"إعادة محاذاة كل شيء على هذا الإعداد"**.
- **"زر المشاركة لا يفعل شيئًا":** أُصلح، وهو الآن يفتح لوحة شبكات. وبلا أي تحديد تظهر كلها.
- **"النسبة تظهر رغم إلغاء التحديد":** إعداد "عرض النتيجة" يقبل النسبة أو التسمية أو **لا شيء**.
- **"لا أستطيع حذف مشروع":** هذا الاختبار مستخدم في بوب كويز فيديو. التطبيق يسمّي الفيديوهات.
- **"أتمتة Systeme.io لا تنطلق عند الاختبار":** لا يعيد Systeme.io تشغيل قاعدة إذا كان الوسم موجودًا على جهة الاتصال. أزله يدويًا قبل كل تجربة.
- **"نطاقي ما زال قيد الانتظار":** إنه انتشار DNS. عد لاحقًا واضغط **تحقق**.
- **"أرى ‎{score}‎ كما هي":** هذا مقصود. تحقق من الإملاء ووضع الاختبار واسم المحور.`,
    },
    related_slugs: ["tiquiz-profil-ou-score", "tiquiz-stats", "tiquiz-mise-en-page"],
    tags: ["tiquiz", "probleme", "bug", "404", "depannage", "erreur", "aide"],
  },
];
