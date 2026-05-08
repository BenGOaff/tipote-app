# Brief produit Tipote — pour génération de contenu de vente

> Ce document est destiné à un agent IA qui doit produire des landing pages, séquences emails, posts sociaux, scripts vidéo, ads ou pages de vente pour Tipote. Il est rédigé pour être consommé directement par une IA générative — structuré, factuel, sans verbiage.
>
> Pour la documentation technique destinée aux développeurs : voir `CAHIER_DES_CHARGES.md` (ce dossier) et `docs/INVARIANTS.md`.

---

## 1. Identité

- **Nom du produit** : Tipote (avec ®)
- **Domaine principal** : app.tipote.com
- **Tagline courte** : « Le pote de business des entrepreneurs »
- **Pitch en une phrase** : Tipote est l'assistant IA qui mémorise ton business, ta cible et tes objectifs pour bâtir ta stratégie, créer tes contenus et les publier directement sur tes réseaux sociaux — sans repartir de zéro à chaque fois.
- **Pitch en trois phrases** : Les outils IA génériques (ChatGPT, Claude, etc.) sont amnésiques : tu redonnes ton contexte à chaque conversation, et le résultat reste lisse et interchangeable. Tipote mémorise une fois pour toutes ton profil business, ton audience, tes offres, ton storytelling, et s'en sert pour tout générer en cohérence avec TA stratégie. Et il publie pour toi sur LinkedIn, Facebook, Instagram, Threads, X, TikTok, Pinterest — pas de copier-coller.

## 2. Public cible

### 2.1. Cible principale (persona prioritaire)

