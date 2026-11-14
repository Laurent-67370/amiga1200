#!/usr/bin/env bash
# Émulateur amiga1200 (WinUAE 6 et PUAE, WebAssembly) embarqué dans l'APK du 68k Trainer : build-emu/emu/ devient
# assets/emu/ (voir app/build.gradle.kts). La page est reconstruite depuis les sources (wasm/app/make-page.py) ; les
# cœurs et les autres fichiers sont ceux publiés à la racine du dépôt, la même version que le site.
#
#   trainer-src/android/preparer-emulateur.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/trainer-src/android/build-emu/emu"
rm -rf "$OUT" && mkdir -p "$OUT"
for f in puae.js puae.wasm amiberry.js amiberry.wasm ipf.js ipf.wasm puae-frontend.js lazydisk-worker.js adf.js hdf.js lha.js \
         ffs.js aros-rom.bin.gz aros-ext.bin.gz manifest.webmanifest icon-192.png icon-512.png icon-maskable-512.png \
         apple-touch-icon.png fond.jpg; do
  cp "$ROOT/$f" "$OUT/"
done
cp -r "$ROOT/whd" "$ROOT/sons" "$OUT/"
python3 "$ROOT/wasm/app/make-page.py" "$OUT/index.html"
BUILD=$(cd "$ROOT" && TZ=Europe/Paris git log -1 --date=format-local:'%d/%m/%Y %H:%M' --format='%cd (%h)' 2>/dev/null || echo "locale")
sed -i "s|__BUILD__|$BUILD, 68k Trainer|g" "$OUT/index.html"
# Pas de service worker dans l'application : la WebView fournit l'isolation (MainActivity.kt) et tous les fichiers
# sont déjà sur le téléphone
printf '/* 68k Trainer (Android) : isolation fournie par la WebView, pas de service worker */\n' > "$OUT/coi.js"
du -sh "$OUT"
