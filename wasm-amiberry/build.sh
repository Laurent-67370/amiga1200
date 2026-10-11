#!/usr/bin/env bash
# Cœur Amiberry (base WinUAE 6) compilé en WebAssembly, avec un banc d'essai Node.
#
#   wasm-amiberry/build.sh            → wasm-amiberry/out/amiberry.js (+ .wasm), module pour la page
#                                       wasm-amiberry/out/amb-bench.js (+ .wasm), banc d'essai Node
#   cd wasm-amiberry/out && node amb-bench.js 150 300 A1200OG frame.ppm
#
# Prérequis : Emscripten (emcc) dans le PATH. Les sources d'Amiberry sont clonées dans
# wasm-amiberry/src (version figée ci-dessous), puis adaptées par patches/*.patch :
#  - processeur « wasm » (pas d'assembleur ni de JIT, drapeaux du 68000 en C portable) ;
#  - horloge CLOCK_MONOTONIC (CLOCK_MONOTONIC_RAW échoue sous Emscripten) ;
#  - réservation de mémoire limitée à 384 Mo (une réservation y est une vraie allocation) ;
#  - pas d'attente interne entre deux images : la page cadence l'émulation.
#  - port série émulé sans port réel (MIDI vers la page) ; manette CD32 à 7 boutons ; mémoire RTG dans les
#    sauvegardes d'état ; recadrage automatique allégé ; réserve mémoire sans remise à zéro.
# Les coroutines libco du cœur sont remplacées par des fils (libco_pthread.c).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
AMB_REPO=https://github.com/BlitterStudio/amiberry.git
AMB_REV=ca2332df8cf914ec97c4a7c6ace38adcb3543b25   # Amiberry 8.3 (octobre 2026)
SRC="$HERE/src"
OUT="$HERE/out"
JOBS=${JOBS:-$(nproc)}

if [ ! -d "$SRC/.git" ]; then
  git clone --filter=blob:none "$AMB_REPO" "$SRC"
