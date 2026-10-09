# Émulateur Amiga 1200

Un Amiga 1200 complet dans le navigateur, en une seule page HTML : processeur 68EC020, chipset AGA,
2 Mo de Chip RAM, contrôleur IDE Gayle, deux lecteurs de disquettes.

Ouvrez `index.html`, ou déposez-le tel quel sur n'importe quel hébergement web : aucun serveur particulier n'est nécessaire.

## Démarrer

1. **Réglages → Importer un Kickstart** : votre ROM Kickstart 3.1 A1200 (40.068). Sans ROM, la machine démarre sur AROS, un Kickstart libre intégré.
2. Glissez une disquette `.adf` sur la page ou sur la fente du lecteur.
3. **Allumer**.

Les ROM et disquettes Workbench d'origine ne sont pas fournies. Vos fichiers restent dans le navigateur (IndexedDB) et ne sont envoyés nulle part.

## Fonctions

- Disquettes `.adf`, `.dms`, `.adz` et ADF étendus dans DF0: et DF1:, création de disquettes vierges formatées
- Archives `.zip` et `.gz` ouvertes directement ; un `.zip` de plusieurs disquettes remplit la bibliothèque
- Disque dur `.hdf` / `.hdz` jusqu'à 512 Mo sur DH0:, création d'un disque vierge à partitionner avec HDToolBox
- Enregistrement automatique des disques modifiés (quelques secondes après chaque écriture, à l'extinction et en quittant l'onglet), bibliothèque locale, téléchargement des disques modifiés
- Kickstart Amiga Forever chiffrés avec `rom.key`
- Mémoire Fast 4 ou 8 Mo, processeur 14 MHz ou maximum, PAL/NTSC, trois résolutions
- Joystick au clavier ou manette USB, touches Amiga virtuelles, Ctrl-Amiga-Amiga
- Clavier A1200 complet à l'écran (libellés AZERTY ou QWERTY) et souris tactile : l'écran sert de pavé tactile, deux doigts pour le bouton droit
- Centrage automatique de l'image
- Mode **Compatibilité maximale** (prélecture et caches du 68020, blitter au cycle près) pour les démos et jeux capricieux
- **Saut d'images automatique** : quand le navigateur ne suit pas, l'image est dessinée moins souvent pour que le son et la vitesse de jeu restent à 50 Hz
- **Profils par disque** : compatibilité, vitesse, mémoire, région, joystick et lecteurs propres à un jeu, appliqués quand sa disquette est dans DF0: ou son disque sur DH0:
- LED Power, Drive et HD, plein écran, capture PNG, effet moniteur cathodique

## Clavier et souris

Le clavier suit la position physique des touches : choisissez le keymap `f` dans les Préférences Input du Workbench.
Cliquez dans l'écran pour capturer la souris, Échap pour la libérer. Les touches Amiga sont la touche Windows/Cmd
ou les boutons sous les lecteurs.

## Limites

- Le 68020 n'est pas émulé au cycle près (SAE ne le permet pas) : la vitesse « 14 MHz » est une approximation fidèle mais pas exacte.
- Pas de sauvegarde d'état de la machine : le cœur SAE garde son état dans des fermetures JavaScript qu'on ne peut pas figer ni restaurer.
- Archives `.lha` / `.lzx` et images `.ipf` non prises en charge.

## Construire

```
python3 build.py
```

Concatène et minifie le cœur `vendor/sae`, intègre les ROM AROS compressées et l'interface `src/template.html`
pour produire `index.html`.

## Structure

| Chemin | Contenu |
|---|---|
| `index.html` | Page finale, autonome |
| `src/template.html` | Interface (HTML, CSS, JavaScript) |
| `vendor/sae/` | Cœur d'émulation SAE (GPL v2) |
| `vendor/aros/` | ROM AROS (AROS Public License) |
| `build.py` | Script de construction |

## Licences

- Cœur d'émulation : [SAE](https://github.com/naTmeg/ScriptedAmigaEmulator) de Rupert Hausberger, dérivé de WinUAE, GNU GPL v2.
- Kickstart de secours : AROS, AROS Public License.
- L'ensemble est distribué sous GNU GPL v2 (voir `LICENSE`).

Amiga est une marque de ses détenteurs respectifs ; ce projet n'y est pas affilié.
