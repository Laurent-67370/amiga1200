# Cœur PUAE en WebAssembly (en cours)

Branche de travail pour remplacer le cœur SAE par [PUAE](https://github.com/libretro/libretro-uae)
(le moteur de WinUAE) compilé en WebAssembly. Voir l'étude de faisabilité pour le plan complet.

- `vendor/puae` : PUAE en sous-module, épinglé sur le commit étudié.
- `patches/` : correctifs nécessaires en WebAssembly (types de fonctions incohérents, sans effet en natif).
- `build.sh` : compilation Emscripten avec fils d'exécution → `dist/puae.js` + `dist/puae.wasm`, et un banc d'essai Node.
- `bench.c` : frontal libretro minimal sans écran (A1200 d'origine, AROS intégré), mesure la vitesse et teste la sauvegarde d'état.

La GitHub Action `.github/workflows/puae-wasm.yml` compile tout à chaque modification et publie
la vitesse mesurée dans le résumé de l'exécution.

## Résultats (GitHub Actions, Emscripten 4.0.15, 10 octobre 2026)

| Mode | Vitesse | Temps réel PAL |
| --- | --- | --- |
| Rapide | 167 images/s | × 3,3 |
| Cycle exact | 118 images/s | × 2,4 |

Sauvegarde d'état : 2,3 Mo en 4,5 ms, restauration OK. Module navigateur : 3,5 Mo compressé.
Machine : serveur partagé de GitHub, plus lent qu'un PC de bureau récent.

Étape 1 sur 6 : chaîne de compilation, terminée.

## Étape 2 : frontal navigateur (terminée)

- `frontend.c` : pont libretro → fonctions `fe_*` simples (image RGBA, son, clavier, souris, joysticks, LED, disquettes, états).
- `web/puae-frontend.js` : canvas, AudioWorklet, pointeur capturé, manettes, boucle calée sur les 49,92 images/s du PAL.
- `web/coi-sw.js` : service worker qui ajoute les en-têtes d'isolation exigés par les fils d'exécution sur GitHub Pages.
- Page d'essai publiée automatiquement : https://laurent-67370.github.io/amiga1200/puae/

Testé dans Chromium : AROS démarre, 50 images/s au rythme réel, son à 44,1 kHz, sauvegarde d'état 2,2 Mo en 8 ms puis restauration.
Raccourcis : Inser = Help, Page préc. / Page suiv. = Amiga gauche / droite. Étape suivante : écran, son, clavier et souris dans le navigateur.

## Étape 3 : interface complète (terminée)

- `app/make-page.py` génère `index.html` à partir de l'interface actuelle (`src/template.html`) en ne remplaçant
  que les parties qui parlent au cœur : `app/engine-puae.js` (allumage, configuration WinUAE `.uae`, LED, charge)
  et `app/media-puae.js` (lecteurs à chaud, enregistrement des écritures, disquette et disque dur vierges).
- `web/adf.js` : disquette vierge formatée FFS, validée avec amitools (xdftool).
- Bibliothèque et réglages partagés avec la version SAE (même site, même stockage local).
- Page d'essai brute conservée : `/puae/essai.html`.

Testé dans Chromium (bureau et mobile tactile) : 50 images/s, disquette vierge et archive .zip dans DF0:,
insertion à chaud dans DF1:, éjection, écriture enregistrée automatiquement dans la Bibliothèque, extinction
puis rallumage (la page se recharge).


## Étape 4 : disque dur (terminée)

- L'écran gris avec un disque dur venait de l'AROS intégré à PUAE (révision 55696), pas du portage : reproduit en
  natif. Le Kickstart de secours est désormais AROS du 20 août 2026 (`vendor/aros`), servi compressé par la page.
- « Nouveau » crée un disque partitionné (RDB, DH0: amorçable, comme HDToolBox) et formaté FFS (`web/hdf.js`),
  validé avec amitools de 64 à 512 Mo ; AROS démarre directement dessus sur son Shell.
- `fe_flush` : le cœur écrit par `fwrite`, la dernière écriture pouvait rester dans le tampon de la bibliothèque C ;
  la page vide les tampons avant de relire un disque.
- Clavier : un événement par image et dans l'ordre (PUAE lit le clavier une fois par image) ; Maj, Ctrl et Alt
  recalés sur l'état annoncé par le navigateur.
- Le correctif « IDE synchrone » de l'étape 3 est retiré : il ne contournait que l'ancien AROS et provoquait, dans
  le navigateur, des erreurs d'écriture après un blocage de la page. L'IDE garde son propre fil d'exécution.

Vérifié dans Chromium : démarrage depuis DH0:, fichier écrit par un script de démarrage puis retrouvé dans la
Bibliothèque (relu avec amitools), commande tapée au clavier qui écrit sur DH0: avec l'enregistrement automatique
actif, disque créé par « Nouveau » amorçable.

## Étape 5 : sauvegardes d'état et profils (terminée)

- `app/states-puae.js` : bouton **Sauvegardes**, 4 emplacements par jeu (disquette de DF0:, sinon disque dur),
  vignette de l'écran, date, taille ; raccourcis Ctrl+Maj+S / Ctrl+Maj+R pour l'emplacement 1.
- Un état PUAE note les chemins des disques mais pas leur contenu : chaque sauvegarde garde la liste des disques,
  le Kickstart et les réglages. « Reprendre » s'applique à chaud si la machine est déjà dans cette configuration,
  sinon l'Amiga se rallume avec elle puis charge l'état. Les disques modifiés sont enregistrés au même moment.
- Supprimer un disque de la Bibliothèque supprime ses sauvegardes.
- Profils par disque transmis au cœur : cycle exact, vitesse, mémoire Fast, PAL/NTSC, vitesse des lecteurs
  (vérifié : `fastmem_size=8` et `cpu_cycle_exact=true` dans la configuration générée, état de 11 Mo avec 8 Mo de Fast).

Vérifié dans Chromium : « echo AAA », sauvegarde, « echo BBB », reprise → seul AAA à l'écran, à chaud comme après
extinction (reprise au clavier) ; profil cycle exact + 8 Mo Fast + NTSC appliqué au démarrage.

## Étape 6 : bascule (terminée)

- Le travail de la branche `puae` est fusionné dans `main`.
- La version PUAE est publiée à la racine du site, l'ancienne version SAE dans `sae/` (construite par `build.py`),
  et l'ancienne adresse d'essai `/puae/` redirige vers l'accueil.
- Le service worker d'isolation laisse passer `sae/` sans en-têtes (polices Google, pas de fils d'exécution).
- Une autre branche poussée est publiée dans `/<nom de la branche>/` pour les essais.

## Après la bascule

- **Matériel** : carte accélératrice au choix (68030 + 68882 à 28 MHz, 68040 à 28 MHz, 68060 à 42 MHz, options
  `puae_cpu_model`, `puae_fpu_model`, `puae_cpu_multiplier`), horloge MSM6242B (`rtc=`) dès que la mémoire Fast est
  active, bruit des lecteurs (`puae_floppy_sound`, réglable à chaud). La carte fait partie des profils et des sauvegardes.
- **Souris** : les deux doigts de l'écran tactile envoyaient le bouton du milieu ; ils envoient le bouton droit.
- **Application installable et hors ligne** : `web/manifest.webmanifest`, icônes, et `web/coi-sw.js` qui, en plus des
  en-têtes d'isolation, copie le site dans le cache du navigateur (copie locale d'abord, réseau sinon). Sa version est
  le résumé des fichiers publiés, calculé par `build.sh` : chaque publication renouvelle la copie et efface l'ancienne.
