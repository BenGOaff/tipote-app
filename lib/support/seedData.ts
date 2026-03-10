// lib/support/seedData.ts
// Comprehensive help center content — 10 categories, 60+ articles
// Each article has FR/EN/ES/IT/AR translations

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
- Vos objectifs à 90 jours
- Votre positionnement et différenciation

Chaque contenu généré est **réellement personnalisé** pour votre business.

### Les grandes fonctionnalités

1. **Onboarding intelligent** — Un questionnaire complet qui crée votre profil business
2. **Plan stratégique IA** — Un plan d'action 30/60/90 jours avec pyramide d'offres
3. **Création de contenu IA** — Posts, emails, articles, vidéos, quiz, pages et plus
4. **Publication directe** — Publiez sur LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok et Pinterest en un clic
5. **Automatisations** — Auto-commentaires, comment-to-DM, comment-to-email
6. **Pages & Quiz** — Créez des landing pages et des quiz lead magnet hébergés
7. **Gestion des leads** — Centralisez et exportez vos prospects (chiffrement AES-256)
8. **Analytics IA** — Suivez vos KPIs et recevez un diagnostic business

### Disponible en 5 langues

Tipote fonctionne en Français, English, Español, Italiano et العربية.

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
- Your 90-day goals
- Your positioning and differentiation

Every generated content is **truly personalized** for your business.

### Main features

1. **Smart onboarding** — A complete questionnaire that creates your business profile
2. **AI strategic plan** — A 30/60/90-day action plan with offer pyramid
3. **AI content creation** — Posts, emails, articles, videos, quizzes, pages and more
4. **Direct publishing** — Publish on LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok and Pinterest in one click
5. **Automations** — Auto-comments, comment-to-DM, comment-to-email
6. **Pages & Quizzes** — Create hosted landing pages and lead magnet quizzes
7. **Lead management** — Centralize and export your prospects (AES-256 encryption)
8. **AI Analytics** — Track your KPIs and get a business diagnosis

### Available in 5 languages

Tipote works in Français, English, Español, Italiano and العربية.

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

1. **Onboarding inteligente** — Cuestionario completo que crea tu perfil
2. **Plan estratégico IA** — Plan de acción 30/60/90 días
3. **Creación de contenido IA** — Posts, emails, artículos, vídeos y más
4. **Publicación directa** — Publica en 7 redes sociales en un clic
5. **Automatizaciones** — Auto-comentarios, comment-to-DM
6. **Páginas y Quiz** — Landing pages y quizzes alojados
7. **Gestión de leads** — Centraliza y exporta tus prospectos
8. **Analytics IA** — KPIs y diagnóstico de negocio

> **Siguiente paso:** [Crear tu cuenta y completar el onboarding](/support/article/create-account)`,
      it: `## Tipote, il tuo amico di business

Tipote® è un'applicazione web SaaS tutto-in-uno progettata per imprenditori che vogliono **strutturare il loro business e creare contenuti personalizzati con l'IA**.

### Le funzionalità principali

1. **Onboarding intelligente** — Questionario completo che crea il tuo profilo
2. **Piano strategico IA** — Piano d'azione 30/60/90 giorni
3. **Creazione contenuti IA** — Post, email, articoli, video e altro
4. **Pubblicazione diretta** — Pubblica su 7 social network in un clic
5. **Automazioni** — Auto-commenti, comment-to-DM
6. **Pagine e Quiz** — Landing page e quiz lead magnet ospitati
7. **Gestione lead** — Centralizza e esporta i tuoi contatti
8. **Analytics IA** — KPI e diagnosi di business

