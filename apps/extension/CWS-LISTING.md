# Soumission Chrome Web Store — Tipote Boost

Document de référence pour la submission CWS. Copies prêtes à coller, screenshots à produire, justifications des permissions. À jour de la v0.1.0 du manifest.

---

## Champs du Store Listing

### Nom (32 caractères max)

```
Tipote Boost
```

### Description courte (132 caractères max)

```
Booste tes posts LinkedIn grâce à un pod d'engagement collaboratif. Auto-like et commentaires IA validés en 1 clic.
```

### Description longue (16 000 caractères max)

```
Tipote Boost transforme la portée de tes publications LinkedIn grâce à un pod d'engagement entre membres Tipote, ET t'aide à commenter rapidement n'importe quel post avec l'assistance d'une IA.

🚀 Mode pod — boost mutuel
Quand tu publies sur LinkedIn, les autres membres du pod reçoivent automatiquement une suggestion d'engagement : un like et 4 propositions de commentaires générées par IA. Ils valident en un clic le commentaire qu'ils veulent poster (ou l'éditent avant). Tes posts gagnent des likes et des commentaires de qualité dans les premières minutes — exactement quand l'algorithme LinkedIn décide de la portée.

💬 Mode quick comment — n'importe quel post
Sur n'importe quel post LinkedIn que tu visites, l'extension propose 4 angles de commentaires générés par IA. Tu choisis le ton, tu édites au besoin, tu publies. Productivité maximale, validation toujours manuelle.

✨ Les 4 tons de commentaires
- "Je suis d'accord" — pour appuyer un propos
- "Je ne suis pas d'accord" — pour ouvrir un débat constructif
- "Ajouter de la valeur" — pour enrichir la discussion
- "Poser une question" — pour relancer la conversation

🛡️ Anti-spam intégré
- Maximum 12 actions par heure et par membre (mode pod)
- Délais aléatoires entre actions
- Pause automatique si LinkedIn détecte une activité suspecte
- Jamais 100% du pod sur un même post (pattern naturel préservé)

🤝 Pod équitable
Un système de karma équilibre les boosts donnés et reçus. Pas de free-riders : si tu ne rends pas tes boosts, tu en reçois moins.

🔒 Confidentialité
Aucune donnée partagée avec un tiers. Stockage chez Supabase (UE). Le commentaire n'est jamais posté sans ton clic explicite. Tu peux désactiver l'extension ou supprimer ton compte à tout moment.

⚠️ Pré-requis
- Compte Tipote actif (https://www.tipote.fr/)
- Compte LinkedIn

Politique de confidentialité : https://app.tipote.com/legal/extension
```

### Catégorie

`Productivité` (Productivity) — sous-catégorie `Marketing`.

### Langue principale

`Français (France)`. On peut ajouter `English` dans une v2.

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

(adapter si une autre adresse est préférée)

---

## Permissions — justifications

CWS demande de justifier chaque permission. Voici les copies à coller dans le formulaire de submission.

### `storage`

> Nécessaire pour mémoriser localement l'état du compte de l'utilisateur (URN LinkedIn, pods rejoints, file d'attente des tâches d'engagement) entre les rechargements du service worker.

### `alarms`

> Nécessaire pour réveiller périodiquement le service worker afin de vérifier les nouvelles tâches d'engagement assignées au pod (poll de l'API Tipote toutes les 60 secondes).

### `host_permissions: https://*.linkedin.com/*`

> L'extension a besoin d'injecter un content script sur LinkedIn pour : (1) détecter les nouvelles publications de l'utilisateur, (2) afficher des suggestions de commentaires sur les posts d'autres membres du pod, (3) exécuter le like et le commentaire validés par l'utilisateur via les endpoints internes LinkedIn (Voyager). Aucune autre donnée n'est lue.

### `host_permissions: https://app.tipote.com/*` + `https://tipote.com/*`

> Le service worker communique avec le backend Tipote pour récupérer les tâches d'engagement assignées et y rapporter les actions validées par l'utilisateur. Aucune donnée n'est échangée avec un autre domaine.

