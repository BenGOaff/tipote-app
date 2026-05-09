# CAHIER DES CHARGES Tipote — Version Mai 2026 (État actuel du produit)

Application Web SaaS multilingue (FR/EN/ES/IT/AR) pour analyse business, planification stratégique, génération de contenus IA et publication automatisée sur les réseaux sociaux.

> **Notes de version Mai 2026** — synthèse des évolutions depuis la version d'Avril :
> - **Module Popquiz** : nouveau type de contenu (vidéo + quiz incrustés à des timestamps précis), accessible depuis `/create`. Mirror du module développé sur Tiquiz, scopé multi-projet via `project_id`. Plan gratuit limité à 1 popquiz par projet.
> - **Sécurité** : la clé API Systeme.io est désormais **chiffrée at rest** (AES-256-GCM, DEK per-user, pipeline `lib/piiCrypto`). Migration progressive — le code lit `_enc` en priorité, retombe sur la colonne plaintext historique pendant la transition. UI : champ `type="password"` + toggle 👁.
> - **Stratégie « live »** : flag `is_stale` posé sur `business_plan.plan_json` quand un champ profil critique change (revenue_goal, niche, has_offers…). La page `/strategy` affiche un bandeau ambré « Tes infos ont changé » avec un bouton « Recalculer maintenant » qui force la regen via `/api/strategy?force=true`.
> - **Reset par projet** : nouveau endpoint `POST /api/profile/reset` qui wipe uniquement le projet actif (vs `/api/account/reset` qui wipe le compte entier). Refuse l'opération si l'user n'a qu'un seul projet (utiliser le reset compte). UI : bouton « Réinitialiser ce Tipote » dans Settings → Compte.
> - **Onboarding multi-profil** : la vérif d'onboarding est désormais STRICTEMENT scopée à `(user_id, project_id)`. Plus de fallback « any project completed » qui sautait l'onboarding du 2e Tipote.
> - **Quiz** : nouvelle colonne `bonus_intro_text` (paragraphe custom de l'étape de partage qui remplace le templeté). `hasBonusFlow` accepte désormais image bonus seule. Bouton « Recommencer » sur l'étape résultat. Fallback consent_text par locale du visiteur. Color picker dans `RichTextEdit` (palette de swatches + input couleur custom + reset). Fix contraste invisible blanc-sur-blanc en mode édition. Bandeau bonus_image fix.
> - **Régression majeure corrigée** : le bloc `/api/strategy` qui supprimait `selected_pyramid` quand `hasOffersEffective=true` est désormais restreint aux `isAffiliate=true`. Avant : « Aucune offre trouvée » sur tous les `PostForm` une fois la stratégie générée.
> - **Garde-fous** : `docs/INVARIANTS.md` documente les zones cassables (5 invariants : lead-safety, scope onboarding, reset par projet, typo FR, offres user-authored).

> **Notes de version Mi-Mai 2026** — sprint 7-8 mai :
>
> - **Pipeline vidéo Popquiz self-hosted** : les vidéos popquiz quittent Supabase Storage pour un serveur dédié. Stack : tus server Node (`@tus/server` + JWT HS256 par-app sur `tus.quiz.tipote.com` / `tus.tipote.com`) → stockage `/srv/popquiz-videos/<app>/raw/<userId>/<videoId>/` → lecture protégée par `nginx secure_link` sur `videos.quiz.tipote.com` / `videos.tipote.com`. Limite passée à **20 Go par vidéo** (vs 5 Go Supabase Free). Migration douce : les vidéos legacy (path `raw/...`) continuent d'être servies via Supabase signed URLs ; les nouvelles (path `<app>/raw/...`) via `secure_link`. Endpoints : `/api/popquiz/upload-token` (mint JWT), `/api/popquiz/playback-url` (signe l'URL preview), `/api/popquiz/[id]/thumbnail` (POST mint token + PATCH apply pour vignette custom).
> - **Vignette popquiz personnalisable** : nouveau composant `ThumbnailPicker` avec **crop 16/9 intégré** (canvas natif, pas de dep). Toggle entre vignette auto-extraite à 2s de la vidéo et vignette uploadée. Le fichier auto reste sur disque, le revert est instantané (changement de pointeur DB).
> - **Player popquiz enrichi** : ajout de la vitesse de lecture (0.5×–2×), skip ±10s, partage (Web Share API + fallback copie-lien), Picture-in-Picture. Poster YouTube en HD (maxresdefault avec fallback hqdefault). Composant `PosterOverlay` qui se masque au démarrage de la lecture (fix du poster qui restait collé sur YouTube/Vimeo).
> - **Multi-projet UX** : nouvelle table `projects` enrichie de `accent_color` / `icon_emoji` / `use_branding_logo`. Composants `ProjectIdentityBadge`, `ProjectIdentityEditor`, `ProjectIndicatorSidebar`. Pill du header coloré, sidebar avec bloc "Projet actif" entre Aide et Langue (visible si ≥ 2 projets). **Danger zone** sur la suppression de projet : confirmation par recopie du nom + liste explicite de ce qui sera détruit. **Cascade FK alignée** : popquizzes / clients / hosted_pages / widgets passés de `SET NULL` à `CASCADE` (migration `20260507_project_delete_cascade`). **Reset session** : `SessionResetGate` ramène l'user sur son projet `is_default = true` à chaque nouvelle session browser via sessionStorage flag — l'user ferme le browser, rouvre, atterrit sur son projet principal.
> - **Onboarding nouveau projet** : la création d'un projet via `POST /api/projects` insère un `business_profiles` vide avec `onboarding_completed = false` puis le `ProjectSwitcher` redirige explicitement vers `/onboarding`. Plus de fallback middleware qui forçait le redirect (cassait les users legacy avec un flag à false ou NULL). **Trigger Postgres auto-complete** (migration `20260508_auto_complete_onboarding_trigger`) : flag passé à `true` automatiquement dès qu'une row a niche + au moins une offre. Plus jamais le cas "user actif depuis des mois mais coincé sur l'onboarding".
> - **Cache d'arguments de vente par offre** : nouveau champ `business_profiles.offers[i].sales_arguments` (JSONB) avec 10 puces "bénéfice + conséquence concrète + angle narratif + idée d'accroche", générées via Claude une seule fois par offre puis réutilisées dans les prompts de contenu (post / email / pages funnel / offer). Économie ~42% de tokens sur un plan 30j × 4 plateformes. UI éditable dans Settings → Mes offres avec palette de 10 angles narratifs. **1 crédit** pour générer/régénérer, **0 crédit** pour les édits manuels.
> - **Streaming SSE pour `/api/content/strategy`** : passage de la génération de plan 30 jours en streaming Anthropic. Plus de timeout Cloudflare 100s sur les gros plans (16k tokens), idle timeout 90s par défaut au lieu de timeout total, chaque chunk Anthropic sert de heartbeat content-aware vers le client. Ajout de `AIGeneratingOverlay` (mascotte + messages rotatifs) sur `ContentStrategyForm`.
> - **Sélecteur d'offres** : `loadAllOffers()` ne retourne plus que les offres user-saisies (`business_profiles.offers`). La pyramide IA générée par l'analyse stratégique est exclue par défaut (toujours accessible avec `{ includePyramid: true }` pour la vue stratégie). Fallback content-based si la row du projet actif est vide.
> - **Quiz analytics par quiz** : nouvelle page `/quiz/[id]/analytics` (cards KPI + chart aire évolution leads + pie distribution résultats + funnel par question). Funnel calculé via nouvelle table `quiz_question_events` (event `view` / `answer` par session anonyme), `claim_scheduled_posts` RPC inchangée. Bouton 📊 dans la liste des quiz.
> - **Programmation de contenu** : refonte du `ScheduleModal` + composant réutilisable `DateTimePicker` (calendar branded primary + slots 09/12/14/18 + time custom + summary lisible "vendredi 15 mai 2026, 14h00"). **Validation past dates côté client + serveur** ; le picker grise les slots passés du jour ; auto-seed today + prochain créneau quand la row n'a pas de `scheduled_date`. Le pipeline cron `/api/n8n/scheduled-posts` reste : timezone Europe/Paris, claim atomique via `FOR UPDATE SKIP LOCKED`, reset stuck >10min, refresh tokens auto, publication directe LinkedIn/Facebook.
> - **JB feedback** : `quizzes.bonus_unlocked_message` (TEXT, optionnel) override le « Bonus unlocked! Check your inbox. » par défaut — utilité : livrer un code promo inline sans dépendre d'un tag SIO ou d'un email transactionnel. UI dans QuizDetailClient sous "Message après partage". `ALL_DEFAULT_CONSENTS` étendu : la phrase admin `"En renseignant ton email, tu acceptes notre politique de confidentialité."` (pre-fill historique du QuizForm) est désormais reconnue comme un default → fallback automatique sur la locale du viewer.
> - **Bucket Supabase manquant** : création de `public-assets` (public, 10 Mo, mime types image whitelist + RLS read-public/write-authenticated). Avant : tous les uploads de logo + bonus image échouaient silencieusement (bucket inexistant en prod, supposition perdue lors d'une restauration projet).
> - **Sync ventes Systeme.io → Tipote analytics** : nouveau pipeline qui pull `GET /api/sales` côté SIO via la clé API user, match chaque vente à une offre Tipote (cascade : `sio_product_id` explicite > nom exact > fuzzy nom > prix unique), agrège par offre + mois et upserts dans `offer_metrics`. Endpoint manuel `POST /api/analytics/sio-sync` (bouton "Synchroniser Systeme.io" sur `/analytics`) + cron quotidien `/api/cron/sio-sync-sales` (35 jours fenêtre, séquentiel, journalisation détaillée). Champ optionnel `business_profiles.offers[i].sio_product_id` éditable dans Settings → Mes offres pour binder une offre Tipote à un produit SIO précis. Modules : `lib/sio/salesSync.ts`, `lib/sio/syncRunner.ts`. Plan stratégique en **3 phases (Fondations / Croissance / Scaling)** — la nomenclature 90 jours / 30-60-90 a été retirée de tous les copywriting, prompts et messages utilisateur.

> **Notes de version 8 mai 2026** — sprint compta + cross-app :
>
> - **Lien d'affiliation Tiquiz** : footer permanent *« Cette vidéo vous est proposée via Tiquiz »* sur tous les popquiz publics (`/pq/[id]`) et leur version embed iframe (`/embed/pq/[id]`), redirige vers `https://www.tipote.fr/part-tiquiz?sa=<id>`. Idem côté quiz publics free / sans footer custom : *« Ce quiz vous est proposé via Tiquiz »*. Tracking commission via le paramètre `?sa=<sa…>` (format Systeme.io) que l'user pose dans Settings → Connexions → Systeme.io → champ "Mon identifiant affilié Tipote". Stocké sur `business_profiles.tipote_affiliate_id`. Migration `20260508_tipote_affiliate_id`.
> - **Notifications de déconnexion sociale + post raté** : email Resend immédiat dès qu'un token social meurt (LinkedIn / Facebook / IG / X / TikTok / Pinterest / Threads / Reddit). Détection 401 / `invalid_grant` / "revoked" dans `lib/refreshSocialToken.ts` + `app/api/n8n/publish-callback/route.ts`. Email aussi quand un post programmé bascule définitivement en `failed` (après 5 retries) avec aperçu du contenu et lien direct vers l'éditeur. Helper unique `lib/social/notifications.ts` avec dédup 3 jours par (user, platform). Nouvelle colonne `social_connections.disconnected_at` (migration `20260508_social_disconnected_at`) reset à `null` à chaque reconnexion OAuth (modifié dans les 9 callbacks OAuth).
> - **Module Compta complet (France uniquement)** : nouvel onglet dans Paramètres (`/settings?tab=compta`) construit en 7 commits.
>   - **1a — Country gate** : business_profiles.country existant → 3 états (vide → sélecteur, France → suite, autre → "bientôt disponible pour ce pays"). Helper `lib/compta/countries.ts`.
>   - **1b — Configuration statut + sous-type** : 3 statuts au lancement (particulier / auto-entrepreneur / SASU avec IS et TVA), chacun avec ses sous-champs (activité AE, ACRE, versement libératoire, franchise TVA / SIREN, exercice fiscal calendaire ou décalé, régime TVA réel mensuel/trimestriel/simplifié, TVA intra, dirigeant rémunéré). 14 colonnes ajoutées sur `business_profiles` (migration `20260508_compta_status_config`). Composant `ComptaConfigForm` avec sélecteur 3 cartes + sous-formulaire dynamique. Liens vers service-public.fr / urssaf.fr / annuaire-entreprises.data.gouv.fr.
>   - **1c — Connexion Stripe** : Restricted Key (lecture seule), sync initial 24 mois + cron daily `/api/cron/sync-payments` à 5h (delta depuis `last_sync_at - 1h`). 3 nouvelles tables : `payment_connections` (clé chiffrée), `transactions` (normalisée toutes sources, idempotence via `UNIQUE (user_id, provider, provider_transaction_id)`), `manual_transactions` (saisies hors PSP). RLS read-self. Migration `20260508_compta_payments_tables`. Modules : `lib/compta/syncEngine.ts`, `lib/compta/providers/stripe.ts`. Endpoints : `/api/compta/connections` (GET liste), `/api/compta/connections/stripe` (POST connect / DELETE), `/api/compta/connections/sync-now` (manual refresh), `/api/compta/connections/disconnect` (générique).
>   - **1d — PayPal + Mollie** : OAuth client_credentials pour PayPal (avec mode live/sandbox + détection feature "Transaction Search" obligatoire) et clé API simple pour Mollie (note de sécurité car pas de Restricted Key). Pagination par fenêtres de 30 jours pour PayPal (limite 31j API), curseur `_links.next.href` pour Mollie. Dédup pré-upsert par `provider_transaction_id` (Postgres rejette `ON CONFLICT DO UPDATE` sur même row 2× dans le même batch). Modules : `lib/compta/providers/paypal.ts`, `lib/compta/providers/mollie.ts`.
>   - **1e — Saisies manuelles** : CRUD complet pour les paiements hors PSP (virement / espèces / chèque / autre). UI `ComptaManualTransactions` avec liste + form édition inline. Endpoints : `/api/compta/manual-transactions` (GET + POST), `/api/compta/manual-transactions/[id]` (PATCH + DELETE).
>   - **1f — Tableau de bord business** : 4 cards (CA mois, depuis janvier, MRR estimé via heuristique description, taux de remboursement) + graph N vs N-1 sur 12 mois (recharts BarChart) + décomposition clients (nouveaux / abonnés / perdus avec churn estimé) + top 5 produits (group by description normalisée) + jauge franchise TVA pour les AE. Conversion EUR via `https://api.frankfurter.app` (open data BCE, cache 1h). Endpoint `/api/compta/dashboard`. Composant `ComptaDashboard.tsx`. **Vocabulaire 100% français normal** ("revenus récurrents" et non MRR, "depuis janvier" et non YTD, "clients perdus" et non churn).
>   - **1g — Seuils fiscaux DB-backed + admin** : nouvelle table `fiscal_thresholds` versionnée par (country, fiscal_year, category) avec seed 2026 FR (vente 85k/93,5k, services BIC/BNC 37,5k/41,25k). Migration `20260508_fiscal_thresholds`. Refactor `lib/compta/fiscal-config.ts` en async DB-read avec fallback hardcodé. Page admin `/admin/compta/fiscal-thresholds` (réservée aux `ADMIN_EMAILS`) pour éditer en ligne avec UI groupée par (pays, année). Cron quotidien `/api/cron/check-fiscal-thresholds` à 6h qui fetch chaque source_url officielle, cherche les valeurs stockées en DB normalisées (NBSP / variantes "85 000" / "85,000" / "85000"), envoie un email aux admins si une valeur a disparu de la page. Permet de mettre à jour les seuils chaque LF sans release Tipote.
>   - **1h — Catégorisation ventes vs commissions affiliation** : colonne `category` sur `transactions` et `manual_transactions` (sale / affiliate / other, défaut sale). Détection auto au sync via heuristique sur description (`affiliation`, `commission`, `kickback`). Préservation des overrides user (lecture des catégories existantes avant chaque upsert). Migration `20260508_compta_transaction_category`. UI : 3 cartes cliquables dans le form de saisie manuelle, badge "Commission" sur les rows, nouvelle card dans le dashboard "Ventes directes vs commissions" (mois courant + YTD avec barre bicolore).
>   - **1i — Calendrier fiscal personnalisé** (Mai 2026) : helper `lib/compta/fiscalCalendar.ts` qui calcule à la volée les échéances fiscales sur 12 mois selon `accounting_status` + sous-config (régime TVA SASU, périodicité URSSAF AE, exercice fiscal, dirigeant rémunéré, TVA intra). Couvre URSSAF (mensuelle / trimestrielle), TVA (CA3 mensuelle/trimestrielle, CA12 simplifiée + acomptes), IS (acomptes 15 mars/juin/sept/déc + solde 4 mois après clôture), bilan (~7 mois après clôture), 2042/2042-C-PRO, CFE (15 décembre), DSN mensuelle si dirigeant rémunéré, DES si TVA intra. Endpoint `/api/compta/fiscal-deadlines`. Composant `FiscalCalendar` (groupé par mois, badges colorés par type, dates butoir, liens directs vers le site officiel — service-public, urssaf, impots.gouv, infogreffe, douane, net-entreprises). Bouton "Marqué comme fait" persisté en localStorage. Cron quotidien `/api/cron/fiscal-reminders` à 8h qui envoie un email + notification in-app pour chaque échéance à J-7 (idempotent par deadline_id). Migration `20260509_compta_ae_urssaf_periodicity` ajoute la colonne pour distinguer mensuelle vs trimestrielle (modifiable dans le `ComptaConfigForm`).
>   - **1j — Export FEC pour les SASU** (Mai 2026) : Fichier des Écritures Comptables au format légal (article A47 A-1 du LPF) — obligatoire en cas de contrôle fiscal pour les sociétés à l'IS. Helper `lib/compta/fecExport.ts` qui génère le fichier pipe-séparé 18 colonnes (encoding UTF-8 + BOM, dates AAAAMMJJ, montants à virgule décimale). Plan comptable simplifié (411 clients, 512100 banque, 530 caisse, 706/707 ventes, 758 produits divers pour commissions affiliation, 44571 TVA collectée). Split HT / TVA 20% pour les SASU avec régime TVA configuré, sinon HT = TTC. Endpoint `/api/compta/fec-export?from=YYYY-MM-DD&to=YYYY-MM-DD` avec auto-calcul de la période = exercice fiscal courant (calendaire ou décalé). Composant `FecExportCard` (dispo uniquement statut SASU + SIREN renseigné), avec sélecteur de dates et avertissement clair sur la portée du FEC produit. Nom du fichier : `<SIREN>FEC<AAAAMMJJ>.txt` comme imposé par l'admin fiscale.
>   - **1k — Achats / charges + TVA déductible** (Mai 2026) : nouvelle table `expense_items` (migration `20260509_compta_expense_items`) avec montant TTC en cents, taux TVA français (0 / 2,1 / 5,5 / 10 / 20 %), TVA déductible auto-calculée serveur-side, catégorie, fournisseur, date, URL justificatif (pour la phase 1l OCR). RLS self-only. UI `ComptaExpenseItems` avec form de saisie (live calc TVA) + liste éditable. Card "TVA à payer" en haut de la section : TVA collectée (estimée 20% du CA YTD pour les users en TVA) − TVA déductible (somme exacte des achats) → TVA à payer ou crédit de TVA. 10 catégories de charges (achats, services, fournitures, déplacements, logiciels, loyer, communication, marketing, formation, autre), chacune mappée sur le bon compte 6XX du PCG général dans le FEC (607 / 611 / 6063 / 6251 / 6511 / 6132 / 626 / 6231 / 6311 / 658). Le FEC inclut désormais les **écritures d'achat** (journal AC) en plus des ventes (journal VT) : débit charge HT + débit 44566 TVA déductible + crédit 512100 banque. Endpoints REST : `/api/compta/expense-items` (GET liste + totaux, POST create) et `/api/compta/expense-items/[id]` (PATCH, DELETE).
>   - **Trou AE-TVA bouché** (Mai 2026) : avant, un auto-entrepreneur qui avait dépassé le seuil de franchise TVA n'avait aucune échéance TVA dans son calendrier fiscal. Nouvelle colonne `ae_vat_regime` ('reel_mensuel' | 'reel_trimestriel' | 'simplifie', défaut simplifié). Sélecteur conditionnel dans `ComptaConfigForm` (apparaît seulement si `ae_vat_franchise = false`). `tvaSASU` refactoré en `tvaDeclarations(regime, intraEnabled, from, to, idPrefix)` pour être appelable depuis les 2 statuts.
>   - **1m — EURL / SARL / SAS** (Mai 2026) : extension du sélecteur `accounting_status` à 6 valeurs (particulier / auto_entrepreneur / sasu / sas / sarl / eurl). Migration `20260509_compta_extra_legal_forms` ajoute 2 colonnes : `eurl_is_election` (true = EURL à l'IS, false = IR par défaut) et `sarl_gerant_majoritaire` (impact sur la DSN). Sémantique élargie des colonnes `sasu_*` historiques : utilisées pour TOUTES les sociétés à l'IS (sasu/sas/sarl/eurl-IS) — évite la duplication de schéma. Helpers `isCorporateAtIS()` et `dirigeantAssimileSalarie()` centralisent les règles. `fiscalCalendar.ts` factoré : un seul code path "société à l'IS" pour les 4 statuts (TVA + IS + bilan + DSN si dirigeant assimilé salarié + CFE), un cas dédié EURL-IR (liasse 2031/2035 ~5 mai + dépôt comptes + CFE + 2042 perso). DSN désactivée pour gérant majoritaire SARL (TNS) et EURL-IR (TNS). FEC étendu à toutes les sociétés. Sélecteur ConfigForm en 2 sections visuelles ("sans société dédiée" / "société à l'IS"), sous-formulaires conditionnels pour le choix IS/IR (EURL) et le statut du gérant (SARL).
>   - **1n — Suisse complète (26 cantons)** (Mai 2026) : portage du module compta côté CH. Migration `20260510_compta_switzerland` ajoute 5 colonnes (`ch_canton`, `ch_vat_assujetti`, `ch_vat_periodicity`, `ch_vat_method`, `ch_started_at`) et étend `accounting_status` à 9 valeurs (3 statuts CH : `independant_ch` / `sarl_ch` / `sa_ch`). `lib/compta/countries.ts` accepte `isSwissCountry` + helper `detectCountryCode`. Nouveau fichier `lib/compta/ch_cantons.ts` qui modélise les **26 cantons suisses** avec leur date butoir réelle de déclaration d'impôt (personne physique ET personne morale, qui peuvent différer) et l'URL de leur portail fiscal cantonal — sources : ch.ch et sites cantonaux officiels. `lib/compta/fiscalCalendarCH.ts` calcule les échéances suisses : décompte TVA selon périodicité (T1→31 mai, T2→31 août, T3→30 nov, T4→28 fév pour le trimestriel — option mensuelle / semestrielle / annuelle), acomptes AVS/AI/APG trimestriels (mars/juin/sept/déc) pour les indépendants, déclaration d'impôt cantonale + fédérale à la date du canton de l'user (avec lien vers son portail), comptes annuels Sàrl/SA dans les 6 mois après clôture (Code des Obligations art. 957a). API `/api/compta/fiscal-deadlines` et cron `/api/cron/fiscal-reminders` dispatchent FR vs CH selon `country` détecté. UI `ComptaTab` ouvre l'onglet aux users CH avec un disclaimer permanent ("Les taux d'imposition varient par canton — ton fiduciaire reste la référence"). `ComptaConfigForm` reçoit une prop `country` qui sélectionne 6 cartes FR ou 4 cartes CH (Particulier / Indépendant / Sàrl / SA), avec sous-formulaire `SuisseFields` (sélecteur des 26 cantons triés FR-DE-IT, IDE pour Sàrl/SA, exercice comptable, assujettissement TVA, périodicité, méthode effective vs TDFN). FEC reste FR-only (norme française non applicable en CH). Dashboard adapté CH : taux TVA 8.1% (vs 20% FR), jauge seuils 100k CHF avec conversion EUR→CHF via forex, copie adaptée ("Assujettissement TVA obligatoire" en CH).
>   - **1o — Portugal** (Mai 2026) : ouverture de l'onglet aux users portugais. Migration `20260510_compta_portugal` ajoute 6 colonnes (`pt_nif`, `pt_region`, `pt_iva_isento`, `pt_iva_periodicity`, `pt_tax_regime`, `pt_started_at`) et étend `accounting_status` à 14 valeurs (5 statuts PT : `trabalhador_independente_pt` / `eni_pt` / `lda_unipessoal_pt` / `lda_pt` / `sa_pt`). Nouveau `lib/compta/fiscalCalendarPT.ts` qui calcule les échéances portugaises : déclaration IVA (mensuelle ou trimestrielle, jour 25 du 2e mois suivant), IRS Modelo 3 (1er avril → 30 juin N+1), IRC Modelo 22 (31 mai N+1 pour exercice civil), 3 acomptes IRC pagamento por conta (31 juillet / 30 septembre / 15 décembre), Segurança Social mensuelle (le 20) pour les indépendants/ENI, communication e-fatura mensuelle (jour 5). 3 régions distinctes (continent / Madère / Açores) avec leurs taux IVA respectifs (23/22/16% normal). Sélecteur `PortugalFields` dans `ComptaConfigForm` (NIF 9 chiffres, région, régime fiscal simplificado vs organizada pour les indépendants, exercice comptable LDA/SA, isenção IVA + périodicité). **Règle UI explicite** : tous les libellés affichés sont en français (titres, descriptions, badges) — seuls les noms officiels des déclarations restent en portugais (NIF, IRS, IRC, Modelo 3/22, e-fatura, AT, CIVA, Segurança Social) car ce sont des termes intraduisibles. Dashboard `isVatable` étendu PT (assujetti si pas en regime de isenção), taux IVA selon région (23 continent / 22 Madère / 16 Açores).
>   - **1p — Belgique** (Mai 2026) : ouverture de l'onglet aux users belges. Migration `20260510_compta_belgium` ajoute 6 colonnes (`be_region` wallonie/flandre/bruxelles, `be_company_number` BCE 10 chiffres, `be_vat_franchise` < 25k €, `be_vat_periodicity` mens/trim, `be_intra_eu_listing` état 723, `be_started_at`) et étend `accounting_status` à 18 valeurs (4 statuts BE : `independant_principal_be` / `independant_complementaire_be` / `srl_be` / `sa_be`). Nouveau `lib/compta/fiscalCalendarBE.ts` qui couvre toutes les obligations fédérales : TVA via Intervat (mensuelle ou trimestrielle, jour 20 du mois suivant), listing client annuel (31 mars), listing intra-UE état 723 trimestriel, IPP via Tax-on-web (~15 juillet), ISoc via Biztax (~30 sept pour exercice civil), 4 versements anticipés trimestriels (10 avril / 10 juillet / 10 octobre / 20 décembre) pour IPP et ISoc, cotisations INASTI/RSVZ trimestrielles (20 mars/juin/sept/déc) avec taux réduit pour les indépendants à titre complémentaire, dépôt comptes annuels BNB pour SRL/SA dans les 7 mois après l'AG. UI `BelgiqueFields` (BCE 10 chiffres, région, exercice comptable SRL/SA, franchise TVA + périodicité, toggle listing intra-UE). FEC reste FR-only (pas d'équivalent légal en BE — les contrôles s'appuient sur le PCMN). Dashboard `isVatable` étendu BE (assujetti si pas en franchise), taux TVA 21% pour le calcul TVA collectée. Avec le portage BE, le module compta couvre 4 pays francophones (FR + CH + PT + BE).
>   - **1q — Espagne** (Mai 2026) : ouverture de l'onglet aux users espagnols. Migration `20260510_compta_spain` ajoute 7 colonnes (`es_community` 17 CCAA + 2 ciudades autónomas, `es_company_number` NIF/CIF, `es_iva_regime` general/simplificado/recargo_equivalencia/exencion, `es_iva_periodicity` mensual/trimestral, `es_redeme` boolean, `es_irpf_method` directa/objetiva, `es_started_at`) et étend `accounting_status` à 22 valeurs (4 statuts ES : `autonomo_es` / `slu_es` / `sl_es` / `sa_es`). Nouveau `lib/compta/fiscalCalendarES.ts` qui couvre toutes les obligations : IVA Modelo 303 trimestriel (T1→20/04, T2→20/07, T3→20/10, T4→30/01) ou mensuel (CA > 6 M€ ou inscrit REDEME), Modelo 390 résumé annuel (30/01), Modelo 349 opérations intra-UE trimestriel, IRPF Modelo 130/131 pagos fraccionados trimestriels pour autónomos (estimación directa ou módulos), IRPF Modelo 100 déclaration annuelle (avril-juin), IS Modelo 200 annuel (1-25 juillet pour exercice civil) + Modelo 202 acomptes (20/04, 20/10, 20/12), RETA cotisations mensuelles via TGSS (réforme 2023, basées sur revenus réels), comptes annuels Registro Mercantil dans le mois suivant l'AG. **Spécificités régionales** : País Vasco + Navarra (Régimen Foral) → portail Hacienda Foral (euskadi.eus / navarra.es) au lieu d'AEAT. Canarias → IGIC (tipo general 7%, Modelos 420/425) au lieu d'IVA. Ceuta + Melilla → IPSI (hors scope MVP, le profil affiche un disclaimer). UI `EspagneFields` (sélecteur 19 CCAA avec disclaimer Foral/IGIC/IPSI dynamique, NIF/CIF, exercice comptable SLU/SL/SA, régime IVA, périodicité, REDEME, méthode IRPF pour autónomos). Dashboard `isVatable` étendu ES (assujetti hors exencion et hors Ceuta/Melilla), taux TVA 21% (péninsule + Baléares) ou 7% (Canarias IGIC). Avec le portage ES, le module compta couvre 5 pays (FR + CH + PT + BE + ES).
>   - **1r — Canada (toutes provinces + territoires)** (Mai 2026) : ouverture de l'onglet aux users canadiens, couverture des 13 juridictions (10 provinces + YT/NT/NU). Migration `20260510_compta_canada` ajoute 8 colonnes (`ca_province` ISO 3166-2 CA-XX, `ca_business_number` BN ARC 9 chiffres ou NEQ QC 10 chiffres, `ca_gst_registered` boolean, `ca_gst_periodicity` mens/trim/annuelle, `ca_petit_fournisseur` < 30 000 $/4 trim, `ca_fiscal_year_calendar` + `ca_fiscal_year_start_month` pour les sociétés, `ca_started_at`) et étend `accounting_status` à 26 valeurs (4 statuts CA génériques car la province discrimine via `ca_province` : `travailleur_autonome_ca` / `entreprise_individuelle_ca` / `inc_provincial_ca` / `inc_federal_ca`). Nouveau `lib/compta/fiscalCalendarCA.ts` qui couvre toutes les obligations : **TPS fédérale 5 % (ARC)** commune, déclinaisons provinciales — QC TVQ 9,975 % (Revenu Québec gère TPS+TVQ ensemble via FPZ-500), TVH harmonisée ON 13 % / NB+NL+NS+PE 15 %, BC PST 7 %, SK PST 6 %, MB RST 7 %, AB+YT+NT+NU TPS seule. Périodicité TPS : mensuelle (CA > 6 M$), trimestrielle (1,5–6 M$), annuelle (< 1,5 M$ avec 4 acomptes trim aux 30 avr/juil/oct + 31 jan). Impôt particulier T1 (ARC) et TP-1 (Revenu Québec au QC) — production 30 avril (15 juin pour autonomes mais paiement dû 30 avril), 4 acomptes provisionnels trimestriels aux 15 mars/juin/sept/déc si impôt > 3 000 $/an (1 800 $ au QC). Impôt société T2 (ARC) et CO-17 (Revenu Québec au QC) — production 6 mois après clôture, paiement à 2 mois (3 mois pour SPCC admissible à la déduction accordée aux petites entreprises), acomptes mensuels au 15. DAS (retenues à la source) mensuelles le 15 du mois suivant pour les sociétés avec employés (RPC/AE/impôt fédéral à l'ARC + RRQ/RQAP/FSS/impôt provincial à Revenu Québec au QC). PST/RST séparée (BC/SK/MB) : rappel mensuel via portail provincial. Mise à jour annuelle REQ pour les entreprises individuelles immatriculées au QC. UI `CanadaFields` (sélecteur des 13 juridictions avec étiquette dynamique du régime de taxes, BN/NEQ, toggle petit fournisseur, toggle inscription TPS, périodicité, exercice comptable pour les sociétés, disclaimer REQ pour entreprise individuelle au QC). Dashboard `isVatable` étendu CA (assujetti si `ca_gst_registered=true`), `vatRateNormal` étendu avec taux total combiné par province (5 → 14,975 %), nouveau seuil "petit fournisseur" 30 000 $ CAD avec conversion EUR→CAD via forex (rate fallback 1.48). `getEurForexRates` accepte maintenant CAD. Avec le portage CA, le module compta couvre 6 pays (FR + CH + PT + BE + ES + CA) et représente la première juridiction nord-américaine, avec un système de taxes le plus fragmenté supporté à ce jour (4 régimes différents pour 13 juridictions).
> - **Connexion CA réel partout dans Tipote (cross-app)** :
>   - Helper unifié `lib/compta/businessSummary.ts` → `getMonthlyRevenueSummary(userId, projectId)` qui agrège transactions PSP + saisies manuelles + fallback `offer_metrics` (pour les users SIO-only). Renvoie CA mois / YTD / comparaison N-1 / objectif / progression / jours restants.
>   - Widget `RevenueGoalProgress` (`components/business/`) affiché en haut de **Aujourd'hui** (`/app`), de la **page Stratégie** (`/strategy` — la mini-jauge utilise désormais aussi cette source) et de l'**onglet Compta** (`/settings?tab=compta`). Vocabulaire naturel : *"Plus que 4 774 € à faire en 14 jours — c'est jouable"*, couleurs adaptatives (vert si atteint, ambre si retard).
>   - **Coach IA contextualisé** : helper `lib/compta/businessContext.ts` qui formate un bloc texte injectable dans les prompts. Injecté dans `/api/coach/chat` (remplace l'ancien bloc REVENUS inline qui ne lisait que offer_metrics), `/api/coach/encouragement` (phrase quotidienne calibrée sur la progression réelle), `/api/strategy` (génération de stratégie + pyramide d'offres voient le CA réel pour proposer des paliers réalistes).
>   - **Page Mes Clients** enrichie : pour chaque client, matched par email avec les transactions PSP, on affiche le total encaissé + badge "Abonné" (paiement récurrent dans les 30j) ou "A arrêté son abo" (churn potentiel). Helper `lib/compta/clientRevenue.ts`, composant `ClientRevenueBadges`.
>   - **Page Analytics** : les "Résultats totaux" (Ventes + CA) lisent maintenant `transactions` + `manual_transactions` quand l'user a la compta configurée, avec badge "↗ Ventes & CA synchronisés depuis Stripe / PayPal / Mollie". Affiche aussi les commissions d'affiliation séparément si présentes. Endpoint `/api/analytics/compta-totals`. Visitors / signups / email stats restent sourcés depuis offer_metrics.
>   - **Cron daily milestones business** : nouveau cron `/api/cron/business-milestones` à 9h qui détecte 3 moments business utiles : 🎯 objectif atteint (≥100%), 📈 mi-parcours objectif (50-99% à partir du 10 du mois), ⚠️ alerte churn (au moins 1 abonné parti ce mois). 1 email max par (user, type, mois) — idempotence via la table `notifications` avec `meta.period`. Respecte `email_preferences.milestones` + rate-limit global.
> - **Sécurité serveur Hostinger** : nettoyage anti-malware (cron pourri résiduel `/tmp/.est1/.b4nd1d0` lié à un compromis ancien), désactivation `PasswordAuthentication` côté SSH, rotation de la clé SSH user (la clé `id_ed25519` historique dans `~/.ssh/authorized_keys` n'était pas reconnue par Béné → remplacée par une nouvelle paire `tipote_vps` ed25519). Crons Tipote dédoublonnés (`awk '!seen[$0]++'`).

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
- **Module Popquiz** (Mai 2026) : vidéo (YouTube/Vimeo/upload TUS resumable jusqu'à 2 GB) avec quiz interactifs incrustés à des timestamps précis, embed iframe pour intégration externe (`/embed/pq/{id}`)
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

**Onglet Compta (France uniquement, Mai 2026) :**

URL : `/settings?tab=compta`. Disponible uniquement pour les users avec `business_profiles.country` reconnu comme France (synonymes tolérés : "France", "FR", "française"…). Les autres pays voient un message "bientôt disponible".

Bandeau permanent en haut : *"Tipote t'aide à anticiper, pas à déclarer. Cet onglet ne remplace ni un comptable ni les déclarations officielles."*

Composé de plusieurs sections empilées :

1. **Progression vers l'objectif mensuel** (`RevenueGoalProgress`) — jauge avec montant fait / objectif, message contextuel ("plus que 4 774 € à faire en 14 jours"), couleurs adaptatives.
2. **Tableau de bord business** (`ComptaDashboard`) — 4 cards en haut (CA mois en cours avec delta vs N-1, depuis janvier avec delta, revenus récurrents = MRR, taux de remboursement) + graph 12 mois N vs N-1 + 2 cards (Mes clients ce mois-ci avec nouveaux/abonnés/perdus, Mes meilleures ventes top 5) + jauge franchise TVA pour les AE.
3. **Décomposition ventes directes vs commissions d'affiliation** — affichée uniquement si l'user a au moins une commission catégorisée (`category = 'affiliate'`). Split en EUR + barre de proportion bicolore mois courant + YTD.
4. **Mes connexions** — cartes Stripe / PayPal / Mollie avec statut (synchronisé il y a Xh / synchronisation initiale en cours / erreur / déconnecté). Boutons "Synchroniser maintenant" et "Déconnecter". Form de connexion avec guide pas-à-pas pour chaque PSP. Note de sécurité spéciale pour Mollie (pas de Restricted Key — clé give read+write).
5. **Saisies manuelles** — CRUD pour les paiements hors PSP (virement / espèces / chèque / autre). Form avec choix de catégorie (Vente / Commission affiliation / Autre).
6. **Configuration du statut** (`ComptaConfigForm`) — sélecteur 3 cartes (Particulier / Auto-entrepreneur / SASU) avec sous-formulaire dynamique (SIREN validé 9 chiffres, exercice fiscal, régime TVA, ACRE, versement libératoire, etc.). Liens vers service-public.fr / urssaf.fr / annuaire-entreprises.data.gouv.fr.

Cron de synchronisation des transactions : `/api/cron/sync-payments` à 5h du matin (delta depuis `last_sync_at - 1h`). Cron daily milestones : `/api/cron/business-milestones` à 9h. Cron de check des seuils fiscaux : `/api/cron/check-fiscal-thresholds` à 6h.

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

Accès restreint aux emails listés dans `lib/adminEmails.ts` (`isAdminEmail()`).

**Fonctionnalités :**

- Vue utilisateurs (search, filtres par plan)  
- Modifier plan, reset password, désactiver  
- Broadcast de notifications  
- Attribution de crédits bonus  
- Opérations en masse  
- Logs de changements de plan (audit trail)
- **Édition des seuils fiscaux** (`/admin/compta/fiscal-thresholds`, Mai 2026) — gestion centralisée des seuils TVA / taux IS pour les users compta, par (pays, année, catégorie). Édition inline avec URL source officielle, date d'effet, notes. Bouton "Ajouter un seuil" pour seeder 2027/2028 ou nouveau pays. L'impact est immédiat côté users (le dashboard compta relit la DB à chaque chargement). Le cron `check-fiscal-thresholds` envoie un email aux admins quand une valeur stockée n'est plus présente sur la page officielle (= changement détecté à valider).

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

- `offer_metrics` — métriques par offre par mois (alimenté auto par webhooks SIO NEW_SALE et par le sync `/api/cron/sio-sync-sales`)
- `analytics_entries` — données analytics manuelles

**Compta (Mai 2026) :**

- `payment_connections` — connexions PSP user (Stripe / PayPal / Mollie) ; `provider`, `api_key_encrypted` (AES-256-GCM, single string ou JSON pour PayPal multi-creds), `last_sync_at`, `initial_sync_done_at`, `last_sync_error`, `disabled_at` (soft-delete pour reconnexion). UNIQUE (user_id, project_id, provider).
- `transactions` — encaissements normalisés toutes sources (Stripe / PayPal / Mollie). Idempotence : UNIQUE (user_id, provider, provider_transaction_id) + dédup pré-upsert pour éviter "ON CONFLICT DO UPDATE 2× même row". Champs : amount_cents, currency, status (paid / partial_refund / refunded / failed / pending), refunded_cents, customer_email, customer_name, description, paid_at, refunded_at, metadata (JSONB), category (sale / affiliate / other — auto-détectée puis éditable), synced_at. RLS read-self.
- `manual_transactions` — saisies hors PSP (virement / espèces / chèque / autre) ; mêmes colonnes business + source_label + category. RLS self-all.
- `fiscal_thresholds` — table source de vérité pour les seuils TVA / taux IS / cotisations par (country, fiscal_year, category). UNIQUE (country, fiscal_year, category). Seed 2026 FR (vat_franchise_vente / services_bic / services_bnc). RLS read-all (les seuils sont publics). Édité via `/admin/compta/fiscal-thresholds`, vérifié par cron `/api/cron/check-fiscal-thresholds`.
- Colonnes ajoutées sur `business_profiles` (Mai 2026) : `country` (déjà existant, mais utilisé maintenant pour le country gate compta), `tipote_affiliate_id` (ID `sa…` Systeme.io pour le tracking commission du footer), `accounting_status` + `accounting_status_configured_at`, `particulier_revenue_type`, `ae_activity_type` + `ae_started_at` + `ae_acre` + `ae_versement_liberatoire` + `ae_vat_franchise`, `sasu_siren` + `sasu_fiscal_year_calendar` + `sasu_fiscal_year_start_month` + `sasu_vat_regime` + `sasu_vat_intra_enabled` + `sasu_dirigeant_remunere`.
- Colonne ajoutée sur `social_connections` : `disconnected_at TIMESTAMPTZ` (Mai 2026) — marker de déconnexion détectée, reset à NULL à chaque reconnexion OAuth.

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

### 9.8. Sync ventes → analytics (pull périodique)

Pour calculer le CA, le nombre de ventes par offre et la progression vers l'objectif `business_profiles.revenue_goal_monthly` sans demander à l'user de saisir manuellement, on pull `GET /api/sales` SIO :

- **Manuel** : `POST /api/analytics/sio-sync` (bouton "Synchroniser Systeme.io" dans `/analytics`)
- **Automatique** : cron quotidien `GET /api/cron/sio-sync-sales` (auth `X-Cron-Secret`, fenêtre 35 jours, séquentiel pour rester sous les rate-limits SIO, journalise sales/revenue/failures par user)

**Matching SIO product → offre Tipote** (cascade dans `lib/sio/salesSync.ts`) :
1. `sio_product_id` explicite renseigné dans Settings → Mes offres → binding 100% fiable
2. Nom de produit exact (insensible à la casse, normalisation espace)
3. Nom fuzzy (substring) — uniquement si une seule offre matche, sinon abstention
4. Prix unique — si une seule offre Tipote a exactement ce montant
5. Sinon → unmatched (compté dans `unmatchedRevenue` du résumé, exclu de l'agrégation par offre)

**Idempotence** : avant chaque upsert, on remet à 0 `sales_count` + `revenue` pour les couples (offer, month) touchés, puis on insère les fresh totals. Les compteurs saisis manuellement (`visitors`, `signups`) sont préservés. UNIQUE `(user_id, offer_name, month)` empêche les doublons. Le free plan SIO supporte l'API depuis 2026 — fonctionnalité accessible à tous les users qui ont configuré leur clé.

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
- **Gestion des clients** (suivi, notes, statuts, accompagnements avec suivi financier et progression) — **enrichie Mai 2026** : badge "Abonné" / "A arrêté son abo" + total encaissé par client (matché par email avec les transactions PSP)
- **Module Compta** (Mai 2026, France) — onglet dans Paramètres avec configuration statut (particulier / auto-entrepreneur / SASU + IS + TVA), connexions Stripe / PayPal / Mollie (sync 24 mois historique + cron daily), saisies manuelles (virement / espèces / chèque), tableau de bord business (CA mois/an, MRR, churn, refund rate, top produits, jauge franchise TVA), catégorisation ventes vs commissions affiliation, calendrier fiscal personnalisé. Connecté au coach IA, à la page Aujourd'hui, à la stratégie et à la page Analytics
- **Lien d'affiliation Tiquiz** (Mai 2026) — footer permanent sur les popquiz publics + embed iframe + quiz publics free, redirige vers `tipote.fr/part-tiquiz?sa=<id>` avec tracking commission via l'ID affilié SIO du créateur
- **Notifications de déconnexion sociale + post raté** (Mai 2026) — email immédiat dès qu'un token social meurt (LinkedIn / FB / IG / X / TikTok / Pinterest / Threads / Reddit) ou qu'un post programmé bascule en `failed`
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
