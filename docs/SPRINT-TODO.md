# TODO — Sprint en cours (à reprendre)

> **Dernière session : 24/05/2026 (soir).** Commencer par « 🌅 À reprendre demain ».

## 🌅 À reprendre demain (priorité)

### 1. Vérifier le tracking Meta (pixel + CAPI) — code livré, EN ATTENTE config + déploiement
Le code est poussé (Tipote + Tiquiz). Il reste des actions côté Meta/déploiement :
- [ ] **Déployer** Tipote + Tiquiz et **appliquer les 2 migrations** `*_meta_capi_token.sql`
      AVANT/avec le deploy (sinon la sauvegarde des réglages plante : colonne manquante).
- [ ] **Générer le token CAPI** : Events Manager → dataset → Paramètres → Conversions API
      → « Générer un token d'accès » → le coller dans Réglages → Tracking
      (nouveau champ « Token Conversions API Meta »).
- [ ] **Couper le bruit** : Events Manager → dataset → Paramètres → désactiver le suivi
      automatique des événements (Boutons). Ne casse plus la détection cette fois.
- [ ] **Vérifs (Gwenn)** : Pixel Helper détecte le pixel ; colonne Intégration = « Meta Pixel »
      (et plus « Aucune intégration ») ; Test des événements = PageView + QuizStart + Lead ;
      le **Lead affiche « 2 sources »** (= déduplication navigateur+serveur OK).
- [ ] Si erreur CAPI dans Test des événements → me transmettre le message exact de Meta.

