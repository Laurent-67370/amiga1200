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
