# Roadmap rétention Tipote / Tiquiz — audit 1er juin 2026

> Issue de l'audit global réalisé le 1er juin 2026 avec Béné. But :
> transformer les outils (qui font beaucoup) en partenaires de résultats
> (qui prouvent qu'ils font gagner). Hypothèse de travail : la rétention
> payante ne tient pas sur la profondeur fonctionnelle, mais sur la
> sensation que l'user perd quelque chose en arrêtant.
>
> Document partagé Tipote ↔ Tiquiz (logique applicable aux deux). Fichier
> auto-géré par Claude — chaque chantier coché ou affiné après réalisation.

---

## Contraintes business validées par Béné (1er juin 2026)

À respecter à 100% dans tous les chantiers ci-dessous :

- **Tiquiz lifetime à 57€ N'EST PLUS COMMERCIALISÉ** (terminé depuis
  longtemps). Plans actifs : Free / Monthly 9€ / Yearly 90€. Les lifetime
  existants restent grandfathérés à vie côté DB / pricing.
- **Nouveau pricing Tiquiz à venir** : 19€/mois et 190€/an pour les
  futurs users uniquement. Les abonnés actuels (9€/90€) sont grandfathérés
  — leur ligne de prix ne doit pas changer sans accord explicite. Le
  switch utilise une colonne `pricing_grandfathered_at` ou équivalent.
- **Bridge Tiquiz → Tipote in-app IMPOSSIBLE** tant que Systeme.io n'a
  pas levé le blocage du whitelabel. Ne pas afficher de CTA "upgrade vers
  Tipote" dans Tiquiz pour l'instant. Réactivable plus tard, donc on
  garde l'archi compatible sans l'exposer côté UI.
- **Affiliate (commissions, payouts, statements, leaderboard)** est géré
  côté Systeme.io. Le dashboard `affiliate.tipote.com` ne gère QUE les
  contenus marketing et les liens trackés — pas la mécanique financière.
- **Monitoring VPS uptime** : déjà couvert par UptimeRobot (Béné). Pas
  besoin de re-coder un healthcheck custom.

---

## Phase 0 — Fondations (PRÉREQUIS pour tout le reste)

### 0.A Table `business_events` (Tipote puis Tiquiz)

Source de vérité unique pour TOUT ce qui est "il s'est passé un truc
business pour cet user". Consommée par : Wall of Wins, milestones,
réengagement, coach proactif, futures intégrations.

- Colonnes : `id`, `user_id`, `project_id` (Tipote multi-projet), `kind`
  (`sale|lead_captured|post_published|post_failed|quiz_view|quiz_complete|quiz_share|account_connected|account_disconnected|strategy_drift|...`),
  `payload jsonb`, `amount_cents int` (pour ventes), `currency`,
  `source` (`systemeio|stripe|paypal|mollie|manual|internal`),
  `occurred_at` (≠ `created_at`), `dedupe_key` (UNIQUE partiel).
- Index : `(user_id, occurred_at DESC)`, `(user_id, kind, occurred_at DESC)`,
  `(user_id, project_id, occurred_at DESC)`.
- RLS : user voit ses events. Admin Tipote voit tout (via SECURITY
  DEFINER si besoin).
- Migration `IF NOT EXISTS` + `NOTIFY pgrst, 'reload schema';` (cf.
  PITFALLS section A).

### 0.B Helper serveur unique `logBusinessEvent()`

Une seule fonction côté backend pour INSERT. Pas de RPC (cf. PITFALLS
section F — les RPC `await rpc(...)` qui ne lisent pas `{ error }`
masquent les échecs). INSERT direct + lecture erreur.

Points d'appel à brancher en parallèle (Tipote phase 0) :
- **`sale` business** : sync **API Systeme.io clé user** (la clé que l'user
  a posée dans `/settings/connexions` — pas le webhook Tipote SIO qui
  lui sert au plan Tipote) + sync Stripe/PayPal/Mollie de la compta
  user. Source = `systemeio` | `stripe` | `paypal` | `mollie` | `manual`.
  ⚠️ NE PAS confondre avec `app/api/systeme-io/webhook/route.ts` qui
  reçoit les ventes des plans Tipote (CA Béné, pas CA du créateur).