### 2. Vérifs visuelles post-déploiement
- [ ] `/popquizzes` (Tipote) : largeur + espacement alignés sur les autres pages (Leads).
- [ ] Quiz compact dans le popquiz (Tipote + Tiquiz) sur mobile : centré, lisible, aéré.
- [ ] Studio visuels (Tipote) : **édition du texte** (taper pour modifier le texte sur le
      visuel), **color picker** (cliquer/glisser dans le picker + appliquer la couleur sans
      qu'il se referme), et italique/souligné par mot. Corrigés le 25/05 mais **non testés en
      visuel côté dev** → à valider (focus textarea Fabric dans le Dialog + key stable toolbar).
- [ ] Sélecteur de clé API SIO par quiz (Tiquiz) : visible près du tag, choix persistant.

## 🎨 Générateur de visuels IA (dashboard affilié uniquement pour l'instant)
Vision : IA (branding+logo) + édition perso, qualité pro, coût maîtrisé. OpenAI
pour les images. Crédits = Tipote uniquement (pas affiliate/Tiquiz). Portage
Tiquiz/Tipote PLUS TARD (quiz/sondages/blog/capture-vente).

**Livré (Phase 1) :**
- ✅ Génération de FOND IA (route serveur, clé owner, no-credits) + prompt
  anti-"image IA moche" (photoréaliste, personne/paysage/abstrait/spatial) +
  ambiance couleurs de marque + zone propre pour le texte + bouton variante.
- ✅ Génération de TEXTE IA (titre stop-scroll + sous-titre + CTA) à partir du
  sujet, dans la langue de l'user, injecté dans les calques éditables.
- ✅ Voile de contraste (Aucun/Sombre/Clair) pour lisibilité texte sur fond IA.
- ✅ Champ "Sujet" partagé (pilote fond IA + textes IA). i18n 6 langues.

**À tester en priorité (gate tout le reste) :**
- [ ] **Qualité des fonds IA** (pas "moche/vu partout") — c'est LE test.
- [ ] Qualité de la copy générée (titre/CTA pertinents, bonne langue).
- [ ] ⚠️ OpenAI exige une **org vérifiée** pour `gpt-image-1` (sinon erreur) —
      vérifier dans le dashboard OpenAI si la génération échoue.

**Reste à faire (roadmap) :**
- [ ] Flèches / emojis / graphiques (décorations, calques au-dessus).
- [ ] Variantes en lot (plusieurs fonds + textes d'un coup, l'user choisit).
- [ ] IA inspirée du **logo** (aujourd'hui : couleurs de marque seulement ;
      le logo est overlay mais n'inspire pas encore la scène — via image-edit).
- [ ] Auto-contraste intelligent (voile activé/adapté automatiquement).
- [ ] Format 1.91:1 (1200×630) pour blog/OG/hero (manquant).

## ✅ Livré le 25/05
- Studio visuels : **refonte layout modale** (stage qui fit, plus de saut au focus),
  **color picker** réparé (pointer-events dans le Dialog Radix + anti-fermeture + flip
  vers le haut), et **i18n complète** : namespaces next-intl `visualStudio` + `colorPicker`
  traduits dans les **6 langues** (fr/en/es/it/pt/pt-BR/ar), recâblage ImageStudio +
  barre flottante + ColorSwatchPicker (Tipote ET Tiquiz) + props VisualGallery.
- **Dette i18n/responsive restante** (à finir pour respecter la règle "tout multilangue") :
  - `VisualGallery` (page affiliée Promouvoir) : titres/boutons encore en dur FR
    ("Créer un visuel", "Visuels singles", etc.) → relève de l'i18n du contenu affilié
    (déjà repérée : contenu Promouvoir FR-only).
  - Champ "Token Conversions API Meta" dans les réglages (Tiquiz `SettingsClient` +
    Tipote `SettingsTabsShell`) : libellé + aide en dur FR (ajoutés par moi) → à i18n.
  - `ColorSwatchPicker` Tiquiz : i18n faite, mais il lui manque les fixes UX récents du
    picker (flip/pointer-events/anti-fermeture) faits côté Tipote → à synchroniser SI le
    picker Tiquiz est utilisé dans des modales.
  - Studio : layout responsive en place (breakpoints lg) mais **non testé sur mobile réel**.
- Studio visuels : **fix édition du texte** (la textarea cachée Fabric vivait sur
  `document.body`, hors du focus-trap du Dialog Radix → clavier KO ; pointée sur
  `canvas.wrapperEl`) + **fix color picker** (la barre flottante se remontait à chaque
  changement de plage → picker fermé ; keyée par `layerId` stable) — suite retours Béné
- Pixel/CAPI : la migration `default_meta_capi_token` doit être lancée **dans les 2 bases
  Supabase** (Tiquiz = `profiles`, Tipote = `business_profiles`) — sinon erreur
  « column not found in schema cache » au save des réglages (en cours côté Gwenn)

## ✅ Livré le 24/05 (session soir)
- Quiz compact dans l'overlay popquiz : centrage vertical (fix 100vh iframe), police `vmin`
  adaptative paysage/portrait, police d'intro réduite sur mobile, espacement inter-éléments
  garanti — **Tiquiz + Tipote**
- Sélecteur de clé API Systeme.io **par quiz** monté dans l'éditeur (backend déjà en place) — Tiquiz
- Pixel Meta : **réactivation autoConfig** (corrige « Aucune intégration » + ré-active
  l'Advanced Matching) + events enrichis (`content_name`, `eventID`) — Tiquiz + Tipote
- **Conversions API serveur** (event Lead, `user_data` hashé SHA-256, dédup via `event_id`
  partagé) — Tiquiz + Tipote. No-op tant que le token n'est pas configuré.
- Studio visuels : **rich text complété** (italique + souligné par plage) — Tipote
- `/popquizzes` (Tipote) : mise en page alignée sur les autres pages (conteneur
  `max-w-[1200px] mx-auto space-y-5` qui manquait)

## ✅ Livré récemment
- Dashboard affilié multilang (FR/EN + stubs ES/IT/PT/AR)
- Guide de lancement 6 étapes + badges 6 paliers
- Link in Bio : avatar uploader, options par bouton, fix bug "2 pages s'ouvrent"
- Refonte UI Link in Bio + PageBuilder alignée sur le pattern wysiwyg quiz (DndKit, auto-save, labels UPPERCASE)
- Sidebar app masquée en mode éditeur (PagesClient)
- Mobile-responsive sur les 4 éditeurs (QuizDetailClient, SurveyDetailClient, LinkinbioEditor, PageBuilder)

## 🔜 À faire ensuite (par ordre de priorité suggéré)

### Pixel Meta / GA / Ads (bug Gwenn — code livré, vérif en attente)
- ✅ Server-render le pixel sur toutes les pages publiques (quiz, survey,
  popquiz, hosted pages, link-in-bio, custom domains) — Tipote + Tiquiz
- ✅ Fallback sur le défaut profil pour les quiz/popquiz/pages sans pixel explicite
- ✅ Migration business_profiles default_* (Tipote) pour le save settings
- ✅ Event Lead/conversion sur les pages de capture + link-in-bio (pas que les quiz)
- ✅ (24/05) **autoConfig RÉACTIVÉ** : le `autoConfig=false` cassait la reconnaissance
  du pixel (« Aucune intégration » remonté par Gwenn 24/05) et l'Advanced Matching.
  Retour au code standard. Le bruit SubscribedButtonClick se coupe désormais dans
  l'UI Events Manager (toggle), pas en code.
- ✅ (24/05) **Conversions API server-side (CAPI)** pour l'event Lead : envoi serveur
  dédupliqué avec le pixel (`event_id` partagé), `user_data` hashé. ⚠️ Nécessite
  token CAPI + migration + déploiement → voir « 🌅 À reprendre demain ».

### Traductions ES/IT/PT/AR du dashboard affilié
✅ Fait (24/05) : les 4 locales sont désormais des traductions complètes
et naturelles (plus des stubs EN). Tous les placeholders préservés.
Typecheck garantit la complétude (AffiliateDict). AR en RTL (le layout
applique dir="rtl" automatiquement).

### Classement top 10 anonymisé
✅ Fait (24/05) : LeaderboardCard sur l'overview. Rank par nombre de
ventes du mois (égalité départagée par commission cumulée), pseudonyme
stable "aff-xxxx" dérivé du sa, ligne "Toi" mise en avant, rang affiché
même hors top 10. Masqué tant que < 3 affiliés actifs ce mois (message
d'attente). Carte "coming_soon" retirée de l'overview.

## ⏳ En attente de validation Béné avant de faire
- Mettre le lien vers le dashboard affilié dans les réglages Tiquiz +
  Tipote (UNIQUEMENT après validation complète de Béné).

### PopquizEditClient WYSIWYG
Pour aligner sur le pattern quiz, popquiz devrait passer de AppShell + form-style
à fullscreen wysiwyg sidebar+preview. Sprint dédié 1-2 jours. Pas bloquant —
l'éditeur actuel marche, juste pas cohérent visuellement avec les autres.

### Version Tipote du contenu Promouvoir (dashboard affilié)
Reportée car Tipote n'est pas encore en vente (juste waiting list). Quand
Tipote sortira, rédiger 8 emails + 24 posts + visuels Tipote. Pour
l'instant la section Promouvoir n'a que Tiquiz.

### Refonte UI Link in Bio (suite)
Quick wins faits. Reste éventuellement :
- Migration vers @dnd-kit (fait pour les blocs, peut-être pour autres listes)
- Audit polish général

### Mobile editors validation en vrai
On a livré les overlay sidebar sur mobile mais pas testé réellement sur un
device. À valider notamment : touch drag-drop, overlay backdrop, scroll
behaviour iOS Safari.
