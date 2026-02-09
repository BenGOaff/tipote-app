# capture-02 — Export Systeme.io (Tipote)

Ce template est exporté par Tipote sous forme de **2 blocs HTML** (BLOC 1 + BLOC 2) à coller dans Systeme.io.

✅ Le rendu est fidèle au template preview : Tipote remplace les textes par ceux de ton offre/persona.

---

## 1) Coller les blocs dans Systeme.io

1. Systeme.io → **Pages** → crée une nouvelle page.
2. Ajoute un bloc **Code HTML** en haut de page → colle **BLOC 1**.
3. Dans le BLOC 1, à l’endroit indiqué **“ICI : AJOUTE TON FORMULAIRE NATIF SYSTEME.IO”** :
   - ajoute un **Formulaire natif** (Prénom + Email)
   - puis supprime le bloc “tpt-slot” (ou remplace-le directement par ton formulaire).
4. Ajoute un second bloc **Code HTML** juste en dessous → colle **BLOC 2**.

Le **BLOC 1** contient aussi les **fonts + le CSS** : il doit être collé en premier.

---

## 2) Boutons (CTA)

Tous les boutons du template pointent vers `#tpt-form` (le formulaire).
👉 Résultat : clic = scroll direct vers le formulaire.

Si tu préfères, tu peux aussi remplacer les boutons HTML par des **boutons natifs Systeme.io** (même texte) : c’est souvent plus simple à éditer ensuite.

---

## 3) Images des résultats (témoignages)

Tipote peut injecter une URL d’image par témoignage :
- `testimonials.0.image_url`
- `testimonials.1.image_url`
- `testimonials.2.image_url`

Si une URL est présente, l’image est affichée en background dans la carte.

---

## 4) Liens légaux

Tipote remplit (si tu les as) :
- `legal_privacy_url` / `legal_privacy_text`
- `legal_mentions_url` / `legal_mentions_text`
- `legal_cgv_url` / `legal_cgv_text`

Sinon, tu peux les modifier directement dans Systeme.io.
