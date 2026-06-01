# Workflow Git avec Béné — À LIRE À CHAQUE SESSION

**Règle absolue : je ne pousse JAMAIS rien sur `main`. Béné est seule
maître de `main` côté GitHub et côté VPS.**

## Comment Béné déploie

Le process invariable de Béné, à respecter à 100 % :

1. Béné **télécharge** depuis ma branche de travail (`claude/busy-wright-501xR`) vers son dossier local
2. Elle **remplace** son ancien code local par mon code à jour
3. Elle **commit + push sur main** depuis son PC vers GitHub
4. Elle **pull main sur le VPS** + rebuild

Ses commandes habituelles, à NE PAS modifier :

```powershell
# Sur son PC Windows
cd C:\Users\hello\Desktop\autopilot\tipote-app
git fetch origin
git pull origin main
git status
git add .
git commit -m "claude add <description>"
git push origin main
```

```bash
# Sur son VPS
cd /home/tipote/tipote-app
git stash
git pull origin main
npm ci
npm run build
pm2 restart tipote-prod --update-env
```

Idem pour `tiquiz` (chemin `C:\Users\hello\Desktop\tiquiz` côté PC,
`/home/tipote/tiquiz-app` côté VPS, process pm2 `tiquiz-prod`).

## Pour moi (Claude)

À chaque sprint où je code :

1. Je travaille sur la branche `claude/busy-wright-501xR`
2. Je push sur cette branche UNIQUEMENT
3. **NE JAMAIS faire `git push origin main` directement**
4. **NE JAMAIS faire `git merge` vers main puis push**

Quand le code est prêt, je dis à Béné :
> « C'est pushé sur `claude/busy-wright-501xR`. Récupère mes
>   fichiers et push sur main avec ton process habituel. »

Et je lui donne la commande pour récupérer mes fichiers sans casser sa branche main locale :

```powershell
# Sur son PC : récupère mes derniers fichiers depuis ma branche
# (sans switcher de branche, applique mes fichiers dans son working tree main)
git fetch origin claude/busy-wright-501xR
git checkout origin/claude/busy-wright-501xR -- .

# Puis son process habituel
git add .
git commit -m "claude <description>"
git push origin main
```

## Que faire si Béné est bloquée par un `non-fast-forward`

Ça arrive si j'ai poussé sur main par erreur ET qu'elle a aussi du local
non-pushé. Solution :

```powershell
git pull origin main --rebase
git push origin main
```

Si conflit pendant le rebase, lui donner `git rebase --abort` pour
revenir à un état propre, puis on debug ensemble.

## Pourquoi cette règle

Béné a son workflow rodé depuis le début. Le moindre déviation casse
ses scripts de déploiement et lui fait perdre du temps. Mon job c'est
de coder, pas de redéfinir ses outils. Si j'ai un doute sur le workflow,
je relis ce fichier et je demande.