- **Accueil** (`app/launcher-puae.js`) : quand l'Amiga est éteint, l'écran affiche le Kickstart utilisé, trois étapes
  au premier passage, puis les derniers disques en vignettes (insérer et allumer en une touche, reprise de la dernière
  sauvegarde d'état). Les commandes qui ne servent qu'allumé sont masquées.
- **Disques durs** : jusqu'à 2 Go sur ordinateur, 512 Mo sur écran tactile (au-delà de 2 Go, les positions dans le fichier
  dépasseraient le `long` 32 bits du cœur). Import lu directement depuis le fichier ; une image de partition sans RDB
  (DOS\0 à DOS\7) reçoit un en-tête RDSK + PART (`hdf.js`, `rdbHeaderFor`) dont la géométrie tombe juste sur sa taille,
  avec le nombre de blocs réservés retrouvé par la position du bloc racine. Stockage en morceaux de 8 Mo dans IndexedDB ;
  `trackWrites` du frontal note les morceaux touchés par le cœur, seuls ceux-là sont recopiés et réenregistrés.
  Le fichier du cœur reçoit le tableau sans copie (`canOwn`). Vérifié : image de partition FFS de 1,9 Go faite par
  amitools, importée en 7 s, démarrage dessus, fichier écrit par le script de démarrage retrouvé dans l'image
  téléchargée.