- **Solopreneur ou micro-entrepreneur francophone** (FR / BE / CH / CA), 30-55 ans
- Vend des **prestations de service** (coaching, conseil, accompagnement) ou des **produits digitaux** (formations, ebooks, programmes en ligne)
- Niveau technique : **non-tech** ou tech-curieux. N'a pas envie de manipuler des prompts, des intégrations Zapier, des workflows complexes
- Niveau marketing : **a fait quelques essais**, suit des formateurs, mais n'a pas de stratégie cohérente. Souvent hésite entre 3-4 offres, 2-3 plateformes, et n'a pas de plan
- Statistiques produit (issues d'études Tipote) :
  - 51 % n'ont pas encore fait leur première vente
  - 46 % passent trop de temps sur la création de contenu
  - 52 % trouvent l'IA générique trop passe-partout pour eux

### 2.2. Cibles secondaires

- **Coachs / consultants déjà en activité** qui veulent industrialiser leur communication sans perdre leur voix
- **Affiliés Systeme.io** (Tipote est white-label disponible chez Systeme.io) qui veulent un outil intégré à leur écosystème existant
- **Petites équipes (2-5 personnes)** dans le marketing / content : plan Elite multi-projets

### 2.3. Anti-cible (à NE PAS adresser dans la com)

- Grandes entreprises avec une équipe marketing dédiée
- Agences (qui revendraient à leurs clients — outil pas pensé pour ça)
- Développeurs / makers tech qui veulent un terrain de jeu IA (Tipote est volontairement opinionated, pas un sandbox)

## 3. Promesse principale

**« Tu n'as plus besoin de réfléchir à QUOI publier, NI à QUAND, NI à COMMENT. »**

Variations à utiliser selon le canal :
- *(Email/landing)* : « Une stratégie qui ne change pas de cap chaque semaine. Du contenu qui te ressemble. Une publication qui se fait toute seule. »
- *(Ads court)* : « L'IA qui se souvient de ton business. »
- *(Social)* : « Tu mets ton business dedans une fois, Tipote bosse pour toi tous les jours. »

## 4. Pain points résolus (à mentionner dans la copy)

| Pain | Ressenti par le prospect | Réponse Tipote |
|---|---|---|
| « J'ai pas de stratégie, je publie au feeling » | Anxiété, sentiment d'éparpillement | Plan stratégique en 3 phases (Fondations, Croissance, Scaling) généré automatiquement après l'onboarding, mis à jour en live quand le profil change |
| « Je passe 2h à écrire un post LinkedIn » | Frustration, procrastination | Génération de posts/emails/articles/scripts en moins de 30s, à partir d'un brief de 10 mots ou d'une offre existante |
| « ChatGPT sort toujours le même style passe-partout » | Démotivation, abandon | La mémoire Tipote (profil + persona + storytelling + ton de voix) est injectée dans CHAQUE prompt → résultats personnalisés |
| « Je sais pas QUAND publier ni À QUEL RYTHME » | Inertie | Calendrier éditorial avec planification automatique sur les meilleurs créneaux par plateforme |
| « Je connecte Zapier / Make / Buffer et ça plante tous les 2 mois » | Fatigue technique | Publication directe via OAuth officiel sur les 7 réseaux, sans intermédiaire |
| « J'ai des leads quelque part dans Systeme.io mais je sais pas qui c'est ni d'où ils viennent » | Opacité | Tableau leads centralisé, taggés par source (quiz, page de capture, popquiz…), avec sync auto vers Systeme.io |
| « Ma stratégie devient obsolète après 2 mois » | Pas mesurable, pas actualisé | Flag « stratégie à jour ? » + bouton « Recalculer » qui re-génère tout en tenant compte des dernières infos profil/stats |

## 5. Différenciateurs (à mettre en avant vs concurrents)

### vs ChatGPT / Claude / Gemini (IA généralistes)
- **Mémoire persistante structurée** vs amnésie + redéfinir le contexte à chaque chat
- **Output cohérent dans le temps** : tes posts d'aujourd'hui restent dans la lignée de ton storytelling de la semaine dernière
- **Publication directe** : Tipote publie sur tes réseaux, ChatGPT ne fait pas

### vs Buffer / Hootsuite / Later (planners de réseaux sociaux)
- Tipote **génère** le contenu, pas seulement le programmer
- Tipote a **une stratégie** derrière : pas juste « publier 3 fois par semaine » mais « publier sur cet axe parce qu'on est en phase Fondations de ton plan »
- Tipote intègre **leads + clients + Systeme.io** dans le même outil

### vs Notion AI / Jasper / Copy.ai (générateurs de contenu)
- Tipote est **opinionated** : il ne te demande pas de choisir entre 50 templates, il sait ce que tu dois publier
- Tipote **publie** sur tes réseaux, pas juste un copier-coller
- Tipote gère **le post-clic** : capture leads, automatisations Systeme.io, suivi des clients

### vs Systeme.io (la plateforme tout-en-un)
- Tipote n'est PAS un concurrent — c'est un **complément**. Tipote pousse les leads vers Systeme.io via webhooks officiels
- Tipote est **disponible en white-label DANS Systeme.io** : un user Systeme.io peut activer Tipote en un clic depuis sa marketplace
- Tipote apporte la couche stratégie + génération + publication réseaux que Systeme.io n'a pas

## 6. Workflow utilisateur (storytelling produit)

### Jour 1 — Onboarding
1. L'user se connecte (Google / email magic-link)
2. Onboarding type Typeform de 10-15 minutes : niche, mission, audience cible, offres existantes, objectif de revenu mensuel, blocage principal, temps disponible par semaine
3. Tipote génère **automatiquement** : un persona client, une « storytelling » de marque (axes narratifs), un plan d'action en 3 phases (Fondations, Croissance, Scaling) — sans durée fixe, chaque phase dure le temps nécessaire à atteindre ses jalons —, une pyramide d'offres si l'user n'en a pas, et 30+ tâches concrètes à cocher

### Jour 1 (suite) — Première création
1. L'user va sur `/create`
2. Choix : Post réseau social / Email / Article / Script vidéo / Page de capture / Quiz / Popquiz vidéo / Stratégie de contenu
3. Tipote pose 3-5 questions ciblées (objectif, plateforme, ton, offre liée si pertinent)
4. Génération en 20-30 secondes via streaming
5. L'user édite inline, ajuste avec le coach IA si besoin
6. Publication directe (LinkedIn / FB / IG / Threads / X / TikTok / Pinterest) — un clic ou programmé

### Semaine 2 — Capture de leads
1. L'user crée un quiz lead-magnet (ou un popquiz vidéo)
2. Le partage : URL courte, embed iframe pour son site, partage social
3. À chaque lead capturé : tag automatique dans Systeme.io, déclenchement de campagnes email
4. Tipote affiche les 10 premiers leads sur le plan free, les suivants débloqués en payant

### Mois 2 — Automatisation
1. L'user active les auto-commentaires (un commentaire IA personnalisé sur chaque post LinkedIn de leurs prospects)
2. L'user configure comment-to-DM ou comment-to-email (« commente "MOI" sous ce post pour recevoir le guide »)
3. Tipote détecte les commentaires, envoie un DM ou email avec le bon contenu, tagge le contact dans Systeme.io

### Mois 3 — Pilotage
1. L'user regarde l'analytics : quels posts ont performé, taux de conversion par offre, comparaison période
2. Coach IA répond aux questions stratégiques contextuellement
3. Quand le profil/diag change, bandeau « Tes infos ont changé » → bouton « Recalculer ma stratégie »
4. La stratégie évolue avec le business

## 7. Catalogue de fonctionnalités (organisé par bénéfice)

### 7.1. Stratégie
- **Plan 90 jours** auto-généré, en 3 phases (Fondations → Croissance → Scale)
- **Persona client** détaillé avec douleurs / désirs / canaux
- **Storytelling de marque** : axes narratifs, message clé, mission
- **Pyramide d'offres** générée par IA (lead magnet → low ticket → middle ticket → high ticket) ou import des offres existantes
- **Tâches actionnables** synchronisées avec le calendrier
- **Recalcul live** quand les infos profil ou stats évoluent

### 7.2. Génération de contenus
- **Posts réseaux sociaux** (LinkedIn, FB, IG, Threads, X, TikTok, Pinterest) — adaptés au format de chaque plateforme
- **Emails marketing** (séquences d'onboarding, newsletters, promos)
- **Articles de blog** (longs, structurés, SEO-aware)
- **Scripts vidéo** (TikTok, Reels, YouTube short)
- **Offres** (page produit, promesse, deliverables, tarification)
- **Pages** (capture, vente, vitrine, link-in-bio) via constructeur visuel
- **Quiz lead-magnet** (avec capture, résultats personnalisés, tags Systeme.io)
- **Popquiz vidéo** (vidéo + quiz incrustés à des timestamps précis, embeddable)
- **Stratégie éditoriale** (calendrier 7/14/30 jours)

### 7.3. Publication & Automatisations
- **Publication directe** sur 7 réseaux (LinkedIn, FB, IG, Threads, X, TikTok, Pinterest) via OAuth officiel
- **Programmation** sur le calendrier éditorial
- **Auto-commentaires** (commentaire IA personnalisé sur les posts de prospects)
- **Comment-to-DM** : déclencheur sur un mot-clé en commentaire → envoi DM
- **Comment-to-email** : idem mais email via Systeme.io

### 7.4. Captation & relation client
- **Quiz** : ultra simple à créer, capture email + tags, viralité (étape de partage), résultats personnalisés avec CTA
- **Popquiz vidéo** (Mai 2026) : vidéo YouTube/Vimeo/upload (jusqu'à 2 GB) avec quiz incrustés à des timestamps précis. Embed iframe pour intégrer sur n'importe quel site
- **Pages de capture** drag-and-drop avec branding cohérent
- **Tableau leads** centralisé avec tags, source, statut
- **Module clients** : suivi des prospects qui ont acheté, notes, statuts, processus d'accompagnement

### 7.5. Intégration Systeme.io (pivot stratégique)
- **Webhooks temps réel** : ventes, annulations, contacts ajoutés
- **Auto-tagging** des leads à la conversion (par quiz / page / popquiz)
- **Auto-inscription** aux formations / communautés Systeme.io
- **Enrichissement contacts** : données enrichies poussées dans Systeme.io
- **Whitelabel disponible** dans la marketplace Systeme.io
- **Clé API chiffrée at rest** (AES-256-GCM, DEK per-user) — sécurité bancaire

### 7.6. Pilotage & insight
- **Analytics** par contenu, plateforme, période, offre
- **Diagnostic IA** : analyse statistique avec recommandations (Basic+)
- **Coach IA contextuel** (Pro/Elite) : pose des questions, le coach connaît tout ton business
- **Pépites** : insights traduits automatiquement en 5 langues, multi-format
- **Notifications temps réel**

### 7.7. Multi-projets (Elite)
- Une instance Tipote par projet/marque/sub-business
- Chaque projet a sa propre clé Systeme.io, son onboarding, ses contenus
- Switch d'un clic
- Reset par projet sans toucher aux autres (Mai 2026)

## 8. Plans & tarification

### Free — 0€
- Tous les modules accessibles
- 25 crédits IA en one-shot (pas de renouvellement)
- 1 connexion sociale max
- 1 quiz / 1 sondage / 1 page / 1 popquiz max
- 10 leads visibles par mois (les suivants restent capturés mais en flou jusqu'à upgrade)
- **Idéal pour** : tester, voir si l'outil correspond

### Basic — 19€/mois ou 190€/an
- Tout le Free, plus :
- 40 crédits IA / mois renouvelés
- 2 connexions sociales
- Auto-commentaires activés
- Analyse statistique IA
- Enrichissement persona IA
- Analyse concurrentielle IA
- Achat de packs de crédits supplémentaires
- **Idéal pour** : un solo qui veut publier régulièrement et automatiser

### Pro — 49€/mois ou 490€/an
- Tout le Basic, plus :
- 150 crédits IA / mois
- 4 connexions sociales
- Coach IA illimité
- **Idéal pour** : un coach / consultant en croissance, avec une stratégie claire à exécuter

### Elite — 99€/mois ou 990€/an
- Tout le Pro, plus :
- 500 crédits IA / mois
- Connexions sociales illimitées
- **Multi-projets** (gérer plusieurs marques avec une seule connexion)
- **Idéal pour** : un solo qui pivote / a 2-3 activités, ou une petite équipe

### Packs de crédits supplémentaires (sans expiration)
- Starter : 25 crédits — 3€
- Standard : 100 crédits — 10€
- Pro : 250 crédits — 22€

### Économie de crédits (transparence)
- 1 crédit ≈ 0.01€ de coûts IA réels
- Génération d'un post : 0.5 à 2 crédits
- Génération d'un article : 3 à 5 crédits
- Auto-commentaire : 0.25 crédit

## 9. Voix de marque & ton

### Vocabulaire Tipote
- **Mots-clés à utiliser** : pote, mémoire, ton, stratégie, vraiment, pas en l'air, concrètement, en live, en un clic
- **Mots à BANNIR** : disruptif, révolutionnaire, leader, solution, expertise (trop corporate), best-in-class, scaling, growth-hacking
- **Tutoiement obligatoire** sur la copy grand public (pas vouvoiement). Le tutoiement EST la marque
- **Métaphores** : Tipote comme un pote qui te connaît, comme un copilote, comme un co-fondateur silencieux. Pas comme un outil, pas comme un assistant

### Ton
- **Direct, sans flagornerie** : pas de « parce que vous êtes incroyable », pas de promesse magique
- **Concret** : toujours un exemple, un chiffre, un cas d'usage
- **Empathique mais lucide** : on comprend la galère du solopreneur, on n'enrobe pas
- **Drôle quand c'est juste** : un peu d'humour bienvenue, mais jamais forcé. Pas de meme overdose
- **Pédagogue** : on explique le pourquoi, pas juste le quoi

### Exemples de phrases dans la voix
- ✅ « Ton plan 90 jours est prêt en 5 minutes. Tes posts du mois suivent. Et oui, c'est vraiment toi qu'on lit. »
- ✅ « Tu n'as pas le temps de lire un livre de marketing. Tipote l'a lu pour toi et applique ce qui marche pour TON business. »
- ❌ « Notre solution révolutionnaire utilise les dernières innovations en IA pour transformer votre business. »
- ❌ « Découvrez la puissance de l'intelligence artificielle pour votre marketing. »

## 10. Preuves & garanties

### Sécurité
- **Auth Supabase PKCE** avec cookies httpOnly — standard bancaire
- **Chiffrement AES-256-GCM par-user** pour les leads PII (email, téléphone, nom)
- **Clé API Systeme.io chiffrée at rest** (Mai 2026) — même un dump de DB ne révèle pas les clés
- **RLS Postgres** sur toutes les tables : isolation par user garantie au niveau DB

### Fiabilité produit
- 5 langues UI (FR / EN / ES / IT / AR avec support RTL)
- 8 variantes pour les quiz publics (FR / FR-vous / EN / ES / IT / DE / PT / AR)
- Tests de non-régression documentés (`docs/INVARIANTS.md`)

### Service client
- Support FR par chatbot IA + tickets
- Aide centralisée à `app.tipote.com/support`
- Mises à jour produit mensuelles documentées

## 11. Objections fréquentes + réponses

| Objection | Réponse type |
|---|---|
| « Encore un outil IA, j'en ai marre » | Tipote n'est pas un IA-de-plus. C'est UN outil avec UNE mémoire. Tu donnes ton contexte une fois, pas 50. |
| « C'est cher 19€/mois, je peux faire pareil avec ChatGPT à 20€ » | ChatGPT te demande ton contexte à chaque session. Tipote l'a en mémoire. Et il PUBLIE pour toi sur 7 réseaux. ChatGPT ne le fait pas. |
| « Je vais perdre ma voix, ça va parler comme un robot » | La voix Tipote part de TON storytelling renseigné à l'onboarding. Tu peux modifier chaque output inline. Et chaque génération s'imprègne plus de ton style avec l'usage. |
| « Je suis pas tech, je vais pas y arriver » | Onboarding guidé en 15 min. Pas de prompts à écrire. Pas d'API à configurer. Le SAV est en français. |
| « Mes données vont être utilisées pour entraîner l'IA » | Non. Les données utilisateurs ne sont jamais envoyées en clair à Anthropic — uniquement des prompts contextualisés, sans PII. Les leads sont chiffrés. |
| « Et si vous fermez ? » | Export complet de toutes tes données possible à tout moment (CSV, JSON). Tu emportes tes leads, tes contenus, ta stratégie. Aucun lock-in. |
| « Pourquoi pas Make / Zapier ? » | Make/Zapier connectent des trucs entre eux. Tipote crée le contenu en plus. Tu n'as pas besoin de connecter LinkedIn à un outil de génération à un planner — c'est tout dans Tipote. |

## 12. CTAs (call-to-action) à utiliser

### CTAs primaires (haut d'entonnoir)
- « Essayer Tipote gratuitement » (vers `/signup`)
- « Tester l'onboarding » (15 min, gratuit, sans CB)
- « Voir un exemple de stratégie générée »

### CTAs secondaires (mi-entonnoir)
- « Découvrir comment Tipote publie sur LinkedIn pour toi »
- « Voir les 7 modules en 90 secondes » (vidéo démo)
- « Regarder un quiz lead-magnet en action »

### CTAs bas d'entonnoir
- « Démarrer mon plan 90 jours » (post-onboarding)
- « Connecter mes réseaux sociaux »
- « Activer mes automatisations »

### CTAs upsell
- « Débloquer le coach IA » (vers Pro)
- « Activer le multi-projet » (vers Elite)
- « Acheter 100 crédits »

## 13. Données chiffrées à mentionner

- 51 % des entrepreneurs n'ont pas fait leur première vente
- 46 % passent trop de temps sur la création de contenu
- 52 % trouvent l'IA trop générique
- 7 réseaux sociaux supportés en publication directe
- 5 langues UI
- 8 variantes pour les quiz publics
- Plan 90 jours en 3 phases
- Onboarding en ~15 min
- Génération d'un post en 20-30 secondes
- Plan free : 1 quiz / 1 sondage / 1 page / 1 popquiz / 25 crédits one-shot

## 14. Slogans / accroches déjà utilisées (réutilisables)

- « Le pote de business des entrepreneurs »
- « L'IA qui se souvient de ton business »
- « Une stratégie qui ne change pas de cap chaque semaine »
- « Tu n'as plus besoin de réfléchir à QUOI publier »
- « Tu mets ton business dedans une fois, Tipote bosse pour toi tous les jours »
- « De l'onboarding à la vente, sans changer d'outil »

## 15. Ce qu'il NE FAUT PAS faire dans la com

- ❌ Comparer frontalement à ChatGPT par nom (positionnement « complémentaire » plutôt qu'agressif)
- ❌ Promettre des revenus garantis (« +10K/mois en 30 jours »)
- ❌ Afficher des témoignages bidons / non vérifiables
- ❌ Vendre Tipote comme « tous-en-un magique » — Tipote a des limites (pas de pub Meta/Google native, pas de SMS marketing, pas d'invoicing)
- ❌ Vouvoyer le prospect dans la com B2C
- ❌ Mettre en avant les crédits IA comme l'argument #1 — les crédits sont un mécanisme de pricing, pas une promesse
- ❌ Utiliser des screenshots de l'app Tipote sans la dernière version (UI évolue vite)