- Quiz / popquiz / pages capture lead → `lead_captured` (upsert
  `quiz_leads` dans `app/api/quiz/[quizId]/public/route.ts:641`,
  `app/api/popquiz/[id]/lead/...`, `app/api/pages/[id]/lead/...`).
  Dedupe via `dedupe_key = "quiz_lead:<quizId>:<emailHash>"`.
- Publication réseau OK → `post_published` (dans
  `app/api/social/publish/route.ts:516` direct ET via n8n :659).
- Publication réseau échec après 5 retries → `post_failed`.
- OAuth déconnexion détectée → `account_disconnected`.
- Drift stratégie détectée → `strategy_drift`.

### 0.C Helper consommation `getUserEventsSince(userId, since, opts)`

Sélection par fenêtre temporelle + filtre kind. Bucketing par
**jour LOCAL** via `lib/dateKeys.ts` (cf. PITFALLS section V).

### 0.D Service notification générique

- Table `user_notifications` (id, user_id, kind, payload jsonb, read_at,
  created_at).
- API `/api/notifications` : list + mark-read.
- Composant `<NotificationCenter />` (bell dans le header).
- Email helper `sendBusinessEmail(userId, template, payload)` — Resend
  ou équivalent existant. Dédup 24h par `(userId, template, hash payload)`.

---

## Phase 1 — Milestones + notifs de wins

Sur la fondation 0. Petit chantier, ROI dopaminique immédiat.

### 1.A Catalogue milestones (Tipote puis Tiquiz)

Tipote :
- Premier lead capturé
- 10e, 50e, 100e, 500e lead
- Première vente (Systeme.io / Stripe / PayPal / Mollie / manuel)
- 10e, 50e, 100e vente
- Premier 1k€, 5k€, 10k€ de CA mensuel
- Premier post publié (par réseau)
- Série de publication : 3 jours, 7 jours, 14 jours, 30 jours
- Premier quiz publié, première complétion, 100e vue
- Première connexion 7 réseaux
- Objectif mensuel atteint (50%, 100%, 150%)
- 1 mois ancienneté, 3 mois, 6 mois, 1 an

Tiquiz :
- Premier quiz publié
- 10e, 50e, 100e, 500e, 1000e lead
- 100e, 1000e vue
- Premier partage capturé
- Premier popquiz publié
- 1 mois ancienneté, 3 mois, 6 mois, 1 an

### 1.B Engine d'évaluation

- Table `user_milestones (user_id, milestone_key, unlocked_at, payload)`
  UNIQUE `(user_id, milestone_key)`.
- Trigger AFTER INSERT sur `business_events` : appelle une fonction
  PL/pgSQL `evaluate_milestones(user_id)` qui vérifie les compteurs
  agrégés et insère dans `user_milestones` si nouveau.
- ATTENTION (PITFALLS F) : ne JAMAIS UPDATE de compteurs directs. Le
  trigger lit la donnée d'agrégat en live (SELECT COUNT) ou via vues
  matérialisées rafraîchies par cron.

### 1.C Render in-app + email

- Toast/dialog au login si milestone non vu (notification non lue).
- Email "🎉 Tu viens de [milestone]" partageable (lien copie ou social).
- Anti-spam : 1 email max par 24h, digest si multiple.

---

## Phase 2 — Wall of Wins

### 2.A Dashboard "Ce mois avec Tipote/Tiquiz"

Carte tout en haut du dashboard `app/dashboard/page.tsx` (Tipote) /
`app/dashboard/page.tsx` (Tiquiz) :

- Période sélectionnable (ce mois / 30j / 90j / tout).
- Tipote : leads capturés, ventes, CA (€), posts publiés, heures
  économisées (estimation : 12 min/post + 2h/quiz + 3h/article), top
  post du mois (engagement le plus haut), milestones atteints.
- Tiquiz : quiz vues, complétions, partages, leads capturés, top quiz
  du mois, milestones.
- Comparaison vs période précédente.
- Source = `business_events` agrégés via helper 0.C.

**RÈGLE CARDINALE Béné (1er juin 2026)** : si la période ne contient AUCUN
résultat (0 lead, 0 vente, 0 post publié, 0 milestone récent), on
**N'AFFICHE PAS** la carte Wall of Wins. Un dashboard qui affiche "0
partout" démotive et augmente le churn. À la place, état neutre type
"Pas encore de chiffres ce mois, voici comment démarrer →" avec 1 CTA
action concrète. Côté code : helper `shouldShowWallOfWins(stats)` qui
retourne false si toutes les métriques agrégées valent 0/null.

