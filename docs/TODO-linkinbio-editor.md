# TODO — Refonte éditeur Link in Bio

**Date** : 23 mai 2026
**Reporter** : Eric (user Tipote)
**Priorité** : moyenne-haute (UX qui plombe l'usage par les vrais users)

## Symptômes remontés par Eric

> "je viens créer mon Link in Bio. Je l'ais publier il s'affiche, je
> voudrai aérer le haut sous profil. Sinon quand je clique sur un
> bouton deux pages s'ouvrent correspondant au bouton, plus de page
> du Link in Bio, ouvrir dans un nouveau onglet et conserver la page
> Link in Bio, possible ? Une couleur différente du thème existe pour
> les boutons ? J'ai du louper un truc."

## Diagnostic du retour Eric

3 problèmes distincts dans son message :

1. **Espacement** : pas assez de marge entre le bloc profil (haut) et
   le premier bouton. Page tassée visuellement.

2. **Comportement liens** : actuellement quand l'user public clique sur
   un bouton, ça ouvre dans le MÊME onglet ce qui ferme la page Link
   in Bio. Eric veut une option **"ouvrir dans un nouvel onglet"** par
   bouton (rel="noopener" + target="_blank"). Aussi noter : il dit
   "deux pages s'ouvrent" — peut-être un bug double-click ou un href
   mal géré qui ouvre 2 fois ? À investiguer.

3. **Couleur boutons** : Eric voudrait pouvoir donner une couleur
   spécifique par bouton (override du thème). Actuellement tous les
   boutons héritent du thème global.

## Refonte globale demandée par Béné

Au-delà des bugs Eric, Béné veut **aligner l'éditeur Link in Bio au
niveau des autres éditeurs Tipote** (pages, quiz) :

- **Design system Tipote** (Card, Button, Input shadcn, palette
  cohérente, fonts identiques au reste de l'app). Actuellement
  "éclaté, moche, pas conforme aux standards".

- **Marges/padding standards** (espacement entre profil et boutons,
  entre boutons, autour de chaque bloc).

- **Drag-and-drop** des blocs (boutons, sections) pour les réorganiser
  facilement. Pattern identique à l'éditeur de pages / quiz (peut-être
  réutiliser le même composant DnD).

- **Image upload pour le profil** : actuellement (sûrement) un champ
  URL à coller. Faut un vrai uploader (drop zone, preview, recadrage
  optionnel) → bucket Supabase `public-assets`.

- **Options par bouton** : ouvrir dans nouvel onglet (toggle), couleur
  custom (color picker), icône optionnelle.

- **Preview live** côté éditeur (split view "édition / aperçu mobile"
  comme dans l'éditeur de pages).

## Fichiers concernés (à explorer)

```bash
find /home/user/tipote-app/components/pages -name "Linkinbio*"
# components/pages/LinkinbioEditor.tsx (déjà existant)
# components/pages/PageBuilder.tsx (référence pour drag-drop)
```

## Plan d'attaque suggéré

1. **Quick wins** (2h) : ajout des marges/padding qui manquent + toggle
   "ouvrir dans nouvel onglet" par bouton + investigate le bug
   "2 pages s'ouvrent".
2. **Color override par bouton** (1h) : champ couleur dans le panneau
   d'édition de chaque bouton, avec fallback sur la couleur du thème.
3. **Refonte UI** (1 jour) : remplacer le layout actuel par
   Card/Section shadcn, alignement avec PageBuilder.tsx, padding
   responsive standards Tipote.
4. **Drag-and-drop** (1 jour) : si pas déjà en place, ajouter
   `@dnd-kit/sortable` (probablement déjà dep) pour réorganiser les
   blocs. Réutiliser le DnD de PageBuilder si compatible.
5. **Image uploader profil** (4h) : Drop zone + preview + upload bucket
   `public-assets` (path : `linkinbio/<auth.uid()>/avatar.png`). Cf.
   `lib/clientFaviconUpload.ts` pour le pattern d'upload bucket.

## À communiquer à Eric après fix

Lui faire un petit retour perso avec les améliorations qu'on aura
faites (espacement, nouvel onglet par bouton, couleur custom). Ça
montre qu'on l'écoute et que son feedback compte.
