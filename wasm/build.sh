#!/usr/bin/env bash
# Compile le cœur PUAE (libretro-uae) en WebAssembly avec Emscripten.
# Produit :
#   dist/puae.js + dist/puae.wasm   module navigateur (fils d'exécution activés)
#   dist/puae-bench.js (+ .wasm)    banc d'essai Node : vitesse, sauvegarde d'état, image capturée
# Usage : wasm/build.sh   (emcc doit être dans le PATH)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/vendor/puae"
OUT="$ROOT/wasm/dist"
OBJ="$ROOT/wasm/obj"
JOBS="${JOBS:-$(nproc)}"
mkdir -p "$OUT" "$OBJ"

# 1. Correctifs (idempotent)
cd "$SRC"
for p in "$ROOT"/wasm/patches/*.patch; do
  if git apply --check "$p" 2>/dev/null; then git apply "$p"; echo "correctif appliqué : $(basename "$p")"; fi
done

# 2. Objets du cœur. Les drapeaux passent par CC pour ne pas écraser les CFLAGS du Makefile.
# setjmp/longjmp en WebAssembly natif : la boucle du processeur (TRY/CATCH de newcpu.c) appelait chaque instruction
# à travers JavaScript avec la version par défaut d'Emscripten, près de la moitié du temps d'émulation
FLAGS="-pthread -O3 -sSUPPORT_LONGJMP=wasm -Wno-error -Wno-incompatible-function-pointer-types -Wno-int-conversion -Wno-implicit-function-declaration"
# La cible « emscripten » du Makefile s'arrête sur une édition de liens qu'on refait nous-mêmes : on garde les objets.
emmake make -j"$JOBS" platform=emscripten HAVE_CHD=0 HAVE_MPEG2=0 CC="emcc $FLAGS" AR=emar || true
find "$SRC/build" -name '*.o' > "$OBJ/objs.txt"
echo "objets du cœur : $(wc -l < "$OBJ/objs.txt")"
test "$(wc -l < "$OBJ/objs.txt")" -gt 150

# 3. libretro-common : fourni par RetroArch d'habitude, à compiler ici
LC="$SRC/libretro-common"
for f in file/file_path.c file/file_path_io.c streams/file_stream.c streams/file_stream_transforms.c \
         compat/compat_strl.c compat/compat_strcasestr.c compat/fopen_utf8.c string/stdstring.c \
         encodings/encoding_utf.c file/retro_dirent.c vfs/vfs_implementation.c time/rtime.c; do
  emcc $FLAGS -I"$LC/include" -c "$LC/$f" -o "$OBJ/lc_$(echo "$f" | tr / _).o"
done
emcc $FLAGS -c "$ROOT/wasm/stubs.c" -o "$OBJ/stubs.o"
emcc $FLAGS -I"$LC/include" -c "$ROOT/wasm/frontend.c" -o "$OBJ/frontend.o"

COMMON=(-pthread -O3 -sSUPPORT_LONGJMP=wasm -sPTHREAD_POOL_SIZE=8 -sINITIAL_MEMORY=256MB -sSTACK_SIZE=8MB -sALLOW_TABLE_GROWTH=1 \
        "$OBJ"/lc_*.o "$OBJ/stubs.o" @"$OBJ/objs.txt")

# 4. Banc d'essai Node (accès direct aux fichiers)
emcc $FLAGS -I"$LC/include" -c "$ROOT/wasm/bench.c" -o "$OBJ/bench.o"
echo "=== édition des liens : banc d'essai ==="
emcc "${COMMON[@]}" "$OBJ/bench.o" -sNODERAWFS=1 -sENVIRONMENT=node -sEXIT_RUNTIME=1 -o "$OUT/puae-bench.js"

# 5. Module navigateur : l'API libretro exposée à JavaScript
EXPORTS='["_retro_api_version","_retro_init","_retro_deinit","_retro_run","_retro_reset","_retro_load_game","_retro_unload_game",
"_retro_get_system_info","_retro_get_system_av_info","_retro_set_environment","_retro_set_video_refresh","_retro_set_audio_sample",
"_retro_set_audio_sample_batch","_retro_set_input_poll","_retro_set_input_state","_retro_set_controller_port_device",
"_retro_serialize_size","_retro_serialize","_retro_unserialize","_retro_keyboard_event","_malloc","_free"]'
echo "=== édition des liens : module navigateur ==="
emcc "${COMMON[@]}" "$OBJ/frontend.o" -sMODULARIZE=1 -sEXPORT_NAME=createPuae -sENVIRONMENT=web,worker -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS="$(echo "$EXPORTS" | tr -d '\n')" \
  -sEXPORTED_RUNTIME_METHODS='["FS","addFunction","removeFunction","UTF8ToString","stringToNewUTF8","setValue","getValue","HEAPU8","HEAP16","HEAPU32","HEAPF32"]' \
  -o "$OUT/puae.js"

# 6. Site : interface complète (générée depuis src/template.html) + page d'essai brute + frontal + module
rm -rf "$OUT/site" && mkdir -p "$OUT/site"
cp "$ROOT"/wasm/web/* "$OUT/site/"
cp "$OUT/puae.js" "$OUT/puae.wasm" "$OUT/site/"
# Cœur WinUAE 6 (Amiberry), compilé avant par wasm-amiberry/build.sh
AMB="$ROOT/wasm-amiberry/out"
if [ -f "$AMB/amiberry.js" ]; then cp "$AMB/amiberry.js" "$AMB/amiberry.wasm" "$OUT/site/"; else echo "cœur WinUAE 6 absent (wasm-amiberry/build.sh non lancé)"; fi
python3 "$ROOT/wasm/app/make-page.py" "$OUT/site/index.html"
# Kickstart de secours : AROS d'août 2026, compressé (décompressé par la page)
gzip -9 -n -c "$ROOT/vendor/aros/aros-20260820-rom.bin" > "$OUT/site/aros-rom.bin.gz"
gzip -9 -n -c "$ROOT/vendor/aros/aros-20260820-ext.bin" > "$OUT/site/aros-ext.bin.gz"
# Version du service worker = résumé des fichiers publiés : chaque publication renouvelle la copie hors ligne
VER=$(cd "$OUT/site" && ls | grep -v '^coi-sw.js$' | sort | xargs cat | sha256sum | cut -c1-12)
sed -i "s/__VERSION__/$VER/" "$OUT/site/coi-sw.js"
echo "version hors ligne : $VER"
ls -la "$OUT" "$OUT/site"
for f in "$OUT"/*.wasm; do echo "$(basename "$f") compressé : $(gzip -9 -c "$f" | wc -c) octets"; done
