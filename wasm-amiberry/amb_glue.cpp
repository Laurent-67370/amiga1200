/* Fonctions C++ d'Amiberry appelées par le frontal (wasm/frontend.c, écrit en C). */
#include "sysdeps.h"
#include "options.h"
#include "disk.h"

extern "C" void amb_disk_insert(int num, const char *name) { disk_insert(num, name); }
extern "C" void amb_disk_eject(int num) { disk_eject(num); }

/* Saut d'images (la page le règle selon la charge) : une image dessinée sur n */
#include <emscripten/emscripten.h>
extern "C" EMSCRIPTEN_KEEPALIVE void amb_set_framerate(int n)
{
	if (n < 1) n = 1;
	if (changed_prefs.gfx_framerate == n) return;
	changed_prefs.gfx_framerate = n;
	set_config_changed();
}

/* Bruits des lecteurs de disquettes, à chaud (les échantillons sont écrits par la page dans /data/floppy_sounds) */
extern "C" EMSCRIPTEN_KEEPALIVE void amb_set_floppy_sound(int on)
{
	for (int i = 0; i < 2; i++)
		changed_prefs.floppyslots[i].dfxclick = on ? 1 : 0;
	set_config_changed();
}
