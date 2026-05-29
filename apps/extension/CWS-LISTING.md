# Soumission Chrome Web Store — Tipote Boost

Document de référence pour la submission CWS. Copies prêtes à coller, screenshots à produire, justifications des permissions.

**Statut** : v1.0.0 (LinkedIn-only) déjà validée. v1.3.0 (multi-plateformes) refusée le 2026-05-28 pour **keyword spam** (réf. « Yellow Argon »). Cette révision corrige les textes et repart en review.

> 🚫 **Cause exacte du rejet (à NE PAS reproduire)** : la description longue contenait la ligne brute `LinkedIn, Facebook, Threads, Instagram, X (Twitter), TikTok et Reddit. Le même flow sur les 7 plateformes`. Google l'a lue comme un empilement de mots-clés de marques (« trop de mots-clés / mots-clés non pertinents »). Les noms de réseaux énumérés en liste dans les **métadonnées CWS** (nom, description courte, description longue) sont un motif de rejet quasi-systématique en re-review.
>
> ✅ **Règle pour cette fiche** : on ne liste JAMAIS les noms de plateformes en énumération dans les champs CWS. On décrit la fonction (« sur les réseaux sociaux que tu utilises déjà »). La couverture par plateforme se montre dans les **captures d'écran** (un screenshot par réseau, voir plus bas) et sur **tipote.fr** (notre site, hors-périmètre de la policy CWS) — pas dans le texte de la fiche.
>
> ⚠️ **Tout le texte de la fiche est rédigé en anglais** : l'extension est internationale (default locale = EN, cf. `src/i18n.ts`). Pas de français dans les champs CWS.

> ⚠️ **Important** : on **met à jour la fiche existante**, on ne crée pas une nouvelle extension. Sinon on perd les utilisateurs déjà installés, les notes, et l'extension ID (qui apparaît dans `externally_connectable`). Dans le Developer Dashboard, ouvrir la fiche existante → **Package** → uploader le nouveau zip.

---

## Champs du Store Listing

### Nom (32 caractères max)

```
Tipote Boost
```

### Description courte (132 caractères max — limite **stricte** côté CWS, l'upload est rejeté au-delà)

```
Grow your reach with a collaborative engagement pod, plus AI comment suggestions you validate in one click on any post.
```

> Identique au champ `description` du `manifest.json` — Chrome utilise les deux. Si tu modifies l'un, modifie l'autre. (119 caractères, OK.)

### Description longue (16 000 caractères max)

> ⚠️ Aucune énumération de noms de plateformes ici (cf. cause du rejet en haut du doc). On parle de « the social networks you already use ». Les captures d'écran montrent chaque réseau.

```
Tipote Boost amplifies your reach through a collaborative engagement pod between Tipote members, and helps you comment on any post quickly with AI assistance.

🌐 One workflow, everywhere you post
No more juggling a different tool for every site. Tipote Boost brings the exact same workflow to the social networks where you already build your audience.

🚀 Pod mode — mutual boost
When you publish on a supported network, other pod members receive an engagement suggestion: a like and 4 AI-generated comment ideas. They validate the comment they want to post in one click (or edit it first). Your posts earn quality engagement in the first minutes, when reach matters most.

💬 Quick comment mode — any post
On any post you visit, the extension suggests 4 AI-generated comment angles. You pick the tone, edit if needed, and publish. Maximum productivity, with manual validation every time.

✨ The 4 comment tones
- "I agree" — to back up a point
- "I disagree" — to open a constructive debate
- "Add value" — to enrich the discussion
- "Ask a question" — to keep the conversation going

🛡️ Built-in anti-spam
- Up to 12 actions per hour per member (pod mode)
- Randomized delays between actions
- Automatic pause if the platform detects suspicious activity
- Never the whole pod on the same post (a natural pattern is preserved)
- Always manual validation: no comment is ever posted without an explicit click from you

🤝 Fair pod
A karma system balances the boosts you give and receive. No free-riders: give fewer boosts, get fewer back.

🔒 Privacy
No data is shared with third parties. Storage on Supabase (EU). Comments are never posted without your explicit click. You can disable the extension or delete your account at any time.

⚠️ Requirements
- An active Tipote account (https://www.tipote.fr/)
- At least one account on a supported social network

Privacy policy: https://app.tipote.com/legal/extension
```

### Catégorie

