# TODO — Sprint en cours (à reprendre)

## ✅ Livré récemment
- Dashboard affilié multilang (FR/EN + stubs ES/IT/PT/AR)
- Guide de lancement 6 étapes + badges 6 paliers
- Link in Bio : avatar uploader, options par bouton, fix bug "2 pages s'ouvrent"
- Refonte UI Link in Bio + PageBuilder alignée sur le pattern wysiwyg quiz (DndKit, auto-save, labels UPPERCASE)
- Sidebar app masquée en mode éditeur (PagesClient)
- Mobile-responsive sur les 4 éditeurs (QuizDetailClient, SurveyDetailClient, LinkinbioEditor, PageBuilder)

## 🔜 À faire ensuite (par ordre de priorité suggéré)

### Pixel Meta / GA / Ads (URGENT — bug Gwenn)
- ✅ Server-render le pixel sur toutes les pages publiques pour fiabilité (en cours, ce sprint)
- À vérifier : que les conversion API (server-side) sont aussi fired pour back-up du pixel client

### Traductions ES/IT/PT/AR du dashboard affilié
Actuellement les 4 locales sont des stubs qui re-exportent EN. Quand on aura des
affiliés de ces langues, traduire proprement les 7 dicts (`app/affiliate/i18n/`).
~3-4h. Pattern identique à la traduction EN existante.

### Classement top 10 anonymisé
Dernière brique gamification (style "ff-***" comme FunnelForge). Pas urgent
tant que la base d'affiliés n'est pas assez grosse (10+). Quand on l'aura :
- Vue agrégée Supabase qui rank par total_commission_cents du mois
- Pseudonyme stable par affilié (hash de sa)
- Carte sur l'overview qui affiche le top 10 (ton rang masqué si tu n'es pas dedans)

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
