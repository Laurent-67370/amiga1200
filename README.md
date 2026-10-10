# Émulateur Amiga 1200

Un Amiga 1200 complet dans le navigateur : processeur 68EC020, chipset AGA, 2 Mo de Chip RAM,
contrôleur IDE Gayle, deux lecteurs de disquettes. Le moteur est celui de WinUAE ([PUAE](https://github.com/libretro/libretro-uae)),
compilé en WebAssembly.

**https://laurent-67370.github.io/amiga1200/**

L'ancienne version, au cœur JavaScript SAE, reste disponible pour comparer : https://laurent-67370.github.io/amiga1200/sae/
Les deux partagent la même Bibliothèque et les mêmes réglages (stockage local du navigateur).

## Démarrer

1. **Réglages → Importer un Kickstart** : votre ROM Kickstart 3.1 A1200 (40.068). Sans ROM, la machine démarre sur AROS
   (version d'août 2026), un Kickstart libre.
2. Glissez une disquette `.adf` (ou une archive `.zip`) sur la page ou sur la fente du lecteur.
3. **Allumer**.

Les ROM et disquettes Workbench d'origine ne sont pas fournies. Vos fichiers restent dans le navigateur (IndexedDB)
et ne sont envoyés nulle part. Un navigateur récent sur ordinateur est recommandé (Chrome, Edge, Firefox) :
la page se recharge une fois au premier passage pour activer l'isolation nécessaire au WebAssembly multi-fils.

## Fonctions

- **Application installable, hors ligne** : bouton *Installer* (Chrome, Edge, Android) ou, sur iPhone/iPad, Safari → Partager → « Sur l'écran d'accueil ». Tout le site est copié sur l'appareil ; les mises à jour arrivent au lancement suivant une connexion.
- Disquettes `.adf`, `.dms`, `.adz`, archives `.zip` et `.gz` ; DF0: et DF1:, insertion à chaud, disquettes vierges formatées
- Disque dur IDE `.hdf` jusqu'à 512 Mo ; **Nouveau** crée un disque partitionné (RDB) et formaté (FFS), prêt pour le Workbench
- Enregistrement automatique des disques modifiés dans la Bibliothèque, téléchargement
- **Sauvegardes d'état** : 4 emplacements par jeu, avec vignette ; Ctrl+Maj+S / Ctrl+Maj+R
- **Profils par disque** : cycle exact, vitesse, carte accélératrice, mémoire Fast, PAL/NTSC, joystick, lecteurs
- **Carte accélératrice** au choix : 68030 + FPU 68882 (28 MHz), 68040 (28 MHz) ou 68060 (42 MHz)
- Horloge sauvegardée (MSM6242B) avec la mémoire Fast, comme une carte trappe ; bruit des lecteurs en option
- Kickstart Amiga Forever chiffrés avec `rom.key`
- Clavier A1200 à l'écran (AZERTY ou QWERTY), souris tactile, manette USB, touches Amiga
- Saut d'images automatique, centrage de l'image, effet moniteur, plein écran, capture

## Clavier et souris

Le clavier suit la position physique des touches : choisissez le keymap `f` dans les Préférences Input du Workbench.
Cliquez dans l'écran pour capturer la souris, Échap pour la libérer. Inser = Help, Page préc. / Page suiv. = touches Amiga.

## Construire

Tout est construit par la GitHub Action `.github/workflows/puae-wasm.yml` à chaque modification :
le cœur PUAE (Emscripten), la page principale, l'ancienne version, un banc d'essai, puis la publication.

| Chemin | Contenu |
|---|---|
| `src/template.html` | Interface commune (écran, boîtier, lecteurs, Bibliothèque, réglages) |
| `wasm/` | Version principale : frontal libretro (`frontend.c`), page (`app/`), fichiers web (`web/`), compilation (`build.sh`) |
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