`Productivité` (Productivity) — sous-catégorie `Marketing`.

### Langue principale

`English (United States)`. L'extension est internationale (default locale EN, cf. `src/i18n.ts`) → on rédige tous les champs CWS en anglais.

### URL du site web (manifest `homepage_url`)

```
https://www.tipote.fr/
```

### Politique de confidentialité (URL — OBLIGATOIRE)

```
https://app.tipote.com/legal/extension
```

### Email de support développeur

```
support@tipote.fr
```

---

## Single purpose (justification single-purpose CWS)

Formulé large pour couvrir les 7 plateformes dès maintenant, sans repasser en review à chaque ajout de réseau dans la liste.

```
Tipote Boost has one clear purpose: to make it easy for members of a collaborative Tipote pod to boost each other's engagement on the social networks they already use, through AI-suggested likes and comments that the user validates manually. Every write action (like, comment) requires an explicit click — there is no hidden automation.
```

---

## Permissions — justifications

CWS demande de justifier chaque permission. **L'ajout de host_permissions sur 6 nouveaux domaines déclenche presque certainement une review « in-depth »** (3–10 jours au lieu de 1–2). Les justifications ci-dessous sont à coller telles quelles dans le formulaire de submission.

### `storage`

> Nécessaire pour mémoriser localement l'état du compte de l'utilisateur (URN / identifiants de profil par plateforme, pods rejoints, file d'attente des tâches d'engagement, paramètres) entre les rechargements du service worker.

### `alarms`

> Nécessaire pour réveiller périodiquement le service worker afin de vérifier les nouvelles tâches d'engagement assignées au pod (poll de l'API Tipote toutes les 60 secondes). Les service workers MV3 étant ré-endormis agressivement par Chrome, `alarms` est la seule façon fiable d'avoir un polling de fond.

### `clipboardWrite`

> Nécessaire pour le bouton « Copier le commentaire » de la popup : l'utilisateur peut récupérer le texte généré par l'IA pour le coller manuellement ailleurs (DM, autre composer). Aucune lecture du presse-papier, écriture uniquement, déclenchée par un clic.

### `host_permissions: https://*.linkedin.com/*`

> Le content script injecté sur LinkedIn détecte les publications créées par l'utilisateur lui-même (pour les proposer comme tâche aux autres membres du pod) et affiche, sur les posts d'autres membres, un badge avec 4 suggestions de commentaires. L'action write (like / commentaire) passe par les endpoints internes LinkedIn (Voyager) et n'est jamais déclenchée sans clic explicite de l'utilisateur. Aucune autre donnée de la page n'est lue ou exfiltrée.

### `host_permissions: https://*.facebook.com/*`

> Même rôle que pour LinkedIn, adapté au DOM Facebook : détection des publications du profil de l'utilisateur, affichage d'un badge de suggestions sur les posts du fil, action write (like / commentaire) déclenchée uniquement après validation manuelle de l'utilisateur. Aucune lecture des messages privés, des amis, des groupes hors-flux public.

### `host_permissions: https://*.threads.net/*` et `https://*.threads.com/*`

> Même rôle, adapté au DOM Threads. Les deux domaines sont nécessaires : Meta migre progressivement les utilisateurs de threads.net vers threads.com selon la région et la date de création du compte. Sans les deux, l'extension ne fonctionnerait que pour la moitié des utilisateurs.

### `host_permissions: https://*.instagram.com/*`

> Même rôle, adapté au DOM Instagram. Limité aux posts publics du fil et au profil de l'utilisateur. Aucune lecture des DM, des stories privées, du contenu autre que le fil public.

### `host_permissions: https://x.com/*`, `https://*.x.com/*`, `https://twitter.com/*`, `https://*.twitter.com/*`

> Même rôle, adapté au DOM X (anciennement Twitter). Les deux noms de domaine sont nécessaires : X a renommé twitter.com en x.com en 2024 mais twitter.com reste accessible pour de nombreux utilisateurs / vieux liens. Sans les deux, l'extension serait inutilisable pour les comptes encore servis sur l'ancien domaine.

### `host_permissions: https://*.tiktok.com/*`

> Même rôle, adapté au DOM TikTok. Limité au fil public et aux commentaires des vidéos visitées par l'utilisateur. Aucune interaction avec les DM ou le contenu privé.

### `host_permissions: https://*.reddit.com/*` et `https://reddit.com/*`

