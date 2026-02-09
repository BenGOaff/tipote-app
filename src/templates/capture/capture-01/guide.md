# capture-01 — Export Systeme.io (Tipote)

Ce template est exporté par Tipote sous forme de **2 blocs HTML** (BLOC 1 + BLOC 2) à coller dans Systeme.io.

✅ Le rendu est **identique au template preview** (pixel perfect) : Tipote remplace uniquement les textes par ceux de ton offre/persona.

---

## 1) Coller les blocs dans Systeme.io

1. Systeme.io → **Pages** → crée une nouvelle page.
2. Ajoute un bloc **Code HTML** en haut de page → colle **BLOC 1**.
3. Ajoute un second bloc **Code HTML** juste en dessous → colle **BLOC 2**.

Le **BLOC 1** contient aussi les **fonts + le CSS** : il doit être collé en premier.

---

## 2) Popup obligatoire pour ce template (capture-01)

Ce template est pensé pour convertir via une **popup** : le formulaire est dans la popup, et tous les CTA doivent l’ouvrir.

### Créer la popup
1. Dans l’éditeur Systeme.io, crée une **Popup**.
2. Dans la popup, ajoute un **Formulaire natif Systeme.io** :
   - Champs conseillés : **Prénom + Email** (option : Téléphone)
   - Bouton : ton CTA (“Télécharger”, “Accès immédiat”, etc.)
3. (Optionnel) Ajoute une phrase de réassurance : “Accès immédiat • Zéro spam”.

### Relier les CTA à la popup (recommandé)
Systeme.io ne permet pas toujours de relier proprement un **bouton HTML** à une popup via l’UI.

👉 Le plus fiable :
- Remplace chaque bouton CTA du template par un **Bouton Systeme.io natif**,
- puis règle l’action : **Ouvrir une popup** → choisis ta popup.

Tu peux ensuite supprimer le CTA HTML du bloc (ou le laisser si tu le masques côté éditeur).

Alternative :
- Si ton setup le permet, tu peux faire pointer `cta_href` vers la popup (méthode Systeme.io selon ta config).

---

## 3) Logo / photo / liens légaux

Tipote remplit automatiquement (si tu les as fournis dans Tipote) :

- **logo_text** + **logo_subtitle**
- **logo_image_url** : affiche un logo au-dessus du texte sans casser le layout
- **author_photo_url** : affiche la photo dans le rond
- **liens légaux** (texte + URL) : CGV / Mentions / Politique de confidentialité
- **email de contact**

Si tu ne fournis pas d’URL de logo/photo, le template affiche la version texte/placeholder.

---

## 4) Checklist avant publication

- [ ] BLOC 1 collé au-dessus de BLOC 2
- [ ] Popup créée + formulaire dedans
- [ ] CTA reliés à la popup (boutons natifs recommandés)
- [ ] Liens légaux OK
- [ ] Email de contact OK