- **Fichiers sur le disque dur** : `web/lha.js` lit les archives LhA (en-têtes de niveau 0 à 2, méthodes -lh0-, -lh4- à
  -lh7-, contrôle CRC-16 ; vérifié contre lhasa sur ses archives de test Amiga et MorphOS), `web/ffs.js` écrit dans une
  partition OFS/FFS (DOS\0 à DOS\3) : carte des blocs libres, dossiers, en-têtes de fichiers et blocs d'extension,
  chaînes de hachage triées, sommes de contrôle. Images vérifiées avec le validateur d'amitools (0 erreur) et relues
  par xdftool. La copie se fait sur le disque en mémoire ; seuls les morceaux de 8 Mo touchés sont réenregistrés,
  et rien n'est écrit en cas d'erreur (place insuffisante, partition non gérée).
- **Mode Amiga 500** : `puae_model=A500` (68000, OCS, 512 Ko Chip + 512 Ko Slow ; la variante 512 Ko seuls ne démarre
  pas AROS), processeur laissé au modèle, pas de disque IDE. Kickstart de l'A500 choisi à part (`romId500`) :
  automatiquement un 1.x/2.0x de la Bibliothèque, reconnu par la version écrite dans l'en-tête de la ROM.

- **WHDLoad en un geste** (`app/whdload-puae.js`) : une archive `.lha` qui contient un `.slave` devient un jeu (`kind: "whd"`)
  au lieu d'être fouillée pour ses disquettes (`readLha(u8, true)` liste sans décompresser). Au lancement, le cœur reçoit
  l'archive elle-même comme contenu, avec `puae_use_whdload=files` : il la monte en lecture seule (`filesystem2=ro,DH0:`),
  démarre sur le volume `WHDLoad:` qu'il extrait de son `WHDLoad_files.zip` intégré (WHDLoad 20.0 et une startup-sequence
  qui trouve le `.slave`) et ajoute `WHDSaves:`. Nos lignes de configuration (horloge, extension AROS) passent par le fichier
  `.uae` propre au contenu (`/save/<nom>.uae`), lu après celles du cœur ; la ROM de démarrage UAE reste active (volumes de
  fichiers, pas de disque IDE). Les Kickstart reconnus sont écrits dans `WHDLoad:Devs/Kickstarts`, `WHDSaves:` est relu et
  réenregistré dans IndexedDB (toutes les 5 s quand il change, et à l'extinction), `NoWriteCache` pour qu'une sauvegarde
  soit écrite tout de suite. Vérifié dans Chromium avec une archive d'essai (un `.slave` minimal) : WHDLoad 20.0 démarre
  depuis l'archive et trouve le slave ; avec AROS il s'arrête sur « Couldn't find VCL instruction » (il cherche la liste
  Copper du vrai Kickstart), d'où l'exigence d'un Kickstart d'origine.
- **Quatre disques durs** : DH0: et DH1: en maître et esclave sur l'IDE Gayle (`ide0_mainboard`, `ide1_mainboard`). Les unités
  IDE 2 et 3 du Gayle émulé ne sont vues ni par AROS ni par le Kickstart 3.1 (vérifié avec AROS : « Please insert volume dh2 ») ;
  DH2: et DH3: passent donc par `uaehf.device` (`uae0`, `uae1`), avec la ROM de démarrage UAE activée seulement dans ce cas.
  « Nouveau » nomme la partition d'après l'unité (DH1…, priorité de démarrage négative) ; deux disques importés avec la même
  partition (DH0 souvent) : `uniquePartitionNames` renomme celle du second dans l'image chargée. Vérifié avec AROS : les quatre
  volumes montés, un fichier écrit sur chacun, y compris après un blocage de la page de 4 s, retrouvé dans la Bibliothèque.
- **Export et import de la Bibliothèque** (`app/library-io-puae.js`) : une archive tar standard, `bibliotheque.json` (les
  enregistrements, contenus remplacés par des références) puis un fichier par contenu, disque dur en une seule image .hdf. L'export
  assemble des Blob (rien n'est copié en mémoire), l'import lit le fichier par tranches et range les disques durs en morceaux.
  À l'import, un élément plus récent sur l'appareil est gardé. Vérifié : quatre disques de 64 Mo, une disquette, un jeu WHDLoad
  et WHDSaves exportés puis importés dans un navigateur vierge, contenus identiques ; l'archive se relit avec GNU tar.