> Même rôle, adapté au DOM Reddit (old + new Reddit). Les deux variantes sont nécessaires : `reddit.com` (sans sous-domaine) sert old.reddit.com pour certains comptes ; les autres pages passent par `www.reddit.com`. Suggestions de commentaires sur les posts publics uniquement.

### `host_permissions: https://app.tipote.com/*` + `https://tipote.com/*`

> Le service worker communique avec le backend Tipote pour récupérer les tâches d'engagement assignées et y rapporter les actions validées par l'utilisateur. Aucune donnée n'est échangée avec un autre domaine que Tipote.

### `externally_connectable: app.tipote.com`

> Permet à la page /boost du site Tipote d'envoyer un message à l'extension pour synchroniser l'état du compte (bouton « Synchroniser » affiché par l'utilisateur lui-même). Sans cela, l'utilisateur devrait re-saisir manuellement son token dans la popup.

### `web_accessible_resources: injected.js` (limité à `*.linkedin.com`)

> L'extension expose un petit script (injected.js) chargé dans le contexte de la page LinkedIn uniquement, pour détecter par interception réseau locale les publications créées par l'utilisateur (LinkedIn n'émet pas d'event DOM utilisable pour ça). Cette détection est strictement passive : aucune donnée n'est exfiltrée vers un tiers, seul l'identifiant URN du post créé par l'utilisateur lui-même est transmis au backend Tipote. Cette ressource n'est exposée qu'au domaine LinkedIn, les autres plateformes utilisent l'observation DOM standard.

### Anti-abus intégré (justification « Limited Use »)

> Toutes les actions write (like, commentaire) sur l'ensemble des 7 plateformes sont strictement encadrées côté extension :
> - Maximum 12 actions par heure et par compte (sliding window persisté localement)
> - Délai gaussien aléatoire entre 3 et 25 secondes avant chaque action (mean 8s, stddev 4s) pour imiter un comportement humain
> - Pause automatique de 30 minutes si la plateforme renvoie HTTP 429
> - Pause automatique de 24 heures en cas de challenge / captcha détecté
> - L'utilisateur valide systématiquement le commentaire avant publication (4 tons proposés, édition libre du texte) — il n'y a aucun mode entièrement automatique

---

## Politique « Limited Use » (Google policy)

> Les données collectées par l'extension (identifiants de profil par plateforme, publications créées par l'utilisateur lui-même, actions d'engagement validées) sont utilisées **uniquement** pour la fonction de pod d'engagement. Aucune donnée n'est partagée avec un tiers, vendue, utilisée pour de la publicité ou pour entraîner des modèles d'IA tiers. Toutes les données sont stockées sur l'infrastructure Tipote (Supabase, UE) et supprimées en cas de désinstallation de l'extension ou de suppression du compte.

---

## Assets visuels à produire (avant submit)

### Icônes (déjà OK dans `public/icons/`)

- 16 × 16 ✓
- 32 × 32 ✓
- 48 × 48 ✓
- 128 × 128 ✓

### Screenshots Store (obligatoires, 1280 × 800 ou 640 × 400)

À produire en local. Pour la review « in-depth », **avoir au moins 2 captures par nouvelle plateforme** rassure le reviewer que la fonctionnalité existe vraiment partout :

1. **Popup connecté** — état « ✓ Connecté » + nom + nb pods
2. **Dashboard /boost** — Vue complète Extension installée + comptes liés + Pods + Karma
3. **Badge sur un post LinkedIn** — pastille Tipote avec les 4 boutons de tons
4. **Badge sur un post Facebook** — même chose, sur un post du fil FB
5. **Badge sur un post X / Twitter**
6. **Badge sur un post Instagram / Threads** (au choix)
7. **Badge sur une vidéo TikTok ou un post Reddit** (au choix)
8. **Suggestions IA déployées** — les 4 commentaires proposés en mode ouvert
9. **Stats karma cette semaine** — vue du karma avec quotas

Conseil : prendre un compte avec quelques boosts donnés / reçus pour que les chiffres ne soient pas à 0.

### Marquee / Promo tile (optionnel mais recommandé)

- Petite tuile promo : 440 × 280 — branding Tipote, slogan court « 7 réseaux, 1 extension »
- Marquee (mise en avant) : 1400 × 560 — visuel hero avec les 7 logos de réseaux

