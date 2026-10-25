# Émulateur Amiga dans le navigateur

**L'Amiga 1200, l'A500, le CD32 et toute la gamme Amiga dans une page web**, sur ordinateur, Android et iPhone, sans rien
installer. Le cœur est **WinUAE 6** (celui d'[Amiberry](https://github.com/BlitterStudio/amiberry)), compilé en
WebAssembly, avec **PUAE** ([libretro-uae](https://github.com/libretro/libretro-uae)) comme second moteur, plus léger.

### ▶ **https://laurent-67370.github.io/amiga1200/**

## La famille Amiga 1200

Quatre versions du même émulateur, toutes sur le **même cœur Amiberry 8.3 (WinUAE 6)**, avec les mêmes bases :
Bibliothèque, jeux WHDLoad en un geste, gros disques durs (AGS), CD32 et CDTV, carte graphique RTG, sauvegardes d'état,
configurations exportables, MIDI.

| Version | Dépôt | Pour | Particularités | Obtenir |
|---|---|---|---|---|
| **Web** (ce dépôt), l'origine du projet | [amiga1200](https://github.com/laurent-67370/amiga1200) | Navigateur : ordinateur, Android, iPhone, iPad | Rien à installer, hors ligne (application PWA), deux moteurs (WinUAE 6 et PUAE) | [Ouvrir la page](https://laurent-67370.github.io/amiga1200/) |
| **Android** | [amiga1200-android](https://github.com/laurent-67370/amiga1200-android) | Téléphones et tablettes 64 bits (Android 9 et plus) | **JIT**, manette et clavier tactiles, raccourcis sur l'écran d'accueil | [APK (Releases → dev)](https://github.com/laurent-67370/amiga1200-android/releases/tag/dev) |
| **Mac** | [amiga1200-mac](https://github.com/laurent-67370/amiga1200-mac) | Mac Apple Silicon (macOS 13 et plus) | **JIT**, application macOS (menus, CoreMIDI, manettes Game Controller) | [.dmg (Releases → dev)](https://github.com/laurent-67370/amiga1200-mac/releases/tag/dev) |
| **Windows et Linux** | [amiga1200-pc](https://github.com/laurent-67370/amiga1200-pc) | PC x64 : Windows 10/11, Linux (AppImage) | Une seule base pour les deux systèmes, .zip portable et AppImage autonome (sans JIT : 68040 interprété) | [.zip et AppImage (Releases → dev)](https://github.com/laurent-67370/amiga1200-pc/releases/tag/dev) |

Passer de l'une à l'autre : une configuration exportée en **.uae** (machine, mémoire, disques) se relit dans les
quatre versions, et aussi dans WinUAE et Amiberry. Les applications Android, Mac et PC ont un bouton **Web** en haut
de leur accueil qui mène ici, et la page web un bouton **Applications** (barre d'outils) qui mène à elles ; Android et Mac ajoutent le **JIT**, que WebAssembly interdit au navigateur. Les
Kickstart et les disques restent à ajouter dans chaque version : ils ne sont jamais fournis ni envoyés nulle part.

## Points forts

- **Une vraie machine complète** : A500, A600, A1200, A3000, A4000, CD32, CDTV ; chipsets OCS, ECS, AGA ; cartes
  68030/68040/68060, mémoire Fast et Zorro III, **carte graphique RTG** pour un Workbench en haute résolution, MIDI.
- **Jeux WHDLoad en un geste** : une archive `.lha` devient une vignette qui lance le jeu, réglé automatiquement grâce
  à la base d'Amiberry (plus de 11 000 jeux).
- **Gros disques durs lus sur place** : jusqu'à **12 disques de plusieurs Go** branchés sans les importer, lus
  directement dans les fichiers de l'appareil. Une collection comme **AGS (Amiga Game Selector)** tourne même sur un
  téléphone. Les fichiers ne sont jamais modifiés : ce que l'Amiga écrit est gardé dans le navigateur.
- **Pensé pour le téléphone** : plein écran en paysage, joystick et clavier Amiga tactiles, souris au doigt.
- **Application installable et hors ligne** (PWA), interface en français, sauvegardes d'état, configurations
  exportables, tout reste dans le navigateur.

Les ROM Kickstart et les disquettes d'origine ne sont pas fournies : sans ROM, l'Amiga démarre sur **AROS**, un
Kickstart libre. Vos fichiers restent dans le navigateur (IndexedDB) et ne sont envoyés nulle part.

## Démarrer

L'écran du moniteur sert d'accueil tant que l'Amiga est éteint :

1. **Kickstart** : pour retrouver l'A1200 d'origine, **Importer le mien…** et choisissez votre ROM Kickstart 3.1 A1200
   (40.068). Les Kickstart chiffrés d'Amiga Forever sont acceptés avec leur `rom.key`.
2. **Un disque** : **Ouvrir un fichier…** (disquette `.adf`, archive `.zip`, jeu WHDLoad `.lha`, image de CD), ou
   glissez-le sur la page. Il est rangé dans la Bibliothèque pour les fois suivantes.
3. **Allumer**.

Ensuite, l'accueil présente les derniers disques utilisés en vignettes : une touche insère le disque et allume
l'Amiga ; un jeu qui a une sauvegarde d'état montre sa capture et propose **Reprendre la sauvegarde**. La page se
recharge une fois au premier passage pour activer l'isolation nécessaire au WebAssembly multi-fils. La version publiée
s'affiche en bas de la page.

## Installer l'application (hors ligne)

L'émulateur est une application web installable (PWA) : une fois installé, il a son icône, s'ouvre en plein écran
et fonctionne **sans connexion**. Le site est copié sur l'appareil à la première visite ; une nouvelle version publiée
est téléchargée seule et prend effet au lancement suivant.

- **Android, ordinateur (Chrome, Edge)** : bouton **Installer** de la barre d'outils, ou menu du navigateur → « Installer l'application ».
  Ouvrez la page dans Chrome lui-même : le navigateur intégré d'une autre application (lien ouvert depuis une messagerie) ne sait pas installer.
- **iPhone, iPad** : dans Safari, Partager → « Sur l'écran d'accueil ».

La Bibliothèque est propre à chaque navigateur : importez votre Kickstart et vos disquettes une fois dans l'application installée.

## Fonctions

### Machines et moteurs

- **Deux cœurs** (Configuration → Processeur et FPU) : **WinUAE 6** (par défaut, le plus fidèle) ou **PUAE** (base WinUAE 5,
  plus léger pour les appareils anciens) ; émulation dans un fil séparé, pour que l'interface ne la ralentisse pas
- **Modèles** : A1200 (68EC020, AGA, IDE Gayle), A500 (68000, OCS, 512 Ko Chip + 512 Ko Slow, Kickstart 1.3 choisi
  automatiquement), et avec WinUAE 6 : A600, A3000, A4000, CDTV ; chipset au choix
- **Cartes accélératrices** : 68030 + FPU 68882 (28 MHz), 68040 (28 MHz) ou 68060 (42 MHz) ; mémoire Fast, **Zorro III
  jusqu'à 256 Mo** ; horloge sauvegardée (MSM6242B) avec la mémoire Fast
- **Carte graphique RTG** de 16 Mo (WinUAE 6) : Workbench en haute résolution avec Picasso96 ou P96
- **CD32** (Akiko, manette à 7 boutons ; ▶ = Play sur écran tactile) : images `.iso`, ou `.cue` avec ses pistes `.bin`
  (CD audio), lancées depuis leur vignette ; il faut les ROM de la console (Kickstart CD32 40.060 et son extension, ou la ROM d'1 Mo)
- **MIDI** sur le port série (Web MIDI) : synthétiseur ou clavier branché à l'ordinateur ; bruit des lecteurs en option

### Disquettes et disques durs

- Disquettes `.adf`, `.dms`, `.adz`, `.ipf`, archives `.zip`, `.gz` et `.lha` ; DF0: à DF3:, insertion à chaud, disquettes vierges formatées
- **Disques durs importés** `.hdf`/`.hdz` jusqu'à **2 Go** (512 Mo sur téléphone et tablette), avec table de partitions (RDB)
  ou image d'une seule partition FFS/OFS, complétée automatiquement pour démarrer ; rangés par morceaux de 8 Mo, seuls
  ceux que l'Amiga modifie sont réenregistrés. **Nouveau** crée un disque partitionné et formaté, prêt pour le Workbench
- **Disques durs lus sur place**, sans limite de taille, jusqu'à 12 (voir plus bas)
- **Copier des fichiers sur un disque dur** (Amiga éteint, *Fichiers…*) : fichiers, dossiers, archives `.lha`/`.zip`
  décompressées au passage ; copie de vos Kickstart dans `Devs:Kickstarts` sous les noms attendus par WHDLoad.
  Partitions OFS et FFS (DOS\0 à DOS\3)

### Sauvegardes, profils et configurations

- **Sauvegardes d'état** : 4 emplacements par jeu, avec vignette ; Ctrl+Maj+S / Ctrl+Maj+R
- **Profils par disque** : modèle, cycle exact, vitesse, carte accélératrice, mémoire, PAL/NTSC, joystick, lecteurs
- **Configurations** nommées : tous les réglages et les disques branchés, chargés d'un coup ; *Exporter tout…* les range
  dans un fichier `.json` (autre appareil, sauvegarde), *Importer…* le relit, ainsi que les `.uae` de WinUAE et
  d'Amiberry ; *Exporter en .uae*
- **Changer d'appareil** : *Exporter tout…* (Bibliothèque) range tout dans un seul fichier `.tar` (disquettes, disques
  durs, Kickstart, jeux WHDLoad, sauvegardes) ; *Importer…* sur l'autre appareil

### Affichage et commandes

- Habillage selon le modèle (Workbench 3.1 pour l'A1200, Workbench 1.3 pour l'A500), effet moniteur, centrage de l'image,
  saut d'images automatique, capture d'écran
- **Plein écran** : sur téléphone, il passe en paysage ; la barre de touches (clavier, joystick, Espace, Entrée, Échap,
  F1, F2) se cache au bout de 4 s ; **Pleine largeur** étire l'image sur toute la largeur. On en sort avec Échap, le
  bouton *Quitter le plein écran* ou le geste retour
- Clavier A1200 à l'écran (AZERTY ou QWERTY), souris tactile, joystick tactile, manette USB, touches Amiga

## Jeux WHDLoad

**En un geste** : ouvrez l'archive `.lha` du jeu (**Ouvrir un fichier…** sur l'accueil, ou glissez-la sur la page).
Elle rejoint la Bibliothèque (*Jeux WHDLoad*) et sa vignette lance le jeu : l'Amiga 1200 démarre avec 8 Mo de Fast
sur un petit volume qui contient WHDLoad, monte l'archive en lecture seule et lance son `.slave`. Rien à installer.

- Il faut votre **Kickstart 3.1** de l'A1200 (WHDLoad ne fonctionne pas avec AROS). Les Kickstart 1.3 et 3.1 de la
  Bibliothèque sont donnés à WHDLoad sous les noms qu'il attend : beaucoup de jeux en ont besoin.
- Les sauvegardes des jeux (`WHDSaves:`) sont gardées d'une partie à l'autre ; les sauvegardes d'état marchent aussi.
- **Réglages par jeu** : la base de l'émulateur Amiberry (projet Amiberry-XML-Builder, plus de 11 000 jeux) est téléchargée
  par le navigateur au premier jeu et rafraîchie tous les 30 jours. NTSC, processeur plus rapide, cycle exact, blitter
  immédiat, souris ou manette CD32 s'appliquent tout seuls. Le jeu est reconnu par le nom de son archive d'origine,
  sinon par son empreinte SHA-1 ; ce que la base indique s'affiche sous la vignette.
- F10 quitte le jeu (touche habituelle des installations).

**Sur un disque dur**, pour garder vos jeux dans un Workbench :

1. Créez un disque dur (**Nouveau**) ou branchez le vôtre, Amiga éteint.
2. **Fichiers…** → dossier `C` : copiez-y le programme `WHDLoad` (archive de whdload.de).
3. **Copier dans Devs:Kickstarts** : vos Kickstart 1.3 et 3.1 de la Bibliothèque, sous les noms de WHDLoad
   (ajoutez les fichiers `.RTB` fournis avec WHDLoad dans le même dossier).
4. **Fichiers…** → dossier `Jeux` : vos jeux `.lha`, décompressés directement.
5. Réglages : 8 Mo de Fast. Démarrez sur le Workbench, ouvrez Jeux et double-cliquez sur l'icône du jeu. F10 pour quitter.

## Gros disques lus sur place (AGS…)

Avec le cœur WinUAE 6, le bouton **Sur place…** d'un disque dur branche un fichier `.hdf` **sans l'importer** : le cœur en lit
les blocs au fur et à mesure, directement dans le fichier de l'appareil (ordinateur, Android). Pas de limite de taille ni
de copie dans le navigateur : c'est ce qui permet de lancer une collection comme **AGS** (Amiga Game Selector), faite de
disques de 4 Go.

- **12 disques** : DH0: et DH1: (IDE), DH2: et DH3: (disques UAE), et **DH4: et suivants** (jusqu'à 8 disques UAE de plus,
  plusieurs fichiers choisis d'un coup).
- **Tes fichiers ne sont jamais modifiés.** Ce que l'Amiga écrit (favoris, réglages, fichiers créés) est gardé dans le
  navigateur par blocs de 4 Ko et réappliqué à l'allumage suivant ; un fichier modifié ailleurs entre-temps (WinUAE…) ne
  reçoit pas d'anciens blocs. Case pour le désactiver et bouton *Effacer…* dans le panneau « DH4: et suivants ».
- **Volume `SHARED:` intégré** (case cochée par défaut) : AGS y range les sauvegardes des jeux (`SHARED:SaveGames`) ;
  il est gardé dans le navigateur d'une séance à l'autre.
- **Éteindre puis Démarrer** ne recharge plus la page avec WinUAE 6 : les disques sur place restent branchés (jusqu'à
  3 rallumages sur téléphone, 5 sur ordinateur ; ensuite la page se recharge une fois pour rendre la mémoire que le
  navigateur garde pour le son).
- **Après un rechargement**, le navigateur ne redonne pas l'accès aux fichiers : leur disposition est mémorisée, et
  **Rebrancher les disques sur place** les remet tous en place en un seul choix de fichiers, chacun reconnu par son nom
  et sa taille. *Réinitialiser* redémarre l'Amiga sans rien rebrancher.
- Pilotes de systèmes de fichiers (PFS3…) lus dans la table de partitions du disque, et prêtés aux disques qui n'en ont pas ;
  partitions en double renommées, partitions « sans montage automatique » montées quand même (en mémoire).
- Un compte rendu des lectures s'affiche 10 s après l'allumage (lectures, Mo lus, erreurs), pour vérifier que l'appareil lit bien le fichier.

**AGS 3.0 (édition UAE) sur téléphone** :

1. Configuration : Amiga 1200, WinUAE 6, Kickstart 3.1, carte 68030, 8 Mo de Fast et 64 Mo de Zorro III, carte RTG au choix.
2. Disques durs/CD : **Workbench.hdf** sur **DH2:** (disque UAE, comme dans la configuration WinUAE d'AGS ; sur l'IDE, son
   démarrage reste sur un écran noir), **Work.hdf** sur DH3:, et AGS_Drive, Games, Extra, Media, WHD_Demos… dans
   **DH4: et suivants** ; laisser DH0: et DH1: vides. Les fichiers doivent être sur l'appareil (pas dans le nuage).
3. **Démarrer**. Puis Configurations → Enregistrer, pour tout retrouver la fois suivante.

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
les cœurs WinUAE 6 et PUAE et le convertisseur IPF (Emscripten), la page principale, l'ancienne version, des bancs d'essai,
puis la publication. Chaque branche poussée est publiée dans `/<nom de la branche>/` pour les essais ; la version
publiée s'affiche en bas de la page (date, heure de Paris, et numéro du commit).

| Chemin | Contenu |
|---|---|
| `src/template.html` | Interface commune (écran, boîtier, lecteurs, Bibliothèque, réglages) |
| `wasm/` | Version principale : frontal libretro (`frontend.c`), page (`app/` : moteur, médias, sauvegardes, accueil, copie de fichiers, commandes tactiles), fichiers web (`web/` : frontal JS, disques RDB/FFS, archives LhA, service worker, manifeste, icônes), compilation (`build.sh`) |
| `vendor/puae/` | Cœur PUAE en sous-module, avec `wasm/patches/` |
| `wasm-amiberry/` | Cœur WinUAE 6 (Amiberry, version figée, adaptée par `patches/`), colle libretro (`amb_glue.cpp`), disques lus sur place (`lazy_disk.cpp`, servi par `wasm/web/lazydisk-worker.js`), compilation (`build.sh`) |
| `wasm-ipf/` | Convertisseur de disquettes IPF (module séparé) |
| `vendor/sae/`, `build.py` | Ancienne version : cœur SAE, construit dans `sae/index.html` |
| `vendor/aros/` | ROM AROS libres |
| `index.html`, `puae.*`, `amiberry.*`, `*.js`, `sae/` | Site publié (généré) |

Détails techniques et historique du portage : `wasm/README.md`.

## Licences

- Cœur WinUAE 6 (Amiberry, dérivé de WinUAE) : GNU GPL v3.
- Cœur PUAE (libretro-uae, dérivé de WinUAE) et cœur SAE (R. Hausberger) : GNU GPL v2.
- AROS : AROS Public License.
- L'ensemble est distribué sous GNU GPL v2 (voir `LICENSE`).

Amiga est une marque de ses détenteurs respectifs ; ce projet n'y est pas affilié.