fi
git -C "$SRC" fetch -q origin "$AMB_REV" 2>/dev/null || true
git -C "$SRC" checkout -q -f "$AMB_REV"
git -C "$SRC" clean -fdq -e '*.o' -e .patches.sum
git -C "$SRC" submodule update --init libretro/libco libretro/libretro-common
for p in "$HERE"/patches/*.patch; do git -C "$SRC" apply "$p"; done
# Le Makefile ne suit pas les en-têtes : si les correctifs ont changé (un en-tête peut en faire partie),
# les objets d'une compilation précédente (cache de l'intégration continue) sont jetés
PATCH_SUM=$(cat "$HERE"/patches/*.patch | sha256sum | cut -c1-16)
if [ "$(cat "$SRC/.patches.sum" 2>/dev/null)" != "$PATCH_SUM" ]; then
  find "$SRC" -name '*.o' -delete
  echo "$PATCH_SUM" > "$SRC/.patches.sum"
fi

# zlib : les en-têtes et sources fournis avec PUAE (le port zlib d'Emscripten se télécharge, ce qui n'est pas toujours possible)
ZINC="$OUT/zinc"; mkdir -p "$ZINC"
cp "$ROOT/vendor/puae/deps/libz/zlib.h" "$ROOT/vendor/puae/deps/libz/zconf.h" "$ZINC/"

EXTRA="-pthread -fwasm-exceptions -sSUPPORT_LONGJMP=wasm -I$ZINC -DSDLMAME_EMSCRIPTEN -Wno-error"
# Le Makefile compile tout, puis échoue à l'édition des liens (options de bibliothèque partagée) : on fait la nôtre
(cd "$SRC/libretro" && emmake make -k -j"$JOBS" platform=unix ARCH=x86_64 CC="emcc $EXTRA" CXX="em++ $EXTRA" >"$OUT/make.log" 2>&1) || true

cd "$OUT"
for f in adler32 compress crc32 deflate gzclose gzlib gzread gzwrite inffast inflate inftrees trees zutil; do
  [ z_$f.o -nt "$ROOT/vendor/puae/deps/libz/$f.c" ] || emcc -O3 -pthread -I"$ZINC" -c "$ROOT/vendor/puae/deps/libz/$f.c" -o z_$f.o
done
emcc -O3 -pthread -I"$SRC/libretro/libco" -c "$HERE/libco_pthread.c" -o libco_pthread.o
emcc -O3 -pthread -I"$SRC/libretro" -c "$HERE/bench.c" -o bench.o
find "$SRC/src" "$SRC/libretro" "$SRC/external/floppybridge" -name '*.o' ! -path '*/libco/*' | sort >objs.txt
[ "$(wc -l <objs.txt)" -ge 300 ] || { echo "compilation incomplète, voir $OUT/make.log" >&2; exit 1; }
em++ -pthread -fwasm-exceptions -sSUPPORT_LONGJMP=wasm -O3 -sPTHREAD_POOL_SIZE=12 \
  -sINITIAL_MEMORY=256MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2GB -sSTACK_SIZE=8MB \
  -sNODERAWFS=1 -sENVIRONMENT=node -sEXIT_RUNTIME=1 -Wno-pthreads-mem-growth \
  bench.o libco_pthread.o z_*.o @objs.txt -o amb-bench.js

# Module navigateur : le même frontal que PUAE (wasm/frontend.c), adapté par FE_AMIBERRY
INC="-I$SRC/src -I$SRC/src/include -I$SRC/src/osdep/libretro -I$SRC/src/osdep -I$SRC/src/threaddep -I$SRC/libretro"
DEFS=(-DAMIBERRY -DLIBRETRO -DLIBRETRO_NO_JIT '-DOSDEP_GFX_PLATFORM_HEADER="libretro/gfx_platform_internal.h"'
      '-DOSDEP_AMIBERRY_PLATFORM_HEADER="libretro/amiberry_platform_internal.h"' '-DOSDEP_INPUT_PLATFORM_HEADER="libretro/input_platform_internal.h"'
      '-DOSDEP_GUI_HANDLING_HEADER="libretro/gui_handling_platform.h"')
em++ -O3 -pthread -fwasm-exceptions -sSUPPORT_LONGJMP=wasm -std=gnu++17 $INC "${DEFS[@]}" -c "$HERE/amb_glue.cpp" -o amb_glue.o
emcc -O3 -pthread -DFE_AMIBERRY -I"$SRC/libretro" -c "$ROOT/wasm/frontend.c" -o frontend.o
EXPORTS='["_retro_run","_retro_set_controller_port_device","_retro_serialize_size","_retro_serialize","_retro_unserialize","_malloc","_free"]'
em++ -pthread -fwasm-exceptions -sSUPPORT_LONGJMP=wasm -O3 -sPTHREAD_POOL_SIZE=12 \
  -sINITIAL_MEMORY=256MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2GB -sSTACK_SIZE=8MB -Wno-pthreads-mem-growth \
  -sMODULARIZE=1 -sEXPORT_NAME=createAmiberry -sENVIRONMENT=web,worker -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS="$EXPORTS" \
  -sEXPORTED_RUNTIME_METHODS='["FS","UTF8ToString","stringToNewUTF8","setValue","getValue","HEAPU8","HEAP16","HEAPU32","HEAPF32"]' \
  frontend.o amb_glue.o libco_pthread.o z_*.o @objs.txt -o amiberry.js

# ROM AROS libres pour le banc d'essai
mkdir -p sys
cp "$ROOT/vendor/aros/aros-20260820-rom.bin" sys/aros-rom.bin
cp "$ROOT/vendor/aros/aros-20260820-ext.bin" sys/aros-ext.bin
echo "OK : $OUT/amb-bench.js, $OUT/amiberry.js"
for f in amb-bench.wasm amiberry.wasm; do echo "$f compressé : $(gzip -9 -c "$f" | wc -c) octets"; done