---

## Notes pour le formulaire CWS (à savoir avant de soumettre)

### Onglet « Privacy practices »

C'est l'écran qui fait le plus rejeter. Cocher / remplir :

- **Single purpose** → coller le bloc « Single purpose » plus haut
- **Permissions justification** → pour CHAQUE permission listée par CWS, coller la justification correspondante plus haut
- **Data usage disclosure** → cocher : `Personally identifiable information` (l'email Tipote) + `User activity` (actions d'engagement). NE PAS cocher health, financial, location, web history, etc.
- **Data handling certification** :
  - ✅ Je n'utilise / transfère pas les données pour des objectifs sans lien avec la fonctionnalité unique de l'extension
  - ✅ Je n'utilise / transfère pas les données pour vendre ou pour de la publicité
  - ✅ Je n'utilise / transfère pas les données pour déterminer la solvabilité ou pour du crédit

### Onglet « Distribution »

- **Public** : `Public`
- **Régions** : `All regions`
- **Audience** : `Aucune information collectée auprès d'enfants` (cocher la déclaration)

---

## Checklist finale avant submit

- [x] Version 1.0.0 → 1.3.0 (LinkedIn-only → multi-plateformes) — fait
- [x] manifest.json à jour avec les 7 plateformes en content_scripts + host_permissions — fait
- [x] CWS-LISTING.md à jour (multi-plateformes) — fait
- [x] **Fix rejet « keyword spam » (2026-05-28)** : description longue + courte + `manifest.json` réécrites en anglais, sans aucune énumération de noms de plateformes — fait
- [ ] **Re-zip** après le fix manifest : le `description` du manifest a changé → rebuild + re-upload du package (sinon le « Résumé issu du package » reste l'ancien texte FR)
- [ ] Coller la NOUVELLE description longue (bloc anglais ci-dessus) dans Store listing → Description, à la place de l'ancienne qui contenait la liste des 7 réseaux
- [ ] Soumettre + (option) faire appel via Version → État si on veut contester, mais le plus rapide est de re-soumettre la révision corrigée
- [ ] Build du package : `cd apps/extension && npm install && npm run build`
- [ ] Zip du contenu de `dist/` (pas du dossier lui-même) :
      `cd apps/extension/dist && zip -r ../tipote-boost-v1.3.0.zip .`
- [ ] Tester sur un Chrome propre (sans cache extension) : install unpacked depuis `apps/extension/dist`, vérifier qu'aucune plateforme ne provoque d'erreur dans `chrome://extensions`
- [ ] Vérifier que la page /legal/extension est accessible publiquement (sans login)
- [ ] Confirmer que tipote.fr et app.tipote.com répondent en 200
- [ ] Préparer un compte de demo pour chaque plateforme (au moins LinkedIn + Facebook + X)
- [ ] Préparer un compte Tipote de demo
- [ ] Upload du zip dans le Developer Dashboard → fiche existante → Package → Upload new package
- [ ] Remplir l'onglet Privacy practices (toutes les justifications de ce doc)
- [ ] Mettre à jour la description longue dans Store listing (le bloc « Description longue » de ce doc)
- [ ] Submit for review

---

## Délais et processus CWS

- **Temps de review attendu** : 3–10 jours (review « in-depth » presque certaine à cause de l'ajout de 6 host_permissions). Ne pas s'inquiéter avant J+10.
- **Pendant la review** : la version 1.0.0 (LinkedIn-only) reste live pour les utilisateurs existants. Zéro downtime.
- **Sensible** : extensions qui touchent LinkedIn / X = scrutin accru car ces plateformes ont déjà fait pression sur Google pour bannir les pods d'engagement (Linkjuice, etc.). Anticiper d'éventuelles questions sur :
  - Pourquoi 7 réseaux ? → réponse : single-purpose au-dessus (pod d'engagement multi-réseaux pour créateurs)
  - Les commentaires sont-ils automatiques ? → réponse : **NON, validation manuelle systématique**, 4 tons, édition libre — c'est le point qui nous différencie d'un bot d'engagement automatisé
  - Spam ? → réponse : throttling strict (max 12/h tous réseaux confondus), cap par pod, anti-bannissement

Si rejet : préparer un appel mettant en avant la validation manuelle systématique de chaque action write. C'est notre différenciation principale par rapport à un bot automatisé.