### `externally_connectable: app.tipote.com`

> Permet à la page /boost du site Tipote d'envoyer un message à l'extension pour synchroniser l'état du compte (bouton "Synchroniser" affiché par l'utilisateur lui-même).

---

## Single purpose (justification single-purpose CWS)

```
Tipote Boost a une fonction unique et claire : faciliter le boost mutuel d'engagement sur LinkedIn entre les membres d'un pod collaboratif Tipote, via auto-like et suggestions de commentaires validés manuellement par l'utilisateur.
```

---

## Politique « Limited Use » (Google policy)

> Les données collectées par l'extension (URN LinkedIn, publications, actions d'engagement) sont utilisées **uniquement** pour la fonction de pod d'engagement. Aucune donnée n'est partagée avec un tiers, vendue, utilisée pour de la publicité ou pour entraîner des modèles d'IA tiers. Toutes les données sont stockées sur l'infrastructure Tipote (Supabase, UE) et supprimées en cas de désinstallation de l'extension ou de suppression du compte.

---

## Assets visuels à produire (avant submit)

### Icônes (déjà OK dans `public/icons/`)

- 16 × 16 ✓
- 32 × 32 ✓
- 48 × 48 ✓
- 128 × 128 ✓

### Screenshots Store (obligatoires, 1280 × 800 ou 640 × 400)

À produire en local après que l'extension marche bout en bout :

1. **Popup connecté** — état "✓ Connecté" + nom + nb pods
2. **Dashboard /boost** — Vue complète Extension installée + Compte LinkedIn lié + Pods + Karma
3. **Badge sur un post LinkedIn** — la pastille Tipote avec les 4 boutons de tons (Phase 2.5)
4. **Suggestions IA déployées** — les 3-4 commentaires proposés en mode ouvert (Phase 2.5)
5. **Stats karma cette semaine** — vue du karma avec quotas

Conseil : prendre un compte avec quelques boosts donnés / reçus pour que les chiffres ne soient pas à 0.

### Marquee / Promo tile (optionnel mais recommandé)

- Petite tuile promo : 440 × 280 — branding Tipote, slogan court
- Marquee (mise en avant) : 1400 × 560 — visuel hero

---

## Checklist finale avant submit

- [ ] Version 0.1.0 → bumper à 1.0.0 pour la première release publique
- [ ] Tester sur 2-3 navigateurs Chrome propres (sans cache extension)
- [ ] Vérifier que `chrome://extensions` ne montre aucun warning
- [ ] Confirmer que la page /legal/extension est accessible publiquement (sans login)
- [ ] Confirmer que tipote.fr existe et n'est pas en construction
- [ ] Préparer un compte LinkedIn de demo (pour le reviewer Google)
- [ ] Préparer un compte Tipote de demo
- [ ] Tester le flow complet : install → login Tipote → ouvrir LinkedIn → matching → recevoir une tâche → liker + commenter
- [ ] Packager le zip : `cd apps/extension && npm run build && cd dist && zip -r ../tipote-boost-v1.0.0.zip .`

---

## Délais et processus CWS

- Frais one-time développeur : 5 USD (compte Google déjà déclaré ?)
- Temps de review typique : 3-7 jours pour une première soumission
- Sensible : extensions qui touchent LinkedIn = scrutin accru parce que LinkedIn a déjà fait pression sur Google pour bannir les pods d'engagement (Linkjuice, etc.). Anticiper potentielles questions sur :
  - Pourquoi accéder à linkedin.com → réponse : single-purpose au-dessus
  - Le commentaire est-il auto ? → réponse : NON, validation manuelle systématique, 4 tons, édition libre
  - Spam ? → réponse : throttling strict (max 12/h), cap par pod, anti-bannissement

Si rejet sur ce dernier point : préparer un appel mettant en avant que tous les commentaires nécessitent une validation manuelle utilisateur — c'est ce qui nous différencie d'un bot d'engagement automatisé.
