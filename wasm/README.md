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
