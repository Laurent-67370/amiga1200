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
FLAGS="-pthread -O3 -Wno-error -Wno-incompatible-function-pointer-types -Wno-int-conversion -Wno-implicit-function-declaration"
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

COMMON=(-pthread -O3 -sPTHREAD_POOL_SIZE=8 -sINITIAL_MEMORY=512MB -sSTACK_SIZE=8MB -sALLOW_TABLE_GROWTH=1 \
        "$OBJ"/lc_*.o "$OBJ/stubs.o" @"$OBJ/objs.txt")

# 4. Banc d'essai Node (accès direct aux fichiers)
emcc $FLAGS -I"$LC/include" -c "$ROOT/wasm/bench.c" -o "$OBJ/bench.o"
emcc "${COMMON[@]}" "$OBJ/bench.o" -sNODERAWFS=1 -sENVIRONMENT=node -sEXIT_RUNTIME=1 -o "$OUT/puae-bench.js"

# 5. Module navigateur : l'API libretro exposée à JavaScript
EXPORTS='["_retro_api_version","_retro_init","_retro_deinit","_retro_run","_retro_reset","_retro_load_game","_retro_unload_game",
"_retro_get_system_info","_retro_get_system_av_info","_retro_set_environment","_retro_set_video_refresh","_retro_set_audio_sample",
"_retro_set_audio_sample_batch","_retro_set_input_poll","_retro_set_input_state","_retro_set_controller_port_device",
"_retro_serialize_size","_retro_serialize","_retro_unserialize","_malloc","_free"]'
emcc "${COMMON[@]}" -sMODULARIZE=1 -sEXPORT_NAME=createPuae -sENVIRONMENT=web,worker -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS="$(echo "$EXPORTS" | tr -d '\n')" \
  -sEXPORTED_RUNTIME_METHODS='["FS","addFunction","removeFunction","UTF8ToString","stringToNewUTF8","setValue","getValue","HEAPU8","HEAP16","HEAPU32"]' \
  -o "$OUT/puae.js"

ls -la "$OUT"
for f in "$OUT"/*.wasm; do echo "$(basename "$f") compressé : $(gzip -9 -c "$f" | wc -c) octets"; done
