# Cœur PUAE en WebAssembly (en cours)

Branche de travail pour remplacer le cœur SAE par [PUAE](https://github.com/libretro/libretro-uae)
(le moteur de WinUAE) compilé en WebAssembly. Voir l'étude de faisabilité pour le plan complet.

- `vendor/puae` : PUAE en sous-module, épinglé sur le commit étudié.
- `patches/` : correctifs nécessaires en WebAssembly (types de fonctions incohérents, sans effet en natif).
- `build.sh` : compilation Emscripten avec fils d'exécution → `dist/puae.js` + `dist/puae.wasm`, et un banc d'essai Node.
- `bench.c` : frontal libretro minimal sans écran (A1200 d'origine, AROS intégré), mesure la vitesse et teste la sauvegarde d'état.

La GitHub Action `.github/workflows/puae-wasm.yml` compile tout à chaque modification et publie
la vitesse mesurée dans le résumé de l'exécution.

Étape 1 sur 6 : chaîne de compilation. Étape suivante : écran, son, clavier et souris dans le navigateur.