> **Prossimo passo:** [Crea il tuo account e completa l'onboarding](/support/article/create-account)`,
      ar: `## Tipote، رفيقك في الأعمال

Tipote® هو تطبيق ويب SaaS متكامل مصمم لرواد الأعمال الذين يريدون **هيكلة أعمالهم وإنشاء محتوى مخصص باستخدام الذكاء الاصطناعي**.

### الميزات الرئيسية

1. **إعداد ذكي** — استبيان كامل ينشئ ملفك التجاري
2. **خطة استراتيجية بالذكاء الاصطناعي** — خطة عمل 30/60/90 يومًا
3. **إنشاء محتوى بالذكاء الاصطناعي** — منشورات ورسائل ومقالات وفيديوهات
4. **نشر مباشر** — انشر على 7 شبكات اجتماعية بنقرة واحدة
5. **أتمتة** — تعليقات تلقائية
6. **صفحات واختبارات** — صفحات هبوط واختبارات مستضافة
7. **إدارة العملاء المحتملين** — مركزة وتصدير العملاء المحتملين
8. **تحليلات بالذكاء الاصطناعي** — مؤشرات الأداء وتشخيص الأعمال`,
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
4. **Générer un plan d'action 30/60/90 jours** avec des tâches concrètes

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
4. **Generate a 30/60/90-day action plan** with concrete tasks

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
5. ✅ Générer un **plan d'action 30/60/90 jours**
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

Tipote processes your answers with **strategic AI (GPT)** to create your persona, business diagnosis, offer pyramid, and 30/60/90-day action plan.

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

1. **Priority action banner** — Your next recommended action with quick action buttons
2. **Key stats** (4 cards) — Published content, completed tasks, engagement, next deadline
3. **Week progress** — Progress bars for weekly goals
4. **Quick actions** — Fast access to content creation, content list, and strategy
5. **Coming this week** — List of scheduled content

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
- **Today** — Dashboard with stats and next action
- **My Strategy** — Action plan, offer pyramid, persona
- **Create** — Creation hub (8 content types)
- **My Content** — List + editorial calendar
- **Templates** — Systeme.io templates
- **Automations** — Auto-comments and webhooks
- **My Leads** — Prospect management

### Secondary menu
- **Analytics** — KPIs + AI diagnosis
- **Insights** — Business insights
- **Settings** — 7 configuration tabs

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

1. **Bienvenue** — Modal d'introduction avec 4 étapes prévisualisées
2. **Tour Aujourd'hui** — Découverte du dashboard
3. **Tour Stratégie** — Plan d'action et pyramide
4. **Tour Créer** — Hub de création
5. **Tour Contenus** — Liste et calendrier
6. **Tour Templates** — Bibliothèque de templates
7. **Tour Crédits** — Comprendre les crédits IA
8. **Tour Analytics** — Suivi des performances
9. **Tour Pépites** — Les insights business
10. **Tour Paramètres Profil** — Configuration du profil
11. **Tour Connexions** — Connecter les réseaux sociaux
12. **Tour Réglages** — Email, mot de passe, langue
13. **Tour Positionnement** — Analyse concurrentielle
14. **Tour Branding** — Identité visuelle
15. **Tour IA** — Gestion des crédits et paramètres IA
16. **Tour Abonnement** — Plans et facturation
17. **Tour Coach** — Le coach IA
18. **Complétion** — Félicitations et prochaines étapes

### Fonctionnement UX

- **Tooltips** avec compteur d'étapes (ex: "3 / 18")
- **Spotlight** sur l'élément ciblé (le reste est assombri)
- **Opt-out** possible via un lien discret en bas du tooltip
- **Fenêtre de 7 jours** — Le tutoriel n'apparaît que pendant vos 7 premiers jours

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

Tipote est disponible en **5 langues** : Français, English, Español, Italiano et العربية.

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

Tipote is available in **5 languages**: Français, English, Español, Italiano and العربية.

### From Settings
Go to **Settings > General** and select your preferred language.

### From the sidebar
Use the **language switcher** at the bottom of the sidebar.

### Interface language vs content language
These are **independent** settings. You can use Tipote in French but generate content in English!

> **See also:** [Settings overview](/support/article/settings-overview)`,
      es: `## Cambia el idioma en 2 clics

Tipote está disponible en 5 idiomas. Ve a **Configuración > Ajustes** o usa el selector en la barra lateral.`,
      it: `## Cambia lingua in 2 clic

Tipote è disponibile in 5 lingue. Vai in **Impostazioni > Impostazioni** o usa il selettore nella sidebar.`,
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

1. **Situation Initiale** — Où étiez-vous avant ? Quel était votre quotidien ?
2. **Élément Déclencheur** — Qu'est-ce qui a tout changé ? Le déclic ?
3. **Péripéties** — Les obstacles rencontrés, les essais, les erreurs
4. **Moment Critique** — Le point de bascule, la plus grande difficulté
5. **Résolution** — Comment vous avez surmonté et trouvé la solution
6. **Situation Finale** — Où vous en êtes aujourd'hui et votre mission

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

#### Phase 1 — Fondations (Jours 1-30)
Mise en place des bases : profil optimisé, premiers contenus, audience initiale.

#### Phase 2 — Croissance (Jours 31-60)
Accélération : plus de contenu, premières offres, nurturing.

#### Phase 3 — Scale (Jours 61-90)
Optimisation et montée en puissance : automatisations, conversion, scaling.

### Les tâches

Chaque phase contient des **tâches cochables** concrètes. Quand vous cochez une tâche :
- La **barre de progression** de la phase se met à jour
- Les **stats du dashboard** se recalculent en temps réel
- La **prochaine action recommandée** est mise à jour

### Header de la page Stratégie

3 badges vous donnent une vue rapide :
- 💰 **Objectif Revenue** — votre objectif financier à 90 jours
- ⏳ **Horizon** — jours restants
- 📊 **Progression** — pourcentage global d'avancement

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

- **Profil démographique** — Âge, profession, situation
- **Problèmes principaux** — Les frustrations et douleurs de votre cible
- **Objectifs** — Ce qu'ils veulent accomplir
- **Objections** — Ce qui les empêche d'acheter
- **Vocabulaire** — Les mots et expressions qu'ils utilisent
- **Canaux préférés** — Où ils consomment du contenu

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
3. **Cliquez sur "Générer"** — L'IA (Claude) crée le contenu
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

- **Plateforme cible** — Choisissez : LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok ou Pinterest
- **Sujet** — De quoi parle le post (l'IA s'adapte à la plateforme)
- **Tonalité** — Pré-remplie depuis vos paramètres
- **Longueur** — Court, moyen ou long

### Étape 3 : Générez

Cliquez sur **"Générer"**. L'IA Claude crée un post optimisé pour la plateforme choisie (hashtags, format, longueur adaptée).

### Étape 4 : Enrichissez

- 📸 **Ajoutez une image** (upload depuis votre appareil)
- 🎬 **Ajoutez une vidéo** (pour Instagram Reels, TikTok, Facebook)
- 💬 **Auto-commentaire** — Programmez un commentaire automatique sous votre post (plan Basic+)

### Options Pinterest spécifiques
- Sélection du **board** Pinterest
- Ajout d'un **lien** vers votre site

### Étape 5 : Publiez ou planifiez

- **Publier maintenant** — Publication directe via OAuth
- **Planifier** — Choisissez date et heure (calendrier éditorial)
- **Sauvegarder en brouillon** — Pour y revenir plus tard

### Modifier un post programmé

Allez dans **Mes Contenus** (vue calendrier ou liste), cliquez sur le post → vous êtes redirigé vers l'éditeur avec tout pré-rempli (texte, images, vidéos, auto-commentaire).

> **Voir aussi :** [Connecter vos réseaux](/support/article/connect-social-networks) • [Le calendrier éditorial](/support/article/editorial-calendar) • [Les auto-commentaires](/support/article/auto-comments)`,
      en: `## Publish on 7 networks in one click

1. Go to **Create > Post**
2. Choose platform (LinkedIn, Facebook, Instagram, Threads, Twitter/X, TikTok, Pinterest)
3. Set topic, tone, length
4. Click **Generate** — AI creates an optimized post
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

- **Newsletter** — Actualités, valeur, engagement
- **Séquence de bienvenue** — Onboarding de vos nouveaux abonnés
- **Email de vente** — Promotion d'une offre
- **Séquence de nurturing** — Éducation progressive

### Comment créer ?

1. **Créer > Email**
2. Choisissez le **type** d'email
3. Indiquez le **sujet** et le **contexte**
4. **Générez** — L'IA crée l'email avec objet, corps et CTA
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
4. **Générez** — L'IA crée un article complet avec titres, sous-titres, introduction et conclusion
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

- **YouTube** — Scripts longs avec chapitres
- **Reels / TikTok** — Scripts courts et percutants
- **Stories** — Scripts de stories séquentielles

### Comment créer ?

1. **Créer > Vidéo**
2. Choisissez le **format** et la **plateforme**
3. Indiquez le **sujet** et l'**angle**
4. **Générez** — L'IA crée un script structuré avec intro hook, développement et CTA
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
3. **Générez** — L'IA crée un descriptif complet avec headline, bénéfices, preuves sociales, prix et CTA
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
3. **Générez** — L'IA crée le copywriting complet du funnel :
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

- 🟢 **Publié** — Déjà publié sur un réseau
- 🔵 **Planifié** — Programmé pour une date future
- ⚪ **Brouillon** — Sauvegardé mais non planifié

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
5. Vous êtes redirigé vers Tipote — le réseau est maintenant **connecté** ✅

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
Cliquez sur **"Publier"** — Le post est envoyé immédiatement sur le réseau connecté. Vous recevez une **notification** de confirmation avec le lien vers le post publié.

### 2. Planifier
Cliquez sur **"Planifier"** — Choisissez une **date et heure** de publication. Le post apparaît dans votre **calendrier éditorial** avec le statut "Planifié". Tipote publie automatiquement à l'heure prévue.

### 3. Sauvegarder en brouillon
Cliquez sur **"Sauvegarder"** — Le post est sauvegardé dans **Mes Contenus** avec le statut "Brouillon". Vous pourrez y revenir, le modifier et le publier plus tard.

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
| 💰 **Page de vente** | Vendre un produit/service | "Formation XYZ — 297€" |
| 🏪 **Site vitrine** | Présenter votre activité | "Découvrez mon expertise" |

### Fonctionnalités de l'éditeur

- **Prévisualisation multi-device** — Mobile, tablette, desktop
- **Édition de texte inline** — Cliquez et modifiez directement
- **Sélecteur de couleurs** — Personnalisez chaque élément
- **Upload d'illustrations** — Ajoutez vos visuels
- **Chat IA** — Demandez à l'IA de modifier la page par conversation
- **OG Image** — Uploadez l'image de partage social
- **Meta description** — Pour le SEO
- **Tracking pixels** — Facebook Pixel et Google Tag Manager
- **URL de paiement** — Lien vers votre page de paiement (Systeme.io, Stripe...)
- **Mentions légales** — Auto-générées

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
    related_slugs: ["create-quiz", "manage-leads", "branding-settings"],
    tags: ["page", "landing", "sales", "capture", "builder"],
  },
  {
    category_slug: "pages-quiz",
    slug: "create-quiz",
    sort_order: 2,
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

- 📊 **Total leads** — Nombre total
- ❓ **Leads quiz** — Provenant des quiz
- 🔄 **Exportés Systeme.io** — Synchronisés
- 📅 **Ce mois-ci** — Nouveaux ce mois

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
- **Tags de capture** — Ajoutez des tags spécifiques par quiz/page
- **Synchronisation automatique** — Les nouveaux leads sont envoyés automatiquement
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
- **Itération IA** — Demandez à l'IA de modifier le contenu
- **Reformulation** — Adaptez le texte à votre tonalité
- **Personnalisation** — Le contenu est adapté à votre profil business

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
| **Prix/an** | — | 190€ | 490€ | 990€ |
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

#### 💙 Basic — 19€/mois
- **40 crédits/mois** (renouvelés automatiquement)
- Auto-commentaires débloqués
- Parfait pour les **débutants** qui publient régulièrement

#### ⭐ Pro — 49€/mois (Populaire)
- **150 crédits/mois**
- **Coach IA** inclus (conversations illimitées)
- Idéal pour les **entrepreneurs actifs** qui produisent beaucoup de contenu

#### 💎 Elite — 99€/mois
- **500 crédits/mois**
- **Multi-projets** — Gérez plusieurs business depuis un compte
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

- **Pas d'expiration** — Les crédits achetés ne périment pas
- **Cumulables** — Ils s'ajoutent à votre solde existant
- **Consommation FIFO** — Les crédits mensuels sont utilisés en premier, puis les crédits achetés

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

- 👥 **Visiteurs en temps réel** — "15 personnes consultent cette page"
- ✅ **Inscriptions récentes** — "Marie vient de s'inscrire"
- 💰 **Achats récents** — "Thomas vient d'acheter"
- 📢 **Messages personnalisés** — "Plus que 3 places disponibles"

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

- **Inline** — Intégré dans le flux de la page
- **Floating left/right** — Barre flottante sur le côté
- **Bottom bar** — Barre fixe en bas de page

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
];
