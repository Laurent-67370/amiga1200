# Émulateur Amiga 1200

Un Amiga 1200 complet dans le navigateur : processeur 68EC020, chipset AGA, 2 Mo de Chip RAM,
contrôleur IDE Gayle, deux lecteurs de disquettes. Le moteur est celui de WinUAE ([PUAE](https://github.com/libretro/libretro-uae)),
compilé en WebAssembly.

**https://laurent-67370.github.io/amiga1200/**

L'ancienne version, au cœur JavaScript SAE, reste disponible pour comparer : https://laurent-67370.github.io/amiga1200/sae/
Les deux partagent la même Bibliothèque et les mêmes réglages (stockage local du navigateur).

## Démarrer

L'écran du moniteur sert d'accueil tant que l'Amiga est éteint :

1. **Kickstart** : sans ROM, la machine démarre sur AROS (version d'août 2026), un Kickstart libre. Pour retrouver
   l'A1200 d'origine, **Importer le mien…** et choisissez votre ROM Kickstart 3.1 A1200 (40.068).
2. **Une disquette** : **Ouvrir une disquette…** (`.adf`, ou une archive `.zip`), ou glissez-la sur la page.
   Elle est rangée dans la Bibliothèque pour les fois suivantes.
3. **Allumer**.

Ensuite, l'accueil présente les derniers disques utilisés en vignettes : une touche insère le disque et allume
l'Amiga ; un jeu qui a une sauvegarde d'état montre sa capture et propose **Reprendre la sauvegarde**.

Les ROM et disquettes Workbench d'origine ne sont pas fournies. Vos fichiers restent dans le navigateur (IndexedDB)
et ne sont envoyés nulle part. La page se recharge une fois au premier passage pour activer l'isolation nécessaire
au WebAssembly multi-fils.

## Installer l'application (hors ligne)

L'émulateur est une application web installable (PWA) : une fois installé, il a son icône, s'ouvre en plein écran
et fonctionne **sans connexion**. Tout le site (environ 16 Mo) est copié sur l'appareil à la première visite ;
une nouvelle version publiée est téléchargée seule et prend effet au lancement suivant.

- **Android, ordinateur (Chrome, Edge)** : bouton **Installer** de la barre d'outils, ou menu du navigateur → « Installer l'application ».
  Ouvrez la page dans Chrome lui-même : le navigateur intégré d'une autre application (lien ouvert depuis une messagerie) ne sait pas installer.
- **iPhone, iPad** : dans Safari, Partager → « Sur l'écran d'accueil ».

La Bibliothèque est propre à chaque navigateur : importez votre Kickstart et vos disquettes une fois dans l'application installée.

## Fonctions

- Accueil : étapes au premier passage, derniers disques en vignettes, Kickstart utilisé toujours visible
- Habillage selon le modèle : couleurs du Workbench 3.1 pour l'A1200, du Workbench 1.3 (bleu et orange) pour l'A500,
  arc-en-ciel du logo Amiga et Boing Ball sur l'accueil
- Disquettes `.adf`, `.dms`, `.adz`, archives `.zip` et `.gz` ; DF0: et DF1:, insertion à chaud, disquettes vierges formatées
- Disque dur IDE `.hdf` jusqu'à **2 Go** (512 Mo sur téléphone et tablette), par exemple avec des jeux WHDLoad installés :
  image avec table de partitions (RDB), ou image d'une seule partition FFS/OFS (« partition hardfile » de WinUAE),
  complétée automatiquement d'une table de partitions pour démarrer. Rangé par morceaux de 8 Mo : seuls ceux que l'Amiga modifie sont réenregistrés
- **Quatre disques durs** : DH0: et DH1: sur l'IDE de l'A1200 (maître, esclave), DH2: et DH3: par le pilote de disque d'UAE ;
  chaque unité a son panneau sous l'écran (sur téléphone, une unité libre se réduit à Choisir… et Nouveau)
- **Nouveau** crée un disque partitionné (RDB) et formaté (FFS), prêt pour le Workbench
- **Copier des fichiers sur le disque dur** (Amiga éteint, bouton *Fichiers…*) : fichiers, dossier entier, archives `.lha`/`.lzh`
  et `.zip` décompressées au passage, dans le dossier choisi ; c'est la façon d'installer des jeux **WHDLoad**.
  Un bouton copie aussi vos Kickstart dans `Devs:Kickstarts` sous les noms attendus par WHDLoad (`kick34005.A500`, `kick40068.A1200`…).
  Partitions OFS et FFS (DOS\0 à DOS\3) ; PFS, SFS et FFS à cache de dossiers ne sont pas modifiables
- **Mode Amiga 500** (68000, OCS, 512 Ko Chip + 512 Ko Slow) pour les jeux A500 qui refusent l'A1200 : bascule sur l'accueil,
  dans Réglages ou dans le profil d'une disquette ; Kickstart 1.3 choisi automatiquement dans la Bibliothèque
- **Jeux WHDLoad en un geste** : une archive `.lha` de jeu WHDLoad se lance directement depuis sa vignette, sans Workbench ni disque dur
- Archives `.lha` acceptées aussi pour les disquettes qu'elles contiennent
- Enregistrement automatique des disques modifiés dans la Bibliothèque, téléchargement
- **Changer d'appareil** : *Exporter tout…* (Bibliothèque) range tout dans un seul fichier `.tar` (disquettes, disques durs,
  Kickstart, jeux WHDLoad, sauvegardes) ; *Importer…* sur l'autre appareil, ce qui y est déjà et plus récent est gardé
- **Sauvegardes d'état** : 4 emplacements par jeu, avec vignette ; Ctrl+Maj+S / Ctrl+Maj+R
- **Profils par disque** : modèle (A1200/A500), cycle exact, vitesse, carte accélératrice, mémoire Fast, PAL/NTSC, joystick, lecteurs
- **Carte accélératrice** au choix : 68030 + FPU 68882 (28 MHz), 68040 (28 MHz) ou 68060 (42 MHz)
- Horloge sauvegardée (MSM6242B) avec la mémoire Fast, comme une carte trappe ; bruit des lecteurs en option
- Kickstart Amiga Forever chiffrés avec `rom.key`
- Clavier A1200 à l'écran (AZERTY ou QWERTY), souris tactile, manette USB, touches Amiga
- Saut d'images automatique, centrage de l'image, effet moniteur, capture
- Plein écran : on en sort avec Échap (deux fois si la souris est capturée), le bouton *Quitter le plein écran* qui apparaît en haut à droite quand on bouge la souris ou touche l'écran, ou le geste retour sur téléphone

## Jeux WHDLoad

**En un geste** : ouvrez l'archive `.lha` du jeu (**Ouvrir un fichier…** sur l'accueil, ou glissez-la sur la page).
Elle rejoint la Bibliothèque (*Jeux WHDLoad*) et sa vignette lance le jeu : l'Amiga 1200 démarre avec 8 Mo de Fast
sur un petit volume qui contient WHDLoad, monte l'archive en lecture seule et lance son `.slave`. Rien à installer.

- Il faut votre **Kickstart 3.1** de l'A1200 (WHDLoad ne fonctionne pas avec AROS). Les Kickstart 1.3 et 3.1 de la
  Bibliothèque sont donnés à WHDLoad sous les noms qu'il attend : beaucoup de jeux en ont besoin.
- Les sauvegardes des jeux (`WHDSaves:`) sont gardées d'une partie à l'autre ; les sauvegardes d'état marchent aussi.
- F10 quitte le jeu (touche habituelle des installations).

**Sur un disque dur**, pour garder vos jeux dans un Workbench :

1. Créez un disque dur (**Nouveau**) ou branchez le vôtre, Amiga éteint.
2. **Fichiers…** → dossier `C` : copiez-y le programme `WHDLoad` (archive de whdload.de).
3. **Copier dans Devs:Kickstarts** : vos Kickstart 1.3 et 3.1 de la Bibliothèque, sous les noms de WHDLoad
   (ajoutez les fichiers `.RTB` fournis avec WHDLoad dans le même dossier).
4. **Fichiers…** → dossier `Jeux` : vos jeux `.lha`, décompressés directement.
5. Réglages : 8 Mo de Fast. Démarrez sur le Workbench, ouvrez Jeux et double-cliquez sur l'icône du jeu. F10 pour quitter.

## Clavier et souris

Le clavier suit la position physique des touches : choisissez le keymap `f` dans les Préférences Input du Workbench.
Inser = Help, Page préc. / Page suiv. = touches Amiga.

- **Souris** : cliquez dans l'écran pour la capturer, Échap pour la libérer. Bouton gauche pour sélectionner,
  bouton droit maintenu pour la barre de menus, comme sur l'Amiga ; sur un pavé tactile, clic à deux doigts.
- **Sans souris** (fonction du Kickstart) : Amiga gauche + Alt gauche = bouton gauche, + Alt droite = bouton droit.
- **Joystick tactile** : bouton *Joystick* sous l'écran ou dans le plein écran ; manche à gauche, FEU et 2e bouton à droite.
  Dans Réglages : zone morte du manche, disposition gaucher, opacité, vibration au tir et aux changements de direction (pas sur iPhone).
- **Plein écran sur téléphone** : barre en haut à gauche avec le clavier complet, le joystick, Espace, Entrée, Échap, F1, F2.
- **Écran tactile** : un doigt déplace la souris, une touche clique, deux touches puis glisser déplace une fenêtre,
  deux doigts posés = bouton droit (glissez jusqu'à l'option du menu et relevez).

## Construire

Tout est construit par la GitHub Action `.github/workflows/puae-wasm.yml` à chaque modification :
le cœur PUAE (Emscripten), la page principale, l'ancienne version, un banc d'essai, puis la publication.

| Chemin | Contenu |
|---|---|
| `src/template.html` | Interface commune (écran, boîtier, lecteurs, Bibliothèque, réglages) |
| `wasm/` | Version principale : frontal libretro (`frontend.c`), page (`app/` : moteur, médias, sauvegardes, accueil, copie de fichiers, commandes tactiles), fichiers web (`web/` : frontal JS, disques RDB/FFS, archives LhA, service worker, manifeste, icônes), compilation (`build.sh`) |
| `vendor/puae/` | Cœur PUAE en sous-module, avec `wasm/patches/` |
| `vendor/sae/`, `build.py` | Ancienne version : cœur SAE, construit dans `sae/index.html` |
| `vendor/aros/` | ROM AROS libres |
| `index.html`, `puae.*`, `*.js`, `sae/` | Site publié (généré) |

Détails techniques et historique du portage : `wasm/README.md`.

## Licences

- Cœur PUAE (libretro-uae, dérivé de WinUAE) et cœur SAE (R. Hausberger) : GNU GPL v2.
- AROS : AROS Public License.
- L'ensemble est distribué sous GNU GPL v2 (voir `LICENSE`).

Amiga est une marque de ses détenteurs respectifs ; ce projet n'y est pas affilié.