### 2.B Email récap mensuel automatique

Cron 1er du mois 9h locale créateur. Template "Ton mois avec Tipote" :
- Récap chiffres
- 3 milestones débloqués
- 1 reco IA pour le mois suivant (lecture stratégie + drift flag)
- CTA "Voir le détail" → dashboard
- Lien désabo email (mais opt-out par catégorie, pas global).

---

## Phase 3 — Email réengagement intelligent

### 3.A Détecteur d'inactivité

Cron quotidien :
- Last `business_events` > 7j → bucket A
- > 14j → bucket B
- > 30j → bucket C
- Plus user actif mais quiz à 0 vue depuis 14j → bucket D
- Stratégie en drift depuis 21j → bucket E

### 3.B Templates par bucket

- A (J7) : "Pas de post programmé cette semaine, je t'ai préparé 5 idées
  d'après tes 3 meilleures perfs" (Tipote : sample posts ; Tiquiz :
  ouvre le brainstorm IA d'un quiz template métier)
- B (J14) : "Voici ce qui a marché chez tes pairs ce mois" (insights
  anonymisés génériques par niche)
- C (J30) : "Tu nous manques. Avant de te désabonner, voici ce qu'on
  peut faire ensemble en 5 min." → 1 CTA action ultra-court
- D : "Ton quiz X n'a pas encore de vue, 3 raisons probables"
- E : "Ta stratégie a 90j, elle a dérivé — recalcule en 30s"

### 3.C Dédup + opt-out

Max 1 email réengagement / 7j. Opt-out par catégorie depuis settings.

---

## Phase 4 — Coach IA proactif hebdo (Tipote, Pro/Elite)

### 4.A Brief lundi 9h

Cron lundi 9h locale (timezone user).
- Lecture profil + stratégie + last 7 days `business_events` + objectif
  CA + agenda éditorial à venir
- Génération via Claude (modèle Sonnet 4.6 ou supérieur — voir
  ANTHROPIC config) d'un brief 5 points : ta semaine, alertes,
  recommandation, posts à valider (lien direct), wins à célébrer.
- Email + dispo dans `/coach` avec historique.

### 4.B Push si critique

Notification in-app immédiate si critique détectée :
- Token social mort + 1 post programmé dans les 48h
- Objectif mensuel à 0% et J-10 du mois
- Quiz à 100 vues mais 0% complétion → problème de questions

### 4.C Justification du palier Pro

Cette feature à elle seule doit JUSTIFIER l'écart Basic → Pro. UI
settings : "Tu as un coach personnel qui te brief chaque lundi.
Disponible en Pro."

---

## Phase 5 — Templates Tiquiz par métier (chantier indépendant)

### 5.A Catalogue initial 15 templates

Niches identifiées (à valider Béné) :
- Coach business / coach perso / coach sportif
- Prof yoga / naturopathe / sophrologue
- Formateur en ligne
- Consultant marketing
- Agent immobilier
- Recruteur RH
- Restaurateur (quiz "quel plat es-tu")
- Photographe (quiz "quel style de mariage")
- Designer UX
- E-commerce / dropshipping
- Conseiller patrimoine
- Coach parental

Chaque template = 5-7 questions + 3-4 résultats + CTA générique +
intro accrocheuse. Stocké en DB (table `quiz_templates`) + seedé code.

### 5.B Galerie publique SEO

Route `/templates` (Tiquiz). Une page par template
`/templates/[slug]`. SEO ciblé "quiz lead magnet coach", "quiz typeform
gratuit yoga", etc.

CTA "Utiliser ce template" → si non connecté, page signup avec template
pré-sélectionné. Sinon création quiz pré-rempli.

### 5.C Bonus : A/B testing natif (Tiquiz)

Optionnel mais gros différenciateur vs Typeform :
- 2 variantes de titre / intro / 1ère question
- 50/50 distribution
- Stats par variante dans analytics

---

## Phase 6 — Nouvelle tarif Tiquiz (futurs users)

### 6.A Migration colonne grandfather

