/* Fonctions C++ d'Amiberry appelées par le frontal (wasm/frontend.c, écrit en C). */
#include "sysdeps.h"
#include "options.h"
#include "disk.h"

extern "C" void amb_disk_insert(int num, const char *name) { disk_insert(num, name); }
extern "C" void amb_disk_eject(int num) { disk_eject(num); }