- `profiles.pricing_grandfathered_at TIMESTAMPTZ` (NULL = nouveau prix)
- Backfill : tous les users existants au moment du switch reçoivent
  `now()` → grandfathérés à vie sur 9€/90€.

### 6.B Pages pricing + checkout

- `/pricing` : affichage conditionnel. Si user connecté et grandfathéré,
  voit 9€/90€. Sinon 19€/190€.
- Stripe : nouveaux prix (nouveaux Price IDs). Anciens prix gardés pour
  les grandfathérés.
- Webhook Stripe : reconnaît le Price ID utilisé pour appliquer le bon
  plan.

### 6.C Communication

- Pas de comm aux users actuels (grandfathérage silencieux = bonne
  surprise quand ils voient une augmentation chez les concurrents).
- Landing publique : nouveau prix d'office.

---

## Phase 7 — Tests E2E routes publiques critiques

### 7.A Playwright minimal

- Tipote : visite `/q/[quiz-public-actif]`, complète le funnel, vérifie
  tag SIO + `business_events` insérés. Itération sur `/p/[slug]`,
  `/pq/[popquiz]`, `/[publicSlug]`.
- Tiquiz : `/q/[quiz]`, `/[publicSlug]`.
- Tests embed iframe (CSP frame-ancestors, cf. PITFALLS X) — JB & co
  ne doivent plus jamais casser silencieusement.
- Tests OG meta sur custom domain (cf. PITFALLS K).

### 7.B Run sur push branche claude

GitHub Actions sur la branche `claude/busy-wright-501xR`. Pas de
blocage de push (les tests servent à m'alerter, pas à bloquer Béné).

---

## Phase 8 — Port Tiquiz (Phases 1 à 3)

Une fois Tipote stabilisé sur les phases 1-3, port adapté :
- `business_events` table (déjà phase 0)
- Milestones catalogue Tiquiz-specific (cf. 1.A)
- Wall of Wins adapté (pas de CA Tiquiz, focus quiz métriques)
- Réengagement adapté (templates Tiquiz)

Pas de coach IA proactif sur Tiquiz (pas dans le scope produit).

---

## Ordre d'exécution recommandé

1. **Phase 0 fondation** (Tipote) — ~2 sessions
2. **Phase 1 milestones** (Tipote) — ~2 sessions
3. **Phase 2 Wall of Wins** (Tipote) — ~2 sessions
4. **Phase 6 nouveau pricing Tiquiz** — 1 session courte (tactique
   indépendante, à insérer entre phases pour aérer)
5. **Phase 3 réengagement** (Tipote) — ~2 sessions
6. **Phase 7 tests E2E** — 1 session bootstrap
7. **Phase 4 coach proactif** (Tipote Pro/Elite) — ~2 sessions
8. **Phase 5 templates Tiquiz** — ~3 sessions
9. **Phase 8 port Tiquiz** — ~2 sessions

Total estimé : ~17-20 sessions de dev.

---

## Décisions tranchées par Béné (1er juin 2026)

- **Phase 2.A — Wall of Wins en haut MAIS conditionnel "motivant ou rien"** :
  si la fenêtre n'a aucun résultat à montrer (0 lead, 0 vente, 0 post
  publié sur la période), on **N'AFFICHE PAS** la carte. Un Wall of Wins
  vide ou avec "0 partout" = effet inverse = démotivation = churn. À la
  place, on garde un état neutre genre "Pas encore de chiffres ce mois,
  voici comment démarrer →" qui pousse vers une action concrète (créer
  un quiz, programmer un post). C'est la phase 3 réengagement qui prend
  le relais à ce moment-là, pas le Wall of Wins.
- **Phase 3.B — V1 = email + in-app, pas de push browser**. Push browser
  reporté en V2 (trop de friction d'opt-in pour le gain en V1).

## Décisions en suspens (à confirmer Béné quand on arrive sur le chantier)

- Phase 1.A : la liste de milestones est-elle complète ? Béné veut
  peut-être en ajouter des "fun" (1er post à minuit, 1er post le
  week-end, etc.).
- Phase 4.A : Sonnet 4.6 ou supérieur ? Cost vs qualité.
- Phase 5.A : liste finale des niches.
- Phase 6.A : date du switch (besoin date concrète pour le grandfathering).
